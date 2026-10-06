"use strict";

const { champ, relations, cleChamp, vrai } = require("./catalogue");

const f = (el, nom) => champ(el, [cleChamp(nom)]);
const lien = (el, nom) => relations(el, [cleChamp(nom)])[0]?.id || null;
const actif = (el) => el && vrai(f(el, "ACTIF"));
const titre = (el) => String(f(el, "Title") || "");
const ordre = (el) => Number(f(el, "ORDRE")) || 0;
const trier = (a, b) => ordre(a) - ordre(b) || Number(a.id) - Number(b.id);
const CIBLES = { page: "OBJ-PAGES-SITE", entete: "OBJ-ENTETE-SITE", footer: "OBJ-FOOTER-SITE" };
const TYPES_VALEUR = new Set(["TEXTE", "NOMBRE", "BOOLEEN", "MEDIA"]);
const APPAREILS = ["ORDINATEUR", "TABLETTE", "MOBILE"];
const CATEGORIES = ["CONTENU", "DESIGN", "AVANCE"];

function appareilDe(valeur) {
  const appareil = f(valeur, "APPAREIL");
  if (appareil === null || appareil === undefined || appareil === "") return "";
  if (!APPAREILS.includes(appareil)) throw new Error("Appareil de valeur Builder invalide.");
  return appareil;
}

function categorieDe(definition) {
  const categorie = f(definition, "CATEGORIECHAMP");
  if (!CATEGORIES.includes(categorie)) throw new Error("Catégorie de champ Builder absente ou invalide.");
  return categorie;
}

function mediaDansSite(media, site) {
  const portee = cleChamp(relations(media, ["OBJMEDIAPORTEE"])[0]?.titre || "");
  if (portee === "GLOBAL") return true;
  if (portee === "SITE") return relations(media, ["OBJSITEPUBLIC"]).some((r) => r.id === String(site.id));
  const client = lien(site, "OBJ-CLIENT") || site.clientId;
  return portee === "CLIENT" && Boolean(client) && relations(media, ["OBJCLIENT"]).some((r) => r.id === String(client));
}

function index(d) {
  return {
    types: new Map((d.builderTypes || []).filter(actif).map((x) => [x.id, x])),
    elements: new Map((d.builderElements || []).map((x) => [x.id, x])),
    champs: new Map((d.builderChamps || []).filter(actif).map((x) => [x.id, x]))
  };
}

function trouverRacine(d, siteId, type, id) {
  if (!CIBLES[type]) return null;
  const racines = (d.builderElements || []).filter((x) => actif(x) &&
    lien(x, "OBJ-SITE-PUBLIC") === String(siteId) && lien(x, CIBLES[type]) === String(id) &&
    !lien(x, "ELEMENT-PARENT"));
  if (racines.length > 1) throw new Error("Plusieurs racines Builder actives désignent le même conteneur.");
  return racines[0] || null;
}

function racineDe(d, element) {
  const { elements } = index(d);
  const site = lien(element, "OBJ-SITE-PUBLIC");
  const attendu = lien(element, "ELEMENT-RACINE") || element.id;
  const vus = new Set();
  let courant = element;
  for (let n = 0; n < 64 && courant; n++) {
    if (vus.has(courant.id) || lien(courant, "OBJ-SITE-PUBLIC") !== site) return null;
    vus.add(courant.id);
    const parent = lien(courant, "ELEMENT-PARENT");
    if (!parent) return courant.id === attendu ? courant : null;
    if (lien(courant, "ELEMENT-RACINE") !== attendu) return null;
    courant = elements.get(parent);
  }
  return null;
}

function champsDe(d, typeId) {
  return (d.builderChamps || []).filter((x) => actif(x) && lien(x, "OBJ-BUILDER-TYPE") === typeId).sort(trier);
}

function valeurDe(d, elementId, definition, appareil = "") {
  if (appareil !== "" && !APPAREILS.includes(appareil)) throw new Error("Appareil Builder invalide.");
  const valeurs = (d.builderValeurs || []).filter((x) => actif(x) &&
    lien(x, "OBJ-BUILDER-ELEMENT") === elementId && lien(x, "OBJ-BUILDER-CHAMP") === definition.id &&
    appareilDe(x) === appareil);
  if (valeurs.length > 1) throw new Error("Valeurs Builder actives dupliquées pour une propriété.");
  const v = valeurs[0];
  if (!v) return null;
  switch (String(f(definition, "TYPE-DONNEE") || "").toUpperCase()) {
    case "NOMBRE": return f(v, "VALEUR-NOMBRE");
    case "BOOLEEN": return f(v, "VALEUR-BOOLEENNE");
    case "MEDIA": return lien(v, "OBJ-MEDIA");
    default: return f(v, "VALEUR-TEXTE");
  }
}

function enfantsDe(d, element) {
  const racine = racineDe(d, element);
  if (!racine) throw new Error("Arborescence Builder incohérente (racine, parent ou site).");
  const enfants = (d.builderElements || []).filter((x) => lien(x, "ELEMENT-PARENT") === element.id);
  if (enfants.some((x) => actif(x) && (lien(x, "OBJ-SITE-PUBLIC") !== lien(racine, "OBJ-SITE-PUBLIC") ||
    lien(x, "ELEMENT-RACINE") !== racine.id))) throw new Error("Enfant Builder rattaché à une autre racine ou un autre site.");
  return enfants.sort(trier);
}

function regleDe(d, parentType, enfantType) {
  const regles = (d.builderRegles || []).filter((r) => actif(r) &&
    lien(r, "TYPE-PARENT") === parentType && lien(r, "TYPE-ENFANT") === enfantType);
  if (regles.length > 1) throw new Error("Règles Builder actives dupliquées.");
  return regles[0] && vrai(f(regles[0], "AUTORISE")) ? regles[0] : null;
}

