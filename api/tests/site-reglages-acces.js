"use strict";

const assert = require("assert");
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const journal = require("../shared/journal-comptes");
const reglage = require("../shared/site-reglages-acces");

(async () => {
  const restore = [];
  const mock = (obj, key, value) => {
    const old = obj[key];
    restore.push(() => { obj[key] = old; });
    obj[key] = value;
  };
  const liste = { id: "site-list", displayName: "OBJ-SITE-PUBLIC" };
  const champs = ["OBJACCESCOCKPIT", "OBJCREATIONCOMPTE", "OBJAPPROBATIONPROPRIETAIRE"]
    .map((name) => ({ name, boolean: {}, hidden: false, readOnly: false }));
  const fields = { OBJACCESCOCKPIT: true, OBJCREATIONCOMPTE: false, OBJAPPROBATIONPROPRIETAIRE: true };
  const cycles = [];
  mock(dse, "trouverListe", () => liste);
  mock(dse, "chargerColonnesListe", async () => champs);
  mock(ecriture, "contexteGraph", async () => ({ token: "test", siteGraphId: "graph", listes: [liste] }));
  mock(ecriture, "lireItemFrais", async () => ({ ...fields }));
  mock(dse, "graphSansCache", async () => ({ eTag: '"etag"', fields: { ...fields } }));
  mock(dse, "graphEcriture", async (_token, method, path, body) => {
    assert.equal(method, "PATCH");
    assert.equal(path, "/sites/graph/lists/site-list/items/7/fields");
    Object.assign(fields, body);
  });
  mock(journal, "commencer", async (_g, entry) => {
    cycles.push({ type: "DÉBUT", ...entry });
    return { journal: true };
  });
  mock(journal, "terminer", async (_g, _entry, result) => {
    cycles.push({ type: "FIN", ...result });
  });
  try {
    assert.deepStrictEqual(await reglage.lire("7"), {
      afficherAccesCockpit: true, creationCompteAutorisee: false, approbationProprietaire: true
    });
    const result = await reglage.enregistrer({
      siteId: "7", acteurId: "12",
      valeurs: { afficherAccesCockpit: false, creationCompteAutorisee: true, approbationProprietaire: false }
    });
    assert.deepStrictEqual(result.valeurs, {
      afficherAccesCockpit: false, creationCompteAutorisee: true, approbationProprietaire: false
    });
    assert.deepStrictEqual(cycles.map((x) => x.type), ["DÉBUT", "FIN"]);
    assert.equal(cycles[1].statut, "SUCCÈS");
    assert.deepStrictEqual(reglage._test.lireValeurs({}, Object.fromEntries([
      ["afficherAccesCockpit", champs[0]], ["creationCompteAutorisee", champs[1]], ["approbationProprietaire", champs[2]]
    ])), reglage._test.DEFAUTS);
    await assert.rejects(() => reglage.enregistrer({
      siteId: "7", acteurId: "12", valeurs: { afficherAccesCockpit: "oui" }
    }), /invalides/);
  } finally {
    for (const fn of restore.reverse()) fn();
  }
  console.log("Réglages d’accès : valeurs par défaut, validation, écriture SharePoint et journalisation OK");
})().catch((err) => { console.error(err); process.exitCode = 1; });
