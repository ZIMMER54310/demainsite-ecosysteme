"use strict";

// Resolution generique Domaine -> Site, entierement deduite de SharePoint (aucun domaine en dur).
// Cache technique court : SharePoint reste la source officielle.
const dse = require("./dse");
const catalogue = require("./catalogue");
const catalogueSource = require("./catalogue-source");
const statutsSite = require("./statuts-site");
const { lireDomainesSharePoint } = require("./domaines");

let cacheDomaines = null;
let enCours = null;

async function domainesDeclares() {
  const duree = (Number(process.env.DSE_CATALOGUE_CACHE_SECONDES) >= 0 ? Number(process.env.DSE_CATALOGUE_CACHE_SECONDES) : 60) * 1000;
  if (cacheDomaines && Date.now() - cacheDomaines.le < duree) return cacheDomaines.liste;
  if (!enCours) {
    enCours = lireDomainesSharePoint()
      .then((liste) => { cacheDomaines = { le: Date.now(), liste }; return liste; })
      .finally(() => { enCours = null; });
  }
  try { return await enCours; } catch (e) { if (cacheDomaines) return cacheDomaines.liste; throw e; }
}

// -> { type: "site", site, statut } | { type: "construction", domaine } | { type: "inconnu" }
async function resoudreDomaine(brut) {
  const domaine = dse.normaliserDomaine(brut);
  if (!domaine || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domaine)) return { type: "invalide" };

  const index = await catalogueSource.obtenirIndex();
  const site = catalogue.siteDuDomaine(index, domaine);
  if (site) {
    const statut = statutsSite.decider(site, index.statuts);
    if (statut.anomalie) console.warn(`[DSE] anomalie statut site ${site.id} : ${statut.anomalie}`);
    return { type: "site", site, domaine, statut };
  }

  const declare = (await domainesDeclares()).some((d) => d.domaine === domaine && d.actif && d.valide);
  return declare ? { type: "construction", domaine } : { type: "inconnu", domaine };
}

module.exports = { resoudreDomaine, domainesDeclares };
