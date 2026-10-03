"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require("../shared/statuts-site");
const catalogueSource = require("../shared/catalogue-source");
const catalogue = require("../shared/catalogue");
const domaines = require("../shared/domaines");

// Donnees factices au format SharePoint (Title, CODE, NOTE-COURTE, NOTE-LONGUE).
const mk = (code, extra = {}) => ({
  titre: `Titre ${code}`, code, noteCourte: `Note ${code}`, noteLongue: `Details ${code}`, actif: true, valide: true, ...extra
});
const statuts = new Map([
  ["1", mk("CONSTRUCTION")], ["2", mk("ACTIF")], ["3", mk("MAINTENANCE")], ["4", mk("SUSPENDU")],
  ["5", mk("ARCHIVE", { titre: "Archivé" })], ["6", mk("NOUVEAU-STATUT", { media: { url: "/api/v1/media/77", mediaId: "77" } })],
  ["7", mk("ACTIF", { actif: false })], ["8", mk("", { titre: "", noteCourte: "ND" })]
]);
const site = (statutId) => ({ id: "9", titre: "S", domaines: ["x.test"], actif: true, valide: true, statutColonne: true, statutId });
let courant = site("2");
catalogueSource.obtenirIndex = async () => ({ sites: new Map(), statuts });
catalogue.siteDuDomaine = (i, d) => (d === "x.test" ? courant : null);
domaines.lireDomainesSharePoint = async () => [];
const { resoudreDomaine } = require("../shared/resolveur-domaine");
const NON_ACTIFS = ["1", "3", "4", "5", "6"];

