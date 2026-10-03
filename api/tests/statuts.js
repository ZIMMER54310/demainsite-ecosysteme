"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require("../shared/statuts-site");
const catalogueSource = require("../shared/catalogue-source");
const catalogue = require("../shared/catalogue");
const domaines = require("../shared/domaines");

const mk = (code, extra = {}) => ({ titre: code, code, actif: true, valide: true, ...extra });
const statuts = new Map([
  ["1", mk("CONSTRUCTION")], ["2", mk("ACTIF")], ["3", mk("MAINTENANCE")], ["4", mk("SUSPENDU")],
  ["5", mk("ARCHIVE", { titre: "Archivé" })], ["6", mk("BIZARRE")], ["7", mk("ACTIF", { actif: false })]
]);
const site = (statutId) => ({ id: "9", titre: "S", domaines: ["x.test"], actif: true, valide: true, statutColonne: true, statutId });
let courant = site("2");
catalogueSource.obtenirIndex = async () => ({ sites: new Map(), statuts });
catalogue.siteDuDomaine = (i, d) => (d === "x.test" ? courant : null);
domaines.lireDomainesSharePoint = async () => [];
const { resoudreDomaine } = require("../shared/resolveur-domaine");

(async () => {
  // 1-5 : chaque statut officiel donne son rendu (reconnu par CODE).
  for (const [id, rendu] of [["1", "construction"], ["2", "actif"], ["3", "maintenance"], ["4", "suspendu"], ["5", "archive"]]) {
    courant = site(id);
    assert.strictEqual((await resoudreDomaine("x.test")).statut.rendu, rendu);
  }
  // 6 : domaine inconnu.
  assert.strictEqual((await resoudreDomaine("inconnu.test")).type, "inconnu");
  // 7 : statut absent / casse / inactif / non reconnu => jamais le vrai site.
  for (const id of [null, "99", "6", "7"]) {
    courant = site(id);
    const r = (await resoudreDomaine("x.test")).statut;
    assert.strictEqual(r.rendu, "indisponible");
    assert.ok(r.anomalie);
    assert.strictEqual(S.etatPublic(r.rendu, true), "indisponible");
  }
  // 9 : seul le statut change l'etat public, le code reste identique.
  assert.strictEqual(S.etatPublic("actif", true), "normal");
  assert.strictEqual(S.etatPublic("actif", false), "construction");
  assert.strictEqual(S.etatPublic("maintenance", true), "maintenance");
  assert.strictEqual(S.etatPublic("suspendu", true), "suspendu");
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

  // Sans page speciale configuree, un statut non actif ne sert aucun contenu Builder.
  const builderRoute = require("../dsePageBuilder");
  for (const [id, mode] of [["1", "construction"], ["3", "maintenance"], ["4", "suspendu"], ["5", "archive"], ["99", "indisponible"]]) {
    courant = site(id);
    const ctx = { log: { error() {} }, res: null };
    await builderRoute.page(ctx, { query: { domaine: "x.test" }, headers: {} });
    const corps = typeof ctx.res.body === "string" ? JSON.parse(ctx.res.body) : ctx.res.body;
    assert.strictEqual(corps.donnees.mode, mode);
    assert.deepStrictEqual(corps.donnees.sections, []);
  }

  // Avec une page SharePoint configuree, un statut non actif compose cette page par son ID natif.
  const builder = require("../shared/builder");
  const builderSource = require("../shared/builder-source");
  const composerPageOriginal = builder.composerPage;
  const obtenirDonneesOriginal = builderSource.obtenirDonnees;
  let optionsComposees;
  courant = { ...site("1"), pagePubliqueId: "22" };
  builder.composerPage = (_donnees, _site, options) => {
    optionsComposees = options;
    return { mode: "builder", page: { id: options.pageId }, sections: [] };
  };
  builderSource.obtenirDonnees = async () => ({});
  const statutConfigure = { log: { error() {} }, res: null };
  await builderRoute.page(statutConfigure, { query: { domaine: "x.test" }, headers: {} });
  const configure = typeof statutConfigure.res.body === "string" ? JSON.parse(statutConfigure.res.body) : statutConfigure.res.body;
  assert.strictEqual(optionsComposees.pageId, "22");
  assert.strictEqual(configure.donnees.mode, "builder");
  builder.composerPage = composerPageOriginal;
  builderSource.obtenirDonnees = obtenirDonneesOriginal;

  // 8 + textes : pages de statut (module front ESM) et CSS responsive.
  const { PAGES_STATUT, pageStatut } = await import("../../modules/statut/statuts.js");
  assert.strictEqual(PAGES_STATUT.construction.titre, "Site en construction");
  assert.strictEqual(PAGES_STATUT.maintenance.titre, "Maintenance en cours");
  assert.strictEqual(PAGES_STATUT.suspendu.titre, "Site temporairement indisponible");
  assert.strictEqual(PAGES_STATUT.archive.titre, "Site archivé");
  assert.strictEqual(PAGES_STATUT.inconnu.titre, "Site indisponible");
  assert.strictEqual(pageStatut("n'importe quoi").titre, "Site temporairement indisponible");
  const css = fs.readFileSync(path.join(__dirname, "../../assets/css/public.css"), "utf8");
  assert.ok(/@media \(max-width: 640px\)/.test(css) && css.includes(".dse-public-card"));
  for (const t of Object.values(PAGES_STATUT)) assert.ok(!/api|sharepoint|github|\bid\b/i.test(JSON.stringify(t)));

  // 10 : aucun domaine/client code en dur dans le moteur de statuts.
  for (const f of ["../shared/statuts-site.js", "../../modules/statut/statuts.js"]) {
    const src = fs.readFileSync(path.join(__dirname, f), "utf8");
    assert.ok(!/\b[a-z0-9-]+\.(fr|com|cloud|pro|eu)\b/i.test(src.replace(/\.js\b/g, "")), `domaine code en dur dans ${f}`);
  }
  console.log("statuts OK");
})().catch((e) => { console.error(e); process.exit(1); });
