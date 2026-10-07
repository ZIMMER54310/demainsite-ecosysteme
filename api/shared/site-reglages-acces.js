"use strict";

const dse = require("./dse");
const ecriture = require("./ecriture");
const journal = require("./journal-comptes");

const NOMS = {
  afficherAccesCockpit: "OBJACCESCOCKPIT",
  creationCompteAutorisee: "OBJCREATIONCOMPTE",
  approbationProprietaire: "OBJAPPROBATIONPROPRIETAIRE"
};
const DEFAUTS = { afficherAccesCockpit: true, creationCompteAutorisee: false, approbationProprietaire: true };

async function schema(g) {
  const liste = dse.trouverListe(g.listes, "OBJ-SITE-PUBLIC");
  if (!liste) throw new Error("Liste OBJ-SITE-PUBLIC indisponible.");
  const colonnes = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id);
  const champs = Object.fromEntries(Object.entries(NOMS).map(([cle, nom]) => {
    const xs = colonnes.filter((c) => !c.hidden && !c.readOnly && c.name === nom && c.boolean);
    if (xs.length !== 1) throw new Error(`Réglage SharePoint absent ou ambigu : ${nom}.`);
    return [cle, xs[0]];
  }));
  return { liste, champs };
}

function lireValeurs(fields, champs) {
  return Object.fromEntries(Object.entries(champs).map(([cle, col]) => [
    cle, fields[col.name] === null || fields[col.name] === undefined ? DEFAUTS[cle] : fields[col.name] === true
  ]));
}

async function lire(siteId) {
  if (!/^\d{1,12}$/.test(String(siteId || ""))) throw new Error("ID natif du site invalide.");
  const g = await ecriture.contexteGraph();
  const { liste, champs } = await schema(g);
  const fields = await ecriture.lireItemFrais(g, liste.id, siteId, Object.values(champs).map((c) => c.name));
  return lireValeurs(fields, champs);
}

async function enregistrer({ siteId, valeurs, acteurId }) {
  if (!/^\d{1,12}$/.test(String(siteId || "")) || !/^\d{1,12}$/.test(String(acteurId || "")) ||
      !valeurs || Object.keys(NOMS).some((k) => typeof valeurs[k] !== "boolean") ||
      Object.keys(valeurs).some((k) => !Object.hasOwn(NOMS, k))) throw new Error("Réglages d’accès invalides.");
  const g = await ecriture.contexteGraph();
  const { liste, champs } = await schema(g);
  const chemin = `/sites/${g.siteGraphId}/lists/${liste.id}/items/${encodeURIComponent(siteId)}`;
  const courant = await dse.graphSansCache(g.token, `${chemin}?$expand=fields($select=${Object.values(champs).map((c) => c.name).join(",")})`);
  const etag = courant?.eTag || courant?.["@odata.etag"];
  if (!etag) throw new Error("Version SharePoint absente, modification refusée.");
  const avant = lireValeurs(courant.fields || {}, champs);
  const apres = Object.fromEntries(Object.keys(NOMS).map((k) => [k, valeurs[k]]));
  if (Object.keys(NOMS).every((k) => avant[k] === apres[k])) return { valeurs: apres, dejaApplique: true };

  const fields = Object.fromEntries(Object.keys(NOMS).map((k) => [champs[k].name, apres[k]]));
  const cle = `SITE-REGLAGES-ACCES:${ecriture.hash([liste.id, siteId, apres])}`;
  const contexte = { siteId: String(siteId), acteurId: String(acteurId) };
  const entree = await journal.commencer(g, { cle, action: "SITE-REGLAGES-ACCES",
    nom: "Modification des réglages d’accès", avant, apres, contexte });
  try {
    await dse.graphEcriture(g.token, "PATCH", `${chemin}/fields`, fields, etag);
    const relu = await ecriture.lireItemFrais(g, liste.id, siteId, Object.values(champs).map((c) => c.name));
    const valeursRelues = lireValeurs(relu, champs);
    if (!Object.keys(NOMS).every((k) => valeursRelues[k] === apres[k])) throw new Error("Relecture des réglages d’accès différente.");
    await journal.terminer(g, entree, { statut: "SUCCÈS", avant, apres: valeursRelues, contexte });
    return { valeurs: valeursRelues, dejaApplique: false };
  } catch (err) {
    await journal.terminer(g, entree, { statut: "ÉCHEC", anomalie: true, erreur: err.message, avant, apres: null, contexte });
    throw err;
  }
}

module.exports = { lire, enregistrer, _test: { NOMS, DEFAUTS, lireValeurs } };
