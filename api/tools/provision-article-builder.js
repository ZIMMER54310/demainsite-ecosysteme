"use strict";

/*
 * Relation unique Article -> DSE-CONSTRUCTION : une racine OBJ-BUILDER-ELEMENT designe son article par ID natif.
 * Ajout d'une seule colonne Lookup facultative ; aucune liste, donnee, suppression ni renommage.
 * Usage : node tools/provision-article-builder.js [--apply]
 */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const P = require("../shared/provisionnement");

const DEFINITIONS = [{ nom: "OBJ-BUILDER-ELEMENT", colonnes: [P.L("OBJ-ARTICLE", "OBJ-ARTICLE")] }];

async function provisionner(appliquer = false) {
  const g = await ecriture.contexteGraph();
  const avant = await P.lireEtat(g.token, g.siteGraphId, DEFINITIONS);
  const plan = P.planifierListes(avant, DEFINITIONS);
  P.afficherPlan(plan);
  if (plan.some((a) => a.type === "erreur")) throw new Error("Plan invalide : aucune écriture.");
  if (!appliquer || !plan.length) return plan;
  const sauvegarde = P.sauvegarder(avant, "article-builder-avant");
  console.log("Sauvegarde du schema", sauvegarde);
  await P.appliquerPlan(g.token, g.siteGraphId, avant, DEFINITIONS);
  dse.viderCacheGraph();
  const apres = await P.lireEtat(g.token, g.siteGraphId, DEFINITIONS);
  if (P.planifierListes(apres, DEFINITIONS).length) throw new Error("Relecture du schema incomplete.");
  const journal = await require("../shared/journal-comptes").enregistrer(g, {
    cle: `ARTICLE-BUILDER-SCHEMA-${ecriture.hash(apres)}`, action: "CONFIGURATION-COCKPIT",
    avant, apres, contexte: { sauvegarde, donneesMetierCreees: 0 }
  });
  console.log("Schema relu ; aucune donnee metier creee.", journal);
  return plan;
}

if (require.main === module) provisionner(process.argv.includes("--apply")).catch((e) => {
  console.error("[DemainSite Ecosysteme article builder schema]", e.message);
  process.exitCode = 1;
});

module.exports = { DEFINITIONS, provisionner };
