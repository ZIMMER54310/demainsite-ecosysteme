"use strict";

const assert = require("assert");
const dse = require("../shared/dse");
const droits = require("../auth/droits");
const ecriture = require("../shared/ecriture");
const statuts = require("../shared/statut-sites");

(async () => {
  const restaurer = [];
  const changer = (o, cle, valeur) => { const avant = o[cle]; restaurer.push(() => { o[cle] = avant; }); o[cle] = valeur; };
  const g = { token: "simule", siteGraphId: "g", listes: [
    { id: "sites", displayName: "OBJ-SITE-PUBLIC" }, { id: "statuts", displayName: "OBJ-SITES-STATUT" }] };
  const d = { reconnu: true, portee: "tous", niveau: "administration", fonctions: ["sites", "administration"], siteIds: ["site"] };
  let courant = "a";
  const index = { sites: new Map([["site", { id: "site", titre: "Site", domaines: ["site.example.test"], clientId: "client" }]]),
    statuts: new Map([["a", { titre: "Initial", code: "INITIAL", actif: true, valide: true }],
      ["b", { titre: "Statut futur", code: "", actif: true, valide: true }],
      ["c", { titre: "Invalide", code: "INVALIDE", actif: true, valide: false }]]) };
  changer(droits, "sitesIndex", async () => index);
  changer(ecriture, "contexteGraph", async () => g);
  changer(dse, "chargerColonnesListe", async () => [{ name: "STATUTOFFICIEL", lookup: { listId: "statuts" } }]);
  changer(ecriture, "lireItemFrais", async () => ({ STATUTOFFICIELLookupId: courant }));
  changer(ecriture, "collecterFrais", async () => ["a", "b", "c"].map((id) => ({ id })));
  changer(ecriture, "etatStructureJournal", async () => ({ disponible: true }));
  try {
    const vue = await statuts.lire(d, "site.example.test");
    assert.deepStrictEqual(vue.statuts.map((s) => s.titre), ["Initial", "Statut futur"]);
    assert.strictEqual(vue.actuel, vue.statuts[0].ref);
    const op = await statuts.construire(d, { domaine: "site.example.test", statut: vue.statuts[1].ref }, g);
    assert.deepStrictEqual(op.op.champs, { STATUTOFFICIELLookupId: "b" });
    assert.strictEqual(op.op.itemId, "site");
    assert.deepStrictEqual(op.op.avantValeurs, { STATUTOFFICIELLookupId: "a" });
    assert.strictEqual(op.op.contexteJournal.clientId, "client");
    assert.ok((await statuts.construire({ ...d, portee: "client" }, {}, g)).refus);
    assert.ok((await statuts.construire(d, { domaine: "intrus.example.test", statut: vue.statuts[1].ref }, g)).refus);
    assert.ok((await statuts.construire(d, { domaine: "site.example.test", statut: "id-non-autorise" }, g)).refus);
    courant = "b";
    assert.ok((await statuts.construire(d, { domaine: "site.example.test", statut: vue.statuts[1].ref }, g)).aucunChangement);
    ecriture.etatStructureJournal = async () => ({ disponible: false, raison: "Journal indisponible" });
    assert.ok((await statuts.construire(d, { domaine: "site.example.test", statut: vue.statuts[0].ref }, g)).op,
      "une panne de journal ne bloque pas le changement de statut");
    const ui = await import("../../modules/cockpit/cockpit.js");
    const html = ui.rendreListeSites({ fonctions: ["sites"] }, { peutChangerStatut: true, elements: [
      { nom: "Site", acces: "alias.example.test", domaine: "site.example.test", statut: { titre: "Futur", actif: false } }] });
    assert.ok(html.includes('data-changer-statut="alias.example.test"'));
    assert.ok(html.includes('href="#/cockpit/site/alias.example.test"'));
    assert.ok(html.includes('href="https://site.example.test/" target="_blank"'));
    const lecteur = ui.rendreListeSites({}, { elements: [{ nom: "Site", acces: "site.example.test", domaine: "site.example.test" }] });
    assert.ok(!lecteur.includes("data-changer-statut"));
  } finally { restaurer.reverse().forEach((r) => r()); }
  console.log("Statuts dynamiques, controle global, Lookup officiel, aucun changement et liens par site OK");
})().catch((e) => { console.error(e); process.exitCode = 1; });
