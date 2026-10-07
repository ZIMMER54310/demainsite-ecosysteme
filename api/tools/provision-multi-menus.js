"use strict";

require("dotenv").config();

const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");

const DEFINITIONS = {
  "OBJ-MENU": {
    id: "6cb14488-8f81-42f7-b9b2-24744fdb5d82",
    colonnes: {
      Title: { type: "text", required: true },
      OBJSITEPUBLIC: { type: "lookup", cible: "OBJ-SITE-PUBLIC", required: true },
      DESCRIPTION: { type: "text" },
      OBJACTIF: { type: "lookup", cible: "OBJ-ACTIF", required: true },
      OBJVALIDE: { type: "lookup", cible: "OBJ-VALIDE", required: true },
      EMPREINTEMENU: { type: "text", required: true, unique: true, indexed: true },
      DATEMODIFICATION: { type: "dateTime" }
    }
  },
  "OBJ-MENU-ENTREE": {
    id: "5df35012-b19d-4928-98d0-49530e31f2a4",
    colonnes: {
      Title: { type: "text", required: true },
      OBJMENU: { type: "lookup", cible: "OBJ-MENU", required: true },
      OBJPAGESSITE: { type: "lookup", cible: "OBJ-PAGES-SITE" },
      URLPERSONNALISEE: { type: "text" },
      ENTREEPARENTE: { type: "lookup", cible: "OBJ-MENU-ENTREE" },
      ORDRE: { type: "number", required: true },
      OUVERTURENOUVELLEFENETRE: { type: "boolean" },
      OBJACTIF: { type: "lookup", cible: "OBJ-ACTIF", required: true },
      OBJVALIDE: { type: "lookup", cible: "OBJ-VALIDE", required: true },
      EMPREINTEENTREE: { type: "text", required: true, unique: true, indexed: true }
    }
  },
  "OBJ-MENU-AFFECTATION": {
    id: "63a1f78c-b52d-44ef-828d-7f366a861628",
    colonnes: {
      Title: { type: "text", required: true },
      OBJMENU: { type: "lookup", cible: "OBJ-MENU", required: true },
      OBJENTETESITE: { type: "lookup", cible: "OBJ-ENTETE-SITE" },
      OBJFOOTERSITE: { type: "lookup", cible: "OBJ-FOOTER-SITE" },
      TYPEEMPLACEMENT: { type: "text", required: true },
      ORDRE: { type: "number" },
      OBJACTIF: { type: "lookup", cible: "OBJ-ACTIF", required: true },
      OBJVALIDE: { type: "lookup", cible: "OBJ-VALIDE", required: true },
      EMPREINTEAFFECTATION: { type: "text", required: true, unique: true, indexed: true }
    }
  }
};

const typeColonne = (c) => c.text ? "text" : c.lookup ? "lookup" : c.number ? "number" :
  c.boolean ? "boolean" : c.dateTime ? "dateTime" : null;
const normaliser = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function verifier(token, siteId) {
  const listes = await dse.collecter(token, `/sites/${siteId}/lists?$select=id,displayName`);
  const ids = Object.fromEntries(listes.map((l) => [l.displayName, l.id]));
  const erreurs = [];
  const controles = [];
  for (const [nom, definition] of Object.entries(DEFINITIONS)) {
    const liste = listes.filter((l) => l.displayName === nom);
    if (liste.length !== 1 || liste[0].id.toLowerCase() !== definition.id.toLowerCase()) {
      erreurs.push(`${nom}: liste absente, dupliquée ou ID inattendu.`);
      continue;
    }
    const colonnes = await dse.chargerColonnesListe(token, siteId, liste[0].id, { contraintes: true });
    for (const [interne, attendu] of Object.entries(definition.colonnes)) {
      const trouvées = colonnes.filter((c) => c.name === interne);
      const c = trouvées[0];
      if (trouvées.length !== 1) {
        erreurs.push(`${nom}.${interne}: colonne interne absente ou dupliquée.`);
        continue;
      }
      if (typeColonne(c) !== attendu.type) erreurs.push(`${nom}.${interne}: type ${attendu.type} requis.`);
      if (attendu.cible) {
        const cible = listes.find((l) => l.displayName === attendu.cible);
        if (!cible || c.lookup?.listId?.toLowerCase() !== cible.id.toLowerCase() || c.lookup?.allowMultipleValues) {
          erreurs.push(`${nom}.${interne}: Lookup simple vers ${attendu.cible} requis.`);
        }
      }
      if (attendu.required && !c.required) erreurs.push(`${nom}.${interne}: colonne obligatoire requise.`);
      if (attendu.unique && !c.enforceUniqueValues) erreurs.push(`${nom}.${interne}: unicité SharePoint requise.`);
      if (attendu.indexed && !c.indexed) erreurs.push(`${nom}.${interne}: index SharePoint requis.`);
      controles.push(`${nom}.${interne}=${typeColonne(c)}${c.lookup ? `->${listes.find((l) => l.id === c.lookup.listId)?.displayName || "cible inconnue"}` : ""}${c.required ? ":required" : ""}${c.indexed ? ":indexed" : ""}${c.enforceUniqueValues ? ":unique" : ""}`);
    }
  }
  return { conforme: erreurs.length === 0, controles, erreurs, ids: Object.fromEntries(Object.keys(DEFINITIONS).map((n) => [n, ids[n] || null])) };
}

