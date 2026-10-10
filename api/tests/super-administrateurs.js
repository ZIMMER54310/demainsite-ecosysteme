"use strict";

process.env.DSE_SESSION_SECRET = "x".repeat(40);
const assert = require("node:assert/strict");
const D = require("../auth/droits");
const admin = require("../shared/administration");
const E = require("../shared/ecriture");
const siteEcriture = require("../shared/site-ecriture");

(async () => {
  const superRegle = { portee: "tous", niveau: "administration", fonctions: ["administration", "utilisateurs", "plateforme", "sites"] };
  const regleAdmin = { portee: "attribues", niveau: "administration", fonctions: ["administration", "utilisateurs", "sites"] };
  const politique = { roles: { super: superRegle, admin: regleAdmin } };
  const donnees = {
    politique, utilisateurs: [
      { id: "1", titre: "Premier", roleId: "super", roleTitre: "Super administrateur", actif: true, valide: true, entraObjectId: "identite-1" },
      { id: "2", titre: "Second", roleId: "super", roleTitre: "Super administrateur", actif: true, valide: true, entraObjectId: "identite-2" }
    ], roles: [
      { id: "super", titre: "Super administrateur", actif: true, valide: true, portee: "TOUS", niveau: "ADMINISTRATION", fonctions: "administration,utilisateurs,plateforme,sites" },
      { id: "admin", titre: "Administrateur", actif: true, valide: true, portee: "ATTRIBUES", niveau: "ADMINISTRATION", fonctions: "administration,utilisateurs,sites" }
    ], liens: [], clients: [{ id: "c1", titre: "Client" }],
    sites: [{ id: "s1", clientId: "c1", actif: true, valide: true }, { id: "s2", clientId: "c1", actif: true, valide: true }],
    structure: { listes: { utilisateur: "users", role: "roles" }, colonnes: { utilisateurRole: "Role" } },
    dynamique: { operations: [
      { id: "o1", operation: "menu.entree.supprimer", fonction: "menu", mode: "write" },
      { id: "o2", operation: "site.creer", fonction: "sites", mode: "create" }
    ], roles: [{ id: "super" }], bases: [], permissions: [], possibles: [], affectations: [] }
  };
  const d = { reconnu: true, global: true, roleId: "super", utilisateurId: "1",
    portee: "tous", niveau: "administration", fonctions: superRegle.fonctions, siteIds: ["s1", "s2"],
    clientIds: ["c1"], contexte: { etat: "COMPLET", siteId: "s1" } };
  assert.equal(D.estSuperAdministrateur(d), true);
  assert.equal(D.estSuperAdministrateur({ ...d, fonctions: regleAdmin.fonctions }), false);
  assert.equal(D.peutAttribuer(d, "super", politique), true, "le site sélectionné ne rétrograde pas le super administrateur");
  assert.equal(D.protegerSuperAdministrateurs(donnees, "2", "admin"), null, "un autre super reste");
  const premier = donnees.utilisateurs[0];
  premier.actif = false;
  assert.match(D.protegerSuperAdministrateurs(donnees, "2", "admin"), /au moins un/);
  premier.actif = true; premier.valide = false;
  assert.match(D.protegerSuperAdministrateurs(donnees, "2", "admin"), /au moins un/);
  premier.valide = true; premier.entraObjectId = null;
  assert.match(D.protegerSuperAdministrateurs(donnees, "2", "admin"), /au moins un/);
  premier.entraObjectId = "identite-1";
  donnees.utilisateurs.push({ id: "3", roleId: "admin", entraObjectId: "identite-1" });
  assert.match(D.protegerSuperAdministrateurs(donnees, "2", "admin"), /au moins un/, "identité ambiguë non utilisable");
  donnees.utilisateurs.pop();
  assert.match(D.protegerSuperAdministrateurs(donnees, null, null, { roles: { super: regleAdmin, admin: regleAdmin } }), /au moins un/, "politique du dernier rôle protégée");
  const contexte = D.contexteSite(d, donnees, "s2");
  assert.equal(contexte.global, true);
  assert.equal(contexte.roleId, "super");
  assert.equal(contexte.niveau, "administration");
  assert.ok(contexte.autorisations.operations.some((o) => o.operation === "menu.entree.supprimer"));
  assert.equal(D.contexteSite(d, donnees, "absent").contexte.etat, "CONTEXTE INCOMPLET");
  assert.equal(siteEcriture.operationGlobaleAutorisee(d, donnees, "site.creer"), true);
  donnees.dynamique.operations[1].interdite = true;
  assert.equal(siteEcriture.operationGlobaleAutorisee(d, donnees, "site.creer"), false, "indisponibilité plateforme conservée");
  donnees.dynamique.operations[1].interdite = false;

  const original = D.donneesDroits;
  const contexteGraphOriginal = E.contexteGraph;
  const R = admin._test.ref;
  try {
    D.donneesDroits = async () => donnees;
    E.contexteGraph = async () => ({ token: "offline", siteGraphId: "site", listes: [] });
    const params = { utilisateur: R("u", "2"), role: R("r", "admin") };
    assert.ok((await admin.construireAction(d, "changer-role", params, null)).op);
    assert.match((await admin.construireAction({ ...d, fonctions: regleAdmin.fonctions }, "changer-role", params, null)).refus, /Seul un super|droits supérieurs/);
    assert.match((await admin.construireAction(d, "changer-role", { utilisateur: R("u", "1"), role: R("r", "admin") }, null)).refus, /propre rôle/);
    premier.actif = false;
    assert.match((await admin.construireAction(d, "changer-role", params, null)).refus, /au moins un/);
    premier.actif = true;
    const identite = { fournisseur: "entra", sujet: "test-super" };
    const apercu = await admin.preparerAction({ identite, d, action: "changer-role", params });
    const op = E.lireJeton(identite, apercu.jeton).op;
    assert.equal(op.verrouRessource, "gouvernance-super-administrateurs");
    assert.equal(op.journalComptes, true);
  } finally { D.donneesDroits = original; E.contexteGraph = contexteGraphOriginal; }

  let liberer;
  const attente = new Promise((resolve) => { liberer = resolve; });
  let entree;
  const demarre = new Promise((resolve) => { entree = resolve; });
  const identite = { fournisseur: "entra", sujet: "concurrence-super" };
  const op = { type: "modifier", listId: "users", itemId: "2", champs: {}, verrouRessource: "gouvernance-super-administrateurs" };
  const un = E.emettreJeton(identite, op).jeton;
  const deux = E.emettreJeton(identite, { ...op, listId: "roles", itemId: "super" }).jeton;
  const premierEnCours = E.executer({ identite, jeton: un, revalider: async () => { entree(); await attente; return "Test terminé sans écriture."; } });
  await demarre;
  assert.equal((await E.executer({ identite, jeton: deux, revalider: async () => null })).status, 409, "retraits et politiques partagent le même verrou");
  liberer();
  assert.equal((await premierEnCours).status, 403);
  console.log("Super administrateurs : accès global, gestion des rôles, dernier compte actif/unique protégé et concurrence OK.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
