"use strict";

/*
 * DSE Builder : composition PURE (sans reseau) Page > Section > Ligne > Colonne > Module.
 * Les donnees arrivent de SharePoint (builder-source.js) ; les relations utilisent les ID natifs.
 * Le domaine determine le site : une page d'un autre site n'est jamais composee.
 */

const { champ, relations, vrai, cleChamp } = require("./catalogue");
const R = require("./builder-recursif");

const LISTES_CONTENU = {
  TITRE: "OBJ-MODULE-TITRE", TEXTE: "OBJ-MODULE-TEXTE", "TEXTE-ENRICHI": "OBJ-MODULE-TEXTE",
  BOUTON: "OBJ-MODULE-BOUTON", BOUTONS: "OBJ-MODULE-BOUTON", IMAGE: "OBJ-MODULE-IMAGE", "IMAGE-TEXTE": "OBJ-MODULE-IMAGE",
  GALERIE: "OBJ-MODULE-GALERIE", CARROUSEL: "OBJ-MODULE-CARROUSEL", VIDEO: "OBJ-MODULE-VIDEO", AUDIO: "OBJ-MODULE-AUDIO",
  DOCUMENT: "OBJ-MODULE-DOCUMENT", TELECHARGEMENT: "OBJ-MODULE-DOCUMENT", CTA: "OBJ-MODULE-CTA", CARTE: "OBJ-MODULE-CARTE",
  HERO: "OBJ-MODULE-HERO",
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
  "OBJMODULESITEPUBLIC", "TITLE", "ID", "CONTENTTYPE", "TITREOBJMODULEHERO", "IDOBJMODULEHERO"]);

const APPAREILS = ["ORDINATEUR", "TABLETTE", "MOBILE"];
const MODULES_ADAPTES_PAGE = new Set(["HERO"]);
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

const choix = (el, nom, valeurs) => { const v = String(f(el, nom) || "").trim().toUpperCase(); return valeurs.includes(v) ? v : null; };
const sansNuls = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
const ALIGNS = ["GAUCHE", "CENTRE", "DROITE", "JUSTIFIE"];
// Valeurs techniques reconnues par le generateur CSS (enumerations, pas des valeurs de design).
const CHOIX = {
  stylePolice: ["NORMAL", "ITALIQUE"], transformation: ["AUCUNE", "MAJUSCULES", "MINUSCULES", "CAPITALES"],
  fondPosition: ["CENTRE", "HAUT", "BAS", "GAUCHE", "DROITE"], fondTaille: ["COUVRIR", "CONTENIR", "AUTO"],
  fondRepetition: ["NON", "OUI", "HORIZONTALE", "VERTICALE"], bordureStyle: ["AUCUNE", "PLEINE", "TIRETS", "POINTILLES", "DOUBLE"],
  justification: ["DEBUT", "CENTRE", "FIN", "ESPACE-ENTRE", "ESPACE-AUTOUR"]
};
const alignDe = (el) => { const a = String(rel(el, "ALIGNEMENT")?.titre || "").toUpperCase(); return ALIGNS.includes(a) ? a : null; };

/*
 * Groupes de reglages Design par type d'element. Source officielle : GROUPES-DESIGN de OBJ-STYLE-TYPE ;
 * ce tableau n'est qu'un repli technique si la configuration est absente.
 */
const GROUPES = ["TYPO", "FOND", "DIMENSIONS", "ESPACEMENT", "BORDURE", "OMBRE", "ALIGNEMENT", "SURVOL"];
const GROUPES_REPLI = {
  PAGE: "FOND;DIMENSIONS;ESPACEMENT;BORDURE;OMBRE;TYPO", ENTETE: "FOND;DIMENSIONS;ESPACEMENT;BORDURE;OMBRE;TYPO",
  FOOTER: "FOND;DIMENSIONS;ESPACEMENT;BORDURE;OMBRE;TYPO", SECTION: "FOND;DIMENSIONS;ESPACEMENT;BORDURE;OMBRE;TYPO",
  LIGNE: "FOND;DIMENSIONS;ESPACEMENT;BORDURE;OMBRE;ALIGNEMENT", COLONNE: "FOND;DIMENSIONS;ESPACEMENT;BORDURE;OMBRE;ALIGNEMENT",
  TITRE: "TYPO;FOND;ESPACEMENT;BORDURE;DIMENSIONS", TEXTE: "TYPO;FOND;ESPACEMENT;BORDURE;DIMENSIONS",
  IMAGE: "DIMENSIONS;ESPACEMENT;BORDURE;OMBRE;ALIGNEMENT", BOUTON: "TYPO;FOND;DIMENSIONS;ESPACEMENT;BORDURE;OMBRE;ALIGNEMENT;SURVOL",
  ICONE: "TYPO;ESPACEMENT;ALIGNEMENT;SURVOL", GALERIE: "DIMENSIONS;ESPACEMENT;BORDURE;OMBRE", VIDEO: "DIMENSIONS;ESPACEMENT;BORDURE;OMBRE",
  GLOBAL: "TYPO;FOND", LIEN: "TYPO;SURVOL"
};
// Type de module -> type de style (un module sans correspondance garde son propre code).
const TYPE_STYLE = { "TEXTE-ENRICHI": "TEXTE", BOUTONS: "BOUTON", CTA: "BOUTON", "IMAGE-TEXTE": "IMAGE", CARROUSEL: "GALERIE" };
const typeStyle = (type) => TYPE_STYLE[String(type || "").toUpperCase()] || String(type || "").toUpperCase();

