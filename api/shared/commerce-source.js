"use strict";

const dse = require("./dse");
const catalogue = require("./catalogue");
const catalogueSource = require("./catalogue-source");

const REFERENTIELS_CREATION = Object.freeze({
  usages: "OBJ-USAGE-SITE",
  typesBoutique: "OBJ-TYPE-BOUTIQUE",
  optionsBoutique: "OBJ-TYPE-BOUTIQUE-OPTION",
  modesCommerciaux: "OBJ-MODE-COMMERCIAL",
  periodicites: "OBJ-PERIODICITE",
  licences: "OBJ-LICENCE",
  decisionsClient: "OBJ-DECISION-CLIENT"
});

const CHAMPS_JOURNAL_AUTORISES = new Set([
  "TITLE", "CODE", "NOM", "ACTION", "DATEEVENEMENT", "CLEIDEMPOTENCE",
  "ANCIENNEVALEUR", "NOUVELLEVALEUR", "STATUTJRN", "ANOMALIE", "ANOMALIEDETECTEE"
]);
const cle = (nom) => catalogue.cleChamp(nom);

function relation(element, nom) {
  const attendu = cle(nom);
  for (const [libelle, brut] of Object.entries(element?.relations || {})) {
    if (cle(libelle) !== attendu) continue;
    return (Array.isArray(brut) ? brut : [brut]).filter((x) => x?.id != null)
      .map((x) => ({ id: String(x.id), titre: x.titre == null ? null : String(x.titre) }));
  }
  return [];
}

function etatOui(element, nom) {
  const lies = relation(element, nom);
  if (lies.length) return lies.some((x) => cle(x.titre).startsWith("OUI"));
  const colonnes = element?._colonnes || [];
  const colonne = colonnes.find((c) => cle(c.displayName || c.name) === cle(nom));
  const valeur = colonne ? element?._fields?.[colonne.name] : undefined;
  return typeof valeur === "boolean" ? valeur : null;
}

function fiche(element, champs = []) {
  const valeur = (nom) => {
    const attendu = cle(nom);
    const entree = Object.entries(element?.configuration || {}).find(([k]) => cle(k) === attendu);
    return entree?.[1] == null ? null : String(entree[1]);
  };
  return {
    id: String(element.id),
    titre: catalogue.titreElement(element) || "",
    code: valeur("CODE"),
    actif: etatOui(element, "OBJ-ACTIF"),
    valide: etatOui(element, "OBJ-VALIDE"),
    relations: Object.fromEntries(champs.map((nom) => [nom, relation(element, nom)]).filter(([, v]) => v.length))
  };
}

function filtrerActifs(elements, champs = []) {
  return elements.filter((x) => etatOui(x, "OBJ-ACTIF") === true && etatOui(x, "OBJ-VALIDE") === true)
    .map((x) => fiche(x, champs));
}

function verifierContratJournal(colonnes) {
  const visibles = (colonnes || []).filter((c) => !c.hidden);
  const requisesInterdites = visibles.filter((c) => c.required && !CHAMPS_JOURNAL_AUTORISES.has(cle(c.name)));
  const parCle = new Map(visibles.map((c) => [cle(c.name), c]));
  const id = parCle.get("TITLE");
  const code = parCle.get("CODE");
  const nom = parCle.get("NOM");
  const date = parCle.get("DATEEVENEMENT");
  const cleIdempotence = parCle.get("CLEIDEMPOTENCE");
  const statut = parCle.get("STATUTJRN");
  return requisesInterdites.length === 0 &&
    Boolean(id?.text && id.enforceUniqueValues && code?.text && code.enforceUniqueValues &&
      nom?.text && date?.dateTime && cleIdempotence?.text &&
      cleIdempotence.enforceUniqueValues && cleIdempotence.indexed && parCle.get("ACTION")?.text &&
      parCle.get("NOUVELLEVALEUR")?.text &&
      parCle.get("ANOMALIE")?.boolean &&
      statut?.choice?.choices?.includes("DÉBUT") && statut.choice.choices.includes("SUCCÈS") &&
      statut.choice.choices.includes("ÉCHEC") && statut.choice.choices.includes("REFUS") &&
      statut.choice.choices.includes("FIN"));
}

async function chargerReferentielsCreation() {
  const g = await require("./ecriture").contexteGraph();
  const listes = await dse.collecter(g.token, `/sites/${g.siteGraphId}/lists?$select=id,displayName,name`);
  const cacheTitres = new Map();
  const entrees = Object.entries(REFERENTIELS_CREATION).map(([cleRef, nom]) => {
    const correspondantes = listes.filter((l) => l.displayName === nom);
    if (correspondantes.length > 1) throw new Error(`Référentiel SharePoint dupliqué : ${nom}.`);
    return [cleRef, correspondantes[0] || null];
  });
  const lues = await Promise.all(entrees.map(([, liste]) => liste
    ? catalogueSource.lireElements(g.token, g.siteGraphId, liste, cacheTitres)
    : null));
  const resultat = Object.fromEntries(entrees.map(([nom, liste], i) => [
    nom,
    liste ? filtrerActifs(lues[i], nom === "optionsBoutique"
      ? ["OBJ-TYPE-BOUTIQUE", "OBJ-CATALOGUE", "OBJ-MODE-COMMERCIAL", "OBJ-LICENCE", "OBJ-PERIODICITE"]
      : []) : null
  ]));
  const types = new Set((resultat.typesBoutique || []).map((x) => x.id));
  resultat.optionsBoutique = resultat.optionsBoutique?.filter((x) =>
    (x.relations["OBJ-TYPE-BOUTIQUE"] || []).some((r) => types.has(r.id))) ?? null;
  resultat.disponibilite = Object.fromEntries(Object.entries(resultat).filter(([k]) => k !== "disponibilite")
    .map(([k, v]) => [k, v !== null]));
  const listeJournal = listes.filter((l) => l.displayName === "OBJ-JRN");
  if (listeJournal.length > 1) throw new Error("Journal SharePoint dupliqué.");
  let journalCompatible = false;
  if (listeJournal.length === 1) {
    const colonnes = await dse.collecter(g.token,
      `/sites/${g.siteGraphId}/lists/${listeJournal[0].id}/columns`);
    journalCompatible = verifierContratJournal(colonnes);
  }
  resultat.ecritures = {
    journalCompatible,
    message: journalCompatible ? null :
      "Les enregistrements sont suspendus : la configuration du journal ne permet pas encore de respecter le cycle sécurisé approuvé."
  };
  return resultat;
}

module.exports = { REFERENTIELS_CREATION, CHAMPS_JOURNAL_AUTORISES, chargerReferentielsCreation,
  _test: { relation, etatOui, fiche, filtrerActifs, verifierContratJournal } };
