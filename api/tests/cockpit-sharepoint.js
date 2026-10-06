"use strict";

process.env.DSE_SESSION_SECRET = "t".repeat(40);
const assert = require("assert");
const dse = require("../shared/dse");
const droits = require("../auth/droits");
const { politiqueDepuisRoles } = require("../auth/politique-sharepoint");
const edition = require("../shared/edition");
const ecriture = require("../shared/ecriture");
const admin = require("../shared/administration");

(async () => {
  const roles = [
    { id: "100", titre: "Global", actif: true, valide: true, portee: "TOUS", niveau: "ADMINISTRATION", fonctions: "ADMINISTRATION-GLOBALE" },
    { id: "200", titre: "Client", actif: true, valide: true, portee: "CLIENT", niveau: "ADMINISTRATION", fonctions: "GESTION-CLIENT;GESTION-UTILISATEURS-CLIENT;GESTION-SITES-ATTRIBUES" },
    { id: "300", actif: true, valide: true, portee: "", niveau: "", fonctions: "" },
    { id: "400", actif: true, valide: true, portee: "TOUS", niveau: "ADMINISTRATION", fonctions: "INCONNUE" }
  ];
  const politique = politiqueDepuisRoles(roles);
  assert.deepStrictEqual(Object.keys(politique.roles), ["100", "200"], "aucune politique par ID ou titre");
  assert.deepStrictEqual(politiqueDepuisRoles([{ ...roles[0], portee: "CLIENT" }]).roles, {});
  assert.deepStrictEqual(politiqueDepuisRoles([{ ...roles[0], actif: false }]).roles, {});
  const clients = [{ id: "a" }, { id: "b" }];
  const utilisateurs = [
    { id: "u1", titre: "a@example.test", entraObjectId: "subject", roleId: "200", clientId: "a", actif: true, valide: true },
    { id: "u2", titre: "b@example.test", roleId: "200", clientId: "b", actif: true, valide: true }
  ];
  const base = { politique, clients, utilisateurs, sites: [{ id: "10", clientId: "a" }, { id: "20", clientId: "b" }],
    liens: [{ utilisateurId: "u1", clientId: "a", siteId: "10", actif: true, valide: true },
      { utilisateurId: "u1", clientId: "b", siteId: "20", actif: true, valide: true }],
    identite: { fournisseur: "entra", sujet: "subject", email: "a@example.test" } };
  const d = droits.calculerDroits(base);
  assert.equal(droits.calculerDroits({ ...base, utilisateurs: utilisateurs.map(({ entraObjectId, ...u }) => u) }).reconnu, false,
    "un titre ressemblant a l'email OAuth ne constitue pas une identite");
  assert.deepStrictEqual(d.siteIds, ["10", "20"], "plusieurs clients autorises par les relations, sans droit hors contexte");
  assert.deepStrictEqual(d.fonctions, []);
  assert.deepStrictEqual(d.clientIds, ["a"]);
  const multi = { ...base, sites: [...base.sites, { id: "11", clientId: "a" }, { id: "12", clientId: "a" }],
    liens: [...base.liens, { utilisateurId: "u1", clientId: "a", siteId: "11", actif: true, valide: true },
      { utilisateurId: "u1", clientId: "b", siteId: "12", actif: true, valide: true }] };
  assert.deepStrictEqual(droits.calculerDroits(multi).siteIds, ["10", "20", "11"], "sites attribues avec client de relation coherent");
  const permanent = { ...multi, utilisateurs: [{ ...utilisateurs[0], entraObjectId: "objet-stable" }],
    identite: { fournisseur: "entra", sujet: "objet-stable", email: "nouvelle-adresse@example.test" } };
  assert.deepStrictEqual(droits.calculerDroits(permanent).siteIds, ["10", "20", "11"], "objet Entra prioritaire malgre changement email");
  assert.strictEqual(droits.calculerDroits({ ...permanent, identite: { fournisseur: "entra", sujet: "autre", email: "a@example.test" } }).reconnu, false,
    "l'email ne reprend pas une identite deja liee");
  assert.strictEqual(droits.calculerDroits({ ...permanent, utilisateurs: [permanent.utilisateurs[0], { ...permanent.utilisateurs[0], id: "doublon" }] }).reconnu, false);
  assert.ok(!droits.peutAttribuer(d, "100", politique));
  assert.deepStrictEqual(droits.calculerDroits({ ...base, clients: [] }).siteIds, []);
  assert.deepStrictEqual(droits.calculerDroits({ ...base, politique: undefined }).fonctions, [], "aucun repli JSON");
  assert.deepStrictEqual(droits.calculerDroits({ ...base, utilisateurs: [{ ...utilisateurs[0], roleId: "300" }] }).fonctions, []);
  assert.deepStrictEqual(admin._test.utilisateursVisibles(d, { utilisateurs, liens: [], politique }).map((u) => u.id), []);
  const origineDonnees = droits.donneesDroits;
  droits.donneesDroits = async () => ({ utilisateurs, clients, liens: [], roles, politique,
    structure: { listes: { role: "roles", utilisateur: "users" }, colonnes: { utilisateurRole: "R", utilisateurClient: "K" } } });
  try {
    const ref = admin._test.ref;
    assert.ok((await admin.construireAction(d, "modifier-politique-role", { role: ref("r", "300"),
      portee: "TOUS", niveau: "ADMINISTRATION", fonctions: "ADMINISTRATION-GLOBALE" }, null)).refus);
    assert.ok((await admin.construireAction(d, "changer-role", { utilisateur: ref("u", "u1"), role: ref("r", "100") }, null)).refus,
      "auto-elevation refusee");
    assert.ok((await admin.construireAction(d, "changer-role", { utilisateur: ref("u", "u2"), role: ref("r", "100") }, null)).refus,
      "droits superieurs ou utilisateur d'un autre client refuses");
    assert.ok((await admin.construireAction(d, "changer-client", { utilisateur: ref("u", "u1"), client: ref("k", "b") }, null)).refus,
      "aucune action de changement de client n'est autorisee");
    const global = { ...d, global: true, portee: "tous", niveau: "administration", roleId: "100", fonctions: politique.roles["100"].fonctions, clientIds: ["a", "b"] };
    assert.ok((await admin.construireAction(global, "modifier-politique-role", { role: ref("r", "100"),
      portee: "CLIENT", niveau: "LECTURE", fonctions: "sites" }, null)).refus, "pas de modification de sa propre politique");
    assert.ok((await admin.construireAction(global, "modifier-politique-role", { role: ref("r", "300"),
      portee: "ATTRIBUES", niveau: "LECTURE", fonctions: "sites;suivi" }, null)).op);
    assert.ok((await admin.construireAction(global, "creer-utilisateur", { email: "new@example.test", role: ref("r", "200") }, null)).refus);
    const nouvelAdmin = await admin.construireAction(global, "creer-utilisateur", { email: "new@example.test", role: ref("r", "200"), client: ref("k", "a") }, null);
    assert.strictEqual(nouvelAdmin.op.champs.KLookupId, "a");
  } finally { droits.donneesDroits = origineDonnees; }
  const session = require("../auth/session");
  const controleur = require("../dseCockpit");
  const anciennesMethodes = { identite: session.identiteSession, droits: droits.droitsPour, index: droits.sitesIndex };
  const reponse = () => ({ status(n) { this.code = n; return this; }, set() { return this; }, json(r) { this.corps = r; return this; } });
  const requete = (domaine, body = {}) => ({ query: { domaine, composant: "seo" }, body,
    get: (h) => ({ origin: "https://a.example.test", host: "a.example.test" }[h]) });
  session.identiteSession = () => base.identite;
  droits.droitsPour = async () => d;
  const donneesAvantControleur = droits.donneesDroits;
  droits.donneesDroits = async () => base;
  droits.sitesIndex = async () => ({ sites: new Map([
    ["10", { id: "10", titre: "A", domainePrincipal: "a.example.test", domaines: ["a.example.test", "alias.example.test"], clientId: "a" }],
    ["20", { id: "20", titre: "B", domainePrincipal: "b.example.test", domaines: ["b.example.test"], clientId: "b" }]
  ]), statuts: new Map() });
  const ancienMenu = admin.menu;
  admin.menu = async () => [];
  try {
    let res = reponse();
    await controleur.moi({ query: {}, hostname: "a.example.test", get: () => null }, res);
    assert.strictEqual(res.code, 200);
    assert.deepStrictEqual(res.corps.donnees.sitesPublics, [{ nom: "A", domainePrincipal: "a.example.test",
      domaines: ["a.example.test", "alias.example.test"] }, { nom: "B", domainePrincipal: "b.example.test",
      domaines: ["b.example.test"] }], "seuls les sites attribues et leurs domaines sont exposes");
    droits.droitsPour = async () => ({ ...d, portee: "tous", siteIds: ["10", "20"] });
    res = reponse();
    await controleur.moi({ query: {}, hostname: "a.example.test", get: () => null }, res);
    assert.strictEqual(res.corps.donnees.sitesPublics.length, 2, "le super administrateur recoit un choix, pas un site arbitraire");
    droits.droitsPour = async () => d;
    res = reponse();
    await controleur.editionLire(requete("b.example.test"), res);
    assert.strictEqual(res.code, 403, "l'URL d'un autre client est refusee");
    res = reponse();
    await controleur.editionApercu(requete("a.example.test", { domaine: "b.example.test", composant: "seo", valeurs: {} }), res);
    assert.strictEqual(res.code, 403, "ecriture hors perimetre refusee et tentative de journalisation");
    const interdit = ecriture.emettreJeton(base.identite, { type: "modifier", portee: "site", fonction: "seo", siteId: "20", listId: "seo", itemId: "1" });
    res = reponse();
    await controleur.confirmer(requete("a.example.test", { jeton: interdit.jeton }), res);
    assert.strictEqual(res.code, 403, "les droits serveur sont controles a la confirmation");
    droits.droitsPour = async () => ({ ...d, fonctions: ["sites", "suivi"] });
    res = reponse();
    await controleur.editionApercu(requete("a.example.test", { domaine: "a.example.test", composant: "seo", valeurs: {} }), res);
    assert.strictEqual(res.code, 403, "une fonction interdite est refusee par le serveur sur un site autorise");
    droits.droitsPour = async () => d;
    session.identiteSession = () => null;
    res = reponse();
    await controleur.editionLire(requete("a.example.test"), res);
    assert.strictEqual(res.code, 401);
  } finally {
    admin.menu = ancienMenu;
    session.identiteSession = anciennesMethodes.identite;
    droits.droitsPour = anciennesMethodes.droits;
    droits.sitesIndex = anciennesMethodes.index;
    droits.donneesDroits = donneesAvantControleur;
  }

  const listes = ["OBJ-SITE-PUBLIC", "OBJ-SEO", "OBJ-JRN", "OBJ-ACTIF", "OBJ-VALIDE", "OBJ-MENU-SITE"]
    .map((displayName) => ({ id: displayName, displayName }));
  const cols = {
    "OBJ-SEO": [
      { name: "Title", displayName: "Titre", required: true, text: { maxLength: 255 } },
      { name: "NOTE_x002d_COURTE", displayName: "NOTE-COURTE", text: { maxLength: 255 } },
      { name: "OBJSITEPUBLIC", lookup: { listId: "OBJ-SITE-PUBLIC", allowMultipleValues: false } },
      { name: "OBJ_x002d_SITE_x002d_PUBLIC", lookup: {} },
      { name: "A", lookup: { listId: "OBJ-ACTIF" } }, { name: "V", lookup: { listId: "OBJ-VALIDE" } }
    ],
    "OBJ-JRN": [{ name: "STATUT", required: true, lookup: { listId: "orphelin" } }],
    "OBJ-MENU-SITE": [
      { name: "Title", text: { maxLength: 255 } },
      { name: "S", lookup: { listId: "OBJ-SITE-PUBLIC" } }
    ]
  };
  const items = {
    "OBJ-JRN": [],
    "OBJ-SEO": [{ id: "1", fields: { Title: "Orphelin" } }],
    "OBJ-ACTIF": [{ id: "17", fields: { Title: "Oui" } }],
    "OBJ-VALIDE": [{ id: "23", fields: { Title: "Oui" } }],
    "OBJ-MENU-SITE": [{ id: "7", fields: { Title: "Menu A", SLookupId: "10" } }, { id: "8", fields: { Title: "Menu B", SLookupId: "20" } }]
  };
  const sauvegarde = {};
  const remplacer = (nom, f) => { sauvegarde[nom] = dse[nom]; dse[nom] = f; };
  let creations = 0;
  let journaux = 0;
  remplacer("obtenirJetonGraph", async () => "fake");
  remplacer("obtenirSiteGraph", async () => ({ id: "g" }));
  remplacer("collecter", async (_t, chemin) => {
    if (chemin.includes("/lists/OBJ-JRN/")) assert.fail("Le journal indisponible ne doit pas être consulté");
    return listes;
  });
  remplacer("chargerColonnesListe", async (_t, _s, l) => {
    if (l === "OBJ-JRN") assert.fail("Le schéma du journal ne doit pas être consulté");
    return cols[l] || [];
  });
  remplacer("chargerItemsListe", async (_t, _s, l) => {
    if (l === "OBJ-JRN") assert.fail("Le journal ne doit pas être consulté");
    return items[l] || [];
  });
  remplacer("graphSansCache", async (_t, chemin) => {
    const m = /\/lists\/([^/]+)\/items(?:\/([^/?]+))?/.exec(chemin);
    if (!m) throw new Error("Chemin de test inconnu");
    if (m[1] === "OBJ-JRN") assert.fail("Le journal ne doit pas être consulté");
    return m[2] ? items[m[1]].find((i) => i.id === m[2]) : { value: items[m[1]] || [] };
  });
  remplacer("graphEcriture", async (_t, methode, chemin, corps, etag) => {
    const m = /\/lists\/([^/]+)\/items(?:\/([^/]+))?/.exec(chemin);
    if (m[1] === "OBJ-JRN") {
      assert.fail("Le journal indisponible ne doit pas être écrit");
    }
    if (methode === "POST") {
      const item = { id: String(++creations + 1), eTag: "test-etag", fields: { ...corps.fields } };
      items[m[1]].push(item);
      return item;
    }
    assert.strictEqual(etag, "test-etag");
    Object.assign(items[m[1]].find((i) => i.id === m[2]).fields, corps);
    return {};
  });
  try {
    const historique = await admin._test.ecrituresRecentes({ token: "fake", siteGraphId: "g", listes }, d);
    assert.strictEqual(historique.liste.length, 0);
    assert.strictEqual(historique.desactive, true);
    const identite = { fournisseur: "entra", sujet: "seo-user" };
    const lecture = await edition.lire({ composant: "seo", siteId: "10" });
    assert.ok(lecture.creation && lecture.champs.every((c) => c.valeur === ""));
    const cle = lecture.champs.find((c) => c.libelle === "Titre").cle;
    const args = { identite, composant: "seo", siteId: "10", valeurs: { [cle]: "Titre de recette" } };
    const p = await edition.preparer(args);
    const p2 = await edition.preparer(args);
    assert.strictEqual(p.status, 200);
    const op = ecriture.lireJeton(identite, p.jeton).op;
    assert.strictEqual(op.champs.OBJSITEPUBLICLookupId, "10");
    assert.strictEqual(op.champs.ALookupId, "17");
    assert.strictEqual(op.champs.VLookupId, "23");
    assert.ok(!Object.hasOwn(op.champs, "OBJ_x002d_SITE_x002d_PUBLICLookupId"));
    const exe = (jeton) => ecriture.executer({ identite, jeton, revalider: async () => null, acteur: "recette" });
    const r = await exe(p.jeton);
    assert.ok(r.succes && r.relecture === "conforme" && r.journal === null);
    assert.ok((await exe(p.jeton)).deja);
    assert.strictEqual((await exe(p2.jeton)).status, 409);
    assert.strictEqual(creations, 1);
    assert.deepStrictEqual(items["OBJ-SEO"][0].fields, { Title: "Orphelin" });
    const changement = await edition.preparer({ ...args, valeurs: { [cle]: "Titre modifie" } });
    assert.strictEqual((await exe(changement.jeton)).relecture, "conforme");
    assert.strictEqual(items["OBJ-SEO"][1].fields.Title, "Titre modifie");
    const relink = await edition.preparer({ ...args, valeurs: { [cle]: "Ne pas enregistrer" } });
    const lireVersion = dse.graphSansCache;
    dse.graphSansCache = async (t, chemin) => {
      const r = await lireVersion(t, chemin);
      return chemin.includes("/items/2?") ? { ...r, fields: { ...r.fields, OBJSITEPUBLICLookupId: "20" } } : r;
    };
    assert.strictEqual((await exe(relink.jeton)).status, 409, "un changement de rattachement avant PATCH refuse l'ecriture");
    assert.strictEqual(items["OBJ-SEO"][1].fields.Title, "Titre modifie");
    dse.graphSansCache = lireVersion;
    items["OBJ-SEO"].push({ id: "99", fields: { OBJSITEPUBLICLookupId: "10" } });
    assert.strictEqual((await edition.lire({ composant: "seo", siteId: "10" })).disponible, false);
    assert.strictEqual((await edition.preparer(args)).status, 409);
    assert.strictEqual(edition.elementsLies([{ fields: { OBJSITEPUBLICLookupId: "20", OBJ_x002d_SITE_x002d_PUBLICLookupId: "10" } }], cols["OBJ-SEO"], "10", "OBJ-SITE-PUBLIC", "seo").length, 0);
    const menu = await edition.lire({ composant: "menu", siteId: "10" });
    assert.strictEqual(menu.elements.length, 1);
    assert.strictEqual(menu.elements[0].titre, "Menu A");
    assert.strictEqual((await edition.lire({ composant: "menu", siteId: "20", element: menu.elements[0].ref })).disponible, false);
    assert.ok((await edition.lire({ composant: "menu", siteId: "10", element: menu.elements[0].ref })).champs);
    cols["OBJ-JRN"] = [
      { name: "STATUT", required: false, lookup: { listId: "orphelin" } },
      { name: "STATUTJRN" }, { name: "CLEIDEMPOTENCE", text: { maxLength: 255 } }
    ];
    const g = { token: "fake", siteGraphId: "g", listes };
    assert.ok((await ecriture.etatStructureJournal(g)).disponible, "un Lookup orphelin facultatif ne bloque pas le journal");
    items["OBJ-SEO"].pop();
    const modificationJournalisee = await edition.preparer({ ...args, valeurs: { [cle]: "Titre avec journal" } });
    const resultat = await exe(modificationJournalisee.jeton);
    assert.ok(resultat.succes && resultat.journal === null);
    assert.strictEqual((await exe(modificationJournalisee.jeton)).deja, true);
    assert.strictEqual(journaux, 0, "rejeu sans aucune écriture du journal");
    const journalRejoue = { cle: "cle-deterministe", action: "Recette journal", nom: "Journal", ancien: {}, nouveau: {}, notes: "recette", succes: true };
    await ecriture.journaliser(g, journalRejoue);
    await ecriture.journaliser(g, journalRejoue);
    assert.strictEqual(journaux, 0, "ancien adaptateur de journal sans appel Graph");
    cols["OBJ-JRN"][0].required = true;
    assert.strictEqual((await ecriture.etatStructureJournal(g)).desactive, true, "même un journal historique obligatoire est ignoré");
  } finally {
    Object.assign(dse, sauvegarde);
  }
  console.log("Droits SharePoint, perimetres, SEO sans journal et rejeu sans doublon OK");
})().catch((e) => { console.error(e); process.exitCode = 1; });
