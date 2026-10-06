"use strict";

// Lecture SharePoint (GET uniquement) des listes du Builder. Une liste absente est ignoree : le mode historique reste actif.
const dse = require("./dse");
const { lireElements } = require("./catalogue-source");
const B = require("./builder");

const TOUT = { pages: "OBJ-PAGES-SITE", sections: "OBJ-SECTION-SITE", lignes: "OBJ-LIGNE-SITE", colonnes: "OBJ-COLONNE-SITE",
  modules: "OBJ-MODULE-SITE-PUBLIC", types: "OBJ-MODULE-SITE-PUBLIC-TYPE", modeles: "OBJ-MODELE-BUILDER",
  presets: "OBJ-STYLE-PRESET", responsifs: "OBJ-STYLE-RESPONSIVE", medias: "OBJ-MEDIA", couleurs: "OBJ-COULEUR", polices: "OBJ-POLICE",
  // Constructeur : conteneurs, utilisations, instances, logos et referentiels de structure.
  entetes: "OBJ-ENTETE-SITE", footers: "OBJ-FOOTER-SITE", utilisations: "OBJ-MODULE-UTILISATION", instances: "OBJ-MODELE-INSTANCE",
  logos: "OBJ-LOGO-SITE", structures: "OBJ-LIGNE-STRUCTURE", typesSection: "OBJ-SECTION-TYPE", actifs: "OBJ-ACTIF", valides: "OBJ-VALIDE",
  // Moteur Design : types de style (groupes de reglages), theme du site, referentiels d alignement et d appareil.
  styleTypes: "OBJ-STYLE-TYPE", themes: "OBJ-SITE-THEME", alignements: "OBJ-ALIGNEMENT", appareils: "OBJ-APPAREIL",
  // Articles : contenus construits avec le meme moteur (racine OBJ-BUILDER-ELEMENT -> OBJ-ARTICLE).
  articles: "OBJ-ARTICLE",
  builderTypes: "OBJ-BUILDER-TYPE", builderElements: "OBJ-BUILDER-ELEMENT",
  builderRegles: "OBJ-BUILDER-REGLE-IMBRICATION", builderChamps: "OBJ-BUILDER-CHAMP", builderValeurs: "OBJ-BUILDER-VALEUR" };

let cache = null;
let enCours = null;

async function charger() {
  const token = await dse.obtenirJetonGraph();
  const site = await dse.obtenirSiteGraph(token);
  const listes = await dse.collecter(token, `/sites/${site.id}/lists?$select=id,displayName,name`);
  const titres = new Map();
  const siteListeId = dse.trouverListe(listes, ["OBJ-SITE-PUBLIC"])?.id || null;
  const lire = async (nom) => {
    const liste = dse.trouverListe(listes, [nom]);
    if (!liste) return [];
    const options = nom === "OBJ-BUILDER-CHAMP" ? { exclureChamps: ["APPAREIL"] } : nom === "OBJ-ARTICLE" ? { siteListeId } : {};
    try {
      return await lireElements(token, site.id, liste, titres, options);
    } catch (e) {
      // Article modifie pendant la double lecture du site cible : une seule relecture coherente.
      if (nom !== "OBJ-ARTICLE") throw e;
      return lireElements(token, site.id, liste, titres, options);
    }
  };

  // Identifiant natif de la liste OBJ-ARTICLE : reference d'edition des informations d'un article.
  const donnees = { contenus: {}, listeArticlesId: dse.trouverListe(listes, ["OBJ-ARTICLE"])?.id || null };
  // Lectures paralleles bornees : rapide sans saturer Graph (limitation de debit).
  const taches = [
    ...Object.entries(TOUT).map(([cle, nom]) => async () => { donnees[cle] = await lire(nom); }),
    ...[...new Set(Object.values(B.LISTES_CONTENU))].map((nom) => async () => { donnees.contenus[nom] = await lire(nom); })
  ];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(6, taches.length) }, async () => { while (i < taches.length) await taches[i++](); }));

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
