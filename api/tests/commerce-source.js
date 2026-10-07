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

console.log("Référentiels SharePoint commerce : filtres dynamiques et IDs natifs OK");
