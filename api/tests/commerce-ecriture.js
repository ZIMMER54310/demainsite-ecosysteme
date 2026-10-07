"use strict";

const assert = require("node:assert/strict");
const { _test } = require("../shared/commerce-ecriture");

const listes = [
  { id: "native-site-usage-list", displayName: "OBJ-SITE-USAGE" },
  { id: "native-usage-list", displayName: "OBJ-USAGE-SITE" }
];
assert.equal(_test.trouverListe(listes, "OBJ-SITE-USAGE").id, "native-site-usage-list");
assert.throws(() => _test.trouverListe([...listes, listes[0]], "OBJ-SITE-USAGE"), /unique requise/);

const colonnes = [
  { name: "ObjSitePublic", displayName: "OBJ-SITE-PUBLIC", lookup: { listId: "site-list" } },
  { name: "ObjUsageSite", displayName: "OBJ-USAGE-SITE", lookup: { listId: "usage-list" } },
  { name: "DateEffet", displayName: "DATE-EFFET", dateTime: {} },
  { name: "EmpreinteSiteUsage", displayName: "EMPREINTE-SITE-USAGE", text: {} }
];
assert.equal(_test.trouverColonne(colonnes, ["OBJ-SITE-PUBLIC"], "lookup"), colonnes[0]);
assert.equal(_test.trouverColonne(colonnes, ["DATE-EFFET"], "dateTime").name, "DateEffet");
assert.equal(_test.trouverColonne(colonnes, ["EMPREINTE-SITE-USAGE"], "text").name, "EmpreinteSiteUsage");
assert.throws(() => _test.trouverColonne([...colonnes, colonnes[2]], ["DATE-EFFET"], "dateTime"), /unique requise/);

const refs = { usages: [{ id: "native-usage-1", titre: "Actualité" }] };
assert.equal(_test.resoudreUsage(refs, "native-usage-1").titre, "Actualité");
assert.equal(_test.resoudreUsage(refs, "invented"), undefined);
const reference = _test.referenceUsage("native-list-id", "native-usage-1");
assert.equal(_test.referenceUsage("native-list-id", "native-usage-1"), reference);
assert.notEqual(_test.referenceUsage("other-list-id", "native-usage-1"), reference);

assert.equal(_test.dateEffetValide("2026-10-15"), true);
assert.equal(_test.dateEffetValide("2026-02-30"), false);
assert.equal(_test.dateEffetValide("15/10/2026"), false);
assert.equal(_test.dateEffetValide("2026-1-5"), false);
assert.equal(_test.operationAutorisee({ autorisations: { actif: true, operations: [{ operation: "usage-site.creer" }] } }, "usage-site.creer"), true);
assert.equal(_test.operationAutorisee({ autorisations: { actif: true, operations: [] } }, "usage-site.creer"), false);
assert.equal(_test.operationAutorisee(null, "usage-site.creer"), false);
const autorisations = { actif: true, operations: [{ operation: "usage-site.creer" }] };
assert.equal(_test.refuserSiHorsPortee({ reconnu: true, siteIds: ["site-1"], autorisations },
  "site-1", "usage-site.creer"), null);
assert.match(_test.refuserSiHorsPortee({ reconnu: true, siteIds: ["site-1"], autorisations },
  "site-2", "usage-site.creer"), /périmètre/);
assert.match(_test.refuserSiHorsPortee({ reconnu: true, siteIds: ["site-1"], autorisations: { actif: true, operations: [] } },
  "site-1", "usage-site.creer"), /pas autorisée/);

(async () => {
  const refuseSansDroit = await require("../shared/commerce-ecriture").preparerAjoutUsage({
    identite: { fournisseur: "entra", sujet: "pilote" },
    droits: { reconnu: true, siteIds: ["site-1"], autorisations: { actif: true, operations: [] } },
    siteId: "site-1", usageReference: reference, dateEffet: "2026-10-15"
  });
  assert.equal(refuseSansDroit.status, 403);
  assert.match(refuseSansDroit.erreur, /usage-site\.creer/);
  console.log("Aperçu usage-site : noms SharePoint, référence, date, opération et périmètre vérifiés (refus sans droit)");
})().catch((error) => { console.error(error); process.exitCode = 1; });
