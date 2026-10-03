"use strict";
const dse = require("../shared/dse");
const statutsSite = require("../shared/statuts-site");
const resoudreur = require("../shared/resolveur-domaine");
const builderSource = require("../shared/builder-source");

module.exports = async function (context, req) {
  const id = dse.correlationId(req);
  try {
    const domaine = dse.normaliserDomaine(req.query.domaine);
    if (!domaine || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domaine)) {
      throw dse.creerErreur("DSE-API-DOMAINE-INVALIDE", 400, "Domaine invalide");
    }

    const r = await resoudreur.resoudreDomaine(domaine);
    if (r.type === "inconnu") throw dse.creerErreur("DSE-API-SITE-ININTROUVABLE", 404, "Domaine inconnu");
    if (r.type !== "site") {
      // Domaine declare dans SharePoint sans site public encore rattache : situation generique neutre.
      return dse.reponseJson(context, req, 200, {
        succes: true,
        donnees: { id: null, nom: domaine, domaines: [domaine], langue: null, etat: "situation", situation: null, publication: { actif: false, valide: false } },
        meta: { versionApi: "0.9", correlationId: id, genereLe: new Date().toISOString() }
      }, id);
    }

    const lookupOui = (f, re) => {
      const k = Object.keys(f).find((x) => re.test(x) && x.endsWith("LookupId"));
      return k ? String(f[k]) === "1" : false;
    };

    // La page configuree dans OBJ-SITE-PUBLIC est prioritaire ; sans configuration,
    // le comportement historique de la route "/" reste disponible pour un site actif.
    const donnees = await builderSource.obtenirDonnees();
    const pagePubliquePrete = (donnees.pages || []).some((p) => {
      const f = p._fields || {};
      const k = Object.keys(f).find((x) => /^OBJ_x002d_SITE/.test(x) && x.endsWith("LookupId"));
      const pageCorrespond = r.site.pagePubliqueId
        ? String(p.id) === String(r.site.pagePubliqueId)
        : String(f.URL || "/").trim() === "/";
      return k && String(f[k]) === String(r.site.id) && pageCorrespond &&
        lookupOui(f, /^OBJ_x002d_ACTIF/) && lookupOui(f, /^OBJ_x002d_VALIDE/);
    });
    const periode = statutsSite.periodeApplicable(r.site);
    if (periode.anomalie) {
      context.log.warn(`[DSE ${id}] domaine hors configuration temporelle site=${r.site.id}`);
    }
    const rendu = periode.applicable ? r.statut.rendu : "indisponible";
    const etat = statutsSite.etatPublic(rendu, pagePubliquePrete);
    const nom = r.site.titre || null;
    // Situation generique : donnees du statut SharePoint ; le media propre au site est prioritaire.
    const situation = etat === "situation" && rendu === "situation"
      ? { ...r.statut.situation, media: r.site.mediaSituation || r.statut.situation?.media || null }
      : null;

    return dse.reponseJson(context, req, 200, {
      succes: true,
      donnees: {
        id: rendu === "indisponible" ? null : String(r.site.id),
        nom,
        domaines: [domaine],
        etat,
        situation,
        pageId: etat === "normal" && r.site.pagePubliqueId ? String(r.site.pagePubliqueId) : null,
        langue: null,
        publication: { actif: true, valide: true }
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
