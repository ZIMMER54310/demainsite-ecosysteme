"use strict";
/*
 * Articles du site selectionne : la colonne URL de OBJ-ARTICLE est un chemin.
 * Le domaine n'est jamais saisi ; l'adresse publique vient du domaine principal officiel.
 */
const assert = require("assert");
const { _test } = require("../shared/edition");
const { normaliserChemin, champsDuComposant } = _test;

const champs = [{ nom: "Title", libelle: "Titre" }, { nom: "URL", libelle: "Url" }];
const art = champsDuComposant("articles", champs);
assert.strictEqual(art[1].libelle, "Chemin de l'article");
assert.strictEqual(art[1].chemin, true);
assert.ok(!art[0].chemin);
assert.strictEqual(champsDuComposant("pages", champs)[1].libelle, "Url", "autres composants inchanges");

assert.deepStrictEqual(normaliserChemin(""), { valeur: "" });
assert.deepStrictEqual(normaliserChemin("actualites/mon-article"), { valeur: "/actualites/mon-article" });
assert.deepStrictEqual(normaliserChemin("//x"), normaliserChemin("https://demainsite.fr/a"));
for (const refus of ["https://demainsite.fr/a", "http://x.fr", "//demainsite.fr/a", "demainsite.fr/a", "javascript:alert(1)", "/a b", "/../a", "/é"]) {
  assert.ok(normaliserChemin(refus).erreur, `refus attendu : ${refus}`);
}
assert.deepStrictEqual(normaliserChemin("/a//b/"), { valeur: "/a/b/" });

(async () => {
  global.window = { location: { origin: "https://dseco.fr" } };
  global.location = { hostname: "dseco.fr", hash: "", origin: "https://dseco.fr" };
  global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  global.document = { body: { classList: { remove() {}, add() {}, contains: () => false } }, querySelector: () => null, querySelectorAll: () => [] };
  const m = await import("../../modules/cockpit/cockpit.js");
  assert.strictEqual(m.adressePublique("demainsite.fr", "/actualites/a"), "https://demainsite.fr/actualites/a");
  assert.strictEqual(m.adressePublique("demainsite.fr", "actualites/a"), "https://demainsite.fr/actualites/a");
  assert.strictEqual(m.adressePublique("", "/a"), "(domaine principal non renseigné)");
  const moi = { nom: "Pilote", fonctions: ["sites"], menu: [] };
  const html = m.rendreEdition(moi, { disponible: true, creation: true, libelle: "Articles", site: "DemainSite", domaine: "demainsite.fr",
    domainePrincipal: "demainsite.fr", champs: [{ cle: "Title", libelle: "Titre", valeur: "" }, { cle: "URL", libelle: "Chemin de l'article", chemin: true, valeur: "" }] },
  { domaine: "demainsite.fr", composant: "articles", element: "nouveau" });
  assert.ok(html.includes("Chemin de l&#039;article") || html.includes("Chemin de l'article"));
  assert.ok(!/>Url</.test(html), "libelle Url encore visible");
  assert.ok(html.includes("https://demainsite.fr"), "domaine principal non affiche");
  assert.ok(html.includes("data-chemin-apercu"));
  console.log("Tests articles (chemin) : OK");
})().catch((e) => { console.error(e); process.exit(1); });
