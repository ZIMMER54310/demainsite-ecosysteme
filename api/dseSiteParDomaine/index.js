"use strict";
const dse = require("../shared/dse");

module.exports = async function (context, req) {
  const id = dse.correlationId(req);
  try {
    const domaine = dse.normaliserDomaine(req.query.domaine);
    if (!domaine || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domaine)) {
      throw dse.creerErreur("DSE-API-DOMAINE-INVALIDE", 400, "Domaine invalide");
    }

    const token = await dse.obtenirJetonGraph();
    const siteGraph = await dse.obtenirSiteGraph(token);
    const listes = await dse.collecter(token, `/sites/${siteGraph.id}/lists?$select=id,displayName,name,webUrl`);
    const liste = listes.find((l) => String(l.displayName || l.name).toUpperCase() === "OBJ-SITE-PUBLIC");
    if (!liste) throw dse.creerErreur("DSE-API-LISTE-SITE-PUBLIC-ININTROUVABLE", 404, "OBJ-SITE-PUBLIC introuvable");

    const colonnes = await dse.collecter(token, `/sites/${siteGraph.id}/lists/${liste.id}/columns?$select=id,name,displayName,hidden,lookup`);
    const items = await dse.collecter(token, `/sites/${siteGraph.id}/lists/${liste.id}/items?$expand=fields&$top=200`);

    let trouve = null;
    for (const item of items) {
      if (dse.contientDomaine(item.fields || {}, domaine)) { trouve = item; break; }
      if (await dse.resoudreLookupDomaine(token, siteGraph.id, item, colonnes, domaine)) { trouve = item; break; }
    }
    const lookupOui = (f, re) => {
      const k = Object.keys(f).find((x) => re.test(x) && x.endsWith("LookupId"));
      return k ? String(f[k]) === "1" : false;
    };

    if (!trouve) {
      // Domaine enregistre dans SharePoint mais sans site : "en construction".
      const ld = listes.find((l) => String(l.displayName || l.name).toUpperCase() === "OBJ-NOM DE DOMAINE");
      const doms = ld ? await dse.collecter(token, `/sites/${siteGraph.id}/lists/${ld.id}/items?$expand=fields&$top=200`) : [];
      const connu = doms.some((d) => dse.normaliserDomaine(d.fields && d.fields.Title) === domaine);
      if (!connu) throw dse.creerErreur("DSE-API-SITE-ININTROUVABLE", 404, "Domaine inconnu");
      return dse.reponseJson(context, req, 200, {
        succes: true,
        donnees: { id: null, nom: domaine, domaines: [domaine], langue: null, etat: "construction", publication: { actif: false, valide: false } },
        meta: { versionApi: "0.9", correlationId: id, genereLe: new Date().toISOString() }
      }, id);
    }

    // Une page d'accueil active et validee est necessaire pour le mode normal.
    const lp = listes.find((l) => String(l.displayName || l.name).toUpperCase() === "OBJ-PAGES-SITE");
    const pagesSite = lp ? await dse.collecter(token, `/sites/${siteGraph.id}/lists/${lp.id}/items?$expand=fields&$top=200`) : [];
    const pageAccueilPrete = pagesSite.some((p) => {
      const f = p.fields || {};
      const k = Object.keys(f).find((x) => /^OBJ_x002d_SITE/.test(x) && x.endsWith("LookupId"));
      return k && String(f[k]) === String(trouve.id) && String(f.URL || "/").trim() === "/" &&
        lookupOui(f, /^OBJ_x002d_ACTIF/) && lookupOui(f, /^OBJ_x002d_VALIDE/);
    });
    const tf = trouve.fields || {};
    const siteOui = lookupOui(tf, /^(OBJ_x002d_)?ACTIF/) && lookupOui(tf, /^OBJ_x002d_VALIDE/);
    const etat = siteOui && pageAccueilPrete ? "normal" : "construction";

    const fields = trouve.fields || {};
    const idSite = dse.trouverChamp(fields, colonnes, ["IDOBJSITEPUBLIC", "IDSITEPUBLIC", "CODESITE"]) || trouve.id;
    const nom = dse.trouverChamp(fields, colonnes, ["NOMDUSITE", "NOMSITE", "TITRE", "TITLE"]) || fields.Title || null;
    const langue = dse.trouverChamp(fields, colonnes, ["LANGUE", "LANG"]) || null;
    const actifBrut = dse.trouverChamp(fields, colonnes, ["ACTIF", "ACTIVE"]);
    const valideBrut = dse.trouverChamp(fields, colonnes, ["VALIDE", "VALIDATION", "PUBLIE"]);

    dse.reponseJson(context, req, 200, {
      succes: true,
      donnees: {
        id: String(idSite),
        nom: nom === null ? null : String(nom),
        domaines: [domaine],
        etat,
        langue: langue === null ? null : String(langue),
        publication: {
          actif: actifBrut === null ? null : dse.booleenPublic(actifBrut),
          valide: valideBrut === null ? null : dse.booleenPublic(valideBrut)
        }
      },
      meta: { versionApi: "0.9", correlationId: id, genereLe: new Date().toISOString() }
    }, id);
  } catch (e) {
    const status = e.status || 500;
    const messages = {
      "DSE-API-DOMAINE-INVALIDE": "Le domaine fourni est invalide.",
      "DSE-API-LISTE-SITE-PUBLIC-ININTROUVABLE": "La source des sites publics est indisponible.",
      "DSE-API-SITE-ININTROUVABLE": "Aucun site public ne correspond au domaine demandé."
    };
    const inconnu = e.codeDse === "DSE-API-SITE-ININTROUVABLE"
      ? ` domaine=${String(req.query.domaine || "").replace(/[^a-z0-9.\-]/gi, "").slice(0, 100)}`
      : "";
    context.log.error(`[DSE ${id}] ${e.codeDse || e.message}${inconnu}`);
    dse.reponseJson(context, req, status, {
      succes: false,
      erreur: { code: e.codeDse || "DSE-API-ERREUR-INTERNE", message: messages[e.codeDse] || "Le service DSE est indisponible." },
      meta: { versionApi: "0.9", correlationId: id, genereLe: new Date().toISOString() }
    }, id);
  }
};
