"use strict";

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const P = require("../shared/provisionnement");
const { T, TL, N, B, L } = P;

const DEFINITIONS = [
  { nom: "OBJ-REALISATION-ETAT", creer: true, colonnes: [
    T("CODE"), N("PROGRESSION"), T("LIBELLE-ACTION"), T("OPERATION-TECHNIQUE"), T("COULEUR"), B("ACTIF")
  ] },
  ...["OBJ-ENTETE-SITE", "OBJ-FOOTER-SITE", "OBJ-PAGES-SITE", "OBJ-BUILDER-ELEMENT"]
    .map((nom) => ({ nom, colonnes: [L("REALISATION-ETAT", "OBJ-REALISATION-ETAT")] })),
  { nom: "OBJ-DROIT-OPERATION", colonnes: [
    B("DEMANDABLE"), B("INTERDITE"), B("OPTION-REQUISE"), T("MESSAGE-REFUS")
  ] },
  { nom: "OBJ-CLIENT-CAPACITE", creer: true, colonnes: [
    L("OBJ-CLIENT", "OBJ-CLIENT"), L("OBJ-SITE-PUBLIC", "OBJ-SITE-PUBLIC"),
    L("OBJ-CAPACITE", "OBJ-CAPACITE"), B("ACTIF")
  ] },
  { nom: "OBJ-DEMANDE-ACCES", creer: true, colonnes: [
    L("OBJ-UTILISATEUR", "OBJ-UTILISATEUR"), L("OBJ-UTILISATEUR-SITE", "OBJ-UTILISATEUR-SITE"),
    L("OBJ-CLIENT", "OBJ-CLIENT"), L("OBJ-SITE-PUBLIC", "OBJ-SITE-PUBLIC"),
    L("OBJ-CAPACITE", "OBJ-CAPACITE"), L("OBJ-ACTION", "OBJ-ACTION"),
    L("OBJ-PERIMETRE-TYPE", "OBJ-PERIMETRE-TYPE"), T("OPERATION-TECHNIQUE"),
    TL("MOTIF"), T("CLE-IDEMPOTENCE"), B("TRAITEE")
  ] },
  { nom: "OBJ-ACCOMPAGNEMENT", creer: true, colonnes: [
    T("TYPE-IDENTITE"), TL("DESCRIPTION"), L("OBJ-MEDIA", "OBJ-MEDIA"),
    L("OBJ-UTILISATEUR", "OBJ-UTILISATEUR"), B("ACTIF")
  ] },
  { nom: "OBJ-MODELE-BUILDER", colonnes: [
    L("SOURCE-ENTETE", "OBJ-ENTETE-SITE"), L("SOURCE-FOOTER", "OBJ-FOOTER-SITE"),
    B("DEFAUT-NOUVEAU-SITE")
  ] }
];

async function provisionner(appliquer = false) {
  const g = await ecriture.contexteGraph();
  const avant = await P.lireEtat(g.token, g.siteGraphId, DEFINITIONS);
  const plan = P.planifierListes(avant, DEFINITIONS);
  P.afficherPlan(plan);
  if (!appliquer) return plan;
  const sauvegarde = P.sauvegarder(avant, "cockpit-avant");
  console.log("Sauvegarde du schema", sauvegarde);
  if (plan.length) await P.appliquerPlan(g.token, g.siteGraphId, avant, DEFINITIONS);
  dse.viderCacheGraph();
  const apres = await P.lireEtat(g.token, g.siteGraphId, DEFINITIONS);
  if (P.planifierListes(apres, DEFINITIONS).length) throw new Error("Relecture du schema cockpit incomplete.");
  const journal = await require("../shared/journal-comptes").enregistrer(g, {
    cle: `COCKPIT-SCHEMA-${ecriture.hash(apres)}`, action: "CONFIGURATION-COCKPIT",
    avant, apres, contexte: { sauvegarde, donneesMetierCreees: 0 }
  });
  console.log("Schema relu ; aucun statut, offre, abonnement, modele ou droit attribue.", journal);
}

if (require.main === module) provisionner(process.argv.includes("--apply")).catch((e) => {
  console.error("[DemainSite Ecosysteme cockpit schema]", e.message);
  process.exitCode = 1;
});

module.exports = { DEFINITIONS, provisionner };
