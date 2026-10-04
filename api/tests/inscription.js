"use strict";

process.env.DSE_SESSION_SECRET = "i".repeat(40);
const assert = require("assert");
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const droits = require("../auth/droits");
const inscription = require("../auth/inscription");

(async () => {
  const noms = ["OBJ-NOM DE DOMAINE", "OBJ-SITE-PUBLIC", "OBJ-CLIENT", "OBJ-ROLE", "OBJ-ACTIF", "OBJ-VALIDE",
    "OBJ-UTILISATEUR", "OBJ-UTILISATEUR-SITE", "OBJ-JRN", "OBJ-INSCRIPTION"];
  const listes = noms.map((displayName) => ({ id: displayName, displayName }));
  const lookup = (name, liste) => ({ name, lookup: { listId: liste, allowMultipleValues: false } });
  const cols = {
    "OBJ-NOM DE DOMAINE": [lookup("OBJSITE", "OBJ-SITE-PUBLIC"), lookup("K", "OBJ-CLIENT"), lookup("A", "OBJ-ACTIF"), lookup("V", "OBJ-VALIDE")],
    "OBJ-SITE-PUBLIC": [lookup("K", "OBJ-CLIENT")],
    "OBJ-INSCRIPTION": [{ name: "ENTRAOBJECTID", text: {} }, lookup("U", "OBJ-UTILISATEUR"),
      lookup("K", "OBJ-CLIENT"), lookup("S", "OBJ-SITE-PUBLIC"), lookup("R", "OBJ-ROLE"), lookup("A", "OBJ-ACTIF"), lookup("V", "OBJ-VALIDE")],
    "OBJ-UTILISATEUR": [{ name: "ENTRAOBJECTID", text: {} }],
    "OBJ-JRN": [{ name: "STATUT", required: false, lookup: { listId: "orphelin" } }, { name: "STATUTJRN" }, { name: "CLEIDEMPOTENCE" }]
  };
  const items = Object.fromEntries(noms.map((n) => [n, []]));
  items["OBJ-NOM DE DOMAINE"] = [{ id: "d", fields: { Title: "client.example.test", OBJSITELookupId: "s", KLookupId: "k", ALookupId: "yes", VLookupId: "yes" } }];
  items["OBJ-SITE-PUBLIC"] = [{ id: "s", fields: { KLookupId: "k" } }];
  items["OBJ-ACTIF"] = items["OBJ-VALIDE"] = [{ id: "yes", fields: { Title: "Oui" } }];
  items["OBJ-INSCRIPTION"] = [{ id: "invitation", fields: { ENTRAOBJECTID: "oid", KLookupId: "k", SLookupId: "s", RLookupId: "r", ALookupId: "yes", VLookupId: "yes" } }];
  const S = { listes: { utilisateur: "OBJ-UTILISATEUR", lien: "OBJ-UTILISATEUR-SITE" }, colonnes: {
    utilisateurEntra: "ENTRAOBJECTID", utilisateurRole: "R", utilisateurClient: "K", utilisateurActif: "A", utilisateurValide: "V",
    lienUtilisateur: "U", lienClient: "K", lienSite: "S", lienActif: "A", lienValide: "V"
  } };
  const sauvegarde = {};
  const changer = (objet, cle, valeur) => { sauvegarde[cle] = objet[cle]; objet[cle] = valeur; };
  const donnees = () => ({
    structure: S, utilisateurs: items["OBJ-UTILISATEUR"].map((i) => ({ id: i.id, entraObjectId: i.fields.ENTRAOBJECTID,
      clientId: i.fields.KLookupId, actif: i.fields.ALookupId === "yes", valide: i.fields.VLookupId === "yes" })),
    clients: [{ id: "k", titre: "Client" }], roles: [{ id: "r", titre: "Lecteur" }],
    politique: { roles: { r: { portee: "attribues", niveau: "lecture", fonctions: ["sites"] } } }
  });
  changer(droits, "donneesDroits", async () => donnees());
  changer(dse, "obtenirJetonGraph", async () => "fake");
  changer(dse, "obtenirSiteGraph", async () => ({ id: "g" }));
  changer(dse, "collecter", async () => listes);
  changer(dse, "chargerColonnesListe", async (_t, _s, l) => cols[l] || []);
  changer(dse, "chargerItemsListe", async (_t, _s, l) => items[l] || []);
  changer(dse, "graphSansCache", async (_t, chemin) => {
    const m = /\/lists\/([^/]+)\/items(?:\/([^/?]+))?/.exec(chemin);
    return m[2] ? items[m[1]].find((i) => i.id === m[2]) : { value: items[m[1]] };
  });
  changer(dse, "graphEcriture", async (_t, methode, chemin, corps) => {
    assert.strictEqual(methode, "POST");
    const l = /\/lists\/([^/]+)\/items/.exec(chemin)[1];
    assert.ok(!Object.hasOwn(corps.fields, "STATUTLookupId"));
    const item = { id: String(items[l].length + 1), fields: corps.fields };
    items[l].push(item);
    return item;
  });
  try {
    const id = { fournisseur: "entra", sujet: "oid", email: "compte@example.test" };
    const ctx = await inscription.domaineContexte(await ecriture.contexteGraph(), "client.example.test");
    assert.deepStrictEqual(ctx, { domaine: "client.example.test", domaineId: "d", siteId: "s", clientId: "k" });
    const preview = await inscription.inscrire(id, "client.example.test");
    assert.strictEqual(preview.donnees.confirmationRequise, true);
    assert.strictEqual(items["OBJ-UTILISATEUR"].length, 0);
    const r = await inscription.inscrire(id, "client.example.test", true);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.donnees.journal.enregistre, true);
    assert.strictEqual(items["OBJ-UTILISATEUR"].length, 1);
    assert.strictEqual(items["OBJ-UTILISATEUR-SITE"].length, 1);
    assert.strictEqual(items["OBJ-UTILISATEUR-SITE"][0].fields.KLookupId, "k");
    const replay = await inscription.inscrire(id, "client.example.test", true);
    assert.strictEqual(replay.donnees.deja, true);
    assert.strictEqual(items["OBJ-JRN"].length, 2, "une creation et une attribution, sans doublon au rejeu");
    const interdit = await inscription.inscrire({ ...id, sujet: "intrus" }, "client.example.test", true);
    assert.strictEqual(interdit.status, 403);
    assert.strictEqual(items["OBJ-JRN"].at(-1).fields.STATUTJRN, "REFUS");
    assert.strictEqual(items["OBJ-UTILISATEUR-SITE"].length, 1);
    items["OBJ-UTILISATEUR"][0].fields.KLookupId = "autre-client";
    assert.strictEqual((await inscription.inscrire(id, "client.example.test", true)).status, 403);
    assert.strictEqual(items["OBJ-UTILISATEUR-SITE"].length, 1);
    items["OBJ-SITE-PUBLIC"][0].fields.KLookupId = "autre-client";
    assert.strictEqual(await inscription.domaineContexte(await ecriture.contexteGraph(), "client.example.test"), null);
  } finally {
    for (const [cle, valeur] of Object.entries(sauvegarde)) {
      if (cle === "donneesDroits") droits[cle] = valeur; else dse[cle] = valeur;
    }
  }
  console.log("Inscription autorisee, confirmation, egalite clients, journal REFUS et anti-doublon OK (Graph simule, aucune donnee reelle creee)");
})().catch((e) => { console.error(e); process.exitCode = 1; });
