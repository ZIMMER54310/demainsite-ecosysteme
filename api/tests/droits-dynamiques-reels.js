"use strict";

const path = require("node:path");
const assert = require("node:assert/strict");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const A = require("../auth/autorisations");
const droits = require("../auth/droits");

async function tester() {
  const g = await ecriture.contexteGraph();
  const data = await A.charger(g.token, g.siteGraphId, g.listes);
  const pilote = data.source["OBJ-UTILISATEUR"].items.find((i) => i.id === "2");
  assert.ok(pilote.fields.ENTRAOBJECTID, "Le pilote doit être lié à une identité Entra existante.");
  const relation = data.affectations.find((a) => a.id === "4");
  assert.equal(relation.utilisateurId, "2");
  assert.ok(relation.actif);
  const r = A.resoudre(data, pilote.id, "2");
  assert.ok(r.actif);
  assert.ok(r.affectations.some((a) => a.id === "4"));
  for (const op of ["entete.modifier", "footer.modifier", "pages.voir", "articles.creer", "articles.modifier"]) {
    assert.ok(A.autoriser(r, op).autorise, `Permission réelle attendue : ${op}`);
  }
  for (const op of ["pages.modifier", "pages.creer", "pages.publier", "parametres.modifier",
    "utilisateurs.modifier", "boutique.modifier", "operation.inconnue"]) {
    assert.equal(A.autoriser(r, op).autorise, false, `Refus attendu : ${op}`);
  }
  const permis = new Set(r.operations.map((o) => `${o.capaciteId}/${o.actionId}`));
  assert.equal(permis.size, 5, "Les opérations techniques ne doivent pas ajouter de paire capacité/action.");
  for (const site of data.source["OBJ-SITE-PUBLIC"].items) {
    if (!r.siteIds.includes(site.id)) assert.equal(A.resoudre(data, pilote.id, site.id).actif, false);
  }
  assert.equal(A.resoudre(data, "identifiant-inexistant", "2").actif, false);
  const denies = data.permissions.filter((p) => p.autorisation === false);
  for (const p of denies) {
    const contextes = A.ciblesPour(data, data.affectations.find((a) => a.id === p.affectationId));
    for (const site of contextes.cibles) {
      assert.ok(!A.resoudre(data, p.utilisateurId, site.id).operations.some((o) =>
        o.capaciteId === p.capaciteId && o.actionId === p.actionId));
    }
  }
  dse.viderCacheGraph();
  droits.viderCache();
  const identiteNative = { fournisseur: "entra", sujet: pilote.fields.ENTRAOBJECTID };
  const base = await droits.droitsPour(identiteNative);
  const contexte = droits.contexteSite(base, await droits.donneesDroits(), "2");
  assert.equal(contexte.contexte.etat, "COMPLET");
  assert.ok(contexte.fonctions.includes("articles"));
  assert.ok(!contexte.fonctions.includes("utilisateurs"));
  assert.ok(!contexte.fonctions.includes("administration"));
  assert.ok(base.siteIds.includes("2"));
  const donnees = await droits.donneesDroits();
  for (const u of donnees.utilisateurs.filter((u) => u.entraObjectId && u.actif && u.valide)) {
    const global = await droits.droitsPour({ fournisseur: "entra", sujet: u.entraObjectId });
    if (!global.global) continue;
    const s = donnees.sites.find((s) => s.actif && s.valide &&
      !donnees.liens.some((l) => l.utilisateurId === u.id && l.siteId === s.id));
    if (!s) continue;
    const c = droits.contexteSite(global, donnees, s.id);
    assert.equal(c.contexte.etat, "COMPLET");
    assert.equal(c.contexte.source, "POLITIQUE-GLOBALE-SHAREPOINT");
    assert.deepEqual(c.fonctions, global.fonctions, "Aucune fonction inventée au changement de cible.");
  }
  console.log("Droits dynamiques natifs : cinq paires autorisées, refus et contexte serveur conformes.");
  console.log(`Restrictions explicites réelles contrôlées : ${denies.length}. Aucune donnée de test écrite.`);
  console.log("Cette recette de résolution native ne constitue PAS un test OAuth ou une écriture métier.");
}

if (require.main === module) tester().catch((e) => { console.error(e.message); process.exitCode = 1; });

module.exports = { tester };