function groupesDesign(donnees, type) {
  const code = typeStyle(type);
  const t = (donnees?.styleTypes || []).find((x) => String(f(x, "CODE") || f(x, "Title") || "").toUpperCase() === code && !inactifEl(x));
  const brut = String((t && f(t, "GROUPES-DESIGN")) || GROUPES_REPLI[code] || "TYPO;FOND;DIMENSIONS;ESPACEMENT;BORDURE;OMBRE;ALIGNEMENT");
  return brut.toUpperCase().split(/[;,\s]+/).filter((g) => GROUPES.includes(g));
}
const inactifEl = (el) => rel(el, "OBJ-ACTIF")?.id === "2" || rel(el, "OBJ-VALIDE")?.id === "2";

/* Valeurs PROPRES d'un preset (sans heritage). */
function styleDepuisPreset(preset, referentiels = {}) {
  if (!preset || !publiable(preset)) return {};

  const hexDe = (nom) => {
    const id = rel(preset, nom)?.id;
    const hex = id ? f(referentiels.couleurs?.get(id), "VALEUR-HEX") : null;
    return hex && HEX.test(String(hex).trim()) ? String(hex).trim() : null;
  };
  let police = null;
  let policeFamille = null;
  const p = referentiels.polices?.get(rel(preset, "OBJ-POLICE")?.id);
  if (p) {
    const fam = String(f(p, "FAMILLE") || f(p, "CODE") || "").trim();
    if (POLICES[fam.toUpperCase()]) police = fam.toUpperCase();
    else if (/^[A-Za-z0-9 ]{2,40}$/.test(fam)) policeFamille = fam;
  }
  const mediaId = rel(preset, "OBJ-MEDIA-ARRIERE-PLAN")?.id;
  const media = mediaId ? referentiels.medias?.get(mediaId) : null;
  const ombreActive = booleen(preset, "OMBRE", false);
  const survol = sansNuls({ couleurTexte: hexDe("OBJ-COULEUR-TEXTE-SURVOL"), couleurFond: hexDe("OBJ-COULEUR-FOND-SURVOL"), couleurBordure: hexDe("OBJ-COULEUR-BORDURE-SURVOL") });

  return sansNuls({
    couleurTexte: hexDe("OBJ-COULEUR-TEXTE"), couleurFond: hexDe("OBJ-COULEUR-FOND"), couleurBordure: hexDe("OBJ-COULEUR-BORDURE"),
    police, policeFamille, tailleTexte: borne(f(preset, "TAILLE-TEXTE"), 8, 96), poidsPolice: borne(f(preset, "POIDS-POLICE"), 100, 900),
    hauteurLigne: borne(f(preset, "HAUTEUR-LIGNE"), 1, 3), alignement: alignDe(preset),
    stylePolice: choix(preset, "STYLE-POLICE", CHOIX.stylePolice),
    espacementLettres: borne(f(preset, "ESPACEMENT-LETTRES"), -5, 20),
    transformation: choix(preset, "TRANSFORMATION-TEXTE", CHOIX.transformation),
    fondMedia: media && (referentiels.mediaVisible || publiable)(media) ? String(media.id) : null,
    fondPosition: choix(preset, "FOND-POSITION", CHOIX.fondPosition),
    fondTaille: choix(preset, "FOND-TAILLE", CHOIX.fondTaille),
    fondRepetition: choix(preset, "FOND-REPETITION", CHOIX.fondRepetition),
    fondOpacite: borne(f(preset, "FOND-OPACITE"), 0, 100),
    couleurDegrade: hexDe("OBJ-COULEUR-DEGRADE"), degradeAngle: borne(f(preset, "DEGRADE-ANGLE"), 0, 360),
    largeur: borne(f(preset, "LARGEUR"), 0, 100), largeurMaximale: borne(f(preset, "LARGEUR-MAXIMALE"), 0, 2400),
    largeurMinimale: borne(f(preset, "LARGEUR-MINIMALE"), 0, 2400), hauteur: borne(f(preset, "HAUTEUR"), 0, 4000),
    hauteurMinimale: borne(f(preset, "HAUTEUR-MINIMALE"), 0, 4000), hauteurMaximale: borne(f(preset, "HAUTEUR-MAXIMALE"), 0, 4000),
    marge: espaces(preset, "MARGE"), padding: espaces(preset, "PADDING"),
    bordureLargeur: borne(f(preset, "BORDURE-LARGEUR"), 0, 20), bordureRayon: borne(f(preset, "BORDURE-RAYON"), 0, 200),
    bordureStyle: choix(preset, "BORDURE-STYLE", CHOIX.bordureStyle),
    ombre: ombreActive ? sansNuls({ x: borne(f(preset, "OMBRE-X"), -100, 100), y: borne(f(preset, "OMBRE-Y"), -100, 100),
      flou: borne(f(preset, "OMBRE-FLOU"), 0, 200), etalement: borne(f(preset, "OMBRE-ETALEMENT"), -100, 100), couleur: hexDe("OBJ-COULEUR-OMBRE") }) : null,
    survol: Object.keys(survol).length ? survol : null,
    justification: choix(preset, "JUSTIFICATION", CHOIX.justification)
  });
}

