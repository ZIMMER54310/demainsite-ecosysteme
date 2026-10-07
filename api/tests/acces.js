"use strict";

process.env.DSE_SESSION_SECRET = "a".repeat(40);
const assert = require("assert");
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const droits = require("../auth/droits");
const incidents = require("../auth/incidents");
const acces = require("../auth/acces");
const session = require("../auth/session");
const inscription = require("../auth/inscription");
const entra = require("../auth/fournisseurs/entra");

(async () => {
  const restaurer = [];
  const changer = (o, c, v) => { const avant = o[c]; restaurer.push(() => { o[c] = avant; }); o[c] = v; };
  const journaux = [];
  const g = { token: "simule", siteGraphId: "graph", listes: [
    { id: "journal", displayName: "OBJ-JRN" }, { id: "site-list", displayName: "OBJ-SITE-PUBLIC" }
  ] };
  const id = { fournisseur: "entra", sujet: "objet-stable", email: "compte@example.test" };
  const admin = { fournisseur: "entra", sujet: "admin-stable" };
  let donnees = { utilisateurs: [{ id: "u", titre: "Compte", entraObjectId: id.sujet, roleId: "r", actif: true, valide: true },
    { id: "admin", titre: "Admin", entraObjectId: admin.sujet, roleId: "global", actif: true, valide: true }],
    politique: { roles: { global: { portee: "tous", niveau: "administration" } } } };
  let approbationActive = true;
  let politiqueItems = [];
  const d = { reconnu: true, siteIds: ["site"], sitesCommuns: ["commun"], fonctions: ["sites"], portee: "attribues" };
  changer(ecriture, "contexteGraph", async () => g);
  changer(ecriture, "collecterFrais", async (_g, chemin) => chemin.includes("/politique/") ? politiqueItems : journaux);
  changer(ecriture, "journaliser", async (_g, entree) => {
    if (!journaux.some((i) => i.fields.CLEIDEMPOTENCE === entree.cle)) journaux.push({ id: String(journaux.length + 1), fields: {
      ACTION: entree.action, NOUVELLEVALEUR: JSON.stringify(entree.nouveau), CLEIDEMPOTENCE: entree.cle,
      STATUTJRN: entree.refus ? "REFUS" : "SUCCÈS"
    } });
    return { ok: true };
  });
  changer(droits, "donneesDroits", async () => donnees);
  changer(droits, "droitsPour", async (i) => i.sujet === admin.sujet
    ? { reconnu: true, portee: "tous", niveau: "administration", fonctions: ["utilisateurs"], utilisateurId: "admin" } : d);
  changer(droits, "sitesIndex", async () => ({ sites: new Map() }));
  changer(inscription, "domaineContexte", async (_g, nom) => ({ siteId: nom === "commun.example.test" ? "commun" : nom === "autre.example.test" ? "autre" : "site", domaine: nom }));
  changer(dse, "chargerColonnesListe", async (_token, _site, listId) => listId === "site-list" ? [
    { name: "OBJACCESCOCKPIT", boolean: {} }, { name: "OBJCREATIONCOMPTE", boolean: {} },
    { name: "OBJAPPROBATIONPROPRIETAIRE", boolean: {} }
  ] : [{ name: "A", lookup: { listId: "actif" } }, { name: "V", lookup: { listId: "valide" } }]);
  changer(ecriture, "lireItemFrais", async (_graph, listId) => listId === "site-list"
    ? { OBJACCESCOCKPIT: true, OBJCREATIONCOMPTE: true, OBJAPPROBATIONPROPRIETAIRE: approbationActive } : {});
  changer(dse, "chargerItemsListe", async () => [{ id: "oui", fields: { Title: "Oui" } }]);
  try {
    assert.strictEqual((await acces.etat(null, "site.example.test")).etat, "visiteur");
    assert.strictEqual((await acces.etat(null, "site.example.test")).creationCompteAutorisee, true);
    assert.strictEqual((await acces.etat(null, "site.example.test")).approbationProprietaire, true);
    assert.strictEqual((await acces.etat(id, "site.example.test")).cible, "/#/cockpit/sites");
    assert.strictEqual((await acces.etat(id, "commun.example.test")).cible, "/#/cockpit");
    assert.strictEqual((await acces.etat(id, "autre.example.test")).etat, "refuse");
    const roleNormal = droits.droitsPour;
    droits.droitsPour = async () => ({ reconnu: false, fonctions: [] });
    assert.strictEqual((await acces.etat(id, "site.example.test")).etat, "attente");
    donnees.utilisateurs[0].actif = false;
    assert.strictEqual((await acces.etat(id, "site.example.test")).etat, "refuse");
    donnees.utilisateurs[0].actif = true;
    droits.droitsPour = roleNormal;
    await incidents.refuser(id, "site.example.test", "Périmètre");
    await incidents.refuser(id, "site.example.test", "Périmètre");
    await incidents.refuser(id, "site.example.test", "Périmètre");
    assert.strictEqual(await incidents.verifier(id), false, "sans politique : pas de durée inventée ni verrouillage automatique");
    assert.deepStrictEqual((await incidents.lire(true)).incidents, []);
    assert.strictEqual((await incidents.lire()).desactive, true);
    assert.strictEqual(await incidents.decider(id, "ancien", "maintenir"), false);
    assert.strictEqual(await incidents.decider(admin, "ancien", "reactiver"), false);
    g.listes.push({ id: "politique", displayName: "OBJ-POLITIQUE-ACCES" },
      { id: "actif", displayName: "OBJ-ACTIF" }, { id: "valide", displayName: "OBJ-VALIDE" });
    politiqueItems = [{ id: "p", fields: { ALookupId: "oui", VLookupId: "oui", FENETREREFUSMINUTES: 5, BLOCAGEMINUTES: 10 } }];
    incidents.viderCache();
    await Promise.all(Array.from({ length: 3 }, () => incidents.refuser(id, "site.example.test", "Périmètre")));
    assert.strictEqual(await incidents.verifier(id), false, "blocage automatique désactivé explicitement");
    const bloque = { status(n) { this.code = n; return this; }, set() { return this; }, json(c) { this.corps = c; return this; } };
    changer(session, "identiteSession", () => id);
    let autorise = false;
    changer(inscription, "reglagesSite", async () => ({
      afficherAccesCockpit: true, creationCompteAutorisee: true, approbationProprietaire: approbationActive
    }));
    await acces.proteger({ method: "GET", get: () => null }, bloque, () => { autorise = true; });
    assert.strictEqual(autorise, true);
    assert.strictEqual((await acces.etat(id, "site.example.test")).etat, "contexte-incomplet");
    await incidents.refuser(id, "site.example.test", "Périmètre");
    const alertes = journaux.filter((i) => i.fields.ACTION === "ALERTE-EN-ATTENTE");
    assert.strictEqual(alertes.length, 0);
    assert.strictEqual(await incidents.decider(admin, "ancien", "reactiver"), false);
    assert.strictEqual(await incidents.verifier(id), false);
    assert.strictEqual(journaux.length, 0, "aucune dépendance au journal pour l'accès");
    assert.strictEqual(await incidents.decider(admin, "ancien", "maintenir"), false);
    assert.strictEqual(await incidents.verifier(id), false);
    assert.strictEqual(await incidents.decider(admin, "ancien", "reactiver"), false);
    await Promise.all(Array.from({ length: 3 }, () => incidents.refuser(id, "site.example.test", "Rôle")));
    const maintenant = Date.now;
    Date.now = () => maintenant() + 11 * 60000;
    try { assert.strictEqual(await incidents.verifier(id), false, "expiration issue de SharePoint"); }
    finally { Date.now = maintenant; }
    const avant = journaux.length;
    const reponse = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, set() { return this; },
      json(c) { this.corps = c; return this; } });
    const req = { method: "GET", hostname: "site.example.test", get: () => null };
    const res = reponse();
    await acces.proteger(req, res, () => { res.status(503).json({ succes: false }); });
    assert.strictEqual(journaux.length, avant, "panne API non comptée");
    const csrfRefus = reponse();
    await acces.proteger({ ...req, method: "POST" }, csrfRefus, () => assert.fail("CSRF accepté"));
    assert.strictEqual(csrfRefus.statusCode, 403);
    assert.strictEqual(journaux.length, avant, "CSRF invalide non associé arbitrairement à l'utilisateur");
    const token = session.signer({ usage: "csrf", sub: id.sujet }, 600);
    const valide = reponse();
    await acces.proteger({ ...req, method: "POST", get: (h) => ({
      origin: "https://site.example.test", host: "site.example.test", "x-dse-csrf": token
    }[h]) }, valide, () => { valide.json({ succes: true }); });
    assert.strictEqual(valide.corps.succes, true);
    let acceptes = 0;
    const limite = reponse();
    for (let n = 0; n < 121; n++) acces.limiter({ ip: "ip-simulee" }, limite, () => { acceptes++; });
    assert.strictEqual(acceptes, 120);
    assert.strictEqual(limite.statusCode, 429);
    assert.strictEqual(journaux.length, avant, "limitation IP sans incident utilisateur");

    // Retour OAuth sur le domaine d'origine, avec cookie de transaction et passage unique.
    process.env.DSE_TENANT_ID = "tenant";
    process.env.DSE_CLIENT_ID = "client";
    process.env.DSE_CLIENT_SECRET = "simule";
    process.env.DSE_AUTH_BASE_URL = "https://central.example.test";
    changer(inscription, "apresAuthentification", async () => true);
    const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; },
      redirect(n, cible) { this.code = n; this.cible = cible; }, status(n) { this.code = n; return this; }, send(t) { this.texte = t; } });
    const debut = response();
    await entra.demarrer({ hostname: "site.example.test" }, debut);
    const oauth = new URL(debut.cible);
    const state = oauth.searchParams.get("state");
    const txCookie = debut.headers["Set-Cookie"][0].split(";")[0];
    const tx = session.verifier(session.lireCookies({ headers: { cookie: txCookie } }).dse_auth_tx);
    changer(global, "fetch", async () => ({ ok: true, json: async () => ({ id_token: `e30.${Buffer.from(JSON.stringify({
      aud: "client", tid: "tenant", iss: "https://login.microsoftonline.com/tenant/v2.0",
      nonce: tx.nonce, oid: id.sujet, exp: Math.floor(Date.now() / 1000) + 60
    })).toString("base64url")}.signature` }) }));
    const retour = await entra.rappel({ hostname: "central.example.test", query: { state, code: "code-simule" } }, response());
    assert.ok(retour.cible.startsWith("https://site.example.test/api/v1/auth/continuer?code="));
    const passage = new URL(retour.cible).searchParams.get("code");
    const hostile = response();
    await entra.continuer({ hostname: "site.example.test", query: { code: passage }, headers: {} }, hostile);
    assert.strictEqual(hostile.code, 403, "cookie de navigateur d'origine obligatoire");
    const fin = response();
    await entra.continuer({ hostname: "site.example.test", query: { code: passage }, headers: { cookie: txCookie } }, fin);
    assert.strictEqual(fin.cible, "/#/cockpit/sites");
    assert.ok(fin.headers["Set-Cookie"].some((c) => c.includes("dse_session=") && /HttpOnly; Secure; SameSite=Lax/.test(c)));
    const rejeu = response();
    await entra.continuer({ hostname: "site.example.test", query: { code: passage }, headers: { cookie: txCookie } }, rejeu);
    assert.strictEqual(rejeu.code, 403);
    const avantAnnulation = journaux.length;
    const annule = response();
    await entra.demarrer({ hostname: "site.example.test" }, annule);
    const annulation = new URL(annule.cible).searchParams.get("state");
    const abandon = await entra.rappel({ hostname: "central.example.test", query: { state: annulation, error: "access_denied" } }, response());
    assert.strictEqual(abandon.ok, false);
    assert.strictEqual(journaux.length, avantAnnulation);

    changer(acces, "etat", async () => ({ etat: "attente", cible: null,
      creationCompteAutorisee: true, approbationProprietaire: true }));
    const debutDemande = response();
    await entra.demarrer({ hostname: "site.example.test", query: { mode: "demande-compte" } }, debutDemande);
    const urlDemande = new URL(debutDemande.cible);
    const etatDemande = urlDemande.searchParams.get("state");
    const cookieDemande = debutDemande.headers["Set-Cookie"][0].split(";")[0];
    const transactionDemande = session.verifier(session.lireCookies({ headers: { cookie: cookieDemande } }).dse_auth_tx);
    assert.strictEqual(transactionDemande.mode, "demande-compte");
    global.fetch = async () => ({ ok: true, json: async () => ({ id_token: `e30.${Buffer.from(JSON.stringify({
      aud: "client", tid: "tenant", iss: "https://login.microsoftonline.com/tenant/v2.0",
      nonce: transactionDemande.nonce, oid: id.sujet, exp: Math.floor(Date.now() / 1000) + 60
    })).toString("base64url")}.signature` }) });
    const retourDemande = await entra.rappel({ hostname: "central.example.test",
      query: { state: etatDemande, code: "code-simule" } }, response());
    const codeDemande = new URL(retourDemande.cible).searchParams.get("code");
    const finDemande = response();
    await entra.continuer({ hostname: "site.example.test", query: { code: codeDemande },
      headers: { cookie: cookieDemande } }, finDemande);
    assert.strictEqual(finDemande.cible, "/#/demande-compte");
    approbationActive = false;
    const debutSuspendu = response();
    const oauthSuspendu = await entra.demarrer({ hostname: "site.example.test",
      query: { mode: "demande-compte" } }, debutSuspendu);
    assert.strictEqual(oauthSuspendu, false, "l’entrée OAuth refuse les demandes sans approbation");
    approbationActive = true;

    changer(global, "window", { location: { origin: "https://site.example.test" } });
    changer(global, "document", { createElement: (tag) => ({ tag, isConnected: true, enfants: [],
      setAttribute() {}, append(e) { this.enfants.push(e); } }) });
    const { monterAccesPublic } = await import("../../modules/public/acces.js");
    for (const etat of ["visiteur", "autorise", "attente", "refuse", "bloque"]) {
      global.fetch = async () => ({ ok: true, json: async () => ({ donnees: { etat } }) });
      const racine = { enfants: [], append(e) { this.enfants.push(e); } };
      await monterAccesPublic(racine);
      const bouton = racine.enfants[0].enfants[0];
      assert.strictEqual(bouton.tag, ["visiteur", "autorise"].includes(etat) ? "a" : "span");
      if (bouton.tag === "a") assert.strictEqual(bouton.href, "/api/v1/acces/entrer");
      assert.ok(bouton.textContent.length > 0);
    }
    global.fetch = async () => ({ ok: true, json: async () => ({ donnees: {
      etat: "visiteur", afficherAccesCockpit: true, creationCompteAutorisee: true
    } }) });
    const inscriptionPublique = { enfants: [], append(e) { this.enfants.push(e); } };
    await monterAccesPublic(inscriptionPublique);
    assert.strictEqual(inscriptionPublique.enfants[0].enfants.length, 2);
    assert.strictEqual(inscriptionPublique.enfants[0].enfants[1].textContent, "Créer mon compte");
    assert.strictEqual(inscriptionPublique.enfants[0].enfants[1].href, "/api/v1/auth/entra/connexion?mode=demande-compte");
  } finally { restaurer.reverse().forEach((f) => f()); incidents.viderCache(); }
  console.log("Acces public sans journal ni blocage automatique, CSRF, droits et retour Entra domaine origine OK (simulation uniquement)");
})().catch((e) => { console.error(e); process.exitCode = 1; });
