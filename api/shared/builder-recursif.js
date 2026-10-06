"use strict";

const { champ, relations, cleChamp, vrai } = require("./catalogue");

const f = (el, nom) => champ(el, [cleChamp(nom)]);
const lien = (el, nom) => relations(el, [cleChamp(nom)])[0]?.id || null;
const actif = (el) => el && vrai(f(el, "ACTIF"));
const titre = (el) => String(el?._fields?.Title || f(el, "Title") || f(el, "Titre") || "");
const ordre = (el) => Number(f(el, "ORDRE")) || 0;
const trier = (a, b) => ordre(a) - ordre(b) || Number(a.id) - Number(b.id);
const CIBLES = { page: "OBJ-PAGES-SITE", entete: "OBJ-ENTETE-SITE", footer: "OBJ-FOOTER-SITE", article: "OBJ-ARTICLE" };
const TYPES_VALEUR = new Set(["TEXTE", "NOMBRE", "BOOLEEN", "MEDIA"]);
const APPAREILS = ["ORDINATEUR", "TABLETTE", "MOBILE"];
const CATEGORIES = ["CONTENU", "DESIGN", "AVANCE"];
const natureDe = (definition) => {
  const nature = cleChamp(f(definition, "TYPE-DONNEE"));
  return nature === "OBJMEDIA" ? "MEDIA" : nature;
};

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
  switch (natureDe(definition)) {
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

function profondeurDe(d, element) {
  if (!racineDe(d, element)) throw new Error("Arborescence Builder incohérente.");
  let profondeur = 0, courant = element;
  const idx = index(d);
  while (lien(courant, "ELEMENT-PARENT")) {
    profondeur++;
    courant = idx.elements.get(lien(courant, "ELEMENT-PARENT"));
  }
  return profondeur;
}

function sousArbre(d, element) {
  const resultat = [], vus = new Set();
  const visiter = (el, profondeur) => {
    if (vus.has(el.id) || profondeur >= 64) throw new Error("Cycle ou profondeur Builder excessive.");
    vus.add(el.id);
    resultat.push(el);
    for (const enfant of enfantsDe(d, el).filter(actif)) visiter(enfant, profondeur + 1);
  };
  visiter(element, 0);
  return resultat;
}

function verifierComposition(d, racine) {
  for (const el of sousArbre(d, racine)) {
    const enfants = enfantsDe(d, el).filter(actif);
    const type = index(d).types.get(lien(el, "OBJ-BUILDER-TYPE"));
    if (!type) throw new Error("Type Builder indisponible.");
    if (enfants.length && !vrai(f(type, "EST-CONTENEUR"))) throw new Error("Un élément non conteneur possède des enfants.");
    for (const enfant of enfants) {
      const erreur = verifierInsertion(d, el, lien(enfant, "OBJ-BUILDER-TYPE"), enfant);
      if (erreur) throw new Error(erreur);
    }
    for (const regle of (d.builderRegles || []).filter((r) => actif(r) && vrai(f(r, "AUTORISE")) &&
      lien(r, "TYPE-PARENT") === type.id)) {
      const nombre = enfants.filter((x) => lien(x, "OBJ-BUILDER-TYPE") === lien(regle, "TYPE-ENFANT")).length;
      if (nombre < Number(f(regle, "MINIMUM") || 0)) throw new Error("Nombre minimal d'enfants requis par SharePoint.");
    }
  }
}

function regleDe(d, parentType, enfantType) {
  const regles = (d.builderRegles || []).filter((r) => actif(r) &&
    lien(r, "TYPE-PARENT") === parentType && lien(r, "TYPE-ENFANT") === enfantType);
  if (regles.length > 1) throw new Error("Règles Builder actives dupliquées.");
  return regles[0] && vrai(f(regles[0], "AUTORISE")) ? regles[0] : null;
}

function verifierInsertion(d, parent, typeId, element = null, { copie = false } = {}) {
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
  const nombre = enfantsDe(d, parent).filter((x) => actif(x) && (copie || x.id !== element?.id) && lien(x, "OBJ-BUILDER-TYPE") === typeId).length;
  const maximum = f(regle, "MAXIMUM");
  if (maximum !== null && maximum !== "" && Number.isFinite(Number(maximum)) && nombre >= Number(maximum)) return "Nombre maximal d'enfants atteint.";
  let profondeur = 1;
  let courant = parent;
  while (lien(courant, "ELEMENT-PARENT")) { profondeur++; courant = idx.elements.get(lien(courant, "ELEMENT-PARENT")); }
  const profondeurSousArbre = (x) => Math.max(...sousArbre(d, x).map((el) => profondeurDe(d, el) - profondeurDe(d, x) + 1));
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

function empreinteDe(d, racine) {
  const elements = (d.builderElements || []).filter((el) => lien(el, "ELEMENT-RACINE") === racine.id || el.id === racine.id).sort(trier);
  const etat = elements.map((el) => ({ id: el.id, parent: lien(el, "ELEMENT-PARENT"),
    site: lien(el, "OBJ-SITE-PUBLIC"), racine: lien(el, "ELEMENT-RACINE"), type: lien(el, "OBJ-BUILDER-TYPE"),
    titre: titre(el), ordre: ordre(el), profondeur: f(el, "PROFONDEUR"), actif: actif(el),
    valide: f(el, "VALIDE"), visible: f(el, "VISIBLE"), verrouille: f(el, "VERROUILLE"),
    champs: champsDe(d, lien(el, "OBJ-BUILDER-TYPE")).map((c) => ({
      id: c.id, code: f(c, "CODE-CHAMP"), categorie: categorieDe(c), nature: natureDe(c),
      valeurs: ["", ...APPAREILS].map((appareil) => valeurDe(d, el.id, c, appareil))
    })) }));
  return require("node:crypto").createHash("sha256").update(JSON.stringify(etat)).digest("hex");
}

function structureDe(d, racine, reference) {
  return (d.builderElements || []).filter((el) => lien(el, "ELEMENT-RACINE") === racine.id || el.id === racine.id).sort(trier)
    .map((el) => ({ ref: reference(el.id, "element"), parent: lien(el, "ELEMENT-PARENT") ? reference(lien(el, "ELEMENT-PARENT"), "element") : null,
      ordre: ordre(el), profondeur: Number(f(el, "PROFONDEUR") ?? profondeurDe(d, el)), actif: Boolean(actif(el)) }));
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
      const nature = natureDe(definition);
      const surcharges = Object.fromEntries(APPAREILS.map((appareil) => [appareil, valeurDe(d, el.id, definition, appareil)]));
      for (const v of [valeur, ...Object.values(surcharges)]) {
        if (nature !== "MEDIA" || !v) continue;
        const media = (d.medias || []).find((m) => m.id === v);
        if (!media || !mediaVisible(media)) throw new Error("Média Builder absent ou hors périmètre.");
      }
      const mediaTypes = Object.fromEntries([valeur, ...Object.values(surcharges)].filter(Boolean).map((id) =>
        [id, relations((d.medias || []).find((m) => m.id === id), ["OBJMEDIATYPE"])[0]?.titre || ""]));
      return {
      ref: reference(definition.id, "champ"), cle: String(f(definition, "CODE-CHAMP") || ""),
      libelle: titre(definition), nature, categorie: categorieDe(definition),
      obligatoire: vrai(f(definition, "OBLIGATOIRE")), aide: String(f(definition, "AIDE") || ""),
      valeur, surcharges, ...(nature === "MEDIA" ? { mediaTypes } : {})
    }; });
    return { ref: reference(el.id, "element"), typeRef: reference(type.id, "type"), titre: titre(el),
      type: "builder", rendu: String(f(type, "CLE-RENDU") || "").toUpperCase(), conteneur: vrai(f(type, "EST-CONTENEUR")),
      ordre: ordre(el), profondeur: profondeurDe(d, el),
      ajouts: [...idx.types.values()].filter((t) => regleDe(d, type.id, t.id)).map((t) => ({
        ref: reference(t.id, "type"), titre: titre(t)
      })),
      verrouille: vrai(f(el, "VERROUILLE")), champs, enfants,
      etat: { inactif: false, brouillon: !vrai(f(el, "VALIDE")), publiable: vrai(f(el, "VALIDE")) } };
  };
  if (!racineDe(d, racine)) throw new Error("Racine Builder incohérente.");
  const resultat = visiter(racine, 0);
  if (resultat && !renduPublic) {
    resultat.empreinte = empreinteDe(d, racine);
    resultat.structure = structureDe(d, racine, reference);
  }
  return resultat;
}

module.exports = { index, trouverRacine, racineDe, enfantsDe, regleDe, verifierInsertion, verifierRetrait, arbre,
  champsDe, valeurDe, actif, f, lien, titre, CIBLES, TYPES_VALEUR, mediaDansSite, APPAREILS, appareilDe, categorieDe,
  natureDe, profondeurDe, sousArbre, verifierComposition, empreinteDe };