function responsiveDepuisPreset(presetId, responsifs, referentiels = {}) {
  const sortie = {};
  for (const r of responsifs || []) {
    if (rel(r, "OBJ-STYLE-PRESET")?.id !== presetId || !publiable(r)) continue;
    const appareil = String(rel(r, "OBJ-APPAREIL")?.titre || "").toUpperCase();
    if (!APPAREILS.includes(appareil)) continue;
    const hexDe = (nom) => {
      const hex = f(referentiels.couleurs?.get(rel(r, nom)?.id), "VALEUR-HEX");
      return hex && HEX.test(String(hex).trim()) ? String(hex).trim() : null;
    };

    sortie[appareil] = sansNuls({
      largeur: borne(f(r, "LARGEUR"), 0, 100), tailleTexte: borne(f(r, "TAILLE-TEXTE"), 8, 96), alignement: alignDe(r),
      marge: espaces(r, "MARGE"), padding: espaces(r, "PADDING"), masque: booleen(r, "MASQUE", false) || null,
      couleurTexte: hexDe("OBJ-COULEUR-TEXTE"), couleurFond: hexDe("OBJ-COULEUR-FOND"),
      hauteurMinimale: borne(f(r, "HAUTEUR-MINIMALE"), 0, 4000), bordureRayon: borne(f(r, "BORDURE-RAYON"), 0, 200),
      largeurMaximale: borne(f(r, "LARGEUR-MAXIMALE"), 0, 2400)
    });
  }
  return sortie;
}

// Fusion : la valeur la plus specifique gagne ; les objets (marge, padding, ombre, survol) se fusionnent cote par cote.
function fusionner(base, ajout) {
  const r = { ...base };
  for (const [k, v] of Object.entries(ajout || {})) {
    r[k] = v && typeof v === "object" && r[k] && typeof r[k] === "object" ? { ...r[k], ...v } : v;
  }
  return r;
}

const presetDuSite = (preset, site) => {
  const s = rel(preset, "OBJ-SITE-PUBLIC")?.id;
  return Boolean(preset) && publiable(preset) && (!s || s === String(site?.id));
};

// Chaine d'heritage : racine -> ... -> preset (PRESET-PARENT, profondeur bornee, sans boucle).
function chainePresets(presetId, ctx) {
  const chaine = [];
  const vus = new Set();
  let id = presetId;
  while (id && !vus.has(id) && chaine.length < 6) {
    vus.add(id);
    const p = ctx.presets.get(id);
    if (!presetDuSite(p, ctx.site)) break;
    chaine.unshift(p);
    id = rel(p, "PRESET-PARENT")?.id;
  }
  return chaine;
}