function planifierChampsObligatoires(listes, colonnesParListe) {
  const changements = [];
  for (const [nom, definition] of Object.entries(DEFINITIONS)) {
    const liste = listes.find((x) => x.displayName === nom);
    if (!liste || liste.id.toLowerCase() !== definition.id.toLowerCase()) continue;
    const colonnes = colonnesParListe[liste.id] || [];
    for (const [interne, attendu] of Object.entries(definition.colonnes)) {
      if (!attendu.required) continue;
      const c = colonnes.find((x) => x.name === interne);
      if (c && !c.required) changements.push({ liste: nom, listeId: liste.id, colonne: interne, colonneId: c.id });
    }
  }
  return changements;
}

async function appliquerChampsObligatoires(g) {
  const journal = require("../shared/journal-comptes");
  const listes = await dse.collecter(g.token, `/sites/${g.siteGraphId}/lists?$select=id,displayName`);
  const colonnesParListe = {};
  const itemsParListe = {};
  for (const [nom, definition] of Object.entries(DEFINITIONS)) {
    const liste = listes.find((x) => x.displayName === nom);
    if (!liste || liste.id.toLowerCase() !== definition.id.toLowerCase()) {
      throw new Error(`${nom}: liste absente ou ID inattendu ; aucune correction appliquée.`);
    }
    colonnesParListe[liste.id] = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id, { contraintes: true });
    itemsParListe[nom] = await dse.chargerItemsListe(g.token, g.siteGraphId, liste.id);
  }
  const changements = planifierChampsObligatoires(listes, colonnesParListe);
  for (const [nom, definition] of Object.entries(DEFINITIONS)) {
    const requis = Object.entries(definition.colonnes).filter(([, c]) => c.required).map(([champ, attendu]) =>
      attendu.type === "lookup" ? `${champ}LookupId` : champ);
    if (itemsParListe[nom].some((item) =>
      requis.some((champ) => item.fields?.[champ] === undefined || item.fields?.[champ] === null || item.fields?.[champ] === ""))) {
      throw new Error(`${nom}: des éléments existants ne satisfont pas les champs requis ; aucune correction de schéma appliquée.`);
    }
  }
  for (const item of changements) {
    const colonne = colonnesParListe[item.listeId].find((x) => x.id === item.colonneId);
    const cle = `DSE-MENU-COLONNE-REQUISE-${ecriture.hash([item.listeId, item.colonneId])}`;
    const avant = { listeId: item.listeId, colonneId: item.colonneId, required: false };
    const apres = { listeId: item.listeId, colonneId: item.colonneId, required: true };
    const contexte = { liste: item.liste, colonne: item.colonne, idempotence: cle };
    const entree = await journal.commencer(g, {
      cle, action: "STRUCTURE-MENU-COLONNE-REQUISE", nom: `${item.liste}.${item.colonne}`,
      avant, apres, contexte
    });
    try {
      await dse.graphEcriture(g.token, "PATCH",
        `/sites/${g.siteGraphId}/lists/${item.listeId}/columns/${encodeURIComponent(item.colonneId)}`,
        { required: true });
      dse.viderCacheGraph();
      const relues = await dse.chargerColonnesListe(g.token, g.siteGraphId, item.listeId, { contraintes: true });
      const relue = relues.find((x) => x.id === item.colonneId);
      if (!relue?.required) throw new Error(`${item.liste}.${item.colonne}: SharePoint n'a pas confirmé le caractère obligatoire.`);
      await journal.terminer(g, entree, { statut: "SUCCÈS", avant, apres, contexte });
      console.log(`Corrigé, relu et journalisé : ${item.liste}.${item.colonne} (ID natif ${item.colonneId})`);
    } catch (erreur) {
      try {
        await journal.terminer(g, entree, { statut: "ÉCHEC", avant, apres: null,
          anomalie: true, erreur: erreur.message, contexte });
      } catch (erreurJournal) {
        console.error("[DSE multi-menus journal]", erreurJournal.message);
      }
      throw erreur;
    }
  }
  dse.viderCacheGraph();
}

async function provisionner(appliquer = false) {
  const g = await ecriture.contexteGraph();
  if (appliquer) {
    const avant = await verifier(g.token, g.siteGraphId);
    const autresErreurs = avant.erreurs.filter((x) => !x.endsWith(": colonne obligatoire requise."));
    if (autresErreurs.length) throw new Error(`Correction refusée : défauts autres que l'obligation des champs (${autresErreurs.join(", ")}).`);
    await appliquerChampsObligatoires(g);
  }
  const resultat = await verifier(g.token, g.siteGraphId);
  console.log(`Listes contrôlées : ${Object.keys(DEFINITIONS).length}; aucune création de liste ni de colonne.`);
  for (const ligne of resultat.controles) console.log(`OK ${ligne}`);
  for (const erreur of resultat.erreurs) console.error(`ERREUR ${erreur}`);
  console.log(resultat.conforme ? "SCHÉMA MULTI-MENUS CONFORME — AUCUNE MODIFICATION" : "SCHÉMA MULTI-MENUS NON CONFORME");
  return resultat;
}

if (require.main === module) provisionner(process.argv.includes("--apply")).then((r) => {
  if (!r.conforme) process.exitCode = 2;
}).catch((e) => {
  console.error("[DSE multi-menus schema]", e.message);
  process.exitCode = 1;
});

module.exports = { DEFINITIONS, verifier, provisionner, planifierChampsObligatoires };
