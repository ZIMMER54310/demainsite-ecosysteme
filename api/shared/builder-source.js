"use strict";

// Lecture SharePoint (GET uniquement) des listes du Builder. Une liste absente est ignoree : le mode historique reste actif.
const dse = require("./dse");
const { lireElements } = require("./catalogue-source");
const B = require("./builder");

const TOUT = { pages: "OBJ-PAGES-SITE", sections: "OBJ-SECTION-SITE", lignes: "OBJ-LIGNE-SITE", colonnes: "OBJ-COLONNE-SITE",
  modules: "OBJ-MODULE-SITE-PUBLIC", types: "OBJ-MODULE-SITE-PUBLIC-TYPE", modeles: "OBJ-MODELE-BUILDER",
  presets: "OBJ-STYLE-PRESET", responsifs: "OBJ-STYLE-RESPONSIVE", medias: "OBJ-MEDIA", couleurs: "OBJ-COULEUR", polices: "OBJ-POLICE" };

let cache = null;
let enCours = null;

async function charger() {
  const token = await dse.obtenirJetonGraph();
  const site = await dse.obtenirSiteGraph(token);
  const listes = await dse.collecter(token, `/sites/${site.id}/lists?$select=id,displayName,name`);
  const titres = new Map();
  const lire = async (nom) => {
    const liste = dse.trouverListe(listes, [nom]);
    return liste ? lireElements(token, site.id, liste, titres) : [];
  };

  const donnees = { contenus: {} };
  for (const [cle, nom] of Object.entries(TOUT)) donnees[cle] = await lire(nom);
  for (const nom of new Set(Object.values(B.LISTES_CONTENU))) donnees.contenus[nom] = await lire(nom);

  // Valeurs techniques (hex, famille) portees par les elements des referentiels de style.
  return donnees;
}

async function obtenirDonnees() {
  const duree = (Number(process.env.DSE_CATALOGUE_CACHE_SECONDES) >= 0 ? Number(process.env.DSE_CATALOGUE_CACHE_SECONDES) : 60) * 1000;
  if (cache && Date.now() - cache.le < duree) return cache.donnees;

  if (!enCours) {
    enCours = charger().then((donnees) => { cache = { le: Date.now(), donnees }; return donnees; }).finally(() => { enCours = null; });
  }
  return enCours;
}

module.exports = { obtenirDonnees, viderCache: () => { cache = null; } };
