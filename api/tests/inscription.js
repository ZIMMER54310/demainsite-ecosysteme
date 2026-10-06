"use strict";

process.env.DSE_SESSION_SECRET = "i".repeat(40);
const assert = require("assert");
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const droits = require("../auth/droits");
const inscription = require("../auth/inscription");

(async () => {
  const noms = ["OBJ-NOM DE DOMAINE", "OBJ-SITE-PUBLIC", "OBJ-CLIENT", "OBJ-ROLE", "OBJ-ACTIF", "OBJ-VALIDE",
    "OBJ-UTILISATEUR", "OBJ-UTILISATEUR-SITE", "OBJ-JRN", "OBJ-INSCRIPTION", "OBJ-ACCES-COMMUN"];
  const listes = noms.map((displayName) => ({ id: displayName, displayName }));
  const lookup = (name, liste) => ({ name, lookup: { listId: liste, allowMultipleValues: false } });
  const cols = {
    "OBJ-NOM DE DOMAINE": [lookup("OBJSITE", "OBJ-SITE-PUBLIC"), lookup("K", "OBJ-CLIENT"), lookup("A", "OBJ-ACTIF"), lookup("V", "OBJ-VALIDE")],
    "OBJ-SITE-PUBLIC": [lookup("K", "OBJ-CLIENT")],
    "OBJ-INSCRIPTION": [{ name: "OIDINTERNE", displayName: "ENTRA-OBJECT-ID", text: {} }, lookup("U", "OBJ-UTILISATEUR"),
      lookup("K", "OBJ-CLIENT"), lookup("S", "OBJ-SITE-PUBLIC"), lookup("R", "OBJ-ROLE"), lookup("A", "OBJ-ACTIF"), lookup("V", "OBJ-VALIDE")],
    "OBJ-UTILISATEUR": [{ name: "ENTRAOBJECTID", text: {} }],
    "OBJ-ACCES-COMMUN": [lookup("U", "OBJ-UTILISATEUR"), lookup("S", "OBJ-SITE-PUBLIC"), lookup("A", "OBJ-ACTIF"), lookup("V", "OBJ-VALIDE")],
    "OBJ-JRN": [{ name: "STATUT", required: false, lookup: { listId: "orphelin" } }, { name: "STATUTJRN" }, { name: "CLEIDEMPOTENCE" }]
  };
  const items = Object.fromEntries(noms.map((n) => [n, []]));
  items["OBJ-NOM DE DOMAINE"] = [
    { id: "d", fields: { Title: "client.example.test", OBJSITELookupId: "s", KLookupId: "k", ALookupId: "yes", VLookupId: "yes" } },
    { id: "commun", fields: { Title: "dseco.fr", OBJSITELookupId: "commun", KLookupId: "proprietaire-dse", ALookupId: "yes", VLookupId: "yes" } }];
  items["OBJ-SITE-PUBLIC"] = [{ id: "s", fields: { KLookupId: "k" } }, { id: "commun", fields: { KLookupId: "proprietaire-dse" } }];
  items["OBJ-ACTIF"] = items["OBJ-VALIDE"] = [{ id: "yes", fields: { Title: "Oui" } }];
  items["OBJ-INSCRIPTION"] = [{ id: "invitation", fields: { OIDINTERNE: "oid", KLookupId: "k", SLookupId: "s", RLookupId: "r", ALookupId: "yes", VLookupId: "yes" } }];
  const S = { listes: { utilisateur: "OBJ-UTILISATEUR", lien: "OBJ-UTILISATEUR-SITE" }, colonnes: {
    utilisateurEntra: "ENTRAOBJECTID", utilisateurRole: "R", utilisateurClient: "K", utilisateurActif: "A", utilisateurValide: "V",
    lienUtilisateur: "U", lienClient: "K", lienSite: "S", lienActif: "A", lienValide: "V"
  } };
  const sauvegarde = {};
  const changer = (objet, cle, valeur) => { sauvegarde[cle] = objet[cle]; objet[cle] = valeur; };
  const donnees = () => ({
    structure: S, utilisateurs: items["OBJ-UTILISATEUR"].map((i) => ({ id: i.id, entraObjectId: i.fields.ENTRAOBJECTID,
      titre: i.fields.Title, roleId: i.fields.RLookupId,
      clientId: i.fields.KLookupId, actif: i.fields.ALookupId === "yes", valide: i.fields.VLookupId === "yes" })),
    clients: [{ id: "k", titre: "Client" }], roles: [{ id: "r", titre: "Lecteur" }],
    politique: { roles: {
      r: { portee: "attribues", niveau: "lecture", fonctions: ["sites"] },
      global: { portee: "tous", niveau: "administration", fonctions: ["sites"] }
    } }
  });
  changer(droits, "donneesDroits", async () => donnees());
  changer(droits, "droitsPour", async (identite) => droits.calculerDroits({ identite, ...donnees() }));
  changer(dse, "obtenirJetonGraph", async () => "fake");
  changer(dse, "obtenirSiteGraph", async () => ({ id: "g" }));
  changer(dse, "collecter", async () => listes);
  changer(dse, "chargerColonnesListe", async (_t, _s, l) => {
    if (l === "OBJ-JRN") assert.fail("Une panne du schéma journal ne doit pas atteindre l'inscription");
    return cols[l] || [];
  });
  changer(dse, "chargerItemsListe", async (_t, _s, l) => {
    if (l === "OBJ-JRN") assert.fail("Le journal ne doit pas être lu par l'inscription");
    return items[l] || [];
  });
  changer(dse, "graphSansCache", async (_t, chemin) => {
    const m = /\/lists\/([^/]+)\/items(?:\/([^/?]+))?/.exec(chemin);
    return m[2] ? items[m[1]].find((i) => i.id === m[2]) : { value: items[m[1]] };
  });
  let interruptionCommun = true;
  changer(dse, "graphEcriture", async (_t, methode, chemin, corps) => {
    assert.strictEqual(methode, "POST");
    const l = /\/lists\/([^/]+)\/items/.exec(chemin)[1];
    if (l === "OBJ-JRN") assert.fail("Le journal ne doit pas être écrit par l'inscription");
    if (l === "OBJ-ACCES-COMMUN" && interruptionCommun) {
      interruptionCommun = false;
      throw new Error("Interruption commune simulée");
    }
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
    const invitation = items["OBJ-INSCRIPTION"][0];
    for (const [champ, valeur] of [["ALookupId", "non"], ["VLookupId", "non"], ["KLookupId", "autre"],
      ["SLookupId", "autre"], ["RLookupId", "inconnu"], ["RLookupId", "global"], ["OIDINTERNE", "autre"]]) {
      const avant = invitation.fields[champ];
      invitation.fields[champ] = valeur;
      assert.strictEqual((await inscription.inscrire(id, "client.example.test", true)).status, 403);
      assert.strictEqual(items["OBJ-UTILISATEUR"].length, 0);
      assert.strictEqual(items["OBJ-ACCES-COMMUN"].length, 0);
      invitation.fields[champ] = avant;
    }
    assert.strictEqual(await inscription.apresAuthentification({ ...id, sujet: "sans-invitation" }, "client.example.test"), false);
    await assert.rejects(() => inscription.apresAuthentification(id, "client.example.test"), /indisponible/);
    assert.strictEqual(items["OBJ-UTILISATEUR"].length, 1);
    assert.strictEqual(items["OBJ-UTILISATEUR-SITE"].length, 1);
    assert.strictEqual(await inscription.apresAuthentification(id, "client.example.test"), true, "reprise apres interruption, meme si le compte est deja reconnu");
    assert.strictEqual(items["OBJ-UTILISATEUR"].length, 1);
    assert.strictEqual(items["OBJ-UTILISATEUR-SITE"].length, 1);
    assert.strictEqual(items["OBJ-UTILISATEUR-SITE"][0].fields.KLookupId, "k");
    assert.strictEqual(items["OBJ-ACCES-COMMUN"].length, 1);
    assert.strictEqual(items["OBJ-ACCES-COMMUN"][0].fields.SLookupId, "commun");
    assert.strictEqual(items["OBJ-UTILISATEUR"][0].fields.KLookupId, "k");
    assert.strictEqual(items["OBJ-SITE-PUBLIC"][1].fields.KLookupId, "proprietaire-dse");
    assert.strictEqual(await inscription.apresAuthentification(id, "dseco.fr"), true, "la connexion d'un utilisateur reconnu reste possible dans le cockpit commun");
    assert.strictEqual(items["OBJ-JRN"].length, 0, "inscription sans lecture/ecriture du journal");
    const replay = await inscription.inscrire(id, "client.example.test", true);
    assert.strictEqual(replay.donnees.deja, true);
    const total = items["OBJ-JRN"].length;
    await inscription.inscrire(id, "client.example.test", true);
    assert.strictEqual(items["OBJ-JRN"].length, total, "aucun doublon journal au rejeu");
    assert.strictEqual(items["OBJ-ACCES-COMMUN"].length, 1);
    assert.strictEqual(items["OBJ-UTILISATEUR"].length, 1);
    assert.strictEqual(items["OBJ-UTILISATEUR-SITE"].length, 1);
    assert.strictEqual(new Set(items["OBJ-JRN"].map((i) => i.fields.CLEIDEMPOTENCE)).size, total);
    const d = droits.calculerDroits({ identite: id, ...donnees(), sites: [{ id: "s", clientId: "k" }, { id: "commun", clientId: "proprietaire-dse" }],
      liensCommuns: [{ utilisateurId: "1", siteId: "commun", actif: true, valide: true }] });
    assert.deepStrictEqual(d.sitesCommuns, ["commun"]);
    assert.deepStrictEqual(d.siteIds, [], "un acces commun n'accorde aucun droit metier");
    assert.deepStrictEqual(d.clientIds, ["k"]);
    assert.deepStrictEqual(droits.calculerDroits({ identite: id, ...donnees(),
      sites: [{ id: "commun", clientId: "proprietaire-dse" }],
      liensCommuns: [{ utilisateurId: "1", siteId: "commun", actif: true, valide: false }] }).sitesCommuns, []);
    const session = require("../auth/session");
    const controleur = require("../dseCockpit");
    const ancienneIdentite = session.identiteSession;
    session.identiteSession = () => id;
    try {
      for (const body of [{ role: "global" }, { client: "intrus" }, { site: "commun" }, { confirmer: "true" }]) {
        const res = { status(n) { this.code = n; return this; }, set() { return this; }, json(r) { this.corps = r; return this; } };
        await controleur.inscrire({ body, hostname: "client.example.test",
          get: (h) => ({ origin: "https://client.example.test", host: "client.example.test" }[h]) }, res);
        assert.strictEqual(res.code, 403, "aucun parametre navigateur ne remplace l'invitation");
      }
    } finally { session.identiteSession = ancienneIdentite; }
    invitation.fields.RLookupId = "different";
    assert.strictEqual((await inscription.inscrire(id, "client.example.test", true)).status, 403);
    invitation.fields.RLookupId = "r";
    items["OBJ-UTILISATEUR"][0].fields.RLookupId = "autre-role";
    assert.strictEqual((await inscription.inscrire(id, "client.example.test", true)).status, 403);
    items["OBJ-UTILISATEUR"][0].fields.RLookupId = "r";
    items["OBJ-ACCES-COMMUN"][0].fields.VLookupId = "non";
    assert.strictEqual((await inscription.inscrire(id, "client.example.test", true)).status, 502);
    assert.strictEqual(items["OBJ-ACCES-COMMUN"].length, 1);
    assert.strictEqual(items["OBJ-JRN"].length, 0);
    items["OBJ-ACCES-COMMUN"][0].fields.VLookupId = "yes";
    const interdit = await inscription.inscrire({ ...id, sujet: "intrus" }, "client.example.test", true);
    assert.strictEqual(interdit.status, 403);
    assert.strictEqual(items["OBJ-JRN"].length, 0);
    assert.strictEqual(items["OBJ-UTILISATEUR-SITE"].length, 1);
    items["OBJ-UTILISATEUR"][0].fields.KLookupId = "autre-client";
    assert.strictEqual((await inscription.inscrire(id, "client.example.test", true)).status, 403);
    assert.strictEqual(items["OBJ-UTILISATEUR-SITE"].length, 1);
    items["OBJ-SITE-PUBLIC"][0].fields.KLookupId = "autre-client";
    assert.strictEqual(await inscription.domaineContexte(await ecriture.contexteGraph(), "client.example.test"), null);
    items["OBJ-SITE-PUBLIC"][0].fields.KLookupId = "k";
    items["OBJ-UTILISATEUR"][0].fields.KLookupId = "k";
    items["OBJ-SITE-PUBLIC"].push({ id: "s2", fields: { KLookupId: "k" } });
    items["OBJ-NOM DE DOMAINE"].push({ id: "d2", fields: { ...items["OBJ-NOM DE DOMAINE"][0].fields,
      Title: "second.example.test", OBJSITELookupId: "s2" } });
    items["OBJ-INSCRIPTION"].push({ id: "invitation2", fields: { ...invitation.fields, SLookupId: "s2" } });
    assert.strictEqual(await inscription.apresAuthentification(id, "second.example.test"), true);
    assert.strictEqual(items["OBJ-UTILISATEUR"].length, 1);
    assert.strictEqual(items["OBJ-UTILISATEUR-SITE"].length, 2);
    assert.strictEqual(items["OBJ-ACCES-COMMUN"].length, 1);
    assert.strictEqual(items["OBJ-UTILISATEUR"][0].fields.KLookupId, "k");
  } finally {
    for (const [cle, valeur] of Object.entries(sauvegarde)) {
      if (["donneesDroits", "droitsPour"].includes(cle)) droits[cle] = valeur; else dse[cle] = valeur;
    }
  }
  console.log("Inscription autorisee sans journal, confirmation, egalite clients, refus et anti-doublon OK (Graph simule, aucune donnee reelle creee)");
})().catch((e) => { console.error(e); process.exitCode = 1; });
