"use strict";

// Statut public d'un site : OBJ-SITE-PUBLIC -> Lookup OBJ-SITES-STATUT (ID natif) -> rendu.
// Une seule regle est connue du code : le statut ACTIF affiche le vrai site.
// Tout autre statut SharePoint (y compris futur) produit une "situation" generique
// alimentee par les champs de l'element de statut.
const LISTE_STATUTS = ["OBJ-SITES-STATUT"];
const CODE_ACTIF = "ACTIF";
const MOTS_MEDIA = ["IMAGE", "MEDIA", "FOND", "PHOTO"];

const cle = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Code d'un statut : colonne CODE, a defaut le titre. Aucune liste fermee.
function codeStatut(statut) {
  return cle(statut?.code) || cle(statut?.titre) || null;
}

const texte = (v) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t && t.toUpperCase() !== "ND" ? t : null;
};

/*
 * Media d'un element SharePoint, resolu generiquement :
 * - Lookup vers OBJ-MEDIA (ID natif) => route publique /api/v1/media/:id ;
 * - sinon colonne lien/image dont le nom evoque un media.
 * motsCles restreint les colonnes candidates (ex. ["SITUATION"] pour un site).
 */
function mediaElement(colonnes, fields, mediaListId, motsCles = null) {
  const accepte = (c) => {
    const k = cle(c.displayName || c.name);
    return !motsCles || motsCles.some((m) => k.includes(m));
  };
  for (const c of colonnes || []) {
    if (!mediaListId || !c.lookup || String(c.lookup.listId || "").replace(/[{}]/g, "").toLowerCase() !== mediaListId || !accepte(c)) continue;
    const brut = fields?.[`${c.name}LookupId`] ?? fields?.[c.name];
    const id = String((Array.isArray(brut) ? brut[0]?.LookupId : brut?.LookupId ?? brut) ?? "").trim();
    if (/^[0-9]{1,9}$/.test(id)) return { url: `/api/v1/media/${id}`, mediaId: id };
  }
  for (const c of colonnes || []) {
    if (!(c.hyperlinkOrPicture || c.thumbnail) || !accepte(c)) continue;
    if (!MOTS_MEDIA.some((m) => cle(c.displayName || c.name).includes(m))) continue;
    const v = fields?.[c.name];
    const url = String((v && typeof v === "object" ? v.Url ?? v.url ?? (v.serverUrl ? `${v.serverUrl}${v.serverRelativeUrl || ""}` : null) : v) ?? "").trim();
    if (/^https:\/\//i.test(url)) return { url };
  }
  return null;
}

// Donnees publiques d'une situation : uniquement ce que SharePoint fournit.
function situationPublique(statut) {
  if (!statut) return null;
  return {
    statutId: statut.id != null ? String(statut.id) : null,
    code: codeStatut(statut),
    titre: texte(statut.titre),
    texte: texte(statut.noteCourte),
    details: texte(statut.noteLongue),
    media: statut.media || null
  };
}

/*
 * site   = { statutColonne:boolean, statutId:string|null }
 * statuts = Map(id -> { id, titre, code, noteCourte, noteLongue, media, actif, valide }) ou null.
 * Retour { rendu, situation?, anomalie? } avec rendu :
 *   "transition"   structure Statut pas encore provisionnee : comportement historique
 *   "actif"        vrai site
 *   "situation"    tout autre statut valide : page generique Situation du site
 *   "indisponible" statut vide/casse/inactif : page generique neutre, jamais le vrai site
 */
function decider(site, statuts) {
  if (!statuts || !site?.statutColonne) return { rendu: "transition" };
  if (!site.statutId) return { rendu: "indisponible", anomalie: "statut vide" };
  const statut = statuts.get(String(site.statutId));
  if (!statut) return { rendu: "indisponible", anomalie: "statut introuvable" };
  if (!statut.actif || !statut.valide) return { rendu: "indisponible", anomalie: "statut inactif" };
  const code = codeStatut(statut);
  if (!code) return { rendu: "indisponible", anomalie: "statut non reconnu" };
  if (code === CODE_ACTIF) return { rendu: "actif" };
  return { rendu: "situation", situation: situationPublique(statut) };
}

function dateBorne(valeur, fin = false) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const t = String(valeur).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(t)
    ? new Date(`${t}T${fin ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(t);
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

const afficheVraiSite = (rendu) => rendu === "actif" || rendu === "transition";

// Valeur exposee au front (champ "etat") : "normal" (vrai site) ou "situation" (page generique).
function etatPublic(rendu, pageAccueilPrete) {
  return afficheVraiSite(rendu) && pageAccueilPrete ? "normal" : "situation";
}

module.exports = {
  LISTE_STATUTS, CODE_ACTIF, codeStatut, decider, situationPublique, mediaElement,
  afficheVraiSite, etatPublic, periodeApplicable, cle
};
