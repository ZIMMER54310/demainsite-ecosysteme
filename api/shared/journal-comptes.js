"use strict";

const crypto = require("node:crypto");
const dse = require("./dse");
const ecriture = require("./ecriture");
const catalogue = require("./catalogue");
const normaliser = catalogue.cleChamp;

const ETATS_TERMINAUX = new Set(["SUCCÈS", "ÉCHEC", "REFUS"]);

function champ(colonnes, nom, type) {
  const cle = normaliser(nom);
  const candidats = colonnes.filter((c) => !c.hidden && !c.readOnly &&
    (normaliser(c.name) === cle || normaliser(c.displayName) === cle) && c[type]);
  const exact = candidats.filter((c) => normaliser(c.name) === cle);
  const resultat = exact.length ? exact : candidats;
  if (resultat.length !== 1) throw new Error(`OBJ-JRN : colonne ${nom} unique exploitable requise.`);
  return resultat[0];
}

async function schema(g) {
  const liste = dse.trouverListe(g.listes, "OBJ-JRN");
  if (!liste) throw new Error("OBJ-JRN indisponible : journalisation refusée.");
  const colonnes = await dse.collecter(g.token, `/sites/${g.siteGraphId}/lists/${liste.id}/columns`);
  if (!require("./commerce-source")._test.verifierContratJournal(colonnes)) {
    throw new Error("OBJ-JRN : contrat de journalisation incompatible.");
  }
  const champs = {
    id: champ(colonnes, "Title", "text").name,
    code: champ(colonnes, "CODE", "text").name,
    nom: champ(colonnes, "NOM", "text").name,
    action: champ(colonnes, "ACTION", "text").name,
    date: champ(colonnes, "DATEEVENEMENT", "dateTime").name,
    cle: champ(colonnes, "CLEIDEMPOTENCE", "text").name,
    statut: champ(colonnes, "STATUTJRN", "choice").name,
    nouvelle: champ(colonnes, "NOUVELLEVALEUR", "text").name,
    anomalie: champ(colonnes, "ANOMALIE", "boolean").name
  };
  const ancienne = colonnes.find((c) => !c.hidden && !c.readOnly && normaliser(c.name) === "ANCIENNEVALEUR" && c.text);
  const anomalieDetectee = colonnes.find((c) => !c.hidden && !c.readOnly &&
    normaliser(c.name) === "ANOMALIEDETECTEE" && c.boolean);
  if (ancienne) champs.ancienne = ancienne.name;
  if (anomalieDetectee) champs.anomalieDetectee = anomalieDetectee.name;
  return { liste, colonnes, champs };
}

function serialiser(valeur) {
  if (valeur === undefined) return "";
  if (typeof valeur === "string") return valeur;
  return JSON.stringify(valeur);
}

async function lireParCle(g, liste, champs, cle) {
  const filtre = `fields/${champs.cle} eq '${String(cle).replace(/'/g, "''")}'`;
  return ecriture.collecterFrais(g,
    `/sites/${g.siteGraphId}/lists/${liste.id}/items?$filter=${encodeURIComponent(filtre)}&$expand=fields($select=${champs.cle},${champs.statut})&$top=2`);
}

function creerIdentifiants(action, domaine) {
  const suffixe = crypto.randomBytes(8).toString("hex").toUpperCase();
  const utc = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const nomDomaine = (String(domaine || "COCKPIT").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48)) || "COCKPIT";
  const nomAction = (String(action || "ACTION").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 100)) || "ACTION";
  return { id: `JRN-OVH-${utc}-${suffixe}`, code: `OVH.${nomDomaine}.${nomAction}.${suffixe}` };
}

