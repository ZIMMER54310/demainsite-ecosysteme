"use strict";

process.env.DSE_SESSION_SECRET = "x".repeat(40);
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const A = require("../auth/autorisations");
const D = require("../auth/droits");
const admin = require("../shared/droits-administration");
const E = require("../shared/ecriture");
const dse = require("../shared/dse");
const journal = require("../shared/journal-comptes");

function fixture() {
  const source = Object.fromEntries(A.LISTES.map((nom) => [nom, {
    id: nom.toLowerCase(), nom, cols: [
      { name: "Title", displayName: "Titre", text: {} },
      { name: "Actif", displayName: "ACTIF", boolean: {} }
    ], items: []
  }]));
  function colonne(nom, label, type, cible) {
    const name = label.replace(/[^A-Za-z0-9]/g, "");
    source[nom].cols.push({ name, displayName: label,
      [type]: type === "lookup" ? { listId: source[cible].id, allowMultipleValues: false } : {} });
    return name;
  }
  function item(nom, id, titre, valeurs = {}) {
    const fields = { Title: titre, Actif: true };
    for (const [label, value] of Object.entries(valeurs)) {
      const c = source[nom].cols.find((c) => c.displayName === label);
      assert.ok(c, `${nom}/${label}`);
      fields[`${c.name}${c.lookup ? "LookupId" : ""}`] = value;
    }
    const row = { id, fields: { ...fields, "@odata.etag": '"v1"' } };
    source[nom].items.push(row);
    return row;
  }
  for (const nom of ["OBJ-ACTIF", "OBJ-VALIDE", "OBJ-VEROUILLE"]) item(nom, "oui", "Oui");
  for (const [nom, label] of [["OBJ-CAPACITE", "CODE-CAPACITÉ"], ["OBJ-ACTION", "CODE-ACTION"],
    ["OBJ-PERIMETRE-TYPE", "CODE-PÉRIMÈTRE"], ["OBJ-ORIGINE-DROIT", "CODE-ORIGINE-DROIT"]]) colonne(nom, label, "text");
  item("OBJ-ROLE", "admin", "Administrateur"); item("OBJ-ROLE", "editeur", "Éditeur");
  item("OBJ-CAPACITE", "images", "Images", { "CODE-CAPACITÉ": "images" });
  item("OBJ-ACTION", "modifier", "Modifier", { "CODE-ACTION": "modifier" });
  item("OBJ-PERIMETRE-TYPE", "site", "Site", { "CODE-PÉRIMÈTRE": "site" });
  item("OBJ-ORIGINE-DROIT", "manuel", "Manuel", { "CODE-ORIGINE-DROIT": "manuel" });
  item("OBJ-TYPE-CIBLE", "site", "Site");
  item("OBJ-CLIENT", "client", "Client");
  colonne("OBJ-SITE-PUBLIC", "OBJ-CLIENT", "lookup", "OBJ-CLIENT");
  colonne("OBJ-SITE-PUBLIC", "TYPE-CIBLE", "lookup", "OBJ-TYPE-CIBLE");
  for (const id of ["s1", "s2"]) item("OBJ-SITE-PUBLIC", id, id, { "OBJ-CLIENT": "client", "TYPE-CIBLE": "site" });
  for (const id of ["acteur", "cible"]) item("OBJ-UTILISATEUR", id, id);
  for (const [label, cible] of [["OBJ-UTILISATEUR", "OBJ-UTILISATEUR"], ["OBJ-ROLE", "OBJ-ROLE"],
    ["TYPE-PÉRIMÈTRE", "OBJ-PERIMETRE-TYPE"], ["ORIGINE-DROIT", "OBJ-ORIGINE-DROIT"], ["OBJ-CLIENT", "OBJ-CLIENT"],
    ["CibleSite", "OBJ-SITE-PUBLIC"]]) colonne("OBJ-UTILISATEUR-SITE", label, "lookup", cible);
  colonne("OBJ-UTILISATEUR-SITE", "VERROUILLE", "boolean");
  for (const [id, user, role] of [["a1", "acteur", "admin"], ["a2", "cible", "editeur"]]) {
    item("OBJ-UTILISATEUR-SITE", id, id, { "OBJ-UTILISATEUR": user, "OBJ-ROLE": role,
      "TYPE-PÉRIMÈTRE": "site", "ORIGINE-DROIT": "manuel", "OBJ-CLIENT": "client", CibleSite: "s1" });
  }
  for (const nom of ["OBJ-ROLE-CAPACITE", "OBJ-UTILISATEUR-PERMISSION"]) {
    colonne(nom, "OBJ-CAPACITE", "lookup", "OBJ-CAPACITE");
    colonne(nom, "OBJ-DROIT-OPERATION", "lookup", "OBJ-DROIT-OPERATION");
    colonne(nom, "AUTORISATION", "boolean");
    colonne(nom, "VERROUILLE", "boolean");
  }
  colonne("OBJ-ROLE-CAPACITE", "OBJ-ROLE", "lookup", "OBJ-ROLE");
  for (const role of ["admin", "editeur"]) item("OBJ-ROLE-CAPACITE", role, role, { "OBJ-ROLE": role, "OBJ-CAPACITE": "images" });
  for (const [label, cible] of [["OBJ-UTILISATEUR", "OBJ-UTILISATEUR"], ["OBJ-UTILISATEUR-SITE", "OBJ-UTILISATEUR-SITE"], ["OBJ-ACTION", "OBJ-ACTION"]]) {
    colonne("OBJ-UTILISATEUR-PERMISSION", label, "lookup", cible);
  }
  for (const [id, user, affectation] of [["p1", "acteur", "a1"], ["p2", "cible", "a2"]]) {
    item("OBJ-UTILISATEUR-PERMISSION", id, id, { "OBJ-UTILISATEUR": user, "OBJ-UTILISATEUR-SITE": affectation,
      "OBJ-CAPACITE": "images", "OBJ-ACTION": "modifier", AUTORISATION: true });
  }
  colonne("OBJ-CAPACITE-ACTION", "OBJ-CAPACITE", "lookup", "OBJ-CAPACITE");
  colonne("OBJ-CAPACITE-ACTION", "OBJ-ACTION", "lookup", "OBJ-ACTION");
  item("OBJ-CAPACITE-ACTION", "1", "1", { "OBJ-CAPACITE": "images", "OBJ-ACTION": "modifier" });
  for (const label of ["OPERATION-TECHNIQUE", "FONCTION-COCKPIT", "MODE-TECHNIQUE", "LIBELLE-INTERFACE", "ROUTE-COCKPIT"]) colonne("OBJ-DROIT-OPERATION", label, "text");
  for (const label of ["DEMANDABLE", "INTERDITE", "OPTION-REQUISE", "INDIVIDUEL-REQUIS"]) colonne("OBJ-DROIT-OPERATION", label, "boolean");
  colonne("OBJ-DROIT-OPERATION", "OBJ-CAPACITE", "lookup", "OBJ-CAPACITE");
  colonne("OBJ-DROIT-OPERATION", "OBJ-ACTION", "lookup", "OBJ-ACTION");
  for (const [id, code] of [["o1", "images.modifier"], ["o2", "images.supprimer"]]) item("OBJ-DROIT-OPERATION", id, code,
    { "OPERATION-TECHNIQUE": code, "FONCTION-COCKPIT": "logo-medias", "MODE-TECHNIQUE": "write",
      "LIBELLE-INTERFACE": code, "ROUTE-COCKPIT": "medias", "OBJ-CAPACITE": "images", "OBJ-ACTION": "modifier" });
  for (const [label, cible] of [["OBJ-PERIMETRE-TYPE", "OBJ-PERIMETRE-TYPE"], ["OBJ-ORIGINE-DROIT", "OBJ-ORIGINE-DROIT"]]) colonne("OBJ-DROIT-PERIMETRE", label, "lookup", cible);
  for (const label of ["CHAMP-CIBLE-AFFECTATION", "GUID-LISTE-CIBLE", "MODE-RESOLUTION", "CHAMP-MEMBRE", "CHAMP-GROUPEMENT", "TYPE-CIBLE-SITE"]) colonne("OBJ-DROIT-PERIMETRE", label, "text");
  item("OBJ-DROIT-PERIMETRE", "1", "1", { "OBJ-PERIMETRE-TYPE": "site", "OBJ-ORIGINE-DROIT": "manuel",
    "CHAMP-CIBLE-AFFECTATION": "CibleSite", "GUID-LISTE-CIBLE": source["OBJ-SITE-PUBLIC"].id,
    "MODE-RESOLUTION": "direct", "TYPE-CIBLE-SITE": "site" });
  const dynamique = A.construire(source);
  const donnees = { dynamique, utilisateurs: [
    { id: "acteur", roleId: "admin", actif: true, valide: true },
    { id: "cible", roleId: "editeur", actif: true, valide: true }
  ], roles: [], clients: [{ id: "client" }], liens: [], sites: [], accesTypes: [],
  politique: { roles: {
    admin: { portee: "attribues", niveau: "administration", fonctions: ["administration", "logo-medias"] },
    editeur: { portee: "attribues", niveau: "ecriture", fonctions: ["logo-medias"] }
  } } };
  const acteur = { reconnu: true, niveau: "administration", portee: "attribues", fonctions: ["administration", "logo-medias"],
    utilisateurId: "acteur", siteIds: ["s1"], clientIds: ["client"], contexte: { etat: "COMPLET", siteId: "s1" } };
  return { source, dynamique, donnees, acteur, item };
}

