// Styles du Builder : seules des proprietes CSS explicitement autorisees sont generees. Jamais de CSS arbitraire.
// Toutes les valeurs viennent de SharePoint (presets, theme, responsive) ; ce module ne fait que les traduire.
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const POLICES = { SANS: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", SERIF: "Georgia,'Times New Roman',serif", MONO: "ui-monospace,Menlo,Consolas,monospace" };
const FAMILLE = /^[A-Za-z0-9 ]{2,40}$/;
const ALIGNEMENTS = { GAUCHE: "left", CENTRE: "center", DROITE: "right", JUSTIFIE: "justify" };
const FLEX = { DEBUT: "flex-start", CENTRE: "center", FIN: "flex-end", "ESPACE-ENTRE": "space-between", "ESPACE-AUTOUR": "space-around" };
const FLEX_ALIGNEMENT = { GAUCHE: "flex-start", CENTRE: "center", DROITE: "flex-end", JUSTIFIE: "space-between" };
const STYLE_POLICE = { NORMAL: "normal", ITALIQUE: "italic" };
const SOULIGNEMENT_STYLE = { SIMPLE: "solid", DOUBLE: "double", POINTILLES: "dotted", TIRETS: "dashed", ONDULE: "wavy" };
const TRANSFORMATION = { AUCUNE: "none", MAJUSCULES: "uppercase", MINUSCULES: "lowercase", CAPITALES: "capitalize" };
const FOND_POSITION = { CENTRE: "center", HAUT: "top", BAS: "bottom", GAUCHE: "left", DROITE: "right" };
const FOND_TAILLE = { COUVRIR: "cover", CONTENIR: "contain", AUTO: "auto" };
const FOND_REPETITION = { NON: "no-repeat", OUI: "repeat", HORIZONTALE: "repeat-x", VERTICALE: "repeat-y" };
const BORDURE_STYLE = { AUCUNE: "none", PLEINE: "solid", TIRETS: "dashed", POINTILLES: "dotted", DOUBLE: "double" };
// Requetes responsive techniques (memes seuils que la grille du Builder).
export const REQUETES = { TABLETTE: "(max-width:1024px)", MOBILE: "(max-width:640px)" };

const nb = (v, min, max) => (Number.isFinite(Number(v)) && v !== null && v !== "" && typeof v !== "boolean" ? Math.min(max, Math.max(min, Number(v))) : null);
const hex = (v) => (HEX.test(String(v || "")) ? String(v) : null);

function rgba(couleur, opacite) {
  const h = hex(couleur);
  if (!h) return null;
  if (opacite === null) return h;
  const x = h.length === 4 ? h.slice(1).split("").map((c) => c + c).join("") : h.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${Math.round(opacite) / 100})`;
}

function espaces(propriete, valeurs) {
  if (!valeurs || typeof valeurs !== "object") return [];
  return [["haut", "top"], ["bas", "bottom"], ["gauche", "left"], ["droite", "right"]]
    .map(([cle, cote]) => [cote, nb(valeurs[cle], 0, 400)])
    .filter(([, v]) => v !== null)
    .map(([cote, v]) => `${propriete}-${cote}:${v}px`);
}

const urlFond = (id, ctx) => {
  if (!/^\d{1,12}$/.test(String(id || ""))) return null;
  const base = /^[A-Za-z0-9:/._-]{0,200}$/.test(String(ctx?.apiBase ?? "")) && ctx?.apiBase ? ctx.apiBase : "/api/v1";
  return `url("${base}/media/${id}")`;
};

/* Declarations groupees : typo, fond, dim, marge, padding, bord, ombre, flex. */
export function groupes(style = {}, ctx = {}) {
  const s = style || {};
  const g = { typo: [], fond: [], dim: [], marge: [], padding: [], bord: [], ombre: [], flex: [] };

  if (hex(s.couleurTexte)) g.typo.push(`color:${s.couleurTexte}`);
  if (POLICES[s.police]) g.typo.push(`font-family:${POLICES[s.police]}`);
  else if (FAMILLE.test(String(s.policeFamille || ""))) g.typo.push(`font-family:"${s.policeFamille}",${POLICES.SANS}`);
  if (nb(s.tailleTexte, 8, 96) !== null) g.typo.push(`font-size:${nb(s.tailleTexte, 8, 96)}px`);
  if (nb(s.poidsPolice, 100, 900) !== null) g.typo.push(`font-weight:${Math.round(nb(s.poidsPolice, 100, 900) / 100) * 100}`);
  if (STYLE_POLICE[s.stylePolice]) g.typo.push(`font-style:${STYLE_POLICE[s.stylePolice]}`);
  if (typeof s.soulignement === "boolean") g.typo.push(`text-decoration-line:${s.soulignement ? "underline" : "none"}`);
  if (hex(s.soulignementCouleur)) g.typo.push(`text-decoration-color:${s.soulignementCouleur}`);
  if (SOULIGNEMENT_STYLE[s.soulignementStyle]) g.typo.push(`text-decoration-style:${SOULIGNEMENT_STYLE[s.soulignementStyle]}`);
  if (nb(s.soulignementEpaisseur, 0, 10) !== null) g.typo.push(`text-decoration-thickness:${nb(s.soulignementEpaisseur, 0, 10)}px`);
  if (nb(s.soulignementDistance, 0, 20) !== null) g.typo.push(`text-underline-offset:${nb(s.soulignementDistance, 0, 20)}px`);
  if (nb(s.hauteurLigne, 1, 3) !== null) g.typo.push(`line-height:${nb(s.hauteurLigne, 1, 3)}`);
  if (nb(s.espacementLettres, -5, 20) !== null) g.typo.push(`letter-spacing:${nb(s.espacementLettres, -5, 20)}px`);
  if (TRANSFORMATION[s.transformation]) g.typo.push(`text-transform:${TRANSFORMATION[s.transformation]}`);
  if (ALIGNEMENTS[s.alignement]) g.typo.push(`text-align:${ALIGNEMENTS[s.alignement]}`);

  const opacite = nb(s.fondOpacite, 0, 100);
  const fond = rgba(s.couleurFond, opacite);
  const image = urlFond(s.fondMedia, ctx);
  const degrade = hex(s.couleurDegrade) && hex(s.couleurFond)
    ? `linear-gradient(${nb(s.degradeAngle, 0, 360) ?? 180}deg,${fond},${rgba(s.couleurDegrade, opacite)})` : null;
  if (fond) g.fond.push(`background-color:${fond}`);
  if (image) {
    // Couleur + opacite au-dessus d'une image : voile ; sinon image seule.
    const voile = degrade || (fond && opacite !== null ? `linear-gradient(${fond},${fond})` : null);
    g.fond.push(`background-image:${voile ? `${voile},` : ""}${image}`);
    g.fond.push(`background-position:${FOND_POSITION[s.fondPosition] || "center"}`);
    g.fond.push(`background-size:${FOND_TAILLE[s.fondTaille] || "cover"}`);
    g.fond.push(`background-repeat:${FOND_REPETITION[s.fondRepetition] || "no-repeat"}`);
  } else if (degrade) g.fond.push(`background-image:${degrade}`);

  if (nb(s.largeur, 1, 100) !== null) g.dim.push(`width:${nb(s.largeur, 1, 100)}%`);
  if (nb(s.largeurMinimale, 0, 2400) !== null) g.dim.push(`min-width:${nb(s.largeurMinimale, 0, 2400)}px`);
  if (nb(s.largeurMaximale, 1, 2400) !== null) g.dim.push(`max-width:${nb(s.largeurMaximale, 1, 2400)}px`);
  if (nb(s.hauteur, 1, 4000) !== null) g.dim.push(`height:${nb(s.hauteur, 1, 4000)}px`);
  if (nb(s.hauteurMinimale, 0, 4000) !== null) g.dim.push(`min-height:${nb(s.hauteurMinimale, 0, 4000)}px`);
  if (nb(s.hauteurMaximale, 1, 4000) !== null) g.dim.push(`max-height:${nb(s.hauteurMaximale, 1, 4000)}px`);

  g.marge.push(...espaces("margin", s.marge));
  g.padding.push(...espaces("padding", s.padding));

  const largeurBord = nb(s.bordureLargeur, 0, 20);
  const styleBord = BORDURE_STYLE[s.bordureStyle];
  if (largeurBord !== null) g.bord.push(`border:${largeurBord}px ${styleBord || "solid"} ${hex(s.couleurBordure) || "currentColor"}`);
  else {
    if (styleBord) g.bord.push(`border-style:${styleBord}`);
    if (hex(s.couleurBordure)) g.bord.push(`border-color:${s.couleurBordure}`);
  }
  if (nb(s.bordureRayon, 0, 200) !== null) g.bord.push(`border-radius:${nb(s.bordureRayon, 0, 200)}px`);
  for (const [cle, cote] of [["HautGauche", "top-left"], ["HautDroite", "top-right"], ["BasDroite", "bottom-right"], ["BasGauche", "bottom-left"]]) {
    if (nb(s[`bordureRayon${cle}`], 0, 200) !== null) g.bord.push(`border-${cote}-radius:${nb(s[`bordureRayon${cle}`], 0, 200)}px`);
  }
  for (const [cle, cote] of [["Haut", "top"], ["Droite", "right"], ["Bas", "bottom"], ["Gauche", "left"]]) {
    const epaisseur = nb(s[`bordureEpaisseur${cle}`], 0, 20);
    const style = BORDURE_STYLE[s[`bordureStyle${cle}`]];
    if (epaisseur !== null) {
      g.bord.push(`border-${cote}-width:${epaisseur}px`);
      g.bord.push(`border-${cote}-style:${style || styleBord || "solid"}`);
    } else if (style) g.bord.push(`border-${cote}-style:${style}`);
    if (hex(s[`bordureCouleur${cle}`])) g.bord.push(`border-${cote}-color:${s[`bordureCouleur${cle}`]}`);
  }

  const o = s.ombre;
  if (o === false || o?.active === false) g.ombre.push("box-shadow:none");
  if (o && typeof o === "object" && o.active !== false) {
    const v = (k, min, max) => nb(o[k], min, max) ?? 0;
    // Couleur de repli technique si l'ombre est activee sans couleur.
    g.ombre.push(`box-shadow:${v("x", -100, 100)}px ${v("y", -100, 100)}px ${v("flou", 0, 200)}px ${v("etalement", -100, 100)}px ${hex(o.couleur) || "rgba(0,0,0,.2)"}`);
  }

  if (FLEX[s.justification]) g.flex.push(`justify-content:${FLEX[s.justification]}`);
  const displays = { BLOCK: "block", FLEX: "flex", GRID: "grid" };
  const directions = { ROW: "row", COLUMN: "column", "ROW-REVERSE": "row-reverse", "COLUMN-REVERSE": "column-reverse" };
  const aligns = { DEBUT: "start", CENTRE: "center", FIN: "end", STRETCH: "stretch" };
  if (displays[s.display]) g.flex.push(`display:${displays[s.display]}`);
  if (directions[s.direction]) g.flex.push(`flex-direction:${directions[s.direction]}`);
  if (s.retourLigne === true) g.flex.push("flex-wrap:wrap");
  if (s.retourLigne === false) g.flex.push("flex-wrap:nowrap");
  if (aligns[s.alignItems]) g.flex.push(`align-items:${aligns[s.alignItems]}`);
  for (const [cle, prop] of [["gap", "gap"], ["gapLigne", "row-gap"], ["gapColonne", "column-gap"]]) {
    if (nb(s[cle], 0, 400) !== null) g.flex.push(`${prop}:${nb(s[cle], 0, 400)}px`);
  }
  if (nb(s.colonnesGrille, 1, 12) !== null) g.flex.push(`grid-template-columns:repeat(${Math.round(nb(s.colonnesGrille, 1, 12))},minmax(0,1fr))`);
  if (["STATIC", "RELATIVE", "ABSOLUTE", "STICKY"].includes(s.position)) g.flex.push(`position:${s.position.toLowerCase()}`);
  if (nb(s.ordre, -100, 100) !== null) g.flex.push(`order:${Math.round(nb(s.ordre, -100, 100))}`);
  return g;
}

export function declarations(style = {}, ctx = {}) {
  const g = groupes(style, ctx);
  return [...g.typo, ...g.fond, ...g.dim, ...g.marge, ...g.padding, ...g.bord, ...g.ombre, ...g.flex];
}

export function attributStyle(style, ctx) {
  const d = declarations(style, ctx);
  return d.length ? ` style="${d.join(";")}"` : "";
}

function survol(s) {
  const v = s?.survol;
  if (!v || typeof v !== "object") return [];
  return [hex(v.couleurTexte) && `color:${v.couleurTexte}`, hex(v.couleurFond) && `background-color:${v.couleurFond}`,
    hex(v.couleurBordure) && `border-color:${v.couleurBordure}`].filter(Boolean);
}

const tout = (g) => [...g.typo, ...g.fond, ...g.dim, ...g.marge, ...g.padding, ...g.bord, ...g.ombre];

/*
 * Repartition par type d'element : quelles declarations vont sur l'enveloppe, lesquelles sur la cible interne
 * (le bouton lui-meme, l'image, le titre...). Retourne [[selecteur, declarations[]], ...].
 */
function blocs(sel, type, style, ctx) {
  const g = groupes(style, ctx);
  const s = style || {};
  const h = survol(s);
  const t = String(type || "").toUpperCase();
  const typoSeparee = ["CARTE", "LISTE-CARTES", "CTA", "FAQ", "ACCORDEON", "HERO", "IMAGE", "IMAGE-TEXTE"].includes(t) && (s.typoTitre || s.typoTexte);
  if (typoSeparee) g.typo = [];
  const r = [];
  const add = (selecteur, d) => { if (d.length) r.push([selecteur, d]); };

  if (t === "BOUTON" || t === "BOUTONS" || t === "CTA") {
    add(sel, g.marge);
    const justif = g.flex.length ? g.flex : FLEX_ALIGNEMENT[s.alignement] ? [`justify-content:${FLEX_ALIGNEMENT[s.alignement]}`] : [];
    add(`${sel} .dse-b-boutons`, justif);
    add(`${sel} .dse-b-bouton`, [...g.typo.filter((x) => !x.startsWith("text-align")), ...g.fond, ...g.dim, ...g.padding, ...g.bord, ...g.ombre]);
    add(`${sel} .dse-b-bouton:hover,${sel} .dse-b-bouton:focus-visible`, h);
  } else if (t === "TITRE") {
    add(sel, [...g.fond, ...g.dim, ...g.marge, ...g.padding, ...g.bord, ...g.ombre]);
    add(`${sel} .dse-b-titre`, g.typo);
    add(`${sel}:hover .dse-b-titre`, h.filter((x) => x.startsWith("color")));
    add(`${sel}:hover`, h.filter((x) => !x.startsWith("color")));
  } else if (t === "IMAGE" || t === "IMAGE-TEXTE") {
    add(sel, [...g.typo, ...g.fond, ...g.marge, ...g.padding]);
    if (typoSeparee) add(`${sel} figcaption`, groupes(s, ctx).typo);
    const dims = g.dim.some((x) => x.startsWith("height")) ? [...g.dim, "object-fit:cover"] : g.dim;
    add(`${sel} .dse-b-image-img`, [...dims, ...g.bord, ...g.ombre]);
    if (["GAUCHE", "CENTRE", "DROITE"].includes(s.imagePosition)) {
      add(`${sel} .dse-b-image-img`, ["display:block", `margin-left:${s.imagePosition === "GAUCHE" ? "0" : "auto"}`, `margin-right:${s.imagePosition === "DROITE" ? "0" : "auto"}`]);
    }
    add(`${sel} .dse-b-image-img:hover`, h.filter((x) => x.startsWith("border")));
    add(`${sel} .dse-b-image--contenu`, ["display:grid", "grid-template-columns:auto auto minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) auto auto", "grid-template-rows:auto auto auto minmax(0,1fr) minmax(0,1fr) auto auto auto auto", "isolation:isolate"]);
    add(`${sel} .dse-b-image-media`, ["grid-area:3/3/7/7", "min-width:0"]);
    add(`${sel} .dse-b-image-media img`, ["display:block", "max-width:100%"]);
    add(`${sel} .dse-b-image-legende`, ["grid-area:9/1/10/9"]);
    for (const [i, cle] of ["Titre", "Texte"].entries()) {
      const superpose = s[`image${cle}Mode`] === "SUPERPOSE";
      const position = s[`image${cle}Position`] || (cle === "Titre" ? "HAUT" : "BAS");
      const areas = superpose ? { HAUT: `${3 + i}/3/${4 + i}/7`, BAS: `${5 + i}/3/${6 + i}/7`, GAUCHE: `3/${3 + i}/7/${4 + i}`, DROITE: `3/${5 + i}/7/${6 + i}` }
        : { HAUT: `${1 + i}/3/${2 + i}/7`, BAS: `${7 + i}/3/${8 + i}/7`, GAUCHE: `3/${1 + i}/7/${2 + i}`, DROITE: `3/${7 + i}/7/${8 + i}` };
      const autre = cle === "Titre" ? "Texte" : "Titre";
      const autrePosition = s[`image${autre}Position`] || (autre === "Titre" ? "HAUT" : "BAS");
      if (superpose && ["GAUCHE", "DROITE"].includes(position) && s[`image${autre}Mode`] === "SUPERPOSE" && s[`image${autre}Masque`] !== true) {
        const debut = autrePosition === "HAUT" ? 5 - i : 3;
        const fin = autrePosition === "BAS" ? 6 - i : 7;
        areas.GAUCHE = `${debut}/${3 + i}/${fin}/${4 + i}`;
        areas.DROITE = `${debut}/${5 + i}/${fin}/${6 + i}`;
      }
      add(`${sel} .dse-b-image-${cle.toLowerCase()}`, [`display:${s[`image${cle}Masque`] === true ? "none" : "block"}`, `grid-area:${areas[position] || areas.BAS}`, "min-width:0", "margin:0", "padding:8px", "overflow-wrap:anywhere", `max-width:${["GAUCHE", "DROITE"].includes(position) ? "18rem" : "none"}`, `z-index:${superpose ? 1 : "auto"}`]);
    }
  } else if (["GALERIE", "CARROUSEL", "VIDEO"].includes(t)) {
    add(sel, [...g.typo, ...g.fond, ...g.dim, ...g.marge, ...g.padding]);
    add(`${sel} img,${sel} video,${sel} iframe`, [...g.bord, ...g.ombre]);
  } else if (t === "SECTION") {
    add(sel, [...g.typo, ...g.fond, ...g.dim.filter((x) => !/^(width|max-width|min-width)/.test(x)), ...g.marge, ...g.padding, ...g.bord, ...g.ombre, ...g.flex]);
    add(`${sel}>.dse-b-contenu`, g.dim.filter((x) => /^(width|max-width|min-width)/.test(x)));
    add(`${sel}:hover`, h);
  } else if (t === "LIGNE") {
    add(sel, [...tout(g), ...g.flex, ...(g.flex.length ? [] : FLEX_ALIGNEMENT[s.alignement] ? [`justify-content:${FLEX_ALIGNEMENT[s.alignement]}`] : [])]);
    add(`${sel}:hover`, h);
  } else if (t === "COLONNE") {
    add(sel, [...tout(g), ...(g.flex.length ? [...(s.display ? [] : ["display:flex", "flex-direction:column"]), ...g.flex] : [])]);
    add(`${sel}:hover`, h);
  } else if (t === "LIEN") {
    add(`${sel} a`, [...g.typo, ...g.fond, ...g.padding, ...g.bord]);
    add(`${sel} a:hover,${sel} a:focus-visible`, h);
  } else {
    add(sel, [...tout(g), ...g.flex]);
    add(`${sel}:hover`, h);
  }
  const cibles = {
    CARTE: [".dse-b-carte h3", ".dse-b-carte p"],
    "LISTE-CARTES": [".dse-b-carte h3", ".dse-b-carte p"],
    CTA: [".dse-b-cta h2", ".dse-b-cta p"],
    FAQ: [".dse-b-faq-item summary", ".dse-b-faq-item p"],
    ACCORDEON: [".dse-b-faq-item summary", ".dse-b-faq-item p"],
    HERO: [".dse-hero-title", ".dse-hero-text"],
    IMAGE: [".dse-b-image-titre", ".dse-b-image-texte"],
    "IMAGE-TEXTE": [".dse-b-image-titre", ".dse-b-image-texte"]
  };
  if (typoSeparee) for (const [i, cle] of ["typoTitre", "typoTexte"].entries()) {
    const visibilite = !["IMAGE", "IMAGE-TEXTE"].includes(t) && !(i === 0 && ["FAQ", "ACCORDEON"].includes(t)) && typeof s[cle]?.masque === "boolean"
      ? [`display:${s[cle].masque ? "none" : "block"}`] : [];
    add(`${sel} ${cibles[t][i]}`, [...groupes({ ...s, ...s[cle] }, ctx).typo, ...visibilite]);
  }
  return r;
}

const css = (liste, important = false) => liste.map(([s, d]) => `${s}{${d.map((x) => (important ? `${x} !important` : x)).join(";")}}`).join("");

/* CSS complet d'un element : base + surcharges tablette/mobile (la valeur la plus specifique gagne). */
export function cssElement(identifiant, type, style = {}, responsive = {}, ctx = {}) {
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(String(identifiant || ""))) return "";
  const sel = `.${identifiant}`;
  let sortie = css(blocs(sel, type, style, ctx));
  for (const [appareil, media] of Object.entries(REQUETES)) {
    const r = responsive?.[appareil];
    if (!r || typeof r !== "object") continue;
    const { masque, ...valeurs } = r;
    const scoped = {};
    for (const cle of ["typoTitre", "typoTexte"]) if (style[cle] || valeurs[cle]) {
      scoped[cle] = valeurs[cle] || {};
    }
    const imageDisposition = {};
    if (["IMAGE", "IMAGE-TEXTE"].includes(type)) for (const cle of ["imageTitreMode", "imageTexteMode", "imageTitrePosition", "imageTextePosition", "imageTitreMasque", "imageTexteMasque"]) imageDisposition[cle] = valeurs[cle] ?? style[cle];
    const regles = css(blocs(sel, type, { ...valeurs, ...imageDisposition, ...scoped }, ctx), true);
    if (regles) sortie += `@media ${media}{${regles}}`;
  }
  return sortie;
}

// Compatibilite : surcharges responsive seules (anciens appels).
export function reglesResponsive(identifiant, responsive = {}, type = "") {
  return cssElement(identifiant, type, {}, responsive);
}

export const aDuStyle = (style, responsive) => Boolean((style && Object.keys(style).length) || (responsive && Object.keys(responsive).some((k) => responsive[k] && Object.keys(responsive[k]).some((x) => x !== "masque"))));
