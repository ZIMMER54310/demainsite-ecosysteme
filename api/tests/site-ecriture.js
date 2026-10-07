"use strict";

const assert = require("node:assert/strict");
const site = require("../shared/site-ecriture");

const donnees = {
  dynamique: {
    operations: [{ operation: "site.creer", mode: "create", capaciteId: "cap-1", actionId: "action-1" },
      { operation: "site.valider", mode: "validate", capaciteId: "cap-2", actionId: "action-2" }],
    roles: [{ id: "role-1" }],
    bases: [{ roleId: "role-1", capaciteId: "cap-1" }, { roleId: "role-1", capaciteId: "cap-2" }],
    possibles: [{ capaciteId: "cap-1", actionId: "action-1" },
      { capaciteId: "cap-2", actionId: "action-2" }],
    permissions: [{ utilisateurId: "user-1", affectationId: null,
      capaciteId: "cap-1", actionId: "action-1", autorisation: true },
    { utilisateurId: "user-1", affectationId: null,
      capaciteId: "cap-2", actionId: "action-2", autorisation: true }]
  }
};

const droits = { reconnu: true, global: true, roleId: "role-1", utilisateurId: "user-1" };
assert.equal(site.operationGlobaleAutorisee(droits, donnees, "site.creer"), true);
assert.equal(site.operationGlobaleAutorisee(droits, donnees, "site.valider"), true);
assert.equal(site.operationGlobaleAutorisee({ ...droits, global: false }, donnees, "site.creer"), false);
assert.equal(site.operationGlobaleAutorisee({ ...droits, roleId: "role-2" }, donnees, "site.creer"), false);
assert.equal(site.operationGlobaleAutorisee(droits, {
  ...donnees,
  dynamique: { ...donnees.dynamique, possibles: [] }
}, "site.creer"), false);
assert.equal(site.operationGlobaleAutorisee(droits, {
  ...donnees,
  dynamique: { ...donnees.dynamique, permissions: [] }
}, "site.creer"), false);
assert.equal(site.operationGlobaleAutorisee(droits, {
  ...donnees,
  dynamique: { ...donnees.dynamique, permissions: [
    { utilisateurId: "user-1", affectationId: "site-assignment",
      capaciteId: "cap-1", actionId: "action-1", autorisation: true }
  ] }
}, "site.creer"), false);
assert.equal(site.operationGlobaleAutorisee(droits, {
  ...donnees,
  dynamique: { ...donnees.dynamique, permissions: [
    ...donnees.dynamique.permissions,
    { utilisateurId: "user-1", affectationId: null,
      capaciteId: "cap-1", actionId: "action-1", autorisation: false }
  ] }
}, "site.creer"), false);
assert.equal(site.operationGlobaleAutorisee(droits, {
  ...donnees,
  dynamique: { ...donnees.dynamique, operations: [{ ...donnees.dynamique.operations[0], mode: "write" }] }
}, "site.creer"), false);
assert.equal(site.operationGlobaleAutorisee(droits, donnees, "site.modifier"), false);

assert.equal(site._test.nomValide("  Site réel  "), "Site réel");
assert.equal(site._test.nomValide(""), null);
assert.equal(site._test.nomValide("x".repeat(256)), null);
assert.equal(site._test.nomValide("Site\u0000interdit"), null);
assert.equal(site._test.validerObligatoires([
  { name: "Title", required: true, text: {} },
  { name: "Client", required: true, lookup: { allowMultipleValues: false } }
], { Title: "Site", ClientLookupId: "12" }), null);
assert.match(site._test.validerObligatoires([
  { name: "Title", required: true, text: {} },
  { name: "Client", displayName: "Client", required: true, lookup: { allowMultipleValues: false } }
], { Title: "Site" }), /Client/);

const reference = site._test.referenceDomaine("liste-1", "47");
assert.equal(reference, site._test.referenceDomaine("liste-1", "47"));
assert.notEqual(reference, site._test.referenceDomaine("liste-1", "48"));
assert.equal(site._test.lireReferenceBrouillon({ fournisseur: "entra", sujet: "user-1" }, "unknown"), null);

(async () => {
  const refus = await site.preparerCreation({
    identite: { fournisseur: "entra", sujet: "user-1" },
    droits: { reconnu: true, global: false, roleId: "role-1", utilisateurId: "user-1" },
    donnees, nom: "Site", reference: "opaque"
  });
  assert.equal(refus.status, 403);
  assert.match(refus.erreur, /création globale de site n'est pas autorisée/);
  console.log("OK site-ecriture : droit global, contrôles de saisie, références et refus fail-closed");
})().catch((erreur) => {
  console.error(erreur);
  process.exitCode = 1;
});
