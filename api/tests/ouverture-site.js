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

  // Jeton de navigation : chaque resolution invalide la precedente.
  router.registerRoute("/x", async () => {});
  global.location.hash = "#/x";
  const avant = router.navigationCourante();
  await router.resolveRoute();
  await router.resolveRoute();
  assert.strictEqual(router.navigationCourante(), avant + 2);

  console.log("Tests ouverture de site : OK");
})().catch((e) => { console.error(e); process.exit(1); });
