"use strict";

const assert = require("node:assert/strict");
const dse = require("../shared/dse");
const { DEFINITIONS, planifierChampsObligatoires, verifier } = require("../tools/provision-multi-menus");
const multiMenus = require("../shared/multi-menus");

const ids = {
  "OBJ-MENU": DEFINITIONS["OBJ-MENU"].id,
  "OBJ-MENU-ENTREE": DEFINITIONS["OBJ-MENU-ENTREE"].id,
  "OBJ-MENU-AFFECTATION": DEFINITIONS["OBJ-MENU-AFFECTATION"].id,
  "OBJ-SITE-PUBLIC": "site-list",
  "OBJ-ACTIF": "active-list",
  "OBJ-VALIDE": "valid-list",
  "OBJ-PAGES-SITE": "page-list",
  "OBJ-ENTETE-SITE": "header-list",
  "OBJ-FOOTER-SITE": "footer-list"
};
const columns = Object.fromEntries(Object.entries(DEFINITIONS).map(([name, def]) => [
  ids[name], Object.entries(def.colonnes).map(([internal, expected]) => ({
    name: internal,
    displayName: internal,
    required: expected.required === true,
    indexed: expected.indexed === true,
    enforceUniqueValues: expected.unique === true,
    ...(expected.type === "lookup" ? { lookup: { listId: ids[expected.cible], allowMultipleValues: false } } :
      expected.type === "text" ? { text: {} } :
        expected.type === "number" ? { number: {} } :
          expected.type === "boolean" ? { boolean: {} } : { dateTime: {} })
  }))
]));

const originalCollecter = dse.collecter;
const originalColonnes = dse.chargerColonnesListe;
dse.collecter = async () => Object.entries(ids).map(([displayName, id]) => ({ id, displayName }));
dse.chargerColonnesListe = async (_token, _siteId, listId) => columns[listId] || [];

async function main() {
  try {
    const manquantes = JSON.parse(JSON.stringify(columns));
    manquantes[ids["OBJ-MENU"]].find((x) => x.name === "OBJSITEPUBLIC").required = false;
    const plan = planifierChampsObligatoires(
      Object.entries(ids).map(([displayName, id]) => ({ displayName, id })),
      manquantes
    );
    assert.deepEqual(plan.map((x) => `${x.liste}.${x.colonne}`), ["OBJ-MENU.OBJSITEPUBLIC"]);
    const result = await verifier("test-token", "test-site");
    assert.equal(result.conforme, true, result.erreurs.join(", "));
    assert.deepEqual(result.ids, {
      "OBJ-MENU": DEFINITIONS["OBJ-MENU"].id,
      "OBJ-MENU-ENTREE": DEFINITIONS["OBJ-MENU-ENTREE"].id,
      "OBJ-MENU-AFFECTATION": DEFINITIONS["OBJ-MENU-AFFECTATION"].id
    });
    const bad = columns[ids["OBJ-MENU-ENTREE"]].find((x) => x.name === "OBJMENU");
    bad.lookup.listId = "wrong-list";
    const invalid = await verifier("test-token", "test-site");
    assert.equal(invalid.conforme, false);
    assert.ok(invalid.erreurs.some((x) => x.includes("OBJ-MENU-ENTREE.OBJMENU")));
    const graph = { token: "test-token", siteGraphId: "test-site", listes: [
      { displayName: "OBJ-PAGES-SITE", id: "page-list" },
      { displayName: "OBJ-ACTIF", id: "active-list" }
    ] };
    columns["page-list"] = [
      { name: "OBJACTIF", lookup: { listId: "active-list", allowMultipleValues: false } }
    ];
    const relation = await multiMenus._test.lookupVers(graph, "OBJ-PAGES-SITE", "OBJ-ACTIF");
    assert.equal(relation.list.id, "page-list");
    assert.equal(relation.column.lookup.listId, "active-list");
    console.log("Schéma multi-menus : Lookups, requis, unicité, index et résolution de relation vérifiés.");
  } finally {
    dse.collecter = originalCollecter;
    dse.chargerColonnesListe = originalColonnes;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