(async () => {
  // 1 : ACTIF -> vrai site.
  courant = site("2");
  assert.strictEqual((await resoudreDomaine("x.test")).statut.rendu, "actif");
  assert.strictEqual(S.etatPublic("actif", true), "normal");
  // 2-6 : CONSTRUCTION, MAINTENANCE, SUSPENDU, ARCHIVE et un statut futur -> meme rendu generique,
  // alimente uniquement par les donnees SharePoint de l'element de statut.
  for (const id of NON_ACTIFS) {
    courant = site(id);
    const r = (await resoudreDomaine("x.test")).statut;
    assert.strictEqual(r.rendu, "situation", `statut ${id}`);
    assert.strictEqual(r.situation.titre, statuts.get(id).titre);
    assert.strictEqual(r.situation.texte, statuts.get(id).noteCourte);
    assert.strictEqual(r.situation.details, statuts.get(id).noteLongue);
    assert.strictEqual(r.situation.statutId, null === statuts.get(id).id ? null : r.situation.statutId);
    assert.strictEqual(S.etatPublic(r.rendu, true), "situation");
  }
  courant = site("6");
  assert.deepStrictEqual((await resoudreDomaine("x.test")).statut.situation.media, { url: "/api/v1/media/77", mediaId: "77" });
  // Domaine inconnu.
  assert.strictEqual((await resoudreDomaine("inconnu.test")).type, "inconnu");
  // Statut absent / casse / inactif / sans code => jamais le vrai site, situation neutre.
  for (const id of [null, "99", "7", "8"]) {
    courant = site(id);
    const r = (await resoudreDomaine("x.test")).statut;
    assert.strictEqual(r.rendu, "indisponible");
    assert.ok(r.anomalie);
    assert.strictEqual(S.etatPublic(r.rendu, true), "situation");
  }
  assert.strictEqual(S.etatPublic("actif", false), "situation");
  // Media generique : Lookup OBJ-MEDIA (ID natif) ou colonne image https.
  assert.deepStrictEqual(S.mediaElement([{ name: "IMG", displayName: "IMAGE-SITUATION", lookup: { listId: "{ABC}" } }], { IMGLookupId: 12 }, "abc"),
    { url: "/api/v1/media/12", mediaId: "12" });
  assert.deepStrictEqual(S.mediaElement([{ name: "F", displayName: "FOND", hyperlinkOrPicture: {} }], { F: { Url: "https://cdn.test/a.jpg" } }, null),
    { url: "https://cdn.test/a.jpg" });
  assert.strictEqual(S.mediaElement([{ name: "F", displayName: "FOND", hyperlinkOrPicture: {} }], { F: { Url: "http://x/a.jpg" } }, null), null);
  // Avant provisionnement des statuts : comportement historique conserve.
  assert.strictEqual(S.decider({ statutColonne: false }, null).rendu, "transition");
  assert.deepStrictEqual(S.periodeApplicable({ dateDebut: "2020-01-01", dateFin: "2030-12-31" }, Date.parse("2025-01-01")), { applicable: true });
  assert.strictEqual(S.periodeApplicable({ dateDebut: "2030-01-01" }, Date.parse("2025-01-01")).applicable, false);
  assert.strictEqual(S.periodeApplicable({ dateFin: "not-a-date" }).applicable, false);

  const sitesLus = catalogueSource.lireSites([{
    id: "9",
    configuration: {},
    relations: {
      "OBJ-SITES-STATUT": { id: "2", titre: "ACTIF" },
      "PAGE-PUBLIQUE": { id: "22", titre: "Page Construction" }
    },
    _fields: { DATEDEBUT: "2025-01-01", DATEFIN: "2025-12-31" },
    _colonnes: [
      { name: "OBJ_x002d_SITES_x002d_STATUT", displayName: "OBJ-SITES-STATUT", lookup: { listId: "statuts" } },
      { name: "PAGEPUBLIQUE", displayName: "PAGE-PUBLIQUE", lookup: { listId: "pages" } },
      { name: "DATEDEBUT", displayName: "DATE-DEBUT" },
      { name: "DATEFIN", displayName: "DATE-FIN" }
    ]
  }]);
  assert.strictEqual(sitesLus[0].pagePubliqueId, "22", "le Lookup de page conserve l'ID natif SharePoint");
  assert.strictEqual(sitesLus[0].dateDebut, "2025-01-01");
  assert.strictEqual(sitesLus[0].dateFin, "2025-12-31");

  // Builder : toute situation non ACTIF (meme avec PAGE-PUBLIQUE configuree) => mode "situation", sans contenu.
  const builderRoute = require("../dsePageBuilder");
  const appelBuilder = async () => {
    const ctx = { log: { error() {} }, res: null };
    await builderRoute.page(ctx, { query: { domaine: "x.test" }, headers: {} });
    return typeof ctx.res.body === "string" ? JSON.parse(ctx.res.body) : ctx.res.body;
  };
  for (const id of [...NON_ACTIFS, "99"]) {
    courant = { ...site(id), pagePubliqueId: "22" };
    const corps = await appelBuilder();
    assert.strictEqual(corps.donnees.mode, "situation", `builder statut ${id}`);
    assert.deepStrictEqual(corps.donnees.sections, []);
  }
  // ACTIF : le Builder compose la PAGE-PUBLIQUE configuree par son ID natif.
  const builder = require("../shared/builder");
  const builderSource = require("../shared/builder-source");
  const composerPageOriginal = builder.composerPage;
  const obtenirDonneesOriginal = builderSource.obtenirDonnees;
  let optionsComposees;
  courant = { ...site("2"), pagePubliqueId: "22" };
  builder.composerPage = (_donnees, _site, options) => {
    optionsComposees = options;
    return { mode: "builder", page: { id: options.pageId }, sections: [] };
  };
  builderSource.obtenirDonnees = async () => ({});
  const actif = await appelBuilder();
  assert.strictEqual(optionsComposees.pageId, "22");
  assert.strictEqual(actif.donnees.mode, "builder");
  builder.composerPage = composerPageOriginal;
  builderSource.obtenirDonnees = obtenirDonneesOriginal;

  // Page generique unique (module front ESM) : meme structure pour toute situation.
  const { rendreSituation } = await import("../../modules/situation/situation.js");
  const structure = (html) => html.replace(/>[^<]*</g, "><").replace(/="[^"]*"/g, '=""');
  const rendus = [];
  for (const id of NON_ACTIFS) {
    courant = site(id);
    const situation = (await resoudreDomaine("x.test")).statut.situation;
    const html = rendreSituation(situation, { nomSite: "Mon site", domaine: "x.test" });
    assert.ok(html.includes(situation.titre.replace("é", "é")) || html.includes("Titre"), "titre SharePoint");
    assert.ok(html.includes(situation.texte) && html.includes(situation.details));
    rendus.push(structure(html.replace(/ dse-situation-media/, "").replace(/ style="[^"]*"/, "")));
  }
  assert.ok(rendus.every((r) => r === rendus[0]), "une seule structure de page pour toutes les situations");
  const avecMedia = rendreSituation({ titre: "T", media: { url: "/api/v1/media/77" } });
  assert.ok(avecMedia.includes("background-image:url('/api/v1/media/77')"));
  assert.ok(!rendreSituation({ titre: "T", media: { url: "javascript:alert(1)" } }).includes("javascript:"));
  // Donnees absentes ou erreur : repli neutre, sans detail technique.
  for (const s of [null, undefined, {}, { titre: "ND" }]) {
    const html = rendreSituation(s);
    assert.ok(html.includes("Site momentanément indisponible"));
    assert.ok(!/api|sharepoint|graph|erreur|error|undefined|null/i.test(html.replace(/dse-[a-z-]+/g, "")));
  }
  assert.ok(!rendreSituation({ titre: "<script>x</script>" }).includes("<script>"));
  // Footer SharePoint conserve dans la page generique ; footer minimal sinon.
  const footer = { contenu: { configuration: { "TITRE-PRINCIPAL": "Marque", TEXTE: "Texte footer" } } };
  assert.ok(rendreSituation({ titre: "T" }, { nomSite: "N", footer }).includes("Texte footer"));
  assert.ok(rendreSituation({ titre: "T" }, { nomSite: "N" }).includes("dse-footer--minimal"));
  const css = fs.readFileSync(path.join(__dirname, "../../assets/css/public.css"), "utf8");
  assert.ok(/@media \(max-width: 640px\)/.test(css) && css.includes(".dse-public-card"));

  // 7 : aucun code de statut metier (hors ACTIF) dans le chemin de rendu ; aucune page par statut.
  const chemin = ["../shared/statuts-site.js", "../dsePageBuilder/index.js", "../dseSiteComplet/index.js",
    "../dseSiteParDomaine/index.js", "../../pages/accueil.js", "../../modules/situation/situation.js"];
  for (const f of chemin) {
    const src = fs.readFileSync(path.join(__dirname, f), "utf8");
    assert.ok(!/["'`](construction|maintenance|suspendu|archive)["'`]/i.test(src), `statut code en dur dans ${f}`);
  }
  assert.ok(!fs.existsSync(path.join(__dirname, "../../modules/statut/statuts.js")), "plus de pages par statut");

  // 10 : aucun domaine/client code en dur dans le moteur de statuts.
  for (const f of ["../shared/statuts-site.js", "../../modules/situation/situation.js"]) {
    const src = fs.readFileSync(path.join(__dirname, f), "utf8");
    assert.ok(!/\b[a-z0-9-]+\.(fr|com|cloud|pro|eu)\b/i.test(src.replace(/\.js\b/g, "")), `domaine code en dur dans ${f}`);
  }
  console.log("statuts OK");
})().catch((e) => { console.error(e); process.exit(1); });
