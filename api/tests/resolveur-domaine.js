"use strict";
const assert = require("assert");
const catalogueSource = require("../shared/catalogue-source");
const domaines = require("../shared/domaines");
const catalogue = require("../shared/catalogue");

const site = { id: "7", titre: "S", domaines: ["connu.test"], actif: true, valide: true };
catalogueSource.obtenirIndex = async () => ({ sites: new Map([["7", site]]) });
catalogue.siteDuDomaine = (idx, d) => (d === "connu.test" ? site : null);
domaines.lireDomainesSharePoint = async () => [
  { domaine: "sanssite.test", actif: true, valide: true },
  { domaine: "inactif.test", actif: false, valide: true }
];
const { resoudreDomaine } = require("../shared/resolveur-domaine");

(async () => {
  assert.strictEqual((await resoudreDomaine("www.Connu.test")).type, "site");
  assert.strictEqual((await resoudreDomaine("sanssite.test")).type, "construction");
  assert.strictEqual((await resoudreDomaine("inactif.test")).type, "inconnu");
  assert.strictEqual((await resoudreDomaine("autre.test")).type, "inconnu");
  assert.strictEqual((await resoudreDomaine("../etc")).type, "invalide");
  console.log("resolveur-domaine OK");
})().catch((e) => { console.error(e); process.exit(1); });
