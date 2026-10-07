"use strict";
/*
 * Ouverture d'un site : etats explicites LOADING / READY / FORBIDDEN / ERROR.
 * Un delai, une erreur reseau ou un 503 ne doivent jamais afficher le refus d'acces.
 */
const assert = require("assert");

const REFUS = "Ce site n'est pas disponible dans votre espace.";
const memoire = new Map();
global.window = { location: { origin: "https://dseco.fr" } };
global.location = { hostname: "dseco.fr", hash: "#/cockpit/site/demainsite.fr", origin: "https://dseco.fr" };
global.sessionStorage = { getItem: (k) => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, String(v)), removeItem: (k) => memoire.delete(k) };
global.document = { body: { classList: { remove() {}, add() {}, contains: () => false } }, querySelector: () => null, querySelectorAll: () => [] };

const moi = { succes: true, donnees: { connecte: true, reconnu: true, nom: "Pilote", fonctions: ["sites"], niveau: "lecture", menu: [], nombreSites: 1, sitesPublics: [], clients: [], fournisseurs: [] } };
const reponse = (status, corps) => ({ ok: status >= 200 && status < 300, status, json: async () => corps });

function simuler(site) {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/moi")) return reponse(200, moi);
    if (u.includes("/cockpit/site")) return site();
    throw new Error(`appel inattendu ${u}`);
  };
}

