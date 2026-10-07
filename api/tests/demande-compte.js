"use strict";

const assert = require("assert");
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const droits = require("../auth/droits");
const inscription = require("../auth/inscription");
const journal = require("../shared/journal-comptes");

(async () => {
  const restaurer = [];
  const changer = (objet, cle, valeur) => {
    const avant = objet[cle];
    restaurer.push(() => { objet[cle] = avant; });
    objet[cle] = valeur;
  };
  const noms = ["OBJ-NOM DE DOMAINE", "OBJ-SITE-PUBLIC", "OBJ-DEMANDE-COMPTE", "OBJ-DEMANDE-COMPTE-ETAT", "OBJ-CLIENT",
    "OBJ-ACTIF", "OBJ-VALIDE", "OBJ-UTILISATEUR", "OBJ-JRN"];
  const listes = noms.map((displayName) => ({ id: displayName, displayName }));
  const lookup = (name, target, required = false) => ({ name, required, lookup: { listId: target, allowMultipleValues: false } });
  const txt = (name, required = false, indexed = false, unique = false) => ({
    name, required, indexed, enforceUniqueValues: unique, text: {}
  });
  const dates = (name, required = false) => ({ name, required, dateTime: {} });
  const siteColumns = [lookup("OBJ-CLIENT", "OBJ-CLIENT"),
    ...["OBJACCESCOCKPIT", "OBJCREATIONCOMPTE", "OBJAPPROBATIONPROPRIETAIRE"].map((name) => ({ name, boolean: {} }))];
  const domainColumns = [
    lookup("OBJSITE", "OBJ-SITE-PUBLIC"), lookup("OBJ-CLIENT", "OBJ-CLIENT"),
    lookup("OBJ-ACTIF", "OBJ-ACTIF"), lookup("OBJ-VALIDE", "OBJ-VALIDE")
  ];
  const requestColumns = [
    txt("Title", true), txt("ENTRAOBJECTID", true),
    lookup("OBJCLIENT", "OBJ-CLIENT", true), lookup("OBJSITEPUBLIC", "OBJ-SITE-PUBLIC"),
    lookup("OBJETATDEMANDECOMPTE", "OBJ-DEMANDE-COMPTE-ETAT", true),
    dates("DATEDEMANDE", true), { name: "DECISION", text: {} }, dates("DATEDECISION"),
    lookup("RESPONSABLETRAITEMENT", "OBJ-UTILISATEUR"),
    txt("CLEIDEMPOTENCE", true, true, true),
    lookup("OBJACTIF", "OBJ-ACTIF", true), lookup("OBJVALIDE", "OBJ-VALIDE", true)
  ];
  const stateColumns = [
    txt("Title", true), txt("CODEETATDEMANDECOMPTE", true, true, true),
    lookup("OBJACTIF", "OBJ-ACTIF", true), lookup("OBJVALIDE", "OBJ-VALIDE", true)
  ];
  const items = [];
  const writes = [];
  const journalEvents = [];
  let creationCompteAutorisee = true;
  let approbationProprietaire = true;
  const graph = { token: "test", siteGraphId: "graph", listes };
  const identite = { fournisseur: "entra", sujet: "entra-object-id", email: "visiteur@example.test" };
  changer(dse, "viderCacheGraph", () => {});
  changer(droits, "viderCache", () => {});
  changer(ecriture, "contexteGraph", async () => graph);
  changer(inscription, "domaineContexte", async () => ({ domaine: "site.example.test", siteId: "site-1", clientId: "client-1" }));
  changer(inscription, "reglagesSite", async () => ({
    afficherAccesCockpit: true, creationCompteAutorisee, approbationProprietaire
  }));
  changer(droits, "donneesDroits", async () => ({ utilisateurs: [] }));
  changer(dse, "chargerColonnesListe", async (_token, _site, listId) => ({
    "OBJ-NOM DE DOMAINE": domainColumns,
    "OBJ-SITE-PUBLIC": siteColumns,
    "OBJ-DEMANDE-COMPTE": requestColumns,
    "OBJ-DEMANDE-COMPTE-ETAT": stateColumns
  }[listId] || []));
  changer(dse, "chargerItemsListe", async (_token, _site, listId) => [{
    id: `${listId}-oui`, fields: { Title: "Oui" }
  }]);
  changer(ecriture, "collecterFrais", async (_g, chemin) => chemin.includes("/OBJ-NOM DE DOMAINE/")
    ? [{ id: "domain-1", fields: { Title: "site.example.test", OBJSITELookupId: "site-1",
      "OBJ-CLIENTLookupId": "client-1", "OBJ-ACTIFLookupId": "OBJ-ACTIF-oui", "OBJ-VALIDELookupId": "OBJ-VALIDE-oui" } }]
    : chemin.includes("/OBJ-SITE-PUBLIC/")
      ? [{ id: "site-1", fields: { "OBJ-CLIENTLookupId": "client-1" } }]
      : chemin.includes("/OBJ-ACTIF/") || chemin.includes("/OBJ-VALIDE/")
        ? [{ id: `${chemin.includes("/OBJ-ACTIF/") ? "OBJ-ACTIF" : "OBJ-VALIDE"}-oui`, fields: { Title: "Oui" } }]
    : chemin.includes("/OBJ-DEMANDE-COMPTE-ETAT/")
      ? [{ id: "state-waiting", fields: {
      CODEETATDEMANDECOMPTE: "EN-ATTENTE", OBJACTIFLookupId: "OBJ-ACTIF-oui", OBJVALIDELookupId: "OBJ-VALIDE-oui"
    } }]
    : chemin.includes("/OBJ-DEMANDE-COMPTE/")
      ? items.map((x) => ({ id: x.id, fields: x.fields })) : []);
  changer(dse, "graphEcriture", async (_token, method, chemin, corps) => {
    assert.strictEqual(method, "POST");
    const item = { id: String(items.length + 1), fields: corps.fields };
    items.push(item);
    writes.push({ chemin, fields: corps.fields });
    return { id: item.id };
  });
  changer(ecriture, "lireItemFrais", async (_g, listId, itemId) => {
    if (listId === "OBJ-SITE-PUBLIC") return {
      "OBJ-CLIENTLookupId": "client-1",
      OBJACCESCOCKPIT: true, OBJCREATIONCOMPTE: creationCompteAutorisee,
      OBJAPPROBATIONPROPRIETAIRE: approbationProprietaire
    };
    assert.strictEqual(listId, "OBJ-DEMANDE-COMPTE");
    return items.find((x) => x.id === String(itemId)).fields;
  });
  changer(journal, "commencer", async (_g, entree) => {
    journalEvents.push({ type: "DÉBUT", ...entree });
    return { id: "journal-1" };
  });
  changer(journal, "terminer", async (_g, _entree, resultat) => {
    journalEvents.push({ type: "FIN", ...resultat });
    return { relecture: "conforme" };
  });
  try {
    const premier = await inscription.soumettreDemandeCompte(identite, "site.example.test");
    assert.strictEqual(premier.status, 201);
    assert.strictEqual(premier.donnees.etat, "EN ATTENTE");
    assert.strictEqual(writes.length, 1);
    assert.strictEqual(writes[0].fields.ENTRAOBJECTID, identite.sujet);
    assert.strictEqual(writes[0].fields.Title, identite.email);
    assert.strictEqual(writes[0].fields.OBJCLIENTLookupId, "client-1");
    assert.strictEqual(writes[0].fields.OBJSITEPUBLICLookupId, "site-1");
    assert.strictEqual(writes[0].fields.OBJETATDEMANDECOMPTELookupId, "state-waiting");
    assert.ok(!Object.keys(writes[0].fields).some((key) => /ROLE|PERIMETRE|AFFECTATION|DROIT/i.test(key)));
    assert.deepStrictEqual(journalEvents.map((x) => x.type), ["DÉBUT", "FIN"]);
    assert.strictEqual(journalEvents[1].statut, "SUCCÈS");
    const doublon = await inscription.soumettreDemandeCompte(identite, "site.example.test");
    assert.strictEqual(doublon.status, 200);
    assert.strictEqual(doublon.donnees.dejaSoumise, true);
    assert.strictEqual(writes.length, 1, "la répétition ne crée aucun doublon");
    approbationProprietaire = false;
    const sansApprobation = await inscription.soumettreDemandeCompte({ ...identite, sujet: "sans-approbation" }, "site.example.test");
    assert.strictEqual(sansApprobation.status, 403, "sans approbation, aucune demande ne peut rester sans traitement");
    assert.strictEqual(writes.length, 1);
    creationCompteAutorisee = false;
    const interdit = await inscription.soumettreDemandeCompte({ ...identite, sujet: "autre-identite" }, "site.example.test");
    assert.strictEqual(interdit.status, 403, "le réglage par site interdit toute création");
    assert.strictEqual(writes.length, 1);
  } finally {
    for (const f of restaurer.reverse()) f();
  }
  console.log("Demande compte : identité vérifiée, aucun droit attribué, idempotence et journalisation OK");
})().catch((e) => { console.error(e); process.exitCode = 1; });
