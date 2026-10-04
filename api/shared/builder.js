"use strict";

/*
 * DSE Builder : composition PURE (sans reseau) Page > Section > Ligne > Colonne > Module.
 * Les donnees arrivent de SharePoint (builder-source.js) ; les relations utilisent les ID natifs.
 * Le domaine determine le site : une page d'un autre site n'est jamais composee.
 */

const { champ, relations, vrai, cleChamp } = require("./catalogue");

const LISTES_CONTENU = {
  TITRE: "OBJ-MODULE-TITRE", TEXTE: "OBJ-MODULE-TEXTE", "TEXTE-ENRICHI": "OBJ-MODULE-TEXTE",
  BOUTON: "OBJ-MODULE-BOUTON", BOUTONS: "OBJ-MODULE-BOUTON", IMAGE: "OBJ-MODULE-IMAGE", "IMAGE-TEXTE": "OBJ-MODULE-IMAGE",
  GALERIE: "OBJ-MODULE-GALERIE", CARROUSEL: "OBJ-MODULE-CARROUSEL", VIDEO: "OBJ-MODULE-VIDEO", AUDIO: "OBJ-MODULE-AUDIO",
  DOCUMENT: "OBJ-MODULE-DOCUMENT", TELECHARGEMENT: "OBJ-MODULE-DOCUMENT", CTA: "OBJ-MODULE-CTA", CARTE: "OBJ-MODULE-CARTE",
  "LISTE-CARTES": "OBJ-MODULE-CARTE", FAQ: "OBJ-MODULE-FAQ", ACCORDEON: "OBJ-MODULE-FAQ", FORMULAIRE: "OBJ-MODULE-FORMULAIRE",
  CATALOGUE: "OBJ-MODULE-CATALOGUE", ARTICLES: "OBJ-MODULE-CATALOGUE", PRODUITS: "OBJ-MODULE-CATALOGUE",
  SERVICES: "OBJ-MODULE-CATALOGUE", COLLECTIONS: "OBJ-MODULE-CATALOGUE", FILTRES: "OBJ-MODULE-CATALOGUE",
  RECHERCHE: "OBJ-MODULE-CATALOGUE", "PRODUITS-ASSOCIES": "OBJ-MODULE-CATALOGUE", "ARTICLES-ASSOCIES": "OBJ-MODULE-CATALOGUE"
};

const LISTES_BUILDER = [
  "OBJ-PAGES-SITE", "OBJ-SECTION-SITE", "OBJ-LIGNE-SITE", "OBJ-COLONNE-SITE", "OBJ-MODULE-SITE-PUBLIC",
  "OBJ-MODULE-SITE-PUBLIC-TYPE", "OBJ-MODELE-BUILDER", "OBJ-STYLE-PRESET", "OBJ-STYLE-RESPONSIVE", "OBJ-MEDIA",
  ...new Set(Object.values(LISTES_CONTENU))
];

const TECHNIQUES = new Set(["ACTIF", "VALIDE", "VEROUILLE", "OBJACTIF", "OBJVALIDE", "OBJVEROUILLE", "ORDREAFFICHAGE",
  "OBJMODULESITEPUBLIC", "TITLE", "ID", "CONTENTTYPE"]);

