"use strict";

require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const progression = require("../shared/progression-visuelle");
const { colonneGraph, T, N, B, TL } = require("../shared/provisionnement");

const DEFINITIONS = {
  min: N("POURCENTAGE-MIN"), max: N("POURCENTAGE-MAX"), couleur: T("COULEUR"),
  ordre: N("ORDRE"), actif: B("ACTIF"), description: TL("DESCRIPTION")
};

async function provisionner(appliquer) {
  const g = await ecriture.contexteGraph();
  g.listes = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists?$select=id,displayName`);
  let liste = await progression.trouverConfiguration(g, true);
  let colonnes = liste ? await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id) : [];
  const champs = progression.colonnesConfiguration(colonnes);
  console.log(liste ? `Liste existante : ${liste.displayName}` : `Liste à créer : ${progression.NOM_LISTE}`);
  const manquantes = Object.entries(DEFINITIONS).filter(([champ]) => !champs[champ]);
  console.log(`Colonnes à créer : ${manquantes.map(([, def]) => def.name).join(", ") || "aucune"}`);
  if (!appliquer) return;
  const avant = { listeId: liste?.id || null, colonnes: colonnes.map((c) => c.name) };
  const mutations = [];
  let tentative = false, termine = false;
  try {
    if (!liste) {
      tentative = true;
      liste = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists`, {
        displayName: progression.NOM_LISTE, description: "Configuration visuelle de la progression du cockpit, commune à tous les sites.",
        list: { template: "genericList" }
      });
      g.listes.push(liste);
      mutations.push("Création liste");
      await dse.graphEcriture(g.token, "PATCH", `/sites/${g.siteGraphId}/lists/${liste.id}/columns/Title`, { displayName: "LIBELLE" });
      mutations.push("Title affiché comme LIBELLE");
    } else if (!champs.libelle) {
      throw new Error("Colonne LIBELLE absente : compléter la structure existante avant de continuer.");
    }
    for (const [champ, def] of manquantes) {
      tentative = true;
      const colonne = colonneGraph(def, {});
      if (champ !== "description" && champ !== "actif") colonne.required = true;
      await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${liste.id}/columns`, colonne);
      mutations.push(`Création colonne ${def.name}`);
    }
    termine = true;
  } finally {
    if (tentative) {
      const resultat = await ecriture.journaliser(g, {
        cle: ecriture.hash(["STRUCTURE-PROGRESSION", avant, liste?.id || null, mutations, termine]),
        action: "STRUCTURE-PROGRESSION", nom: liste?.displayName || progression.NOM_LISTE, ancien: avant,
        nouveau: { listeId: liste?.id || null, mutations }, succes: termine,
        notes: `Provisionnement demandé par Pascal Zimmer. Aucun élément métier créé. Aucune suppression.${termine ? "" : " Échec du provisionnement ; contrôler le schéma avant reprise."}`,
        contexte: { listeId: liste?.id || null }
      });
      console.log("Structure enregistrée ; journal SharePoint désactivé.");
    }
    ecriture.invaliderCaches();
  }
  colonnes = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id);
  if (!progression.structureExacte(colonnes)) throw new Error("Relecture : structure de progression incomplète.");
  console.log(`Structure vérifiée : ${liste.displayName}. Aucune plage ni couleur ajoutée.`);
}

if (require.main === module) provisionner(process.argv.includes("--apply"))
  .catch((e) => { console.error("[DSE progression] provisionnement", e.message); process.exitCode = 1; });

module.exports = { provisionner };