(async () => {
  const pages = await import("../../pages/cockpit.js");
  const router = await import("../../js/router.js");

  assert.deepStrictEqual(pages.etatOuverture({ erreur: { status: 403, message: "x" } }).etat, "FORBIDDEN");
  assert.deepStrictEqual(pages.etatOuverture({ erreur: { status: 401 } }).etat, "FORBIDDEN");
  for (const status of [0, 500, 503, 504, undefined]) assert.strictEqual(pages.etatOuverture({ erreur: { status } }).etat, "ERROR");
  assert.strictEqual(pages.etatOuverture({ site: null }).etat, "ERROR");
  assert.strictEqual(pages.etatOuverture(undefined).etat, "ERROR");
  assert.strictEqual(pages.etatOuverture({ site: { nom: "A" } }).etat, "READY");

  const chargement = pages.rendreOuverture("DemainSite <b>");
  assert.ok(chargement.includes("Ouverture de DemainSite &lt;b&gt;…"));
  assert.ok(chargement.includes("Vérification de vos droits et chargement du cockpit."));
  assert.ok(chargement.includes('aria-busy="true"') && chargement.includes('role="status"'));
  assert.ok(!chargement.includes(REFUS));

  // Delai depasse, reseau coupe, service indisponible : incident, jamais refus.
  for (const panne of [
    () => { const e = new Error("abort"); e.name = "AbortError"; throw e; },
    () => { throw new TypeError("Failed to fetch"); },
    () => reponse(503, { succes: false, erreur: { message: "Le service est momentanément indisponible." } })
  ]) {
    simuler(panne);
    const html = await pages.cockpitSitePage({ domaine: "demainsite.fr" });
    assert.ok(!html.includes(REFUS), "faux refus affiche pendant un incident");
    assert.ok(html.includes("n'a pas pu être chargé") && html.includes("data-reessayer-site"));
  }

  // Refus definitif du serveur : seul cas affichant le refus.
  simuler(() => reponse(403, { succes: false, erreur: { message: REFUS } }));
  assert.ok((await pages.cockpitSitePage({ domaine: "autre.example" })).includes(REFUS));


  // Etat global : 401/403 = FORBIDDEN, tout autre echec = ERROR ; une navigation ancienne ne termine jamais la plus recente.
  const ch = await import("../../js/chargement.js");
  assert.strictEqual(ch.classerErreur({ status: 403 }), "FORBIDDEN");
  assert.strictEqual(ch.classerErreur({ status: 401 }), "FORBIDDEN");
  for (const status of [0, 500, 503, 504, undefined]) assert.strictEqual(ch.classerErreur({ status }), "ERROR");
  ch.commencerNavigation("Chargement de En-tête pour DemainSite", 1);
  ch.commencerNavigation("Chargement de Pages pour DemainSite", 2);
  assert.strictEqual(ch.terminerNavigation(1, "READY"), false);
  assert.strictEqual(ch.etatChargement(), "LOADING");
  assert.strictEqual(ch.terminerNavigation(2, "READY"), true);
  assert.strictEqual(ch.etatChargement(), "READY");
  const attente = ch.rendreChargement("Chargement de En-tête pour DemainSite");
  assert.ok(attente.includes("DemainSite Écosystème travaille") && attente.includes("Chargement de En-tête pour DemainSite"));
  assert.ok(attente.includes(`data-dse-etat="LOADING"`) && !["FORBIDDEN", "ERROR"].includes(ch.etatPage(attente)));
  assert.ok(!/indisponible|pas disponible/.test(attente));
  assert.strictEqual(ch.etatPage(pages.echecChargement()), "ERROR");
  assert.strictEqual(ch.etatPage(pages.echec({ status: 403, message: REFUS })), "FORBIDDEN");
  assert.strictEqual(ch.etatPage(pages.echec({ status: 503 })), "ERROR");
  assert.ok(!pages.echec({ status: 503 }).includes(REFUS) && !pages.echec({ status: 503 }).includes("momentanément indisponible"));

  // Construire : un 503 ou un delai donne ERROR (jamais FORBIDDEN), le site selectionne est conserve.
  const { getState, setState } = await import("../../js/state.js");
  const siteDemo = { acces: "demainsite.fr", domaine: "demainsite.fr", nom: "DemainSite", fonctions: ["pages", "entete", "footer"] };
  for (const panne of [
    () => reponse(503, { succes: false, erreur: { message: "Le service est momentanément indisponible." } }),
    () => { const e = new Error("abort"); e.name = "AbortError"; throw e; }
  ]) {
    setState({ selectedSite: siteDemo });
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes("/moi")) return reponse(200, moi);
      if (u.includes("/construire")) return panne();
      if (u.includes("/cockpit/site")) return panne();
      throw new Error(`appel inattendu ${u}`);
    };
    const page = await pages.cockpitConstruirePage({ domaine: "demainsite.fr", onglet: "entetes" });
    assert.strictEqual(ch.etatPage(page.html), "ERROR");
    assert.ok(!page.html.includes(REFUS) && !page.html.includes("momentanément indisponible"));
    assert.strictEqual(getState().selectedSite?.nom, "DemainSite", "contexte du site perdu pendant un incident");
  }
  // /moi temporairement en echec apres un contexte etabli : utilisateur et menu conserves.
  setState({ user: { authenticated: true, reconnu: true, displayName: "Pilote", fonctions: ["sites"], menu: [{ url: "/cockpit/galerie", libelle: "Galerie" }] } });
  global.fetch = async (url) => (String(url).includes("/moi") ? reponse(503, { succes: false, erreur: { message: "Le service est momentanément indisponible." } }) : reponse(200, { succes: true, donnees: { sites: [] } }));
  await pages.cockpitSitesPage({});
  assert.strictEqual(getState().user.menu.length, 1, "menu perdu apres un /moi en echec temporaire");

  // Preparation immediate du contexte visuel avant la reponse du serveur.
  setState({ selectedSite: null });
  memoire.set("dseOuverture:demainsite.fr", "DemainSite");
  pages.preparerContexteSite("demainsite.fr");
  assert.deepStrictEqual([getState().selectedSite.nom, getState().selectedSite.provisoire], ["DemainSite", true]);

  // Menu du site selectionne : groupes, Construire le site parent, element actif exact.
  const nav = await import("../../modules/cockpit/navigation-site.js");
  const items = nav.navigationSite(siteDemo, "lecture");
  assert.ok(items.filter((x) => x.enfant).map((x) => x.libelle).join() === "Pages,En-tête,Footer,Catalogue / Modèles");
  const { actif, parent } = nav.elementActif(items, "/cockpit/site/demainsite.fr/construire?onglet=entetes");
  assert.strictEqual(actif.libelle, "En-tête");
  assert.ok(/\/construire$/.test(parent.url));
  assert.strictEqual(nav.elementActif(items, "/cockpit/site/demainsite.fr/construire").actif.libelle, "En-tête");
  assert.strictEqual(nav.elementActif(items, "/cockpit/site/demainsite.fr").actif.libelle, "Vue d'ensemble");
  const { renderSidebar } = await import("../../components/sidebar.js");
  for (const s of [siteDemo, { ...siteDemo, provisoire: true }]) {
    setState({ selectedSite: s, user: { authenticated: true, reconnu: true, fonctions: ["sites"], menu: [
      { url: "/cockpit", libelle: "Cockpit" }, { url: "/cockpit/sites", libelle: "Mes sites" }, { url: "/cockpit/galerie", libelle: "Galerie" }, { url: "/cockpit/compte", libelle: "Mon compte" }] } });
    global.location.hash = "#/cockpit/site/demainsite.fr/construire?onglet=entetes";
    const html = renderSidebar();
    for (const t of ["Administration générale", "Cockpit général", "Site sélectionné", "DemainSite", "demainsite.fr", "Construire le site", "Galerie", "Mon compte", "Changer de site"]) assert.ok(html.includes(t), `menu sans ${t}`);
    assert.ok(html.includes('class="cockpit-nav-groupe cockpit-nav-administration"') &&
      html.includes('class="cockpit-nav-groupe cockpit-nav-site"'), "menu sans groupes visuels distincts");
    assert.ok(/class="nav-link active[^"]*"[^>]*aria-current="page"[^>]*href="#\/cockpit\/site\/demainsite\.fr\/construire\?onglet=entetes"/.test(html), "En-tête non actif");
    assert.ok(html.includes("is-parent-actif"));
  }

  // Jeton de navigation : chaque resolution invalide la precedente.
  router.registerRoute("/x", async () => {});
  global.location.hash = "#/x";
  const avant = router.navigationCourante();
  await router.resolveRoute();
  await router.resolveRoute();
  assert.strictEqual(router.navigationCourante(), avant + 2);

  console.log("Tests ouverture de site : OK");
})().catch((e) => { console.error(e); process.exit(1); });