function verifierInsertion(d, parent, typeId, element = null) {
  const idx = index(d);
  const parentType = idx.types.get(lien(parent, "OBJ-BUILDER-TYPE"));
  if (!actif(parent) || !parentType || !vrai(f(parentType, "EST-CONTENEUR")) || !idx.types.has(typeId)) return "Conteneur ou type indisponible.";
  const regle = regleDe(d, parentType.id, typeId);
  if (!regle) return "Cette imbrication n'est pas autorisée dans SharePoint.";
  const root = racineDe(d, parent);
  if (!root) return "Racine Builder incohérente.";
  if (element) {
    const origine = racineDe(d, element);
    if (!origine || origine.id !== root.id) return "Déplacement limité à la même racine et au même site.";
    let courant = parent;
    while (courant) {
      if (courant.id === element.id) return "Un élément ne peut pas être placé dans son propre sous-arbre.";
      courant = idx.elements.get(lien(courant, "ELEMENT-PARENT"));
    }
  }
  const nombre = enfantsDe(d, parent).filter((x) => actif(x) && x.id !== element?.id && lien(x, "OBJ-BUILDER-TYPE") === typeId).length;
  const maximum = f(regle, "MAXIMUM");
  if (maximum !== null && maximum !== "" && Number.isFinite(Number(maximum)) && nombre >= Number(maximum)) return "Nombre maximal d'enfants atteint.";
  let profondeur = 1;
  let courant = parent;
  while (lien(courant, "ELEMENT-PARENT")) { profondeur++; courant = idx.elements.get(lien(courant, "ELEMENT-PARENT")); }
  const profondeurSousArbre = (x) => 1 + Math.max(0, ...enfantsDe(d, x).map(profondeurSousArbre));
  const fin = profondeur + (element ? profondeurSousArbre(element) - 1 : 0);
  const max = f(regle, "PROFONDEUR-MAX");
  if (fin >= 64 || (max !== null && max !== "" && Number(max) > 0 && fin > Number(max))) return "Profondeur maximale atteinte.";
  return null;
}

function verifierRetrait(d, element) {
  const parent = index(d).elements.get(lien(element, "ELEMENT-PARENT"));
  if (!parent) return "La racine ne peut pas être retirée.";
  const regle = regleDe(d, lien(parent, "OBJ-BUILDER-TYPE"), lien(element, "OBJ-BUILDER-TYPE"));
  const minimum = Number(regle && f(regle, "MINIMUM")) || 0;
  const restant = enfantsDe(d, parent).filter((x) => actif(x) && x.id !== element.id &&
    lien(x, "OBJ-BUILDER-TYPE") === lien(element, "OBJ-BUILDER-TYPE")).length;
  return restant < minimum ? "Nombre minimal d'enfants requis par SharePoint." : null;
}

function arbre(d, racine, { public: renduPublic = false, reference = (id) => id, mediaVisible = () => false } = {}) {
  const idx = index(d);
  const visiter = (el, profondeur) => {
    if (profondeur >= 64) throw new Error("Profondeur Builder excessive.");
    if (!actif(el) || (renduPublic && (!vrai(f(el, "VALIDE")) || f(el, "VISIBLE") === false))) return null;
    const type = idx.types.get(lien(el, "OBJ-BUILDER-TYPE"));
    if (!type) throw new Error("Type Builder actif introuvable.");
    const enfants = enfantsDe(d, el).filter(actif).map((enfant) => {
      if (!regleDe(d, type.id, lien(enfant, "OBJ-BUILDER-TYPE"))) throw new Error("Imbrication Builder non autorisée.");
      return visiter(enfant, profondeur + 1);
    }).filter(Boolean);
    const champs = champsDe(d, type.id).map((definition) => {
      const valeur = valeurDe(d, el.id, definition);
      const nature = String(f(definition, "TYPE-DONNEE") || "").toUpperCase();
      const surcharges = Object.fromEntries(APPAREILS.map((appareil) => [appareil, valeurDe(d, el.id, definition, appareil)]));
      for (const v of [valeur, ...Object.values(surcharges)]) {
        if (nature !== "MEDIA" || !v) continue;
        const media = (d.medias || []).find((m) => m.id === v);
        if (!media || !mediaVisible(media)) throw new Error("Média Builder absent ou hors périmètre.");
      }
      return {
      ref: reference(definition.id, "champ"), cle: String(f(definition, "CODE-CHAMP") || ""),
      libelle: titre(definition), nature, categorie: categorieDe(definition),
      obligatoire: vrai(f(definition, "OBLIGATOIRE")), aide: String(f(definition, "AIDE") || ""),
      valeur, surcharges
    }; });
    return { ref: reference(el.id, "element"), typeRef: reference(type.id, "type"), titre: titre(el),
      type: "builder", rendu: String(f(type, "CLE-RENDU") || "").toUpperCase(), conteneur: vrai(f(type, "EST-CONTENEUR")),
      verrouille: vrai(f(el, "VERROUILLE")), champs, enfants,
      etat: { inactif: false, brouillon: !vrai(f(el, "VALIDE")), publiable: vrai(f(el, "VALIDE")) } };
  };
  if (!racineDe(d, racine)) throw new Error("Racine Builder incohérente.");
  return visiter(racine, 0);
}

module.exports = { index, trouverRacine, racineDe, enfantsDe, regleDe, verifierInsertion, verifierRetrait, arbre,
  champsDe, valeurDe, actif, f, lien, titre, CIBLES, TYPES_VALEUR, mediaDansSite, APPAREILS, appareilDe, categorieDe };
