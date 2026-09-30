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
    if (!trouve) throw dse.creerErreur("DSE-API-SITE-ININTROUVABLE", 404, "Aucun site public pour ce domaine");

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
    context.log.error(`[DSE ${id}] ${e.codeDse || e.message}`);
    dse.reponseJson(context, req, status, {
      succes: false,
      erreur: { code: e.codeDse || "DSE-API-ERREUR-INTERNE", message: messages[e.codeDse] || "Le service DSE est indisponible." },
      meta: { versionApi: "0.9", correlationId: id, genereLe: new Date().toISOString() }
    }, id);
  }
};
