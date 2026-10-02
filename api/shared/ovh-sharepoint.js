"use strict";

// OVH -> SharePoint : detection des domaines OVH et preparation (anti-doublon) des elements DSE.
// Aucun domaine en dur. Relations uniquement par ID natifs SharePoint.
const dse = require("./dse");
const ovh = require("./ovh");

const DOMAINE_OK = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// Domaines geres chez OVH : /domain (registrar) sinon /domain/zone (zones DNS). Refus 403 => message explicite.
async function listerDomainesOvh(appel = ovh.appel) {
  const erreurs = [];
  const vus = new Set();
  for (const chemin of ["/domain", "/domain/zone"]) {
    try {
      for (const d of await appel("GET", chemin)) {
        const n = dse.normaliserDomaine(d);
        if (DOMAINE_OK.test(n)) vus.add(n);
      }
    } catch (e) { erreurs.push(`${chemin}: ${e.message}`); }
  }
  if (!vus.size && erreurs.length) {
    const e = new Error(`Liste des domaines OVH illisible (${erreurs.join("; ")}). La cle API OVH doit autoriser GET /domain et GET /domain/zone.`);
    e.code = "OVH-LISTE-REFUSEE";
    throw e;
  }
  return [...vus].sort();
}

const lien = (fields, re) => {
  const k = Object.keys(fields).find((x) => re.test(x) && x.endsWith("LookupId"));
  return k ? String(fields[k]) : null;
};

/*
 * etat = { domainesSp: [{id, domaine, siteId}], sites: [{id, domaineIds[]}] }
 * defauts = { client, type, fournisseur, temps, actif, valide, nonVerrouille }  (IDs natifs)
 * Retour : { aCreerDomaines[], sitesACreer[], liaisons[], ignores[] }
 */
function planifier(domainesOvh, etat, defauts, { orphelins = false } = {}) {
  const connus = new Map(etat.domainesSp.map((d) => [d.domaine, d]));
  const siteParDomaine = new Map();
  for (const s of etat.sites) for (const id of s.domaineIds) siteParDomaine.set(String(id), s.id);

  const plan = { aCreerDomaines: [], sitesACreer: [], liaisons: [], ignores: [] };
  const manque = ["client", "type", "fournisseur", "temps", "actif", "valide", "nonVerrouille"].filter((k) => !defauts[k]);

  for (const d of domainesOvh) {
    const sp = connus.get(d);
    if (!sp) {
      if (manque.length) { plan.ignores.push({ domaine: d, raison: `valeurs SharePoint par defaut manquantes: ${manque.join(", ")}` }); continue; }
      plan.aCreerDomaines.push({ domaine: d });
      plan.sitesACreer.push({ domaine: d, domaineId: null });
    } else if (orphelins && !siteParDomaine.has(String(sp.id)) && !sp.siteId) {
      if (!defauts.client && !sp.clientId) { plan.ignores.push({ domaine: d, raison: "client inconnu" }); continue; }
      plan.sitesACreer.push({ domaine: d, domaineId: sp.id, clientId: sp.clientId });
    }
  }
  return plan;
}

module.exports = { listerDomainesOvh, planifier, lien, DOMAINE_OK };
