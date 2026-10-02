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

  // Le contenu du vrai site n'est jamais servi hors statut Actif (route Builder).
  const builderRoute = require("../dsePageBuilder");
  for (const [id, mode] of [["1", "construction"], ["3", "maintenance"], ["4", "suspendu"], ["5", "archive"], ["99", "indisponible"]]) {
    courant = site(id);
    const ctx = { log: { error() {} }, res: null };
    await builderRoute.page(ctx, { query: { domaine: "x.test" }, headers: {} });
    const corps = typeof ctx.res.body === "string" ? JSON.parse(ctx.res.body) : ctx.res.body;
    assert.strictEqual(corps.donnees.mode, mode);
    assert.deepStrictEqual(corps.donnees.sections, []);
  }

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