const APPAREILS = ["ORDINATEUR", "TABLETTE", "MOBILE"];
const POLICES = { SANS: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", SERIF: "Georgia,'Times New Roman',serif", MONO: "ui-monospace,Menlo,Consolas,monospace" };
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const f = (el, nom) => champ(el, [cleChamp(nom)]);
const rel = (el, nom) => relations(el, [cleChamp(nom)])[0] || null;
const rels = (el, nom) => relations(el, [cleChamp(nom)]);
const nombre = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const borne = (v, min, max) => { const n = nombre(v); return n === null ? null : Math.min(max, Math.max(min, n)); };
const ordre = (el) => nombre(f(el, "ORDRE-AFFICHAGE")) ?? 0;
const parOrdre = (a, b) => ordre(a) - ordre(b) || Number(a.id) - Number(b.id);
const oui = (el, nom) => rel(el, nom)?.id === "1";
const publiable = (el) => oui(el, "OBJ-ACTIF") && oui(el, "OBJ-VALIDE");
const booleen = (el, nom, defaut) => { const v = f(el, nom); return v === null ? defaut : vrai(v); };
const indexer = (liste) => new Map((liste || []).map((e) => [e.id, e]));
const enfants = (liste, parent, nom) => (liste || []).filter((e) => rel(e, nom)?.id === parent).sort(parOrdre);

/* ---------- Styles : propriete par propriete, jamais de CSS arbitraire ---------- */

function espaces(el, prefixe) {
  const sortie = {};
  for (const [cote, cle] of [["haut", "HAUT"], ["bas", "BAS"], ["gauche", "GAUCHE"], ["droite", "DROITE"]]) {
    const v = borne(f(el, `${prefixe}-${cle}`), 0, 400);
    if (v !== null) sortie[cote] = v;
  }
  return Object.keys(sortie).length ? sortie : null;
}

function styleDepuisPreset(preset, referentiels = {}) {
  if (!preset || !publiable(preset)) return {};

  const hexDe = (nom) => {
    const id = rel(preset, nom)?.id;
    const hex = id ? f(referentiels.couleurs?.get(id), "VALEUR-HEX") : null;
    return hex && HEX.test(String(hex).trim()) ? String(hex).trim() : null;
  };
  const famille = (() => {
    const id = rel(preset, "OBJ-POLICE")?.id;
    const code = String(f(referentiels.polices?.get(id), "FAMILLE") || "").toUpperCase();
    return POLICES[code] ? code : null;
  })();
  const alignement = String(rel(preset, "ALIGNEMENT")?.titre || "").toUpperCase();

  const style = {
    couleurTexte: hexDe("OBJ-COULEUR-TEXTE"), couleurFond: hexDe("OBJ-COULEUR-FOND"), couleurBordure: hexDe("OBJ-COULEUR-BORDURE"),
    police: famille, tailleTexte: borne(f(preset, "TAILLE-TEXTE"), 8, 96), poidsPolice: borne(f(preset, "POIDS-POLICE"), 100, 900),
    hauteurLigne: borne(f(preset, "HAUTEUR-LIGNE"), 1, 3), alignement: ["GAUCHE", "CENTRE", "DROITE", "JUSTIFIE"].includes(alignement) ? alignement : null,
    largeur: borne(f(preset, "LARGEUR"), 0, 100), largeurMaximale: borne(f(preset, "LARGEUR-MAXIMALE"), 0, 2400),
    marge: espaces(preset, "MARGE"), padding: espaces(preset, "PADDING"),
    bordureLargeur: borne(f(preset, "BORDURE-LARGEUR"), 0, 20), bordureRayon: borne(f(preset, "BORDURE-RAYON"), 0, 200)
  };

  return Object.fromEntries(Object.entries(style).filter(([, v]) => v !== null));
}

function responsiveDepuisPreset(presetId, responsifs) {
  const sortie = {};
  for (const r of responsifs || []) {
    if (rel(r, "OBJ-STYLE-PRESET")?.id !== presetId || !publiable(r)) continue;
    const appareil = String(rel(r, "OBJ-APPAREIL")?.titre || "").toUpperCase();
    if (!APPAREILS.includes(appareil)) continue;

    sortie[appareil] = Object.fromEntries(Object.entries({
      largeur: borne(f(r, "LARGEUR"), 0, 100), tailleTexte: borne(f(r, "TAILLE-TEXTE"), 8, 96),
      alignement: ["GAUCHE", "CENTRE", "DROITE", "JUSTIFIE"].includes(String(rel(r, "ALIGNEMENT")?.titre || "").toUpperCase())
        ? String(rel(r, "ALIGNEMENT").titre).toUpperCase() : null,
      marge: espaces(r, "MARGE"), padding: espaces(r, "PADDING"), masque: booleen(r, "MASQUE", false) || null
    }).filter(([, v]) => v !== null));
  }
  return sortie;
}

/* ---------- Contenu ---------- */

function mediasValides(el, medias) {
  return rels(el, "OBJ-MEDIA").concat(rels(el, "OBJ-MEDIA-ICONE"), rels(el, "OBJ-MEDIA-MINIATURE"), rels(el, "OBJ-MEDIA-IMAGE"))
    .map((r) => medias.get(r.id))
    .filter((m) => m && publiable(m))
    .map((m) => ({ id: m.id, titre: m.configuration?.Title ?? null }));
}

function contenuNormalise(el, medias) {
  const champs = {};
  for (const [nom, valeur] of Object.entries(el.configuration || {})) {
    const k = cleChamp(nom);
    if (TECHNIQUES.has(k) || valeur === null || valeur === undefined || valeur === "") continue;
    if (typeof valeur === "string" && valeur.trim().toUpperCase() === "ND") continue;
    champs[k] = valeur;
  }

  const liens = {};
  for (const [nom, valeur] of Object.entries(el.relations || {})) {
    const k = cleChamp(nom);
    if (TECHNIQUES.has(k) || k.startsWith("OBJMEDIA")) continue;
    liens[k] = (Array.isArray(valeur) ? valeur : [valeur]).filter(Boolean).map((v) => ({ id: String(v.id), titre: v.titre || null }));
  }

  return { titre: f(el, "Title"), champs, relations: liens, media: mediasValides(el, medias) };
}

function contenusDuModule(module, type, donnees, medias, visible = publiable) {
  const liste = LISTES_CONTENU[type];
  if (!liste) return [];

  return (donnees.contenus?.[liste] || [])
    .filter((c) => visible(c) && rel(c, "OBJ-MODULE-SITE-PUBLIC")?.id === module.id)
    .sort(parOrdre)
    .map((c) => contenuNormalise(c, medias));
}

/* ---------- Modeles globaux : synchronisation et surcharge locale ---------- */

function modeleApplicable(module, site, modeles) {
  const modele = modeles.get(rel(module, "OBJ-MODELE-BUILDER")?.id);
  if (!modele || !publiable(modele)) return null;

  const sites = rels(modele, "OBJ-SITE-PUBLIC").map((s) => s.id);
  return sites.includes(String(site.id)) ? modele : null;
}

/* ---------- Composition ---------- */

function composerModule(module, ctx) {
  const { site, donnees, modules, types, modeles, medias, referentiels } = ctx;
  const type = String(rel(module, "OBJMODULESITEPUBLICTYPE")?.titre || "").trim().toUpperCase();
  if (!type) return null;

  const modele = modeleApplicable(module, site, modeles);
  const maitre = modele ? modules.get(rel(modele, "OBJ-MODULE-SITE-PUBLIC")?.id) : null;
  const maitreOk = maitre && maitre.id !== module.id && publiable(maitre);

  const synchro = (nom) => Boolean(maitreOk) && booleen(module, nom, false) && booleen(modele, nom, false);
  const sourceContenu = synchro("SYNCHRONISE-CONTENU") ? maitre : module;
  const sourceDesign = synchro("SYNCHRONISE-DESIGN") ? maitre : module;
  const sourceAvance = synchro("SYNCHRONISE-AVANCE") ? maitre : module;

  const presetId = rel(sourceDesign, "OBJ-STYLE-PRESET")?.id;
  const preset = presetId ? ctx.presets.get(presetId) : null;
  const responsive = presetId ? responsiveDepuisPreset(presetId, donnees.responsifs) : {};

  const visibilite = {
    ORDINATEUR: booleen(module, "VISIBLE-ORDINATEUR", true) && !responsive.ORDINATEUR?.masque,
    TABLETTE: booleen(module, "VISIBLE-TABLETTE", true) && !responsive.TABLETTE?.masque,
    MOBILE: booleen(module, "VISIBLE-MOBILE", true) && !responsive.MOBILE?.masque
  };

  const classe = String(f(sourceAvance, "CLASSE-CSS") || "");
  const ancrage = String(f(sourceAvance, "ANCRAGE-CSS") || "");

  return {
    type,
    type_connu: types.has(type),
    global: sourceContenu !== module || sourceDesign !== module || sourceAvance !== module,
    contenu: contenusDuModule(sourceContenu, type, donnees, medias, ctx.visible || publiable),
    style: styleDepuisPreset(preset, referentiels),
    responsive,
    visibilite,
    avance: {
      classe: /^[a-z][a-z0-9_-]{0,63}$/i.test(classe) ? classe : "",
      ancrage: /^[a-z][a-z0-9_-]{0,63}$/i.test(ancrage) ? ancrage : ""
    },
    _id: module.id
  };
}

function indexReferentiels(donnees) {
  return {
    couleurs: indexer(donnees.couleurs),
    polices: indexer(donnees.polices)
  };
}

function trouverPage(donnees, site, { pageId, route } = {}) {
  const pages = (donnees.pages || []).filter((p) => rels(p, "OBJ-SITE-PUBLIC").some((s) => s.id === String(site.id)));

  if (pageId) return pages.find((p) => p.id === String(pageId)) || null;

  const url = route || "/";
  return pages.find((p) => String(f(p, "URL") || "/").trim() === url) || null;
}

function contexteComposition(donnees, site) {
  return {
    site, donnees, modules: indexer(donnees.modules),
    types: new Set((donnees.types || []).filter(publiable).map((t) => String(f(t, "Title") || t?._fields?.Title || "").toUpperCase())),
    modeles: indexer(donnees.modeles), presets: indexer(donnees.presets),
    medias: indexer(donnees.medias), referentiels: indexReferentiels(donnees)
  };
}

const appareilDe = (v) => (APPAREILS.includes(String(v || "").toUpperCase()) ? String(v).toUpperCase() : null);

/*
 * Moteur commun Section > Ligne > Colonne > Module, partage par les Pages, En-tetes et Footers.
 * visible(el) : regle de filtrage (public = actif + valide ; apercu cockpit = non desactive).
 */
function composerSections(donnees, site, sectionsSource, { appareil = null, visible = publiable, ctx = null } = {}) {
  const c = { ...(ctx || contexteComposition(donnees, site)), visible };
  const sections = [];
  for (const section of sectionsSource) {
    if (!visible(section)) continue;

    const lignes = [];
    for (const ligne of enfants(donnees.lignes, section.id, "OBJ-SECTION-SITE")) {
      if (!visible(ligne)) continue;

      const structure = String(rel(ligne, "OBJ-LIGNE-STRUCTURE")?.titre || "100");
      const parts = /^\d+(?:-\d+)*$/.test(structure) ? structure.split("-").map(Number) : null;
      const colonnes = [];

      for (const [i, colonne] of enfants(donnees.colonnes, ligne.id, "OBJ-LIGNE-SITE").entries()) {
        if (!visible(colonne)) continue;

        const mods = enfants(donnees.modules, colonne.id, "OBJ-COLONNE-SITE")
          .filter(visible)
          .map((m) => composerModule(m, c))
          .filter((m) => m && (!appareil || m.visibilite[appareil]));

        const largeur = borne(f(colonne, "LARGEUR"), 1, 100) ?? (parts && parts.length > 1 ? parts[i] ?? null : 100);
        colonnes.push({
          largeur, largeurTablette: borne(f(colonne, "LARGEUR-TABLETTE"), 1, 100), largeurMobile: borne(f(colonne, "LARGEUR-MOBILE"), 1, 100),
          modules: mods
        });
      }

      lignes.push({ structure, espacement: borne(f(ligne, "ESPACEMENT-COLONNES"), 0, 120), colonnes });
    }

    sections.push({
      type: String(rel(section, "OBJ-SECTION-TYPE")?.titre || "STANDARD").toUpperCase(),
      ancrage: /^[a-z][a-z0-9_-]{0,63}$/i.test(String(f(section, "ANCRAGE") || "")) ? String(f(section, "ANCRAGE")) : "",
      lignes
    });
  }
  return sections;
}

const aDesModules = (sections) => sections.some((s) => s.lignes.some((l) => l.colonnes.some((c) => c.modules.length)));

/*
 * En-tete / Footer affecte a la page : un seul (Lookup simple), utilise seulement s'il est
 * actif + valide et rattache au meme site. Sinon le rendu historique reste en place.
 */
function composerConteneurPage(donnees, site, page, { liste, relation }, options) {
  const id = rel(page, relation)?.id;
  const el = id ? (donnees[liste] || []).find((x) => x.id === id) : null;
  if (!el || !publiable(el) || rel(el, "OBJ-SITE-PUBLIC")?.id !== String(site.id)) return null;
  const sections = composerSections(donnees, site, enfants(donnees.sections, el.id, relation), options);
  return aDesModules(sections) ? { id: el.id, sections } : null;
}

/*
 * Retourne { mode: "builder" | "historique", page, sections[], entete?, footer? }.
 * Le mode Builder n'existe que si au moins un module valide est rendu ; sinon le rendu historique reste actif.
 */
function composerPage(donnees, site, options = {}) {
  const page = trouverPage(donnees, site, options);
  if (!page || !publiable(page)) return { mode: "historique", page: null, sections: [] };

  const opts = { appareil: appareilDe(options.appareil), ctx: contexteComposition(donnees, site) };
  const sections = composerSections(donnees, site, enfants(donnees.sections, page.id, "OBJ-PAGES-SITE"), opts);
  const entete = composerConteneurPage(donnees, site, page, { liste: "entetes", relation: "OBJ-ENTETE-SITE" }, opts);
  const footer = composerConteneurPage(donnees, site, page, { liste: "footers", relation: "OBJ-FOOTER-SITE" }, opts);

  if (!aDesModules(sections) && !entete && !footer) return { mode: "historique", page: null, sections: [] };
  return { mode: "builder", page: { id: page.id }, sections: aDesModules(sections) ? sections : [], entete, footer };
}

function listerModeles(donnees, site) {
  return (donnees.modeles || [])
    .filter((m) => publiable(m) && rels(m, "OBJ-SITE-PUBLIC").some((s) => s.id === String(site.id)))
    .sort(parOrdre)
    .map((m) => ({ nom: f(m, "Title"), type: rel(m, "OBJ-MODELE-TYPE")?.titre || null, global: booleen(m, "GLOBAL", false) }));
}

function listerTypes(donnees) {
  return (donnees.types || []).filter(publiable).sort(parOrdre).map((t) => String(f(t, "Title") || "").toUpperCase()).filter(Boolean);
}

module.exports = {
  LISTES_CONTENU, LISTES_BUILDER, POLICES, APPAREILS,
  composerPage, composerSections, contexteComposition, composerModule, listerModeles, listerTypes, styleDepuisPreset, responsiveDepuisPreset, trouverPage, publiable, enfants, parOrdre
};
