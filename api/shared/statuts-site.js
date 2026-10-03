"use strict";

// Statut public d'un site : OBJ-SITE-PUBLIC -> Lookup OBJ-SITES-STATUT (ID natif) -> rendu.
// Aucune valeur propre a un domaine/client. Les codes sont ceux des statuts officiels DSE.
const LISTE_STATUTS = ["OBJ-SITES-STATUT"];
const CODES = ["CONSTRUCTION", "ACTIF", "MAINTENANCE", "SUSPENDU", "ARCHIVE"];

const cle = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Code officiel d'un statut : colonne CODE, a defaut le titre. Hors liste officielle => null.
function codeStatut(statut) {
  const c = cle(statut?.code) || cle(statut?.titre);
  return CODES.includes(c) ? c : null;
}

/*
 * site   = { statutColonne:boolean, statutId:string|null }
 * statuts = Map(id -> { id, titre, code, actif, valide }) ou null si OBJ-SITES-STATUT n'existe pas encore.
 * Retour { rendu, anomalie? } avec rendu :
 *   "transition"  structure Statut pas encore provisionnee : comportement historique (page d'accueil validee)
 *   "actif" | "construction" | "maintenance" | "suspendu" | "archive"
 *   "indisponible" statut vide/casse/inconnu : jamais le vrai site
 */
function decider(site, statuts) {
  if (!statuts || !site?.statutColonne) return { rendu: "transition" };
  if (!site.statutId) return { rendu: "indisponible", anomalie: "statut vide" };
  const statut = statuts.get(String(site.statutId));
  if (!statut) return { rendu: "indisponible", anomalie: "statut introuvable" };
  if (!statut.actif || !statut.valide) return { rendu: "indisponible", anomalie: "statut inactif" };
  const code = codeStatut(statut);
  if (!code) return { rendu: "indisponible", anomalie: "statut non reconnu" };
  return { rendu: code.toLowerCase() };
}

function dateBorne(valeur, fin = false) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const texte = String(valeur).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(texte)
    ? new Date(`${texte}T${fin ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(texte);
  return Number.isNaN(date.getTime()) ? NaN : date.getTime();
}

function periodeApplicable(site, maintenant = Date.now()) {
  const debut = dateBorne(site?.dateDebut);
  const fin = dateBorne(site?.dateFin, true);
  if (Number.isNaN(debut) || Number.isNaN(fin)) {
    return { applicable: false, anomalie: "date de publication invalide" };
  }
  if ((debut !== null && maintenant < debut) || (fin !== null && maintenant > fin)) {
    return { applicable: false, anomalie: "hors période de publication" };
  }
  return { applicable: true };
}

// Valeur exposee au front (champ "etat"). Le vrai site ne s'affiche que pour "normal".
function etatPublic(rendu, pageAccueilPrete) {
  if (rendu === "actif" || rendu === "transition") return pageAccueilPrete ? "normal" : "construction";
  return rendu;
}

module.exports = { LISTE_STATUTS, CODES, codeStatut, decider, etatPublic, periodeApplicable, cle };