/* Theme du site : type de style -> preset (OBJ-SITE-THEME, relation au site par la colonne titre Lookup). */
function indexTheme(donnees, site) {
  const codes = new Map((donnees.styleTypes || []).map((t) => [t.id, String(f(t, "CODE") || f(t, "Title") || "").toUpperCase()]));
  const theme = new Map();
  for (const t of donnees.themes || []) {
    const s = rel(t, "Titre OBJ-SITE-THEME")?.id;
    if (s !== String(site?.id) || rel(t, "OBJ-THEME")?.id === "2" || !oui(t, "OBJ-VALIDE")) continue;
    const code = codes.get(rel(t, "OBJ-STYLE-TYPE")?.id);
    const preset = rel(t, "OBJ-STYLE-PRESET")?.id;
    if (code && preset && !theme.has(code)) theme.set(code, preset);
  }
  return theme;
}

/*
 * Style resolu d'un element : THEME SITE (type) -> PRESET (heritage) -> STYLE ELEMENT -> SURCHARGE RESPONSIVE.
 * Retourne { style, responsive, propre } ; propre = valeurs du seul preset de l'element.
 */
function styleResolu(ctx, type, presetId) {
  const chaine = [];
  const themeId = ctx.theme?.get(typeStyle(type));
  for (const p of [...chainePresets(themeId, ctx), ...chainePresets(presetId, ctx)]) if (!chaine.includes(p)) chaine.push(p);
  let style = {};
  const responsive = {};
  for (const p of chaine) {
    style = fusionner(style, styleDepuisPreset(p, ctx.referentiels));
    for (const [a, v] of Object.entries(responsiveDepuisPreset(p.id, ctx.donnees.responsifs, ctx.referentiels))) responsive[a] = fusionner(responsive[a] || {}, v);
  }
  return { style, responsive };
}

const styleElement = (ctx, type, el) => styleResolu(ctx, type, rel(el, "OBJ-STYLE-PRESET")?.id);

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
  const { site, donnees, modules, types, modeles, medias } = ctx;
  const type = String(rel(module, "OBJMODULESITEPUBLICTYPE")?.titre || "").trim().toUpperCase();
  if (!type) return null;

  const modele = modeleApplicable(module, site, modeles);
  const maitre = modele ? modules.get(rel(modele, "OBJ-MODULE-SITE-PUBLIC")?.id) : null;
  const maitreOk = maitre && maitre.id !== module.id && publiable(maitre);

  const synchro = (nom) => Boolean(maitreOk) && booleen(module, nom, false) && booleen(modele, nom, false);
  const sourceContenu = synchro("SYNCHRONISE-CONTENU") ? maitre : module;
  const sourceDesign = synchro("SYNCHRONISE-DESIGN") ? maitre : module;
  const sourceAvance = synchro("SYNCHRONISE-AVANCE") ? maitre : module;

  const { style, responsive } = styleResolu(ctx, type, rel(sourceDesign, "OBJ-STYLE-PRESET")?.id);

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
    style,
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
    polices: indexer(donnees.polices),
    medias: indexer(donnees.medias)
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
    medias: indexer(donnees.medias), referentiels: indexReferentiels(donnees), theme: indexTheme(donnees, site)
  };
}

const appareilDe = (v) => (APPAREILS.includes(String(v || "").toUpperCase()) ? String(v).toUpperCase() : null);

/*
 * Moteur commun Section > Ligne > Colonne > Module, partage par les Pages, En-tetes et Footers.
 * visible(el) : regle de filtrage (public = actif + valide ; apercu cockpit = non desactive).
 */
