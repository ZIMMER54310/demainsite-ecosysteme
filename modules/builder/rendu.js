// Rendu du DSE Builder (pur, sans DOM) : section > ligne > colonne > module.
// Le rendu ne montre jamais d'ID SharePoint ni d'information technique ; un element vide ne produit aucune sortie.
import { escapeHtml } from "../public/outils.js";
import { attributStyle, reglesResponsive } from "./styles.js";
import { rendreTitre } from "../titre/titre.js";
import { rendreTexte } from "../texte/texte.js";
import { rendreBouton } from "../bouton/bouton.js";
import { rendreImage } from "../image/image.js";
import { rendreGalerie } from "../galerie/galerie.js";
import { rendreVideo } from "../video/video.js";
import { rendreAudio } from "../audio/audio.js";
import { rendreDocument } from "../document/document.js";
import { rendreCta } from "../cta/cta.js";
import { rendreFaq } from "../faq/faq.js";
import { rendreCarte } from "../carte/carte.js";
import { rendreCarrousel } from "../carrousel/carrousel.js";
import { rendreFormulaire } from "../formulaire/formulaire.js";

const MODULES = {
  TITRE: rendreTitre, TEXTE: rendreTexte, "TEXTE-ENRICHI": rendreTexte, BOUTON: rendreBouton, BOUTONS: rendreBouton,
  IMAGE: rendreImage, "IMAGE-TEXTE": rendreImage, GALERIE: rendreGalerie, CARROUSEL: rendreCarrousel, VIDEO: rendreVideo,
  AUDIO: rendreAudio, DOCUMENT: rendreDocument, TELECHARGEMENT: rendreDocument, CTA: rendreCta, CARTE: rendreCarte,
  "LISTE-CARTES": rendreCarte, FAQ: rendreFaq, ACCORDEON: rendreFaq, FORMULAIRE: rendreFormulaire
};

const CATALOGUES = {
  CATALOGUE: "tous", ARTICLES: "articles", PRODUITS: "produits", SERVICES: "services", COLLECTIONS: "collections",
  FILTRES: "tous", RECHERCHE: "tous", "PRODUITS-ASSOCIES": "produits", "ARTICLES-ASSOCIES": "articles"
};

// Modules deja geres par les moteurs existants : adaptateurs fournis par la page (HERO, FOOTER, HEADER...).
const ADAPTES = new Set(["HERO", "FOOTER", "HEADER", "NAVIGATION"]);

export function rendreModule(module, ctx = {}) {
  if (!module?.type) return "";
  let interieur = "";

  if (ADAPTES.has(module.type)) interieur = ctx.adapteurs?.[module.type]?.(module) || "";
  else if (CATALOGUES[module.type]) {
    // Monte ensuite par le moteur catalogue existant (filtres + recherche inclus).
    interieur = `<section class="dse-catalogue" data-dse-catalogue-builder="${CATALOGUES[module.type]}" aria-label="Catalogue" hidden></section>`;
  } else if (MODULES[module.type]) interieur = MODULES[module.type](module.contenu || [], ctx);

  if (!String(interieur).trim()) return "";

  const identifiant = `dse-b-m${ctx.compteur ? ctx.compteur() : 0}`;
  const v = module.visibilite || {};
  const classes = ["dse-b-module", `dse-b-module--${String(module.type).toLowerCase()}`, identifiant,
    v.ORDINATEUR === false ? "dse-b-cache-ordinateur" : "", v.TABLETTE === false ? "dse-b-cache-tablette" : "",
    v.MOBILE === false ? "dse-b-cache-mobile" : "", module.avance?.classe || ""].filter(Boolean);
  const ancre = module.avance?.ancrage ? ` id="${escapeHtml(module.avance.ancrage)}"` : "";
  const regles = reglesResponsive(identifiant, module.responsive);

  return `${regles ? `<style>${regles}</style>` : ""}<div class="${escapeHtml(classes.join(" "))}"${ancre}${attributStyle(module.style)}>${interieur}</div>`;
}

