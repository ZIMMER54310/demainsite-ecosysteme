"use strict";
// Galerie : filtrage par droits resolus, domaine principal officiel, bouton cockpit conditionnel.
const assert = require("assert");
const G = require("../shared/galerie");

const complet = (extra = {}) => ({ reconnu: true, contexte: { etat: "COMPLET" }, fonctions: [], contraintesOperations: [], ...extra });
const dyn = (ops) => complet({ autorisations: { operations: ops.map((code) => ({ code, autorise: true })) } });
const autorisations = require("../auth/autorisations");
const original = autorisations.autoriser;
autorisations.autoriser = (a, op) => ({ autorise: a.operations.some((o) => o.code === op && o.autorise) });

const groupes = [
  { id: "1", titre: "Alpha", domainePrincipal: "alpha.fr", domainePrincipalId: "11", domaines: ["alpha.fr", "alias-alpha.fr"], statutId: "1", fiches: ["1"] },
  { id: "2", titre: "Beta", domainePrincipal: "beta.fr", domainePrincipalId: "12", domaines: ["beta.fr"], statutId: "2", fiches: ["2"] },
  { id: "3", titre: "Gamma", domainePrincipal: "gamma.fr", domainePrincipalId: null, domaines: ["gamma.fr"], statutId: "1", fiches: ["3"] }
];
const statuts = new Map([["1", { titre: "Construction" }], ["2", { titre: "Actif" }]]);
const cockpits = new Map([["1", [{ id: "1", titre: "Cockpit" }]], ["2", [{ id: "1", titre: "Cockpit" }]]]);
const droitsParSite = {
  1: dyn(["galerie.voir", "cockpit.ouvrir"]),
  2: dyn(["galerie.voir"]),
  3: complet({ fonctions: ["galerie", "cockpit"] })
};
const cartes = G.construireCartes({ groupes, statuts, cockpits, resumes: new Map(), contexte: (g) => droitsParSite[g.id] });

assert.strictEqual(cartes.length, 3, "sites autorises par galerie.voir");
const [a, b, c] = cartes;
assert.strictEqual(a.urlSite, "https://alpha.fr", "Voir le site = domaine principal, jamais l'alias");
assert.strictEqual(a.cockpit.url, "/cockpit/site/alpha.fr", "cockpit.ouvrir + relation = bouton");
assert.strictEqual(b.cockpit, null, "sans cockpit.ouvrir : aucun bouton");
assert.strictEqual(c.urlSite, null, "sans Lookup DOMAIN-PRINCIPAL : pas d'URL inventee");
assert.strictEqual(c.cockpit, null, "sans relation OBJ-SITE-COCKPIT : pas de bouton");
assert.ok(!("id" in a) && !("fiches" in a), "aucun identifiant technique expose");

// Refus : sans galerie.voir, contrainte explicite, contexte incomplet ou non reconnu.
const refus = [dyn(["cockpit.ouvrir"]), complet({ fonctions: ["galerie"], contraintesOperations: ["galerie.voir"] }),
  { ...complet({ fonctions: ["galerie"] }), contexte: { etat: "CONTEXTE INCOMPLET" } }, { reconnu: false, fonctions: ["galerie"] }];
for (const d of refus) assert.strictEqual(G.construireCartes({ groupes: [groupes[0]], statuts, cockpits, contexte: () => d }).length, 0);

// Recherche, filtres, tri et pagination cote serveur.
let r = G.filtrer(cartes, { q: "bet" });
assert.deepStrictEqual(r.elements.map((x) => x.nom), ["Beta"]);
r = G.filtrer(cartes, { statut: "Construction", tri: "nom", sens: "desc" });
assert.deepStrictEqual(r.elements.map((x) => x.nom), ["Gamma", "Alpha"]);
r = G.filtrer(cartes, { cockpit: "oui" });
assert.deepStrictEqual(r.elements.map((x) => x.nom), ["Alpha"]);
r = G.filtrer(cartes, { parPage: "2", page: "2" });
assert.strictEqual(r.pages, 2); assert.deepStrictEqual(r.elements.map((x) => x.nom), ["Gamma"]);
r = G.filtrer(cartes, { tri: "inconnu", page: "99", parPage: "9999" });
assert.strictEqual(r.criteres.tri, "nom"); assert.strictEqual(r.parPage, 48); assert.strictEqual(r.page, 1);

// Menu : entree Galerie uniquement si resolue cote serveur.
const adm = require("../shared/administration");
(async () => {
  const d = { reconnu: true, global: false, niveau: "lecture", fonctions: [], contexte: { etat: "PARTIEL" } };
  assert.ok(!(await adm.menu(d)).some((e) => e.cle === "galerie"));
  assert.ok((await adm.menu(d, null, { galerie: true })).some((e) => e.cle === "galerie" && e.url === "/cockpit/galerie"));
  autorisations.autoriser = original;
  console.log("Galerie : tests OK");
})().catch((e) => { console.error(e); process.exit(1); });