(async () => {
  const f = fixture();
  const permis = (data, code) => A.autoriser(A.resoudre(data, "cible", "s1"), code).autorise;
  assert.equal(permis(f.dynamique, "images.modifier"), true);
  assert.equal(permis(f.dynamique, "images.supprimer"), true);
  f.item("OBJ-UTILISATEUR-PERMISSION", "individuel", "Individuel", {
    "OBJ-UTILISATEUR": "cible", "OBJ-UTILISATEUR-SITE": "a2", "OBJ-CAPACITE": "images", "OBJ-ACTION": "modifier",
    "OBJ-DROIT-OPERATION": "o2", AUTORISATION: false
  });
  let data = A.construire(f.source);
  assert.equal(permis(data, "images.modifier"), true, "même paire : modifier reste autorisé");
  assert.equal(permis(data, "images.supprimer"), false, "suppression seule interdite");
  data.permissions.find((p) => p.id === "individuel").autorisation = true;
  data.permissions.find((p) => p.id === "p2").autorisation = false;
  assert.equal(permis(data, "images.supprimer"), true, "surcharge précise prioritaire sur ancien refus non verrouillé");
  assert.equal(permis(data, "images.modifier"), false);
  data.permissions.find((p) => p.id === "p2").verrouille = true;
  assert.equal(permis(data, "images.supprimer"), false, "ancien refus verrouillé préservé");
  data = A.construire(f.source);
  data.bases.push({ id: "b3", roleId: "editeur", capaciteId: "images", operationId: "o1", autorisation: false });
  assert.equal(permis(data, "images.modifier"), false, "profil peut interdire une action seule");
  const nouveau = { ...data.operations[0], id: "o3", operation: "images.nouveau", individuelRequis: true };
  data.operations.push(nouveau);
  assert.equal(permis(data, "images.nouveau"), false, "nouveau droit sans attribution automatique");
  data.bases.push({ roleId: "editeur", capaciteId: "images", operationId: "o3", autorisation: true });
  assert.equal(permis(data, "images.nouveau"), true, "profil individuel peut accorder le nouveau droit");
  assert.equal(A.autoriser(A.resoudre(data, "cible", "s2"), "images.nouveau").autorise, false, "hors site refusé");
  const sansColonnes = fixture().source;
  for (const nom of ["OBJ-ROLE-CAPACITE", "OBJ-UTILISATEUR-PERMISSION"]) sansColonnes[nom].cols = sansColonnes[nom].cols.filter((c) => c.displayName !== "OBJ-DROIT-OPERATION");
  assert.equal(permis(A.construire(sansColonnes), "images.modifier"), true, "compatibilité sans extension");

  const originalDonnees = D.donneesDroits;
  try {
    D.donneesDroits = async () => f.donnees;
    const vue = await admin.lire(f.acteur);
    assert.equal(vue.profils.length, 0);
    assert.equal(vue.peutCreer, false);
    const cible = vue.utilisateurs.find((u) => u.titre === "cible");
    const op = vue.operations[1];
    const params = { action: "utilisateur", cible: cible.ref, operation: op.ref, valeur: "false" };
    const plan = await admin.planifier(f.acteur, params);
    assert.equal(plan.type, "ajouter");
    assert.equal(plan.champs.OBJDROITOPERATIONLookupId, "o2");
    assert.equal(plan.champs.AUTORISATION, false);
    assert.equal(plan.journalComptes, true);
    assert.equal(await admin.revalider(f.acteur, plan), null);
    await assert.rejects(admin.planifier({ ...f.acteur, siteIds: ["s2"] }, params), /périmètre/);
    const propre = vue.utilisateurs.find((u) => u.titre === "acteur");
    await assert.rejects(admin.planifier(f.acteur, { ...params, cible: propre.ref }), /modifier ce droit/);
    await assert.rejects(admin.lire({ ...f.acteur, niveau: "ecriture" }), /réservée/);
    await assert.rejects(admin.planifier(f.acteur, { action: "creer" }), /Seul un super/);
    f.dynamique.permissions[0].autorisation = false;
    await assert.rejects(admin.revalider(f.acteur, plan), /modifier ce droit/, "recontrôle des droits de l’acteur");
    f.dynamique.permissions[0].autorisation = true;
    f.dynamique.affectations[1].verrouille = true;
    await assert.rejects(admin.planifier(f.acteur, params), /modifier ce droit/);
    f.dynamique.affectations[1].verrouille = false;
    const superActeur = { ...f.acteur, superAdministrateur: true, global: true };
    const superVue = await admin.lire(superActeur);
    const profil = superVue.profils.find((p) => p.titre === "Éditeur");
    assert.equal(superVue.peutCreer, true);
    assert.equal((await admin.planifier(superActeur, { action: "profil", cible: profil.ref, operation: op.ref, valeur: "false" })).champs.AUTORISATION, false);
    const propreProfil = superVue.profils.find((p) => p.titre === "Administrateur");
    await assert.rejects(admin.planifier(superActeur, { action: "profil", cible: propreProfil.ref, operation: op.ref, valeur: "false" }), /profil ne peut pas/);
    f.source["OBJ-ROLE"].cols.push({ name: "Verrou", displayName: "VERROUILLE", boolean: {} });
    f.source["OBJ-ROLE"].items.find((r) => r.id === "editeur").fields.Verrou = true;
    f.dynamique.roles.find((r) => r.id === "editeur").verrouille = true;
    const vueVerrouillee = await admin.lire(superActeur);
    const verrouille = vueVerrouillee.profils.find((p) => p.titre === "Éditeur");
    assert.equal(verrouille.peutDeverrouiller, true);
    const unlock = await admin.planifier(superActeur, { action: "deverrouiller-profil", cible: verrouille.ref });
    assert.equal(unlock.type, "modifier");
    assert.deepEqual(unlock.champs, { Verrou: false });
    assert.equal(unlock.avant, E.hash({ Verrou: "true" }));
    await assert.rejects(admin.planifier(f.acteur, { action: "deverrouiller-profil", cible: verrouille.ref }), /non autorisé/);
    await assert.rejects(admin.planifier(superActeur, { action: "deverrouiller-profil", cible: propreProfil.ref }), /non autorisé/);
    assert.match((await import(pathToFileURL(path.join(__dirname, "../../modules/cockpit/droits.js")).href)).rendreMatrice(vueVerrouillee, verrouille), /data-deverrouiller-profil/);
    f.dynamique.roles.find((r) => r.id === "editeur").verrouille = false;
    f.source["OBJ-ROLE"].items.find((r) => r.id === "editeur").fields.Verrou = false;
    const creation = { action: "creer", titre: "Télécharger une image", code: "image.telecharger",
      capacite: superVue.capacites[0].ref, typeAction: superVue.actions[0].ref, fonction: "logo-medias", route: "medias", mode: "read" };
    const cree = await admin.planifier(superActeur, creation);
    assert.equal(cree.champs.INDIVIDUELREQUIS, true);
    await assert.rejects(admin.planifier(superActeur, { ...creation, code: "images.modifier" }), /existe déjà/);
    await assert.rejects(admin.planifier(superActeur, { ...creation, fonction: "inconnue" }), /valides/);
    const individuel = { id: "r", roleId: "editeur", capaciteId: "images", operationId: "o2", autorisation: false };
    f.dynamique.bases.push(individuel);
    await assert.rejects(admin.planifier(superActeur, { ...params, valeur: "true" }), /profil/);
    f.dynamique.bases.pop();
    const historique = fixture();
    historique.dynamique.affectations[1].typeId = null;
    historique.donnees.roles = [{ id: "editeur", actif: true, valide: true, titre: "Éditeur" }];
    historique.donnees.sites = [{ id: "s1", clientId: "client", actif: true, valide: true }];
    historique.donnees.liens = [{ id: "a2", utilisateurId: "cible", siteId: "s1", clientId: "client",
      roleId: "editeur", accesTypeId: "lecture-ecriture", actif: true, valide: true }];
    historique.donnees.accesTypes = [{ id: "lecture-ecriture", actif: true, valide: true }];
    historique.item("OBJ-UTILISATEUR-PERMISSION", "restriction", "Restriction", { "OBJ-UTILISATEUR": "cible",
      "OBJ-UTILISATEUR-SITE": "a2", "OBJ-CAPACITE": "images", "OBJ-ACTION": "modifier",
      "OBJ-DROIT-OPERATION": "o2", AUTORISATION: false });
    historique.dynamique.permissions.push({ id: "restriction", utilisateurId: "cible", affectationId: "a2",
      capaciteId: "images", actionId: "modifier", operationId: "o2", autorisation: false });
    const h = D.contexteSite({ reconnu: true, utilisateurId: "cible" }, historique.donnees, "s1");
    assert.equal(h.contexte.etat, "COMPLET");
    assert.deepEqual(h.contraintesOperations, ["images.supprimer"], "modèle historique : une seule action interdite");
    D.donneesDroits = async () => historique.donnees;
    const hVue = await admin.lire(historique.acteur);
    const hCible = hVue.utilisateurs.find((u) => u.titre === "cible");
    assert.equal(hCible.droits[0].effectif, true);
    assert.equal(hCible.droits[1].effectif, false);
    assert.equal((await admin.planifier(historique.acteur, {
      action: "utilisateur", cible: hCible.ref, operation: hVue.operations[1].ref, valeur: "true"
    })).type, "modifier", "les anciennes affectations peuvent modifier une surcharge précise");
    D.donneesDroits = async () => f.donnees;
    const global = fixture();
    global.item("OBJ-ROLE", "super", "Super administrateur");
    global.item("OBJ-ROLE-CAPACITE", "super", "Super", { "OBJ-ROLE": "super", "OBJ-CAPACITE": "images" });
    for (const [id, code, mode] of [["o3", "site.creer", "create"], ["o4", "site.valider", "validate"]]) {
      global.item("OBJ-DROIT-OPERATION", id, code, { "OPERATION-TECHNIQUE": code, "FONCTION-COCKPIT": "sites",
        "MODE-TECHNIQUE": mode, "LIBELLE-INTERFACE": code, "ROUTE-COCKPIT": "sites",
        "OBJ-CAPACITE": "images", "OBJ-ACTION": "modifier" });
    }
    global.item("OBJ-UTILISATEUR-PERMISSION", "pg", "Global", { "OBJ-UTILISATEUR": "cible",
      "OBJ-CAPACITE": "images", "OBJ-ACTION": "modifier", AUTORISATION: true });
    global.donnees.dynamique = A.construire(global.source);
    global.donnees.utilisateurs[1].roleId = "super";
    global.donnees.politique.roles.super = { portee: "tous", niveau: "administration", fonctions: ["plateforme", "sites", "administration"] };
    D.donneesDroits = async () => global.donnees;
    const gVue = await admin.lire(superActeur);
    assert.equal(gVue.operations.length, 4, "toutes les opérations dont les droits globaux sont listées");
    const gCible = gVue.utilisateurs.find((u) => u.global);
    const gOp = gVue.operations.find((o) => o.code === "site.creer");
    assert.ok(gCible.droits.find((d) => d.ref === gOp.ref).effectif);
    const gPlan = await admin.planifier(superActeur, { action: "global", cible: gCible.ref, operation: gOp.ref, valeur: "false" });
    assert.equal(gPlan.champs.OBJUTILISATEURSITELookupId, null);
    await assert.rejects(admin.planifier(global.acteur, { action: "global", cible: gCible.ref, operation: gOp.ref, valeur: "false" }), /globaux/);
    global.donnees.dynamique.permissions.push({ id: "precis", utilisateurId: "cible", affectationId: null,
      capaciteId: "images", actionId: "modifier", operationId: "o3", autorisation: false });
    const siteEcriture = require("../shared/site-ecriture");
    const compteGlobal = { reconnu: true, global: true, roleId: "super", utilisateurId: "cible" };
    assert.equal(siteEcriture.operationGlobaleAutorisee(compteGlobal, global.donnees, "site.creer"), false);
    assert.equal(siteEcriture.operationGlobaleAutorisee(compteGlobal, global.donnees, "site.valider"), true, "droits globaux également indépendants");
    D.donneesDroits = async () => f.donnees;
    const html = (await import(pathToFileURL(path.join(__dirname, "../../modules/cockpit/droits.js")).href));
    const rendu = html.rendreDroits({}, vue, "exemple.fr");
    assert.match(rendu, /data-administration-droits/);
    assert.doesNotMatch(rendu, /data-creer-droit/);
    const matrice = html.rendreMatrice(vue, cible);
    assert.match(matrice, /data-tout-droits/);
    assert.equal((matrice.match(/data-droit=/g) || []).length, 2);
    const cases = [{ checked: true }, { checked: false }];
    const tout = {};
    const groupe = { querySelectorAll: () => cases, querySelector: () => tout };
    html.synchroniserTout(groupe);
    assert.equal(tout.indeterminate, true);
    cases[1].checked = true; html.synchroniserTout(groupe); assert.equal(tout.checked, true);
    cases.length = 0; html.synchroniserTout(groupe); assert.equal(tout.disabled, true);

    // Le pipeline commun réalise une écriture unique, avec ETag, journal et relecture.
    const originals = Object.fromEntries(["obtenirJetonGraph", "obtenirSiteGraph", "collecter", "graphSansCache", "graphEcriture"].map((k) => [k, dse[k]]));
    const originauxJournal = { commencer: journal.commencer, terminer: journal.terminer };
    let ecritures = 0, debuts = 0, fins = 0;
    const identite = { fournisseur: "entra", sujet: "test" };
    const modifier = { ...plan, type: "modifier", itemId: "individuel" };
    const avant = Object.fromEntries(Object.keys(modifier.champs).map((k) => [k, ""]));
    modifier.avant = E.hash(avant);
    let fields = avant;
    try {
      dse.obtenirJetonGraph = async () => "offline";
      dse.obtenirSiteGraph = async () => ({ id: "site" });
      dse.collecter = async () => [];
      dse.graphSansCache = async () => ({ eTag: '"v1"', fields });
      dse.graphEcriture = async (_t, method, _p, body, etag) => {
        assert.equal(method, "PATCH"); assert.equal(etag, '"v1"');
        fields = body; ecritures++;
      };
      journal.commencer = async () => { debuts++; return {}; };
      journal.terminer = async () => { fins++; return { enregistre: true }; };
      const jeton = E.emettreJeton(identite, modifier).jeton;
      assert.equal((await E.executer({ identite, jeton, revalider: async () => null })).succes, true);
      assert.equal((await E.executer({ identite, jeton, revalider: async () => null })).deja, true);
      assert.equal(ecritures, 1); assert.equal(debuts, 1); assert.equal(fins, 1);
      const concurrent = E.emettreJeton(identite, { ...modifier, avant: "version-perimee", champs: { ...modifier.champs, AUTORISATION: true } }).jeton;
      assert.equal((await E.executer({ identite, jeton: concurrent, revalider: async () => null })).status, 409);
      assert.equal(ecritures, 1);
    } finally {
      Object.assign(dse, originals); Object.assign(journal, originauxJournal);
    }
  } finally { D.donneesDroits = originalDonnees; }
  console.log("Droits individuels : séparation, héritage, profils, périmètres, verrous, création, UI, ETag, journal et idempotence OK.");
})().catch((e) => { console.error(e); process.exitCode = 1; });