export function rendreColonne(colonne, ctx) {
  const modules = (colonne.modules || []).map((m) => rendreModule(m, ctx)).filter(Boolean).join("");
  if (!modules) return "";
  const largeur = Number(colonne.largeur) > 0 ? Math.min(100, Number(colonne.largeur)) : 100;
  const tablette = Number(colonne.largeurTablette) > 0 ? Math.min(100, Number(colonne.largeurTablette)) : "";
  const mobile = Number(colonne.largeurMobile) > 0 ? Math.min(100, Number(colonne.largeurMobile)) : 100;
  return `<div class="dse-b-colonne" style="--dse-b-l:${largeur};--dse-b-lt:${tablette || largeur};--dse-b-lm:${mobile}">${modules}</div>`;
}

export function rendreLigne(ligne, ctx) {
  const colonnes = (ligne.colonnes || []).map((c) => rendreColonne(c, ctx)).filter(Boolean).join("");
  if (!colonnes) return "";
  const espace = Number(ligne.espacement) >= 0 && ligne.espacement !== null ? ` style="--dse-b-espace:${Math.min(120, Number(ligne.espacement))}px"` : "";
  return `<div class="dse-b-ligne"${espace}>${colonnes}</div>`;
}

export function rendreSection(section, ctx) {
  const lignes = (section.lignes || []).map((l) => rendreLigne(l, ctx)).filter(Boolean).join("");
  if (!lignes) return "";
  const type = String(section.type || "STANDARD").toLowerCase().replace(/[^a-z-]/g, "");
  const ancre = section.ancrage ? ` id="${escapeHtml(section.ancrage)}"` : "";
  return `<section class="dse-b-section dse-b-section--${type}"${ancre}><div class="dse-b-contenu">${lignes}</div></section>`;
}

// Retourne "" si aucune composition Builder valide : la page conserve alors son rendu historique.
export function rendreBuilder(composition, ctx = {}) {
  if (composition?.mode !== "builder") return "";
  let n = 0;
  const contexte = { ...ctx, compteur: () => ++n };
  const html = (composition.sections || []).map((s) => rendreSection(s, contexte)).filter(Boolean).join("");
  return html ? `<div class="dse-builder">${html}</div>` : "";
}

export const STYLES_BUILDER = `
.dse-builder{display:block}.dse-b-section{padding:clamp(24px,5vw,64px) 16px}.dse-b-section--pleine-largeur{padding-left:0;padding-right:0}
.dse-b-contenu{max-width:1200px;margin:0 auto}.dse-b-section--pleine-largeur>.dse-b-contenu{max-width:none}
.dse-b-ligne{display:flex;flex-wrap:wrap;gap:var(--dse-b-espace,24px)}
.dse-b-colonne{flex:0 0 calc(var(--dse-b-l)*1% - var(--dse-b-espace,24px));min-width:0;max-width:100%}
@media(max-width:1024px){.dse-b-colonne{flex-basis:calc(var(--dse-b-lt)*1% - var(--dse-b-espace,24px))}.dse-b-cache-tablette{display:none}}
@media(max-width:640px){.dse-b-colonne{flex-basis:calc(var(--dse-b-lm)*1%)}.dse-b-cache-mobile{display:none}}
@media(min-width:1025px){.dse-b-cache-ordinateur{display:none}}
.dse-b-module img,.dse-b-module video{max-width:100%;height:auto}
.dse-b-galerie{display:grid;grid-template-columns:repeat(var(--dse-b-colonnes,3),1fr);gap:12px}
@media(max-width:640px){.dse-b-galerie{grid-template-columns:repeat(2,1fr)}}
.dse-b-carrousel{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:12px}.dse-b-carrousel img{scroll-snap-align:start;flex:0 0 85%}
.dse-b-cartes{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.dse-b-bouton{display:inline-block;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600}
.dse-b-bouton--principal{background:#1f4fd8;color:#fff}.dse-b-bouton--secondaire{border:1px solid currentColor}
.dse-b-boutons{display:flex;gap:12px;flex-wrap:wrap}
.dse-b-formulaire{display:grid;gap:12px;max-width:520px}.dse-b-faq-item{border-bottom:1px solid #ddd;padding:10px 0}
`;
