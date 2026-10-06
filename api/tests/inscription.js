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
      lookup("K", "OBJ-CLIENT"), lookup("S", "OBJ-SITE-PUBLIC"), lookup("R", "OBJ-ROLE"), lookup("A", "OBJ-ACTIF"), lookup("V", "OBJ-VALIDE")]
  };
  const items = Object.fromEntries(noms.map((n) => [n, []]));
  items["OBJ-NOM DE DOMAINE"] = [
    { id: "d", fields: { Title: "client.example.test", OBJSITELookupId: "s", KLookupId: "k", ALookupId: "yes", VLookupId: "yes" } },
    { id: "commun", fields: { Title: "dseco.fr", OBJSITELookupId: "commun", KLookupId: "proprietaire-dse", ALookupId: "yes", VLookupId: "yes" } }];
  items["OBJ-SITE-PUBLIC"] = [{ id: "s", fields: { KLookupId: "k" } }, { id: "commun", fields: { KLookupId: "proprietaire-dse" } }];
  items["OBJ-ACTIF"] = items["OBJ-VALIDE"] = [{ id: "yes", fields: { Title: "Oui" } }];
  items["OBJ-INSCRIPTION"] = [{ id: "invitation", fields: { OIDINTERNE: "oid", KLookupId: "k", SLookupId: "s",
    RLookupId: "r", ALookupId: "yes", VLookupId: "yes" } }];
  const S = { listes: { utilisateur: "OBJ-UTILISATEUR", lien: "OBJ-UTILISATEUR-SITE" }, colonnes: {
    utilisateurEntra: "ENTRAOBJECTID", utilisateurRole: "R", utilisateurClient: "K", utilisateurActif: "A", utilisateurValide: "V",
    lienUtilisateur: "U", lienClient: "K", lienSite: "S", lienActif: "A", lienValide: "V"
  } };
  const restaurer = [];
  const changer = (objet, cle, valeur) => {
    const avant = objet[cle];
    restaurer.push(() => { objet[cle] = avant; });
    objet[cle] = valeur;
  };
  changer(droits, "donneesDroits", async () => ({
    structure: S, utilisateurs: [], clients: [{ id: "k", titre: "Client" }], roles: [{ id: "r", titre: "Lecteur" }],
    politique: { roles: {
      r: { portee: "attribues", niveau: "lecture", fonctions: ["sites"] },
      global: { portee: "tous", niveau: "administration", fonctions: ["sites"] }
    } }
  }));
  changer(dse, "obtenirJetonGraph", async () => "fake");
  changer(dse, "obtenirSiteGraph", async () => ({ id: "g" }));
  changer(dse, "collecter", async () => listes);
  changer(dse, "chargerColonnesListe", async (_t, _s, l) => {
    assert.notStrictEqual(l, "OBJ-JRN");
    return cols[l] || [];
  });
  changer(dse, "chargerItemsListe", async (_t, _s, l) => {
    assert.notStrictEqual(l, "OBJ-JRN");
    return items[l] || [];
  });
  changer(dse, "graphSansCache", async (_t, chemin) => {
    assert.ok(!chemin.includes("OBJ-JRN"));
    const m = /\/lists\/([^/]+)\/items(?:\/([^/?]+))?/.exec(chemin);
    return m[2] ? items[m[1]].find((i) => i.id === m[2]) : { value: items[m[1]] };
  });
  changer(dse, "graphEcriture", async () => assert.fail("Aucune ecriture sans profil contextuel autorise."));
  try {
    const id = { fournisseur: "entra", sujet: "oid", email: "compte@example.test" };
    assert.deepStrictEqual(await inscription.domaineContexte(await ecriture.contexteGraph(), "client.example.test"),
      { domaine: "client.example.test", domaineId: "d", siteId: "s", clientId: "k" });
    for (const confirmer of [false, true]) {
      const refus = await inscription.inscrire(id, "client.example.test", confirmer);
      assert.strictEqual(refus.status, 409);
      assert.match(refus.erreur, /Profil d'accès contextuel absent/);
    }
    const invitation = items["OBJ-INSCRIPTION"][0];
    for (const [champ, valeur] of [["ALookupId", "non"], ["VLookupId", "non"], ["KLookupId", "autre"],
      ["SLookupId", "autre"], ["RLookupId", "inconnu"], ["RLookupId", "global"], ["OIDINTERNE", "autre"]]) {
      const avant = invitation.fields[champ];
      invitation.fields[champ] = valeur;
      assert.strictEqual((await inscription.inscrire(id, "client.example.test", true)).status, 403);
      invitation.fields[champ] = avant;
    }
    assert.strictEqual(await inscription.apresAuthentification(id, "client.example.test"), false);
    const invitations = items["OBJ-INSCRIPTION"];
    items["OBJ-INSCRIPTION"] = [];
    assert.strictEqual((await inscription.inscrire(id, "client.example.test", false, true)).status, 204,
      "une connexion existante sans invitation reste possible sans attribuer un contexte");
    items["OBJ-INSCRIPTION"] = invitations;
    const session = require("../auth/session");
    changer(session, "identiteSession", () => id);
    const controleur = require("../dseCockpit");
    for (const body of [{ role: "global" }, { client: "intrus" }, { site: "commun" }, { accesType: "intrus" }, { confirmer: "true" }]) {
      const res = { status(n) { this.code = n; return this; }, set() { return this; }, json(r) { this.corps = r; return this; } };
      await controleur.inscrire({ body, hostname: "client.example.test",
        get: (h) => ({ origin: "https://client.example.test", host: "client.example.test" }[h]) }, res);
      assert.strictEqual(res.code, 403);
    }
    for (const nom of ["OBJ-UTILISATEUR", "OBJ-UTILISATEUR-SITE", "OBJ-ACCES-COMMUN", "OBJ-JRN"]) {
      assert.strictEqual(items[nom].length, 0);
    }
  } finally {
    for (const f of restaurer.reverse()) f();
  }
  console.log("Inscription : refus avant mutation sans profil, invitations invalides, parametres navigateur et connexion existante OK");
})().catch((e) => { console.error(e); process.exitCode = 1; });
