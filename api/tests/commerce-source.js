"use strict";

const assert = require("node:assert/strict");
const { _test } = require("../shared/commerce-source");

const actif = (titre) => ({ relations: { "OBJ-ACTIF": { id: "active-ref", titre } } });
const valide = (titre) => ({ relations: { "OBJ-VALIDE": { id: "valid-ref", titre } } });

assert.equal(_test.etatOui({ relations: { "OBJ-ACTIF": { id: "1", titre: "Oui - Actif" } } }, "OBJ-ACTIF"), true);
assert.equal(_test.etatOui({ relations: { "OBJ-ACTIF": { id: "2", titre: "Non" } } }, "OBJ-ACTIF"), false);
assert.equal(_test.etatOui({ _fields: { Active: true }, _colonnes: [{ name: "Active", displayName: "OBJ-ACTIF" }] }, "OBJ-ACTIF"), true);
assert.equal(_test.etatOui({}, "OBJ-ACTIF"), null);

const eligibles = _test.filtrerActifs([
  { id: "native-1", _fields: { Title: "A" }, configuration: { Titre: "A" }, relations: { ...actif("Oui - Actif").relations, ...valide("Oui").relations } },
  { id: "native-2", _fields: { Title: "B" }, configuration: { Titre: "B" }, relations: { ...actif("Non - Actif").relations, ...valide("Oui").relations } },
  { id: "native-3", _fields: { Title: "C" }, configuration: { Titre: "C" }, relations: { ...actif("Oui - Actif").relations, ...valide("Non").relations } }
]);
assert.deepEqual(eligibles.map((x) => x.id), ["native-1"]);
assert.equal(eligibles[0].titre, "A");
assert.equal(eligibles[0].actif, true);
assert.equal(eligibles[0].valide, true);

const option = { id: "native-option", relations: { "OBJ-TYPE-BOUTIQUE": [
  { id: "native-type", titre: "Boutique" }
] } };
assert.deepEqual(_test.relation(option, "OBJ-TYPE-BOUTIQUE"), [{ id: "native-type", titre: "Boutique" }]);

const contratAutorise = [
  { name: "Title", required: true, indexed: true, enforceUniqueValues: true, text: {} },
  { name: "CODE", required: true, indexed: true, enforceUniqueValues: true, text: {} },
  { name: "NOM", required: true, text: {} },
  { name: "ACTION", text: {} }, { name: "DATEEVENEMENT", dateTime: {} },
  { name: "CLEIDEMPOTENCE", required: false, indexed: true, enforceUniqueValues: true, text: {} },
  { name: "ANCIENNEVALEUR", text: {} },
  { name: "NOUVELLEVALEUR", text: {} }, { name: "STATUTJRN", required: true,
    choice: { choices: ["DÉBUT", "SUCCÈS", "ÉCHEC", "FIN", "REFUS"] } },
  { name: "ANOMALIE", required: true, boolean: {} }, { name: "ANOMALIEDETECTEE", boolean: {} }
];
assert.equal(_test.verifierContratJournal(contratAutorise), true);
assert.equal(_test.verifierContratJournal([...contratAutorise, { name: "AUTRE", required: true, text: {} }]), false,
  "un champ obligatoire hors contrat désactive les écritures");
assert.equal(_test.verifierContratJournal(contratAutorise.filter((x) => x.name !== "CLEIDEMPOTENCE")), false,
  "pas d'idempotence sans clé");
assert.equal(_test.verifierContratJournal(contratAutorise.map((x) =>
  x.name === "CLEIDEMPOTENCE" ? { ...x, enforceUniqueValues: false } : x)), false,
  "la clé d'idempotence doit être unique côté SharePoint");
assert.equal(_test.verifierContratJournal(contratAutorise.map((x) =>
  x.name === "CLEIDEMPOTENCE" ? { ...x, indexed: false } : x)), false,
  "la clé d'idempotence doit être indexée côté SharePoint");
assert.equal(_test.verifierContratJournal([{ ...contratAutorise[0] }, ...contratAutorise.slice(1).map((x) =>
  x.name === "STATUTJRN" ? { ...x, choice: { choices: ["DÉBUT", "SUCCÈS", "ÉCHEC", "FIN"] } } : x)]), false,
  "le refus humain explicite doit être un état journalisable");

console.log("Référentiels commerce et contrat OBJ-JRN : schema, cycle, idempotence et champs natifs OK");
