"use strict";

// OVH -> SharePoint : detection des domaines OVH et preparation (anti-doublon) des elements DSE.
// Aucun domaine en dur. Relations uniquement par ID natifs SharePoint.
const ovh = require("./ovh");

const { normaliserEtValiderDomaine } = require("./domain-sync");

// Les domaines enregistrés sont listés par /domain. Ne pas mélanger les zones DNS,
// qui peuvent contenir des domaines non enregistrés sur le compte.
async function listerDomainesOvh(appel = ovh.appel) {
  let reponse;
  try {
    reponse = await appel("GET", "/domain");
  } catch (e) {
    const erreur = new Error(`Liste des domaines OVH illisible (${e.message}). La clé API doit autoriser GET /domain.`);
    erreur.code = "OVH-LISTE-REFUSEE";
    throw erreur;
  }
  if (!Array.isArray(reponse)) {
    const e = new Error("Réponse inattendue de l'API OVH pour GET /domain.");
    e.code = "OVH-LISTE-REFUSEE";
    throw e;
  }
  return [...new Set(reponse.map(normaliserEtValiderDomaine).filter(Boolean))].sort();
}

module.exports = { listerDomainesOvh };
