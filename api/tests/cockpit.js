"use strict";
// Tests du cockpit DSE : droits cote serveur, session, identite, vue et rendu (sans reseau).
process.env.DSE_SESSION_SECRET = "x".repeat(40);
const assert = require("assert");
const path = require("path");
const url = (f) => require("url").pathToFileURL(path.join(__dirname, "..", "..", f)).href;
const { calculerDroits } = require("../auth/droits");
const session = require("../auth/session");
const entra = require("../auth/fournisseurs/entra");
const { vueSite, resumeSite, filtrerSites } = require("../shared/cockpit");
const politique = require("../config/politique-roles.json");
const perimetre = require("../shared/perimetre");

const TERMES_TECHNIQUES = /OBJ-|Lookup|listeId|"liste"|Graph|GitHub|SharePoint|sharepoint\.com|\bAPI\b/;

(async () => {
  // --- Droits -------------------------------------------------------------
  const sites = [{ id: "4", clientId: "2" }, { id: "9", clientId: "3" }, { id: "11", clientId: null }];
  const u = (id, titre, roleId, extra = {}) => ({ id, titre, roleId, roleTitre: `Rôle ${roleId}`, clientId: "2", actif: true, valide: true, ...extra });
  const base = { sites, politique, clients: [{ id: "2", entraObjectId: "oid-pascal", entraEmail: "pascal@ex.fr" }, { id: "3" }],
    liens: [{ utilisateurId: "2", clientId: "2", siteId: "4", actif: true, valide: true }] };

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
  const liens = [{ utilisateurId: "5", clientId: "3", siteId: "9", actif: true, valide: true }, { utilisateurId: "5", clientId: "3", siteId: "11", actif: true, valide: false }];
  d = calculerDroits({ ...base, liens, identite: { fournisseur: "entra", sujet: "s", email: "c@ex.fr" }, utilisateurs: [u("5", "c@ex.fr", "5", { clientId: "3" })] });
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
  assert.deepStrictEqual(Object.keys(resumeSite(info, actif)).sort(), ["acces", "alias", "client", "domaine", "domaineAPreciser", "nom", "statut"]);
  // Resume avec contenus : meme moteur que la fiche site (progression et etapes identiques)
  const rProg = resumeSite(info, actif, siteComplet);
  const vProg = vueSite({ siteComplet, info, statut: actif });
  assert.strictEqual(rProg.progression, vProg.progression);
  assert.deepStrictEqual(rProg.aCompleter.map((x) => x.cle), vProg.etapes.filter((x) => x.etat !== "termine").map((x) => x.cle));

  // --- Rendu frontend -----------------------------------------------------
  const ui = await import(url("modules/cockpit/cockpit.js"));
  assert.strictEqual(ui.ETAPES_ASSISTANT.length, 12);
  assert.deepStrictEqual(ui.ETAPES_ASSISTANT.map((x) => x.libelle), ["Informations", "Domaine", "Identité visuelle", "En-tête", "Menu", "Pages", "Contenus / médias", "Footer", "SEO", "Aperçu", "Validation", "Progression"]);
  const moi = { nom: "Pascal <b>", role: { titre: "Profil test" }, fonctions: toutes, nombreSites: 1 };
  vue = vueSite({ siteComplet, info, statut: actif, fonctions: toutes });
  const pages = [
    ui.rendreConnexion({ fournisseurs: [{ id: "entra", libelle: "Compte Microsoft", disponible: true }, { id: "externe", libelle: "Accès sans compte Microsoft", disponible: false }] }),
    ui.rendreSansAcces(moi), ui.rendreAccueil({ moi, vueCourante: vue }),
    ui.rendreListeSites(moi, filtrerSites([resumeSite(info, actif, siteComplet), { ...resumeSite(info, null), nom: "Autre <b>", client: "Client <b>" }], { statut: "Actif" })),
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
  assert.deepStrictEqual(vue.statistiques.pages, { total: 1, publiees: 1 });
  assert.ok(pages[4].includes("Que dois-je faire maintenant ?") && pages[4].includes("Situation du site"));
  assert.ok(pages[4].includes('href="https://exemple.fr/"') && pages[4].includes('target="_blank"'));
  assert.ok(pages[4].includes("data-ouvrir-progression") && pages[4].includes("1 active(s) et validée(s)"));
  const restreinte = vueSite({ siteComplet, info, statut: actif, fonctions: ["sites"] });
  assert.deepStrictEqual(restreinte.statistiques, {}, "aucune statistique de pages sans droit");
  const htmlRestreint = ui.rendreVueSite({ fonctions: ["sites"], niveau: "lecture" }, restreinte);
  assert.ok(!htmlRestreint.includes("/construire") && !htmlRestreint.includes("/modifier/"));
  assert.ok(!htmlRestreint.includes("Voir le site public"), "apercu reserve au droit correspondant");
  const navSite = await import(url("modules/cockpit/navigation-site.js"));
  const navigationLecture = navSite.navigationSite({ acces: "alias.example.test", fonctions: ["sites", "seo", "pages"] }, "lecture");
  assert.ok(navigationLecture.every((x) => x.url.startsWith("/cockpit/site/alias.example.test")));
  assert.ok(navigationLecture.some((x) => x.url.endsWith("?onglet=pages")));
  assert.ok(!navigationLecture.some((x) => x.url.includes("/modifier/")), "aucune edition dans le menu lecteur");
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

  // --- Mes sites : sites principaux, alias, filtres, pagination ----------
  // Donnees modelisees sur OBJ-SITE-PUBLIC (IDs natifs) : fiches alias rattachees par DOMAINE-PRINCIPAL.
  const fiches = [
    { id: "1", titre: "DemainSite", domaines: ["demainsite.com", "demainsite.fr"], domaineIds: ["2", "1"], domainePrincipal: "demainsite.fr", domainePrincipalId: "1", statutId: "1", client: "C1" },
    { id: "3", titre: "Blogs-Site", domaines: ["blogs-site.fr"], domaineIds: ["10"], domainePrincipal: "blogs-site.fr", domainePrincipalId: "10", statutId: "1", client: "C1" },
    { id: "5", titre: "blogs-site.com", domaines: ["blogs-site.com"], domaineIds: ["12"], domainePrincipal: "blogs-site.fr", domainePrincipalId: "10", client: "C1" },
    { id: "6", titre: "blogs-site.pro", domaines: ["blogs-site.pro"], domaineIds: ["11"], domainePrincipal: "blogs-site.fr", domainePrincipalId: "10", client: "C1" },
    { id: "8", titre: "carottagexpert.fr", domaines: ["carottagexpert.fr"], domaineIds: ["7"], domainePrincipal: "carottagexpert.fr", domainePrincipalId: "7", statutId: "1", client: "C2" },
    { id: "7", titre: "carottagexpert.com", domaines: ["carottagexpert.com"], domaineIds: ["8"], domainePrincipal: "carottagexpert.fr", domainePrincipalId: "7", client: "C2" },
    { id: "20", titre: "Orphelin", domaines: ["orphelin.fr"], domaineIds: ["30"], domainePrincipal: "inconnu.fr", domainePrincipalId: "99" },
    { id: "21", titre: "Cycle A", domaines: ["a.fr"], domaineIds: ["41"], domainePrincipalId: "42" },
    { id: "22", titre: "Cycle B", domaines: ["b.fr"], domaineIds: ["42"], domainePrincipalId: "41" }
  ];
  const groupes = perimetre.regrouperSites(fiches);
  const parTitre = Object.fromEntries(groupes.map((g) => [g.titre, g]));
  assert.ok(!parTitre["blogs-site.com"] && !parTitre["blogs-site.pro"] && !parTitre["carottagexpert.com"], "alias non comptes comme sites");
  assert.deepStrictEqual(parTitre["Blogs-Site"].fiches, ["3", "5", "6"]);
  const domBlogs = perimetre.domainesDuSite(parTitre["Blogs-Site"]);
  assert.strictEqual(domBlogs.principal, "blogs-site.fr"); assert.deepStrictEqual(domBlogs.alias, ["blogs-site.com", "blogs-site.pro"]);
  assert.strictEqual(perimetre.domainesDuSite(parTitre.DemainSite).principal, "demainsite.fr");
  assert.ok(parTitre.Orphelin && parTitre["Cycle A"] && parTitre["Cycle B"], "rattachement absent ou cycle : aucune supposition");
  assert.strictEqual(perimetre.groupeParDomaine(groupes, "blogs-site.pro").titre, "Blogs-Site", "un alias ouvre son site principal");
  assert.strictEqual(perimetre.groupeParDomaine(groupes, "www.carottagexpert.com").id, "8");
  assert.strictEqual(perimetre.groupeParDomaine(groupes, "absent.fr"), null);

  const statutsTest = { 1: { titre: "Construction", code: "CONSTRUCTION" }, 2: { titre: "Actif", code: "ACTIF" } };
  const nombreux = Array.from({ length: 230 }, (_, i) => resumeSite(
    { titre: `Site ${String(i).padStart(3, "0")}`, domaines: [`site${i}.fr`], domainePrincipal: `site${i}.fr`, client: i % 2 ? "Client B" : "Client A" },
    i % 10 === 0 ? statutsTest[2] : (i % 7 === 0 ? null : statutsTest[1]),
    i % 3 ? null : siteComplet));
  let r = filtrerSites(nombreux, {});
  assert.strictEqual(r.total, 230); assert.strictEqual(r.elements.length, 25); assert.strictEqual(r.pages, 10);
  assert.deepStrictEqual(r.options.statuts, ["Actif", "Construction", "Non renseigné"], "statuts issus des donnees");
  assert.strictEqual(r.compteurs.reduce((n, c) => n + c.nombre, 0), 230);
  r = filtrerSites(nombreux, { page: "10" }); assert.strictEqual(r.elements.length, 5); assert.strictEqual(r.elements[4].nom, "Site 229");
  assert.strictEqual(filtrerSites(nombreux, { page: "999" }).page, 10);
  assert.strictEqual(filtrerSites(nombreux, { parPage: "5000" }).parPage, 100);
  r = filtrerSites(nombreux, { statut: "Actif" }); assert.strictEqual(r.total, 23); assert.ok(r.elements.every((s) => s.statut.titre === "Actif"));
  assert.strictEqual(filtrerSites(nombreux, { statut: "Statut futur" }).total, 0);
  assert.strictEqual(filtrerSites(nombreux, { q: "SITE12" }).total, 11, "recherche insensible a la casse");
  assert.strictEqual(filtrerSites(nombreux, { client: "Client A" }).total, 115);
  assert.ok(filtrerSites(nombreux, { aCompleter: "tout" }).elements.every((s) => s.aCompleter.length));
  const plagesConfigurees = [{ valeur: "plage-native", libelle: "Libellé administré", min: 11, max: 44 }];
  const parProgression = filtrerSites(nombreux, { progression: "plage-native" }, plagesConfigurees);
  assert.ok(parProgression.total > 0);
  assert.ok(parProgression.elements.every((s) => s.progression >= 11 && s.progression <= 44));
  assert.deepStrictEqual(parProgression.options.progressions, [{ valeur: "plage-native", libelle: "Libellé administré" }]);
  assert.deepStrictEqual(filtrerSites(nombreux).options.progressions, [], "aucun seuil de progression par défaut");
  r = filtrerSites(nombreux, { tri: "nom", sens: "desc" }); assert.strictEqual(r.elements[0].nom, "Site 229");
  const alias = filtrerSites([resumeSite(parTitre["Blogs-Site"], statutsTest[1])], { q: "blogs-site.pro" });
  assert.strictEqual(alias.total, 1, "recherche par alias"); assert.strictEqual(alias.elements[0].domaine, "blogs-site.fr");
  const htmlListe = ui.rendreListeSites(moi, filtrerSites(nombreux, { page: "2", statut: "Construction" }));
  assert.ok(htmlListe.includes("Page 2 sur") && htmlListe.includes("Précédent") && htmlListe.includes("data-filtres-sites"));
  assert.ok(!TERMES_TECHNIQUES.test(htmlListe), "aucun terme technique dans Mes sites");
  assert.strictEqual(ui.lienSites({ q: "a b", statut: "Actif" }, { page: 3 }), "#/cockpit/sites?q=a+b&statut=Actif&page=3");
  const cinqCents = Array.from({ length: 500 }, (_, i) => resumeSite(
    { titre: `Site ${String(i).padStart(3, "0")}`, domaines: [`s${i}.example.test`], client: i % 2 ? "B" : "A" },
    { titre: i % 2 ? "Statut nouveau" : "Actif" }));
  const dernierePage = filtrerSites(cinqCents, { page: "20" });
  assert.strictEqual(dernierePage.total, 500);
  assert.strictEqual(dernierePage.pages, 20);
  assert.strictEqual(dernierePage.elements.length, 25);
  assert.strictEqual(dernierePage.elements[24].nom, "Site 499");
  assert.strictEqual(filtrerSites(cinqCents, { statut: "Statut nouveau", client: "B", parPage: "100" }).total, 250);
  const syntheseSites = [{ progression: 20, aCompleter: [{ cle: "pages" }] }, { progression: 80, aCompleter: [] }];
  assert.deepStrictEqual(filtrerSites(syntheseSites).synthese, { progressionMoyenne: 50, aCompleter: 1, progressionConnue: 2 });
  assert.strictEqual(filtrerSites(syntheseSites, { page: 2, parPage: 1 }).synthese.progressionMoyenne, 50, "moyenne globale independante de la pagination");
  assert.strictEqual(filtrerSites([...syntheseSites, {}]).synthese.progressionMoyenne, null, "pas de moyenne partielle trompeuse");
  assert.strictEqual(filtrerSites([]).synthese.progressionMoyenne, null, "aucune progression inventee pour une liste vide");
  assert.ok(htmlListe.includes('data-vue-sites="cartes"') && htmlListe.includes('data-vue-sites="lignes"'));
  assert.ok(htmlListe.includes("Situation générale") && htmlListe.includes("Actions rapides"));
  assert.ok(!ui.rendreListeSites({ fonctions: [] }, r).includes('href="#/cockpit/creer"'), "creation masquee sans droit");
  const header = await import(url("components/header.js"));
  const profil = header.renderHeader({ succes: true }, { authenticated: true, reconnu: true, displayName: "Nom <b>", role: { titre: "Role <b>" }, fonctions: ["sites"] });
  assert.ok(profil.includes("data-recherche-cockpit") && profil.includes("/api/v1/auth/deconnexion"));
  assert.ok(!profil.includes("<b>"), "profil echappe");
  assert.ok(!header.renderHeader({ succes: true }, { fonctions: [] }).includes("data-recherche-cockpit"), "recherche reservee aux sites autorises");

  const sidebar = await import(url("components/sidebar.js"));
  const publicUser = { authenticated: true, reconnu: true, sitesPublics: [
    { nom: "Premier", domainePrincipal: "principal.example.test", domaines: ["principal.example.test", "alias.example.test"] },
    { nom: "Second", domainePrincipal: "second.example.test", domaines: ["second.example.test"] }
  ] };
  let lien = sidebar.rendreVoirSite(publicUser, "/cockpit/site/alias.example.test");
  assert.ok(lien.includes('href="https://principal.example.test/"'), "alias selectionne -> domaine principal");
  assert.ok(lien.includes('target="_blank"') && lien.includes('rel="noopener noreferrer"'));
  assert.ok(!lien.includes("href=\"#") && !lien.includes("/cockpit") && !lien.includes("?"), "URL publique sans administration");
  assert.ok(!lien.includes("second.example.test"), "la selection est respectee meme avec plusieurs sites");
  assert.ok(sidebar.rendreVoirSite(publicUser, "/cockpit/site/second.example.test/modifier/seo").includes('href="https://second.example.test/"'));
  lien = sidebar.rendreVoirSite(publicUser, "/cockpit/sites");
  assert.ok(lien.includes("<details") && lien.includes("principal.example.test") && lien.includes("second.example.test"));
  assert.ok(sidebar.rendreVoirSite({ ...publicUser, sitesPublics: [publicUser.sitesPublics[0]] }, "/cockpit").includes('href="https://principal.example.test/"'));
  assert.ok(!sidebar.rendreVoirSite(publicUser, "/cockpit/site/interdit.example.test").includes("href="), "site hors perimetre sans repli");
  assert.ok(!sidebar.rendreVoirSite(publicUser, "/cockpit/site/%ZZ").includes("href="));
  assert.ok(!sidebar.rendreVoirSite({ ...publicUser, sitesPublics: [{ nom: "Incomplet", domainePrincipal: null, domaines: ["alias.example.test"] }] },
    "/cockpit/site/alias.example.test").includes("href="), "pas de domaine principal invente");
  assert.ok(!sidebar.rendreVoirSite({ ...publicUser, sitesPublics: [{ nom: "Invalide", domainePrincipal: "evil.test/admin", domaines: [] }] }, "/cockpit").includes("href="));
  assert.strictEqual(sidebar.rendreVoirSite({ ...publicUser, authenticated: false }, "/cockpit"), "");
  assert.strictEqual(sidebar.rendreVoirSite(publicUser, "/"), "");
  const state = await import(url("js/state.js"));
  const ancienLocation = global.location;
  global.location = { hash: "#/cockpit/site/alias.example.test" };
  state.setState({ user: publicUser });
  const navigation = sidebar.renderSidebar();
  assert.ok(navigation.indexOf("Voir le site") < navigation.indexOf('href="#/cockpit"'), "sortie publique avant Cockpit");
  state.setState({ selectedSite: { nom: "Site choisi <b>", acces: "alias.example.test", domaine: "principal.example.test", fonctions: ["pages", "seo"] } });
  const navigationLocale = sidebar.renderSidebar();
  assert.ok(navigationLocale.includes("Site sélectionné") && navigationLocale.includes("Vue d&#039;ensemble"));
  assert.ok(navigationLocale.includes("/cockpit/site/alias.example.test/construire?onglet=pages"));
  assert.ok(!navigationLocale.includes("<b>"), "nom du site echappe");
  global.location = { hash: "#/cockpit/site/second.example.test" };
  assert.ok(!sidebar.renderSidebar().includes("Site choisi"), "jamais de contexte du site precedent");
  state.setState({ selectedSite: null });
  state.setState({ user: null });
  global.location = ancienLocation;

  // --- Ecriture, droits d'administration, refus hors perimetre ---------------
  const droitsMod = require("../auth/droits");
  const admin = require("../shared/administration");
  const ecriture = require("../shared/ecriture");
  const { origineValide } = require("../dseCockpit")._test;

  // peutAttribuer : jamais au-dessus de soi
  const dSuper = calculerDroits({ ...base, identite: { fournisseur: "entra", sujet: "s", email: "super@ex.fr" }, utilisateurs: [u("1", "super@ex.fr", "1")] });
  const dClient = calculerDroits({ ...base, liens: [{ utilisateurId: "5", clientId: "2", siteId: "4", actif: true, valide: true }],
    identite: { fournisseur: "entra", sujet: "c", email: "admin@client.fr" }, utilisateurs: [u("5", "admin@client.fr", "3")] });
  assert.strictEqual(dSuper.portee, "tous"); assert.strictEqual(dSuper.niveau, "administration");
  assert.strictEqual(dClient.portee, "client"); assert.deepStrictEqual(dClient.clientIds, ["2"]); assert.deepStrictEqual(dClient.siteIds, ["4"]);
  assert.ok(droitsMod.peutAttribuer(dSuper, "1", politique));
  assert.ok(!droitsMod.peutAttribuer(dClient, "1", politique), "admin client ne peut pas attribuer Super admin");
  assert.ok(!droitsMod.peutAttribuer(dClient, "2", politique));
  assert.ok(droitsMod.peutAttribuer(dClient, "4", politique) && droitsMod.peutAttribuer(dClient, "6", politique));

  // Menu par role
  const dLecteur = calculerDroits({ ...base, identite: { fournisseur: "entra", sujet: "l", email: "l@ex.fr" }, utilisateurs: [u("7", "l@ex.fr", "6")], liens: [{ utilisateurId: "7", siteId: "4", actif: true, valide: true }] });
  const urls = async (d) => (await admin.menu(d)).map((m) => m.url);
  const origApps = admin.applications;
  assert.ok((await urls(dSuper)).includes("/cockpit/administration") && (await urls(dSuper)).includes("/cockpit/utilisateurs"));
  assert.ok(!(await urls(dLecteur)).includes("/cockpit/utilisateurs") && !(await urls(dLecteur)).includes("/cockpit/creer"));
  assert.deepStrictEqual(await urls({ reconnu: false, fonctions: [] }), ["/cockpit"]);

  // Donnees simulees : 2 clients, refus hors perimetre et elevation
  const donneesSim = {
    politique, clients: base.clients, sites,
    utilisateurs: [u("1", "super@ex.fr", "1"), u("5", "admin@client.fr", "3"), u("6", "redac@client.fr", "4"), u("8", "autre@client3.fr", "4", { clientId: "3" })],
    liens: [{ id: "1", utilisateurId: "6", clientId: "2", siteId: "4", actif: true, valide: true }, { id: "2", utilisateurId: "8", clientId: "3", siteId: "9", actif: true, valide: true }],
    roles: ["1", "2", "3", "4", "5", "6"].map((id) => ({ id, titre: `Rôle ${id}`, actif: true, valide: true })),
    structure: { listes: { utilisateur: "LU", lien: "LL", actif: "LA", valide: "LV" }, colonnes: { utilisateurRole: "ROLE", lienUtilisateur: "U", lienSite: "S", lienClient: "K", lienActif: "A", lienValide: "V" } }
  };
  const origDonnees = droitsMod.donneesDroits, origIndex = droitsMod.sitesIndex;
  droitsMod.donneesDroits = async () => donneesSim;
  droitsMod.sitesIndex = async () => ({ sites: new Map([["4", { id: "4", titre: "Site A", domaines: ["a.fr"], domainePrincipal: "a.fr", clientId: "2" }], ["9", { id: "9", titre: "Site B", domaines: ["b.fr"], domainePrincipal: "b.fr", clientId: "3" }]]), statuts: new Map() });
  try {
    const visibles = admin._test.utilisateursVisibles(dClient, donneesSim).map((x) => x.id).sort();
    assert.deepStrictEqual(visibles, ["5", "6"], "admin client : jamais un utilisateur d'un autre client");
    assert.strictEqual(admin._test.utilisateursVisibles(dSuper, donneesSim).length, 4);
    const R = admin._test.ref;
    let a = await admin.construireAction(dClient, "changer-role", { utilisateur: R("u", "6"), role: R("r", "1") }, null);
    assert.ok(a.refus, "elevation refusee");
    a = await admin.construireAction(dClient, "changer-role", { utilisateur: R("u", "8"), role: R("r", "5") }, null);
    assert.ok(a.refus, "utilisateur d'un autre client refuse");
    a = await admin.construireAction(dClient, "changer-role", { utilisateur: R("u", "5"), role: R("r", "4") }, null);
    assert.ok(a.refus, "pas de modification de son propre role");
    a = await admin.construireAction(dClient, "changer-role", { utilisateur: R("u", "6"), role: R("r", "5") }, null);
    assert.ok(a.op && a.op.champs.ROLELookupId === "5" && a.changements.length === 1);
    a = await admin.construireAction(dClient, "ajouter-acces-site", { utilisateur: R("u", "6"), domaine: "b.fr" }, null);
    assert.ok(a.refus, "site hors perimetre refuse");
    a = await admin.construireAction(dClient, "ajouter-acces-site", { utilisateur: R("u", "6"), domaine: "a.fr" }, null);
    assert.ok(a.aucunChangement, "relation active existante : succes idempotent sans nouvelle ecriture");
    a = await admin.construireAction(dClient, "creer-utilisateur", { email: "n@client.fr", role: R("r", "4") }, null);
    assert.ok(a.refus, "creation reservee a la portee tous");
    a = await admin.construireAction(dSuper, "creer-utilisateur", { email: "redac@client.fr", role: R("r", "4") }, null);
    assert.ok(a.refus, "anti-doublon e-mail");
    a = await admin.construireAction(dLecteur, "changer-role", { utilisateur: R("u", "6"), role: R("r", "6") }, null);
    assert.ok(a.refus, "lecteur refuse");
    a = await admin.construireAction(dSuper, "supprimer", {}, null);
    assert.ok(a.refus, "action inconnue refusee");
  } finally { droitsMod.donneesDroits = origDonnees; droitsMod.sitesIndex = origIndex; }
  assert.strictEqual(admin.applications, origApps);

  // Espaces clients : portee tous => tous les clients ayant des sites ; portee client => son client seul ; lecteur attribue => aucun.
  {
    const { clientsDuPerimetre } = require("../dseCockpit")._test;
    const groupes = [{ id: "4", clientId: "2", client: "Client A" }, { id: "10", clientId: "2", client: "Client A" }, { id: "9", clientId: "3", client: "Client B" }, { id: "11" }];
    const avecSites = (d) => ({ droits: { ...d, fonctions: [...new Set([...(d.fonctions || []), "sites"])] } });
    assert.deepStrictEqual(clientsDuPerimetre(avecSites(dSuper), groupes).map((c) => [c.id, c.nombreSites]), [["2", 2], ["3", 1]]);
    assert.deepStrictEqual(clientsDuPerimetre(avecSites(dClient), groupes.filter((g) => g.id !== "9")).map((c) => c.id), ["2"]);
    assert.deepStrictEqual(clientsDuPerimetre(avecSites(dClient), groupes).map((c) => c.id), ["2"], "jamais le client d'un autre");
    assert.deepStrictEqual(clientsDuPerimetre(avecSites(dLecteur), groupes), [], "portee sites attribues : pas d'espace client");
    const htmlClient = ui.rendreListeSites({ fonctions: ["sites"], clients: [{ id: "2" }] }, { ...filtrerSites([{ ...resumeSite(info, actif, siteComplet), clientCockpit: "2" }], {}), client: { id: "2", titre: "Client <A>", nombreSites: 1 } });
    assert.ok(htmlClient.includes("Espace client") && htmlClient.includes("Client &lt;A&gt;") && htmlClient.includes('data-base="/cockpit/client/2"'));
    assert.ok(!htmlClient.includes('<th>Client</th>') && !htmlClient.includes("Espaces clients"), "pas de colonne client dans l'espace client");
    const htmlTous = ui.rendreListeSites({ fonctions: ["sites"] }, { ...filtrerSites([{ ...resumeSite(info, actif, siteComplet), client: "A", clientCockpit: "2" }, { ...resumeSite(info, null), client: "B" }], {}), clientsCockpit: [{ id: "2", titre: "A", nombreSites: 1 }] });
    assert.ok(htmlTous.includes("Espaces clients") && htmlTous.includes('href="#/cockpit/client/2"'));
    assert.strictEqual(ui.lienSites({ statut: "Actif" }, {}, "/cockpit/client/2"), "#/cockpit/client/2?statut=Actif");
  }

  // Gestion transverse : inventaire borne au perimetre, rendu sans terme technique.
  {
    const inv = require("../shared/inventaire");
    const r = (nom, id, titre) => ({ [nom]: { id, titre } });
    const groupes = [{ id: "4", titre: "Site A", domaines: ["a.fr"], fiches: ["4", "40"], clientId: "2" }, { id: "9", titre: "Site B", domaines: ["b.fr"], fiches: ["9"], clientId: "3" }];
    const d = {
      medias: [
        { id: "m1", _fields: { Title: "Logo A" }, relations: { ...r("OBJ-SITE-PUBLIC", "40", "A") } },
        { id: "m2", _fields: { Title: "Logo client B" }, relations: { ...r("OBJ-CLIENT", "3", "B") } },
        { id: "m3", _fields: { Title: "Commun" }, relations: {} }
      ],
      pages: [{ id: "p1", _fields: { Title: "Accueil", URL: "/" }, relations: { "OBJ-SITE-PUBLIC": [{ id: "4" }, { id: "9" }], ...r("OBJ-ENTETE-SITE", "e1", "Haut") } }],
      entetes: [{ id: "e1", _fields: { Title: "Haut" }, relations: { ...r("OBJ-SITE-PUBLIC", "4", "A") } }, { id: "e2", _fields: { Title: "Autre" }, relations: { ...r("OBJ-SITE-PUBLIC", "77", "Z") } }],
      footers: []
    };
    const tous = inv.construire({ type: "medias", perimetre: { global: true, groupes }, donneesBuilder: d });
    assert.deepStrictEqual(tous.map((m) => m.titre).sort(), ["Commun", "Logo A", "Logo client B"], "administration globale : tous les medias");
    const clientA = inv.construire({ type: "medias", perimetre: { global: false, groupes: [groupes[0]] }, donneesBuilder: d });
    assert.deepStrictEqual(clientA.map((m) => m.titre), ["Logo A"], "jamais les medias d'un autre client ni les medias non rattaches");
    assert.strictEqual(clientA[0].sites[0].domaine, "a.fr", "alias rattache au bon site");
    const pages = inv.construire({ type: "pages", perimetre: { global: true, groupes }, donneesBuilder: d });
    assert.deepStrictEqual(pages[0].sites.map((x) => x.domaine), ["a.fr", "b.fr"], "page multi-sites");
    assert.strictEqual(pages[0].entete, "Haut");
    const pagesB = inv.construire({ type: "pages", perimetre: { global: false, groupes: [groupes[1]] }, donneesBuilder: d });
    assert.deepStrictEqual(pagesB[0].sites.map((x) => x.domaine), ["b.fr"], "seuls les sites du perimetre sont affiches");
    const entetes = inv.construire({ type: "entetes", perimetre: { global: true, groupes }, donneesBuilder: d });
    assert.deepStrictEqual(entetes.map((x) => [x.titre, x.pages]), [["Haut", 1]], "En-tete hors sites connus exclu");
    const articles = inv.construire({ type: "articles", perimetre: { global: false, groupes: [groupes[1]] }, indexCatalogue: { items: [
      { type: "article", titre: "Nouvelles", url: "/blog/n", plateformes: [{ id: "9" }], etat: { actif: true, valide: true, public: true } },
      { type: "article", titre: "Prive A", url: "/blog/p", plateformes: [{ id: "4" }], etat: { actif: true, valide: true, public: true } }
    ] } });
    assert.deepStrictEqual(articles.map((a) => a.titre), ["Nouvelles"]);

    const uc = await import(url("modules/cockpit/contenus.js"));
    const htmlC = uc.rendreContenus({ type: "medias", global: true, nombreSites: 2, onglets: [["medias", "Médias"], ["pages", "Pages"], ["entetes", "En-têtes"], ["footers", "Footer"], ["articles", "Articles"]].map(([cle, libelle]) => ({ cle, libelle })), compteurs: { medias: 3, pages: 1, entetes: 1, footers: 0, articles: 0 }, lignes: tous });
    assert.ok(!TERMES_TECHNIQUES.test(htmlC.replace(/\/api\/v1\/media\/[^"]+/g, "")), `terme technique visible : ${htmlC.match(TERMES_TECHNIQUES)?.[0]}`);
    assert.ok(htmlC.includes("#/cockpit/site/a.fr/medias") && htmlC.includes("En-têtes") && !/HERO/i.test(htmlC));
    const htmlP = uc.rendreContenus({ type: "pages", global: false, nombreSites: 2, onglets: [{ cle: "pages", libelle: "Pages" }], compteurs: { pages: 1 }, lignes: pages });
    assert.ok(htmlP.includes("https://a.fr/") && htmlP.includes("onglet=pages") && htmlP.includes("b.fr"));
    assert.strictEqual(uc.rendreRaccourcisContenus({ fonctions: ["pages"] }), "", "pas de raccourci sans la fonction sites");
    assert.ok(uc.rendreRaccourcisContenus({ fonctions: ["sites", "logo-medias"], porteeGlobale: true }).includes("type=medias"));

    const { contenus } = require("../dseCockpit");
    const reponse = () => { const o = { code: 200 }; o.status = (c) => { o.code = c; return o; }; o.json = (j) => { o.corps = j; return o; }; o.set = () => o; o.setHeader = () => o; return o; };
    const sansSession = reponse(); await contenus({ query: {}, cookies: {}, headers: {}, get: () => undefined }, sansSession);
    assert.strictEqual(sansSession.code, 401, "gestion globale refusee sans session");
  }

  // Validation serveur des valeurs
  const champs = ecriture.champsModifiables([
    { name: "Title", displayName: "Titre", text: { maxLength: 20 } },
    { name: "NoteCourte", displayName: "Note", text: { allowMultipleLines: true } },
    { name: "ID-SITE", text: {} }, { name: "Ro", readOnly: true, text: {} }, { name: "Riche", text: { allowMultipleLines: true, textType: "richText" } }
  ]);
  assert.deepStrictEqual(champs.map((c) => c.nom), ["Title", "NoteCourte"]);
  assert.ok(champs.every((c) => !c.cle.includes("Title") && !c.cle.includes("Note")), "cles opaques");
  const [cT, cN] = champs.map((c) => c.cle);
  assert.ok(ecriture.validerValeurs(champs, { [cT]: "x".repeat(21) }).erreurs.length);
  assert.ok(ecriture.validerValeurs(champs, { [cT]: "a\nb" }).erreurs.length);
  assert.ok(ecriture.validerValeurs(champs, { [cT]: "a\u0001" }).erreurs.length);
  assert.ok(ecriture.validerValeurs(champs, { inconnu: "a" }).erreurs.length);
  assert.ok(ecriture.validerValeurs(champs, { [cT]: 3 }).erreurs.length);
  const ok = ecriture.validerValeurs(champs, { [cT]: "  Bonjour ", [cN]: "l1\r\nl2" });
  assert.deepStrictEqual(ok, { erreurs: [], propres: { Title: "Bonjour", NoteCourte: "l1\nl2" } });

  // Jeton : falsifie, autre utilisateur, operation conservee cote serveur
  const idA = { fournisseur: "entra", sujet: "A" }, idB = { fournisseur: "entra", sujet: "B" };
  const { jeton: jetonE } = ecriture.emettreJeton(idA, { type: "modifier", listId: "L", itemId: "1" });
  assert.ok(!jetonE.includes("\"L\"") && !Buffer.from(jetonE.split(".")[0], "base64url").toString().includes("listId"));
  assert.ok(ecriture.lireJeton(idA, jetonE).op);
  assert.ok(ecriture.lireJeton(idB, jetonE).erreur, "jetonE d'un autre utilisateur refuse");
  assert.ok(ecriture.lireJeton(idA, jetonE.slice(0, -2) + "xx").erreur, "jetonE falsifie refuse");
  let refuse = await ecriture.executer({ identite: idA, jeton: jetonE, revalider: async () => ({ refus: "Accès non autorisé." }), acteur: "test" });
  assert.strictEqual(refuse.status, 403, "droits revalides a la confirmation");

  // Origine des POST
  const req = (origin, host) => ({ get: (h) => ({ origin, host }[h.toLowerCase()]) });
  assert.ok(origineValide(req("https://dseco.fr", "dseco.fr")));
  assert.ok(!origineValide(req("https://evil.fr", "dseco.fr")));
  assert.ok(!origineValide(req("http://dseco.fr", "dseco.fr")));
  assert.ok(!origineValide(req(undefined, "dseco.fr")));

  // Rendu : aucun terme technique, controles masques selon le niveau
  const htmlAdmin = ui.rendreAdministration(moi, { nombreSites: 2, sitesParStatut: [{ statut: "Actif", nombre: 2, lien: "/cockpit/sites?statut=Actif" }], problemes: [{ niveau: "critique", titre: "Domaine manquant", lien: "/cockpit/site/a.fr" }], prochaines: [], aCompleter: [], utilisateursParRole: [{ role: "Rédacteur", nombre: 1 }], applications: { disponible: true, liste: [], colonnesManquantes: ["icône"] }, ecrituresRecentes: { disponible: true, liste: [] }, journal: {} });
  assert.ok(!TERMES_TECHNIQUES.test(htmlAdmin) && htmlAdmin.includes("#/cockpit/site/a.fr"));
  const htmlEd = ui.rendreEdition(moi, { disponible: true, libelle: "En-tête", site: "Site A", domaine: "a.fr", champs: [{ cle: cT, libelle: "Titre", valeur: "<b>", max: 20 }] }, { composant: "entete" });
  assert.ok(htmlEd.includes("data-edition") && htmlEd.includes("&lt;b&gt;") && !TERMES_TECHNIQUES.test(htmlEd));
  assert.ok(ui.rendreApercu({ changements: [{ libelle: "Titre", avant: "a", apres: "b" }] }).includes("data-confirmer"));
  assert.deepStrictEqual(ui.editionsVisibles({ niveau: "lecture" }, ["entete", "seo"]), []);
  assert.strictEqual(ui.editionsVisibles({ niveau: "ecriture" }, ["entete"]).length, 1);

  console.log("Tests cockpit OK");
})().catch((e) => { console.error(e); process.exit(1); });