async function commencer(g, { cle, action, nom, avant, apres, domaine, contexte } = {}) {
  if (typeof cle !== "string" || !cle.trim() || cle.length > 255) {
    throw new Error("OBJ-JRN : clé d'idempotence invalide.");
  }
  const { liste, champs } = await schema(g);
  const existants = await lireParCle(g, liste, champs, cle);
  if (existants.length) {
    throw new Error("OBJ-JRN : cette clé d'idempotence existe déjà ; aucune nouvelle écriture n'est autorisée.");
  }
  const identifiants = creerIdentifiants(action, domaine);
  const date = new Date().toISOString();
  const valeurInitiale = serialiser({ etat: "DÉBUT", avant: avant ?? null, demande: apres ?? null, contexte: contexte ?? null });
  const valeurs = {
    [champs.id]: identifiants.id,
    [champs.code]: identifiants.code,
    [champs.nom]: String(nom || action || "Opération DSE").slice(0, 255),
    [champs.action]: String(action || "ACTION").slice(0, 255),
    [champs.date]: date,
    [champs.cle]: cle,
    [champs.statut]: "DÉBUT",
    [champs.nouvelle]: valeurInitiale,
    [champs.anomalie]: false
  };
  if (champs.ancienne && avant !== undefined) valeurs[champs.ancienne] = serialiser(avant);
  if (champs.anomalieDetectee) valeurs[champs.anomalieDetectee] = false;
  const item = await dse.graphEcriture(g.token, "POST",
    `/sites/${g.siteGraphId}/lists/${liste.id}/items`, { fields: valeurs });
  const id = String(item?.id || "");
  if (!id) throw new Error("OBJ-JRN : identifiant de la nouvelle entrée absent.");
  const relu = await dse.graphSansCache(g.token,
    `/sites/${g.siteGraphId}/lists/${liste.id}/items/${encodeURIComponent(id)}?$expand=fields($select=${Object.keys(valeurs).join(",")})`);
  if (!Object.entries(valeurs).every(([k, v]) => k === champs.date
    ? Number.isFinite(Date.parse(relu.fields?.[k])) && Math.abs(Date.parse(relu.fields[k]) - Date.parse(v)) < 1000
    : String(relu.fields?.[k] ?? "") === String(v))) {
    throw new Error("OBJ-JRN : relecture de l'entrée DÉBUT différente.");
  }
  return { listeId: liste.id, itemId: id, champs, idempotence: cle, action, avant, apres, contexte };
}

async function changerEtat(g, entree, statut, valeur, anomalie) {
  const chemin = `/sites/${g.siteGraphId}/lists/${entree.listeId}/items/${encodeURIComponent(entree.itemId)}`;
  const courant = await dse.graphSansCache(g.token, `${chemin}?$expand=fields($select=${entree.champs.statut},${entree.champs.nouvelle})`);
  const etag = courant?.eTag || courant?.["@odata.etag"] || courant?.fields?.["@odata.etag"];
  if (!etag) throw new Error("OBJ-JRN : version ETag absente, transition refusée.");
  const champs = {
    [entree.champs.statut]: statut,
    [entree.champs.nouvelle]: serialiser(valeur),
    [entree.champs.anomalie]: anomalie
  };
  if (entree.champs.anomalieDetectee) champs[entree.champs.anomalieDetectee] = anomalie;
  await dse.graphEcriture(g.token, "PATCH", `${chemin}/fields`, champs, etag);
  const relu = await dse.graphSansCache(g.token, `${chemin}?$expand=fields($select=${Object.keys(champs).join(",")})`);
  if (!Object.entries(champs).every(([k, v]) => relu.fields?.[k] === v)) {
    throw new Error(`OBJ-JRN : relecture de l'état ${statut} différente.`);
  }
}

async function terminer(g, entree, { statut, avant, apres, anomalie, erreur, contexte } = {}) {
  if (!entree || !ETATS_TERMINAUX.has(statut)) throw new Error("OBJ-JRN : résultat de cycle invalide.");
  const resultat = { etat: statut, avant: avant ?? null, apres: apres ?? null,
    anomalie: anomalie ? String(erreur || "Anomalie détectée").slice(0, 1000) : null,
    contexte: contexte ?? entree.contexte ?? null };
  const enErreur = statut === "ÉCHEC";
  await changerEtat(g, entree, statut, resultat, enErreur);
  await changerEtat(g, entree, "FIN", resultat, enErreur);
  return { relecture: "conforme", statut: "FIN", resultat: statut };
}

async function enregistrer(g, { cle, action, avant, apres, contexte, nom, domaine }) {
  const entree = await commencer(g, { cle, action, avant, apres, contexte, nom, domaine });
  return terminer(g, entree, { statut: "SUCCÈS", avant, apres, contexte });
}

module.exports = { commencer, terminer, enregistrer, _test: { champ, serialiser, creerIdentifiants } };
