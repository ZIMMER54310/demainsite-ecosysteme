"use strict";

const assert = require("node:assert/strict");
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const journal = require("../shared/journal-comptes");
const { DEFINITIONS } = require("../tools/provision-multi-menus");
const initialisation = require("../shared/initialisation-menu-site");

const ids = {
  "OBJ-MENU": "menu-list", "OBJ-MENU-ENTREE": "entry-list", "OBJ-MENU-AFFECTATION": "assignment-list",
  "OBJ-SITE-PUBLIC": "site-list", "OBJ-ACTIF": "active-list", "OBJ-VALIDE": "valid-list",
  "OBJ-PAGES-SITE": "page-list", "OBJ-ENTETE-SITE": "header-list", "OBJ-FOOTER-SITE": "footer-list"
};
const listItems = Object.fromEntries(Object.values(ids).map((id) => [id, []]));
const listColumns = {};
for (const [name, definition] of Object.entries(DEFINITIONS)) {
  listColumns[ids[name]] = Object.entries(definition.colonnes).map(([internal, spec]) => ({
    name: internal, displayName: internal, required: spec.required === true,
    indexed: spec.indexed === true, enforceUniqueValues: spec.unique === true,
    ...(spec.type === "lookup" ? { lookup: { listId: ids[spec.cible], allowMultipleValues: false } } :
      spec.type === "text" ? { text: {} } :
        spec.type === "number" ? { number: {} } :
          spec.type === "boolean" ? { boolean: {} } : { dateTime: {} })
  }));
}
const lookup = (name, target) => ({ name, displayName: name, lookup: { listId: ids[target], allowMultipleValues: false } });
listColumns[ids["OBJ-PAGES-SITE"]] = [
  { name: "Title", text: {} }, lookup("OBJSITE", "OBJ-SITE-PUBLIC"), { name: "URL", text: {} },
  lookup("OBJACTIF", "OBJ-ACTIF"), lookup("OBJVALIDE", "OBJ-VALIDE"), lookup("OBJENTETESITE", "OBJ-ENTETE-SITE")
];
listColumns[ids["OBJ-ENTETE-SITE"]] = [
  { name: "Title", text: {} }, lookup("OBJSITE", "OBJ-SITE-PUBLIC"),
  lookup("OBJACTIF", "OBJ-ACTIF"), lookup("OBJVALIDE", "OBJ-VALIDE")
];
listColumns[ids["OBJ-FOOTER-SITE"]] = [
  { name: "Title", text: {} }, lookup("OBJSITE", "OBJ-SITE-PUBLIC"),
  lookup("OBJACTIF", "OBJ-ACTIF"), lookup("OBJVALIDE", "OBJ-VALIDE")
];
for (const [name, id] of Object.entries(ids)) listItems[id] = [];
listItems[ids["OBJ-ACTIF"]].push(
  { id: "act-yes", fields: { Title: "Oui" } }, { id: "act-no", fields: { Title: "Non" } },
  { id: "act-draft", fields: { Title: "Brouillon" } });
listItems[ids["OBJ-VALIDE"]].push(
  { id: "valid-yes", fields: { Title: "Oui" } }, { id: "valid-no", fields: { Title: "Non" } });

(async () => {
  const restore = [];
  const mock = (obj, key, value) => {
    const old = obj[key];
    restore.push(() => { obj[key] = old; });
    obj[key] = value;
  };
  let nextId = 0;
  const graph = { token: "test", siteGraphId: "graph-site",
    listes: Object.entries(ids).map(([displayName, id]) => ({ displayName, id })) };
  const journalCycles = [];
  mock(ecriture, "contexteGraph", async () => graph);
  mock(dse, "chargerColonnesListe", async (_token, _site, id) => listColumns[id] || []);
  mock(ecriture, "collecterFrais", async (_g, path) => {
    const id = decodeURIComponent(path.match(/\/lists\/([^/]+)\/items/)?.[1] || "");
    return (listItems[id] || []).map((x) => ({ id: x.id, fields: { ...x.fields } }));
  });
  mock(ecriture, "lireItemFrais", async (_g, listId, itemId) =>
    ({ ...(listItems[listId] || []).find((x) => x.id === String(itemId))?.fields }));
  mock(dse, "graphEcriture", async (_token, method, path, body) => {
    assert.equal(method, "POST");
    const listId = decodeURIComponent(path.match(/\/lists\/([^/]+)\/items/)?.[1] || "");
    const item = { id: String(++nextId), fields: { ...body.fields } };
    listItems[listId].push(item);
    return { id: item.id };
  });
  mock(journal, "commencer", async (_g, op) => {
    journalCycles.push({ statut: "DÉBUT", ...op });
    return { itemId: String(journalCycles.length) };
  });
  mock(journal, "terminer", async (_g, _entry, result) => {
    journalCycles.push({ statut: "FIN", ...result });
  });
  try {
    const initial = await initialisation.initialiser({ siteId: "77" });
    assert.equal(initial.menu.cree, true);
    assert.equal(initial.accueil.presente, false);
    assert.equal(initial.affectation.affectee, false);
    assert.equal(listItems[ids["OBJ-MENU"]].length, 1);
    assert.equal(listItems[ids["OBJ-MENU-ENTREE"]].length, 0);
    assert.equal(listItems[ids["OBJ-MENU-AFFECTATION"]].length, 0);

    listItems[ids["OBJ-PAGES-SITE"]].push({
      id: "homepage-1", fields: { Title: "Accueil", OBJSITELookupId: "77", URL: "/",
        OBJACTIFLookupId: "act-yes", OBJVALIDELookupId: "valid-yes", OBJENTETESITELookupId: "header-1" }
    });
    listItems[ids["OBJ-ENTETE-SITE"]].push({
      id: "header-1", fields: { Title: "En-tête principal", OBJSITELookupId: "77",
        OBJACTIFLookupId: "act-yes", OBJVALIDELookupId: "valid-yes" }
    });
    listItems[ids["OBJ-ENTETE-SITE"]].push({
      id: "header-inactive", fields: { Title: "Ancien en-tête", OBJSITELookupId: "77",
        OBJACTIFLookupId: "act-no", OBJVALIDELookupId: "valid-yes" }
    });
    const repair = await initialisation.initialiser({ siteId: "77" });
    assert.equal(repair.menu.cree, false);
    assert.equal(repair.accueil.creee, true);
    assert.equal(repair.affectation.creee, true);
    assert.equal(listItems[ids["OBJ-MENU-AFFECTATION"]][0].fields.OBJENTETESITELookupId, "header-1");
    const repeat = await initialisation.initialiser({ siteId: "77" });
    assert.equal(repeat.accueil.creee, false);
    assert.equal(repeat.affectation.creee, false);
    assert.equal(listItems[ids["OBJ-MENU"]].length, 1, "menu sans doublon");
    assert.equal(listItems[ids["OBJ-MENU-ENTREE"]].length, 1, "entrée accueil sans doublon");
    assert.equal(listItems[ids["OBJ-MENU-AFFECTATION"]].length, 1, "affectation sans doublon");
    assert.ok(journalCycles.filter((x) => x.statut === "DÉBUT").length >= 3);
    assert.ok(journalCycles.filter((x) => x.statut === "SUCCÈS").length >= 3);
  } finally {
    for (const fn of restore.reverse()) fn();
  }
  console.log("Initialisation Menu principal : idempotence, Accueil réel, en-tête réel et journalisation OK");
})().catch((err) => { console.error(err); process.exitCode = 1; });
