"use strict";
// Tests du cockpit DSE : droits cote serveur, session, identite, vue et rendu (sans reseau).
process.env.DSE_SESSION_SECRET = "x".repeat(40);
const assert = require("assert");
const path = require("path");
const url = (f) => require("url").pathToFileURL(path.join(__dirname, "..", "..", f)).href;
const { calculerDroits } = require("../auth/droits");
const session = require("../auth/session");
const entra = require("../auth/fournisseurs/entra");
const { vueSite, resumeSite } = require("../shared/cockpit");
const politique = require("../config/politique-roles.json");
const perimetre = require("../shared/perimetre");

const TERMES_TECHNIQUES = /OBJ-|Lookup|listeId|"liste"|Graph|GitHub|SharePoint|sharepoint\.com|\bAPI\b/;

(async () => {
  // --- Droits -------------------------------------------------------------
  const sites = [{ id: "4", clientId: "2" }, { id: "9", clientId: "3" }, { id: "11", clientId: null }];
  const u = (id, titre, roleId, extra = {}) => ({ id, titre, roleId, roleTitre: `Rôle ${roleId}`, clientId: "2", actif: true, valide: true, ...extra });
  const base = { sites, politique, clients: [{ id: "2", entraObjectId: "oid-pascal", entraEmail: "pascal@ex.fr" }] };

  // Rapprochement par e-mail, portee "tous"
  let d = calculerDroits({ ...base, identite: { fournisseur: "entra", sujet: "autre", email: "Admin@Ex.fr" }, utilisateurs: [u("1", "admin@ex.fr", "1")] });
  assert.ok(d.reconnu); assert.deepStrictEqual(d.siteIds, ["4", "9", "11"]); assert.ok(d.fonctions.includes("creer"));
  // Rapprochement par oid du client
  d = calculerDroits({ ...base, identite: { fournisseur: "entra", sujet: "oid-pascal", email: "x@y.fr" }, utilisateurs: [u("2", "nom libre", "3")] });
  assert.ok(d.reconnu); assert.deepStrictEqual(d.siteIds, ["4"]); assert.ok(!d.fonctions.includes("creer"));
  // Ambigu -> rien
  d = calculerDroits({ ...base, identite: { fournisseur: "entra", sujet: "oid-pascal" }, utilisateurs: [u("2", "a", "1"), u("3", "b", "1")] });
  assert.strictEqual(d.reconnu, false); assert.deepStrictEqual(d.fonctions, []);
  // Inactif / non valide -> rien
  d = calculerDroits({ ...base, identite: { fournisseur: "entra", sujet: "s", email: "admin@ex.fr" }, utilisateurs: [u("1", "admin@ex.fr", "1", { valide: false })] });
  assert.strictEqual(d.reconnu, false);
  // Portee "attribues" : uniquement les liens actifs et valides
  const liens = [{ utilisateurId: "5", siteId: "9", actif: true, valide: true }, { utilisateurId: "5", siteId: "11", actif: true, valide: false }];
  d = calculerDroits({ ...base, liens, identite: { fournisseur: "entra", sujet: "s", email: "c@ex.fr" }, utilisateurs: [u("5", "c@ex.fr", "5")] });
  assert.deepStrictEqual(d.siteIds, ["9"]); assert.ok(!d.fonctions.includes("seo")); assert.ok(!d.fonctions.includes("domaine"));
  // Role inconnu de la politique -> aucune fonction, aucun site
  d = calculerDroits({ ...base, identite: { fournisseur: "entra", sujet: "s", email: "z@ex.fr" }, utilisateurs: [u("6", "z@ex.fr", "99")] });
  assert.deepStrictEqual(d.fonctions, []); assert.deepStrictEqual(d.siteIds, []);
  // Aucune identite -> rien
  assert.strictEqual(calculerDroits({ ...base, identite: null, utilisateurs: [] }).reconnu, false);

  // --- Session ------------------------------------------------------------
  const jeton = session.signer({ s: "abc" }, 60);
  assert.strictEqual(session.verifier(jeton).s, "abc");
  const [corps, sig] = jeton.split(".");
  const falsifie = Buffer.from(JSON.stringify({ s: "admin", exp: 9999999999 })).toString("base64url");
  assert.strictEqual(session.verifier(`${falsifie}.${sig}`), null, "corps falsifie rejete");
  assert.strictEqual(session.verifier(`${corps}.AAAA`), null, "signature invalide rejetee");
  assert.strictEqual(session.verifier(jeton, Date.now() + 3600 * 1000), null, "session expiree rejetee");

  // --- Identite Entra -----------------------------------------------------
  const { identiteDepuisJeton, cibleApresConnexion, domaineRetour } = entra._test;
  const c = { client: "cli", tenant: "ten" };
  const rev = { aud: "cli", tid: "ten", iss: "https://login.microsoftonline.com/ten/v2.0", nonce: "n1", exp: Math.floor(Date.now() / 1000) + 60, oid: "o1", preferred_username: "P@Ex.fr", name: "Pascal" };
  assert.deepStrictEqual(identiteDepuisJeton(rev, c, "n1"), { fournisseur: "entra", sujet: "o1", email: "p@ex.fr", nom: "Pascal" });
  assert.strictEqual(identiteDepuisJeton({ ...rev, aud: "autre" }, c, "n1"), null);
  assert.strictEqual(identiteDepuisJeton(rev, c, "mauvais"), null);
  assert.strictEqual(identiteDepuisJeton({ ...rev, tid: "x" }, c, "n1"), null);
  assert.strictEqual(domaineRetour("evil.com/x?"), null);
  assert.strictEqual(cibleApresConnexion("https://dseco.fr", "dseco.fr"), "https://dseco.fr/#/cockpit/site/dseco.fr");

  // --- Vue site -----------------------------------------------------------
  const pub = { relations: { "OBJ-ACTIF": { id: "1" }, "OBJ-VALIDE": { id: "1" } } };
  const siteComplet = {
    site: { disponible: true, liste: "OBJ-SITE-PUBLIC", listeId: "abc", donnees: { id: "4", configuration: { Title: "Mon site" } } },
    pages: { disponible: true, liste: "OBJ-PAGE", listeId: "p", donnees: [{ ...pub, id: "2", configuration: { Title: "Accueil" } }] },
    menu: { disponible: true, liste: "OBJ-MENU-SITE", listeId: "m", donnees: [{ ...pub, id: "1", configuration: { Title: "Menu", "LIEN-URL": { Url: "https://x.sharepoint.com/" } } }] },
    seo: { disponible: true, liste: "OBJ-SEO", listeId: "s", donnees: [] },
    contenus: { footer: { disponible: true, donnees: [] } }
  };
  const info = { id: "4", titre: "Mon site", domaines: ["exemple.fr"], statutId: "2" };
  const actif = { id: "2", titre: "Actif", code: "ACTIF", noteCourte: "En ligne" };
  const toutes = politique.roles["1"].fonctions;
  let vue = vueSite({ siteComplet, info, statut: actif, fonctions: toutes });
  const etat = (cle) => vue.etapes.find((x) => x.cle === cle)?.etat;
  assert.strictEqual(vue.domaine, "exemple.fr"); assert.ok(vue.statut.actif);
  assert.strictEqual(etat("informations"), "termine");
  assert.strictEqual(etat("menu"), "attention", "lien interne signale");
  assert.strictEqual(etat("seo"), "afaire");
  assert.strictEqual(etat("publication"), "termine");
  assert.ok(vue.progression > 0 && vue.progression < 100);
  const json = JSON.stringify(vue);
  assert.ok(!/OBJ-|listeId|"liste"|"id"/.test(json), "aucune cle technique exposee");
  // Statut non ACTIF quelconque (futur) : publication en cours, sans code specifique
  vue = vueSite({ siteComplet, info, statut: { id: "77", titre: "Nouveau statut", code: "NOUVEAU-STATUT" }, fonctions: toutes });
  assert.strictEqual(vue.statut.actif, false); assert.strictEqual(vue.etapes.find((x) => x.cle === "publication").etat, "encours");
  // Filtrage par fonctions
  vue = vueSite({ siteComplet, info, statut: actif, fonctions: politique.roles["6"].fonctions });
  assert.ok(!vue.etapes.some((x) => ["seo", "menu", "footer"].includes(x.cle)));
  assert.deepStrictEqual(Object.keys(resumeSite(info, actif)).sort(), ["acces", "alias", "domaine", "domaineAPreciser", "nom", "statut"]);

  // --- Rendu frontend -----------------------------------------------------
  const ui = await import(url("modules/cockpit/cockpit.js"));
  assert.strictEqual(ui.ETAPES_ASSISTANT.length, 12);
  assert.deepStrictEqual(ui.ETAPES_ASSISTANT.map((x) => x.libelle), ["Informations", "Domaine", "Identité visuelle", "En-tête", "Menu", "Pages", "Contenus / médias", "Footer", "SEO", "Aperçu", "Validation", "Progression"]);
  const moi = { nom: "Pascal <b>", role: { titre: "Profil test" }, fonctions: toutes, nombreSites: 1 };
  vue = vueSite({ siteComplet, info, statut: actif, fonctions: toutes });
  const pages = [
    ui.rendreConnexion({ fournisseurs: [{ id: "entra", libelle: "Compte Microsoft", disponible: true }, { id: "externe", libelle: "Accès sans compte Microsoft", disponible: false }] }),
    ui.rendreSansAcces(moi), ui.rendreAccueil({ moi, vueCourante: vue }), ui.rendreListeSites(moi, [resumeSite(info, actif)]),
    ui.rendreVueSite(moi, vue, "menu"),
    ...ui.ETAPES_ASSISTANT.map((_, i) => ui.rendreAssistant({ moi, numero: i + 1, valeurs: { nom: "Test", domaine: "pas un domaine" } }))
  ];
  for (const html of pages) {
    assert.ok(!TERMES_TECHNIQUES.test(html.replace(/\/api\/v1\/auth\/[^"]+/g, "")), `terme technique visible : ${html.match(TERMES_TECHNIQUES)?.[0]}`);
    assert.ok(!html.includes("<b>"), "nom echappe");
  }
  assert.ok(pages[0].includes("/api/v1/auth/entra/connexion") && pages[0].includes("Bientôt disponible"));
  assert.ok(pages[2].includes("Bonjour Pascal") && pages[2].includes("exemple.fr") && pages[2].includes("Actif"));
  assert.ok(pages[4].includes("⚠") && pages[4].includes("✅") && pages[4].includes("⬜"));
  // Cartes filtrees par fonctions
  assert.deepStrictEqual(ui.cartesVisibles(["sites", "apercu", "inconnue"]).map((x) => x.fonction), ["sites", "apercu"]);
  assert.ok(!ui.rendreCartes(["apercu"], "exemple.fr").includes("Créer"));
  assert.ok(ui.rendreCartes([], null).includes("Aucune fonction"));
  // Assistant : validation non enregistrable, controle du domaine, etats
  assert.ok(pages[5 + 10].includes("disabled"));
  assert.strictEqual(ui.etatEtapeAssistant(ui.ETAPES_ASSISTANT[1], { domaine: "pas un domaine" }), "attention");
  assert.strictEqual(ui.etatEtapeAssistant(ui.ETAPES_ASSISTANT[1], { domaine: "exemple.fr" }), "termine");
  assert.strictEqual(ui.etatEtapeAssistant(ui.ETAPES_ASSISTANT[0], { nom: "X" }), "encours");
  assert.strictEqual(ui.etatEtapeAssistant(ui.ETAPES_ASSISTANT[0], { description: "X" }), "attention");
  assert.strictEqual(ui.etatEtapeAssistant(ui.ETAPES_ASSISTANT[2], {}), "afaire");

  // --- Client -> site principal -> domaine principal -> alias ------------
  // Jamais deduit de l'ordre : plusieurs domaines sans designation => a preciser.
  let dom = perimetre.domainesDuSite({ domaines: ["b.fr", "a.fr"] });
  assert.strictEqual(dom.principal, null); assert.ok(dom.aPreciser);
  assert.deepStrictEqual(perimetre.domainesDuSite({ domaines: ["a.fr", "b.fr"] }).principal, null);
  dom = perimetre.domainesDuSite({ domaines: ["b.fr", "a.fr", "c.fr"], domainePrincipal: "c.fr" });
  assert.strictEqual(dom.principal, "c.fr"); assert.deepStrictEqual(dom.alias, ["a.fr", "b.fr"]); assert.ok(!dom.aPreciser);
  assert.strictEqual(perimetre.domainesDuSite({ domaines: ["WWW.Seul.fr"] }).principal, "seul.fr");
  assert.strictEqual(perimetre.domaineAcces({ domaines: ["b.fr", "a.fr"] }, "b.fr"), "b.fr");
  assert.strictEqual(perimetre.sitePrincipal({ siteIds: ["4", "9"] }), null);
  assert.strictEqual(perimetre.sitePrincipal({ siteIds: ["9", "4"], explicite: "9" }), "9");
  assert.strictEqual(perimetre.sitePrincipal({ siteIds: ["4"], explicite: "99" }), "4");
  assert.strictEqual(perimetre.sitePrincipal({ siteIds: ["4", "9"], explicite: "99" }), null);
  d = calculerDroits({ ...base, identite: { fournisseur: "entra", sujet: "s", email: "admin@ex.fr" }, utilisateurs: [u("1", "admin@ex.fr", "1")] });
  assert.strictEqual(d.sitePrincipalId, null, "plusieurs sites sans designation");
  d = calculerDroits({ ...base, clients: [{ id: "2", sitePrincipalId: "11" }], identite: { fournisseur: "entra", sujet: "s", email: "admin@ex.fr" }, utilisateurs: [u("1", "admin@ex.fr", "1")] });
  assert.strictEqual(d.sitePrincipalId, "11");
  const vMulti = vueSite({ siteComplet: null, info: { titre: "M", domaines: ["b.fr", "a.fr"] }, statut: null });
  assert.strictEqual(vMulti.domaine, null);
  assert.strictEqual(vMulti.etapes.find((x) => x.cle === "domaine").etat, "attention");
  assert.ok(ui.rendreVueSite(moi, vMulti, null).includes("Domaine principal à préciser"));
  const rMulti = resumeSite({ titre: "M", domaines: ["b.fr", "a.fr"], domainePrincipal: "b.fr" }, null);
  assert.strictEqual(rMulti.domaine, "b.fr"); assert.deepStrictEqual(rMulti.alias, ["a.fr"]);

  console.log("Tests cockpit OK");
})().catch((e) => { console.error(e); process.exit(1); });