function composerSections(donnees, site, sectionsSource, { appareil = null, visible = publiable, ctx = null } = {}) {
  const base = ctx || contexteComposition(donnees, site);
  const c = { ...base, visible, referentiels: { ...base.referentiels, mediaVisible: visible } };
  const design = (type, el) => {
    const { style, responsive } = styleElement(c, type, el);
    return { style, responsive, _id: el.id };
  };
  const masque = (d) => appareil && d.responsive[appareil]?.masque;
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
        const dc = design("COLONNE", colonne);
        if (masque(dc)) continue;
        colonnes.push({
          largeur, largeurTablette: borne(f(colonne, "LARGEUR-TABLETTE"), 1, 100), largeurMobile: borne(f(colonne, "LARGEUR-MOBILE"), 1, 100),
          modules: mods, ...dc
        });
      }

      const dl = design("LIGNE", ligne);
      if (masque(dl)) continue;
      lignes.push({ structure, espacement: borne(f(ligne, "ESPACEMENT-COLONNES"), 0, 120), colonnes, ...dl });
    }

    const ds = design("SECTION", section);
    if (masque(ds)) continue;
    sections.push({
      type: String(rel(section, "OBJ-SECTION-TYPE")?.titre || "STANDARD").toUpperCase(),
      ancrage: /^[a-z][a-z0-9_-]{0,63}$/i.test(String(f(section, "ANCRAGE") || "")) ? String(f(section, "ANCRAGE")) : "",
      lignes, ...ds
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
  const ctx = options.ctx || contexteComposition(donnees, site);
  const root = R.trouverRacine(donnees, site.id, relation === "OBJ-ENTETE-SITE" ? "entete" : "footer", el.id);
  if (root) {
    const noeud = R.arbre(donnees, root, { public: true, reference: () => "",
      mediaVisible: (m) => publiable(m) && R.mediaDansSite(m, site) });
    return noeud ? { sections: [], noeuds: [noeud], ...styleElement(ctx, relation === "OBJ-ENTETE-SITE" ? "ENTETE" : "FOOTER", el) } : null;
  }
  return aDesModules(sections) ? { id: el.id, sections, ...styleElement(ctx, relation === "OBJ-ENTETE-SITE" ? "ENTETE" : "FOOTER", el) } : null;
}

/*
 * Les anciens modules adaptés peuvent être rattachés directement à une page, sans
 * hiérarchie Section > Ligne > Colonne. On les projette en mémoire seulement si la
 * page n'a pas de racine récursive et si le module n'est pas déjà dans ses sections.
 */
function composerModulesAdaptesPage(donnees, site, page, sections, options) {
  const base = options.ctx || contexteComposition(donnees, site);
  const visible = options.visible || publiable;
  const ctx = { ...base, visible, referentiels: { ...base.referentiels, mediaVisible: visible } };
  const dejaComposes = new Set(sections.flatMap((s) =>
    s.lignes.flatMap((l) => l.colonnes.flatMap((c) => c.modules.map((m) => m._id)))
  ));
  const modules = (donnees.modules || [])
    .filter((m) => visible(m) &&
      rel(m, "OBJ-PAGES-SITE")?.id === page.id &&
      MODULES_ADAPTES_PAGE.has(String(rel(m, "OBJMODULESITEPUBLICTYPE")?.titre || "").trim().toUpperCase()) &&
      !dejaComposes.has(m.id))
    .sort(parOrdre)
    .map((m) => composerModule(m, ctx))
    .filter((m) => m && (!options.appareil || m.visibilite[options.appareil]));
  if (!modules.length) return sections;

  return [{
    type: "STANDARD", ancrage: "", lignes: [{
      structure: "100", espacement: null, colonnes: [{ largeur: 100, largeurTablette: null, largeurMobile: null, modules }]
    }]
  }, ...sections];
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
  const root = R.trouverRacine(donnees, site.id, "page", page.id);
  if (root) {
    const noeud = R.arbre(donnees, root, { public: true, reference: () => "",
      mediaVisible: (m) => publiable(m) && R.mediaDansSite(m, site) });
    if (noeud) return { mode: "builder", page: { ...styleElement(opts.ctx, "PAGE", page) },
      sections: [], noeuds: [noeud], entete, footer, theme: themeGlobal(opts.ctx) };
  }

  const sectionsComposees = composerModulesAdaptesPage(donnees, site, page, sections, opts);

  if (!aDesModules(sectionsComposees) && !entete && !footer) return { mode: "historique", page: null, sections: [] };
  return { mode: "builder", page: { id: page.id, ...styleElement(opts.ctx, "PAGE", page) }, sections: aDesModules(sectionsComposees) ? sectionsComposees : [], entete, footer,
    theme: themeGlobal(opts.ctx) };
}

/* Styles globaux du theme (GLOBAL sur la racine, LIEN sur les liens) : uniquement s'ils sont configures. */
function themeGlobal(ctx) {
  const sortie = {};
  for (const code of ["GLOBAL", "LIEN"]) {
    if (!ctx.theme?.has(code)) continue;
    const r = styleResolu(ctx, code, null);
    if (Object.keys(r.style).length || Object.keys(r.responsive).length) sortie[code] = r;
  }
  return sortie;
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

module.exports = { CHOIX, ALIGNS,
  LISTES_CONTENU, LISTES_BUILDER, POLICES, APPAREILS,
  composerPage, composerSections, contexteComposition, composerModule, listerModeles, listerTypes, styleDepuisPreset, responsiveDepuisPreset, trouverPage, publiable, enfants, parOrdre,
  composerModulesAdaptesPage, styleResolu, styleElement, themeGlobal, groupesDesign, typeStyle, chainePresets, presetDuSite, GROUPES, GROUPES_REPLI
};
