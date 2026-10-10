// Rendu du DSE Builder (pur, sans DOM) : section > ligne > colonne > module.
// Le rendu ne montre jamais d'ID SharePoint ni d'information technique ; un element vide ne produit aucune sortie.
import { escapeHtml } from "../public/outils.js";
import { cssElement } from "./styles.js";
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
import { codeChamp, declarationsGeneriques, erreurValeur } from "./proprietes.js";

const MODULES = {
  TITRE: rendreTitre, TEXTE: rendreTexte, "TEXTE-ENRICHI": rendreTexte, BOUTON: rendreBouton, BOUTONS: rendreBouton,
  IMAGE: rendreImage, "IMAGE-TEXTE": rendreImage, GALERIE: rendreGalerie, CARROUSEL: rendreCarrousel, VIDEO: rendreVideo,
  AUDIO: rendreAudio, DOCUMENT: rendreDocument, TELECHARGEMENT: rendreDocument, CTA: rendreCta, CARTE: rendreCarte,
  "LISTE-CARTES": rendreCarte, FAQ: rendreFaq, ACCORDEON: rendreFaq, FORMULAIRE: rendreFormulaire
};

const CATALOGUES = {
  CATALOGUE: "tous", ARTICLES: "articles", BLOG: "articles", PRODUITS: "produits", SERVICES: "services", COLLECTIONS: "collections",
  FILTRES: "tous", RECHERCHE: "tous", "PRODUITS-ASSOCIES": "produits", "ARTICLES-ASSOCIES": "articles"
};

// Modules deja geres par les moteurs existants : adaptateurs fournis par la page (HERO, FOOTER, HEADER...).
const ADAPTES = new Set(["HERO", "FOOTER", "HEADER", "NAVIGATION"]);

const REF = /^[a-z]+\.[A-Za-z0-9._-]{4,120}$/;
const PREFIXE = (ctx) => (/^[a-z]{0,3}$/.test(String(ctx.prefixe || "")) ? String(ctx.prefixe || "") : "");

/* Identifiant CSS unique + styles (base, survol, responsive) de l'element ; attribut de reperage en apercu. */
function habiller(el, type, lettre, ctx) {
  const identifiant = `dse-b-${PREFIXE(ctx)}${lettre}${ctx.compteur ? ctx.compteur() : 0}`;
  const regles = cssElement(identifiant, type, el?.style || {}, el?.responsive || {}, ctx);
  if (regles) (ctx.css ? ctx.css.push(regles) : null);
  const cache = Object.entries({ ORDINATEUR: "ordinateur", TABLETTE: "tablette", MOBILE: "mobile" })
    .filter(([a]) => el?.responsive?.[a]?.masque || el?.visibilite?.[a] === false).map(([, n]) => `dse-b-cache-${n}`);
  const ref = ctx.apercu && REF.test(String(el?._ref || "")) ? ` data-dse-ref="${escapeHtml(el._ref)}"` : "";
  return { identifiant, cache, ref, enLigne: regles && !ctx.css ? `<style>${regles}</style>` : "" };
}

export function rendreModule(module, ctx = {}) {
  if (!module?.type) return "";
  let interieur = "";

  if (ADAPTES.has(module.type)) interieur = ctx.adapteurs?.[module.type]?.(module) || "";
  else if (CATALOGUES[module.type]) {
    // Monte ensuite par le moteur catalogue existant (filtres + recherche inclus).
    interieur = `<section class="dse-catalogue" data-dse-catalogue-builder="${CATALOGUES[module.type]}" aria-label="Catalogue" hidden></section>`;
  } else if (MODULES[module.type]) interieur = MODULES[module.type](module.contenu || [], ctx);

  // En apercu, un module sans contenu (brouillon) reste visible sous forme de bloc reperable.
  const vide = !String(interieur).trim();
  if (vide && !(ctx.apercu && module._ref)) return "";
  if (vide) interieur = `<span class="dse-b-vide">Module ${escapeHtml(module.type)} · contenu à renseigner</span>`;

  const h = habiller(module, module.type, "m", ctx);
  const classes = ["dse-b-module", `dse-b-module--${String(module.type).toLowerCase()}`, h.identifiant, ...h.cache, module.avance?.classe || ""].filter(Boolean);
  const ancre = module.avance?.ancrage ? ` id="${escapeHtml(module.avance.ancrage)}"` : "";

  return `${h.enLigne}<div class="${escapeHtml(classes.join(" "))}"${ancre}${h.ref}>${interieur}</div>`;
}

export function rendreColonne(colonne, ctx) {
  let modules = (colonne.modules || []).map((m) => rendreModule(m, ctx)).filter(Boolean).join("");
  if (!modules && ctx.apercu && colonne._ref) modules = `<span class="dse-b-vide">Colonne vide</span>`;
  if (!modules) return "";
  const largeur = Number(colonne.largeur) > 0 ? Math.min(100, Number(colonne.largeur)) : 100;
  const tablette = Number(colonne.largeurTablette) > 0 ? Math.min(100, Number(colonne.largeurTablette)) : "";
  const mobile = Number(colonne.largeurMobile) > 0 ? Math.min(100, Number(colonne.largeurMobile)) : 100;
  const h = habiller(colonne, "COLONNE", "c", ctx);
  return `${h.enLigne}<div class="${["dse-b-colonne", h.identifiant, ...h.cache].join(" ")}"${h.ref} style="--dse-b-l:${largeur};--dse-b-lt:${tablette || largeur};--dse-b-lm:${mobile}">${modules}</div>`;
}

export function rendreLigne(ligne, ctx) {
  let colonnes = (ligne.colonnes || []).map((c) => rendreColonne(c, ctx)).filter(Boolean).join("");
  if (!colonnes && ctx.apercu && ligne._ref) colonnes = `<span class="dse-b-vide">Ligne vide</span>`;
  if (!colonnes) return "";
  const espace = Number(ligne.espacement) >= 0 && ligne.espacement !== null ? ` style="--dse-b-espace:${Math.min(120, Number(ligne.espacement))}px"` : "";
  const h = habiller(ligne, "LIGNE", "l", ctx);
  return `${h.enLigne}<div class="${["dse-b-ligne", h.identifiant, ...h.cache].join(" ")}"${h.ref}${espace}>${colonnes}</div>`;
}

export function rendreSection(section, ctx) {
  let lignes = (section.lignes || []).map((l) => rendreLigne(l, ctx)).filter(Boolean).join("");
  if (!lignes && ctx.apercu && section._ref) lignes = `<span class="dse-b-vide">Section vide</span>`;
  if (!lignes) return "";
  const type = String(section.type || "STANDARD").toLowerCase().replace(/[^a-z-]/g, "");
  const ancre = section.ancrage ? ` id="${escapeHtml(section.ancrage)}"` : "";
  const h = habiller(section, "SECTION", "s", ctx);
  const html = `${h.enLigne}<section class="${["dse-b-section", `dse-b-section--${type}`, h.identifiant, ...h.cache].join(" ")}"${ancre}${h.ref}><div class="dse-b-contenu">${lignes}</div></section>`;
  return html;
}

export function rendreNoeud(noeud, ctx = {}, profondeur = 0) {
  if (!noeud || profondeur >= 64) return "";
  const definitions = noeud.champs || [];
  const valeursPour = (appareil) => Object.fromEntries(definitions.filter((c) => c.categorie === "CONTENU").map((c) =>
    [codeChamp(c.cle), c.surcharges?.[appareil] ?? c.valeur]));
  const avancePour = (appareil) => Object.fromEntries(definitions.filter((c) => c.categorie === "AVANCE").filter((c) =>
    !erreurValeur(c, c.surcharges?.[appareil] ?? c.valeur)).map((c) => [codeChamp(c.cle), c.surcharges?.[appareil] ?? c.valeur]));
  const type = String(noeud.rendu || "").toUpperCase();
  const enfants = (noeud.enfants || []).map((x) => rendreNoeud(x, ctx, profondeur + 1)).join("");
  const contenus = ["ORDINATEUR", "TABLETTE", "MOBILE"].map((appareil) => {
    const champs = valeursPour(appareil);
    const media = definitions.filter((c) => c.categorie === "CONTENU" && c.nature === "MEDIA")
      .map((c) => { const id = c.surcharges?.[appareil] ?? c.valeur; return { id, titre: c.libelle, type: c.mediaTypes?.[id] || "" }; })
      .filter((m) => /^\d{1,12}$/.test(String(m.id)));
    const contenu = [{ champs, media }];
    const module = type === "MODULE" ? [
      champs.TITRE ? rendreTitre([{ champs: { TEXTE: champs.TITRE } }]) : "",
      champs.TEXTE ? rendreTexte([{ champs: { CONTENU: champs.TEXTE } }]) : "",
      ...media.map((m) => {
        const rendre = /VIDEO|VIDÉO/i.test(m.type) ? rendreVideo : /AUDIO|SON/i.test(m.type) ? rendreAudio :
          /DOCUMENT|PDF|FICHIER/i.test(m.type) ? rendreDocument : rendreImage;
        return rendre([{ champs, media: [m] }], ctx);
      }),
      champs.LIBELLEBOUTON && champs.LIEN ? rendreBouton([{ champs: { LIBELLE: champs.LIBELLEBOUTON, URL: champs.LIEN } }]) : ""
    ].join("") : MODULES[type] ? MODULES[type](contenu, ctx) : CATALOGUES[type] ? (ctx.apercu
      ? `<div class="dse-b-vide">📰 ${escapeHtml(noeud.titre || "Articles")} · liste affichée automatiquement sur le site</div>`
      : `<section class="dse-catalogue" data-dse-catalogue-builder="${CATALOGUES[type]}" aria-label="${escapeHtml(noeud.titre || "Catalogue")}" hidden></section>`) : "";
    return { appareil, module };
  });
  const vide = !contenus.some((x) => x.module) && !enfants;
  if (vide && !ctx.apercu) return "";
  const h = habiller({ _ref: noeud.ref }, type, "m", ctx);
  const mediasQueries = { ORDINATEUR: "(min-width:1025px)", TABLETTE: "(min-width:641px) and (max-width:1024px)", MOBILE: "(max-width:640px)" };
  for (const { appareil } of contenus) {
    let declarations = declarationsGeneriques(definitions, appareil, ctx.apiBase);
    if (type === "COLONNE") {
      // Largeur d'une colonne dans sa ligne : poids proportionnel en %, exact malgre l'ecart entre colonnes.
      const champ = definitions.find((c) => c.categorie === "DESIGN" && codeChamp(c.cle) === "LARGEUR");
      const explicite = champ?.surcharges?.[appareil];
      const v = String(explicite ?? champ?.valeur ?? "");
      declarations = declarations.filter((x) => !x.startsWith("width:"));
      const pourcent = /^(\d+(?:\.\d+)?)%$/.exec(v);
      const regle = pourcent && Number(pourcent[1]) > 0 && Number(pourcent[1]) <= 100
        ? (appareil === "MOBILE" ? (explicite != null && explicite !== "" ? `flex:1 1 calc(${pourcent[1]}% - var(--dse-b-espace,24px))` : "") : `flex:${pourcent[1]} ${pourcent[1]} 0%`)
        : /^\d+(?:\.\d+)?(px|rem|em)$/.test(v) && appareil !== "MOBILE" ? `flex:0 0 ${v}` : "";
      if (regle) ctx.css?.push(`@media ${mediasQueries[appareil]}{.dse-b-r-ligne>.dse-b-r-colonne.${h.identifiant}{${regle}}}`);
    }
    if (avancePour(appareil).VISIBILITE === false) declarations.push("display:none");
    if (declarations.length) ctx.css?.push(`@media ${mediasQueries[appareil]}{.${h.identifiant}{${declarations.join(";")}}}`);
    const boutonCss = declarations.filter((x) => /^(color|background-|border|font-|text-align)/.test(x));
    if (type === "MODULE" && boutonCss.length) ctx.css?.push(`@media ${mediasQueries[appareil]}{.${h.identifiant} .dse-b-bouton{${boutonCss.join(";")}}}`);
  }
  const avance = avancePour("");
  const id = avance.IDCSS ? ` id="${escapeHtml(avance.IDCSS)}"` : "";
  const classe = avance.CLASSECSS ? ` ${escapeHtml(avance.CLASSECSS)}` : "";
  const tag = { SECTION: "section", "EN-TETE": "header", ENTETE: "header", FOOTER: "footer" }[type] || "div";
  const barre = ctx.apercu ? `<div class="dse-b-outils" data-dse-outils="${escapeHtml(noeud.ref)}">
    ${(noeud.ajouts || []).length || profondeur ? `<button type="button" data-builder-canvas="ajouter" data-ref="${escapeHtml(noeud.ref)}" title="Ajouter une section, une ligne, une colonne ou un module">＋ Ajouter</button>` : ""}
    <button type="button" data-builder-canvas="modifier" data-ref="${escapeHtml(noeud.ref)}" title="${type === "LIGNE" ? "Colonnes : nombre et largeurs en %" : "Ouvrir les réglages de cet élément"}">✏️ Modifier</button>
    <button type="button" data-builder-canvas="renommer" data-ref="${escapeHtml(noeud.ref)}" title="Renommer ${escapeHtml(noeud.titre || "cet élément")}">🏷 Nom</button>
    ${profondeur ? `<button type="button" data-builder-canvas="dupliquer" data-ref="${escapeHtml(noeud.ref)}">Dupliquer</button>
    <button type="button" class="dse-b-corbeille" data-builder-canvas="retirer" data-ref="${escapeHtml(noeud.ref)}" title="Supprimer ${escapeHtml(noeud.titre || "cet élément")} (confirmation demandée)" aria-label="Supprimer ${escapeHtml(noeud.titre || "cet élément")}">🗑</button>` : ""}</div>` : "";
  const variants = contenus.filter((x) => x.module).map((x) => `<div class="dse-b-appareil dse-b-appareil--${x.appareil.toLowerCase()}">${x.module}</div>`).join("");
  const depot = (position) => ctx.apercu ? `<div class="dse-b-depot" data-builder-depot="${position}" data-ref="${escapeHtml(noeud.ref)}">${{ avant: "Déposer avant", apres: "Déposer après", dans: "Déposer ici" }[position]}</div>` : "";
  const html = `${depot("avant")}${h.enLigne}<${tag}${id} class="dse-b-module dse-b-recursif dse-b-r-${type.toLowerCase().replace(/[^a-z-]/g, "")} ${h.identifiant}${classe}"${h.ref}>${barre}${variants}${enfants}${vide && ctx.apercu ? `<span class="dse-b-vide">${escapeHtml(noeud.titre || "Élément vide")}</span>` : ""}${ctx.apercu && noeud.conteneur && (noeud.ajouts || []).length ? `<button type="button" class="dse-b-plus" data-builder-canvas="ajouter" data-ref="${escapeHtml(noeud.ref)}" title="Ajouter dans ${escapeHtml(noeud.titre || "cet élément")}" aria-label="Ajouter dans ${escapeHtml(noeud.titre || "cet élément")}">＋</button>` : ""}${noeud.conteneur ? depot("dans") : ""}</${tag}>${depot("apres")}`;
  return html;
}

/*
 * Retourne "" si aucune composition Builder valide : la page conserve alors son rendu historique.
 * composition.style/responsive (ou page.style) : style du conteneur (Page, En-tete, Footer) ;
 * composition.theme : styles globaux du site (GLOBAL, LIEN). ctx.prefixe distingue En-tete / Page / Footer.
 */
export function rendreBuilder(composition, ctx = {}) {
  if (composition?.mode !== "builder") return "";
  let n = 0;
  const css = [];
  const contexte = { ...ctx, compteur: () => ++n, css };
  const html = composition.noeuds
    ? composition.noeuds.map((x) => rendreNoeud(x, contexte)).join("")
    : (composition.sections || []).map((s) => rendreSection(s, contexte)).filter(Boolean).join("");
  if (!html) return "";
  const racine = composition.style || composition.responsive ? composition : composition.page || {};
  const type = String(ctx.typeConteneur || "PAGE").toUpperCase();
  const h = habiller({ style: racine.style, responsive: racine.responsive, _ref: racine._ref }, type, "r", contexte);
  const theme = composition.theme || {};
  for (const code of ["GLOBAL", "LIEN"]) {
    if (!theme[code]) continue;
    const r = cssElement(h.identifiant, code, theme[code].style || {}, theme[code].responsive || {}, ctx);
    if (r) css.unshift(r);
  }
  const style = css.length ? `<style>${css.join("")}</style>` : "";
  return `${style}<div class="${["dse-builder", h.identifiant, ...h.cache].join(" ")}"${h.ref}>${html}</div>`;
}

export const STYLES_BUILDER = `
.dse-builder{display:block}.dse-b-section{padding:clamp(24px,5vw,64px) 16px}.dse-b-section--pleine-largeur{padding-left:0;padding-right:0}
.dse-b-appareil--tablette,.dse-b-appareil--mobile{display:none}
.dse-b-appareil--ordinateur{display:contents}.dse-b-recursif .dse-b-titre{font-size:inherit;font-weight:inherit;color:inherit}.dse-b-recursif .dse-b-texte{color:inherit}
.dse-b-outils,.dse-b-depot,.dse-b-plus{display:none}
.dse-b-r-ligne{display:flex;flex-wrap:wrap;gap:var(--dse-b-espace,24px)}.dse-b-r-ligne>.dse-b-r-colonne{flex:1 1 0;min-width:0}.dse-b-r-ligne>:not(.dse-b-r-colonne):not(.dse-b-depot){flex:0 0 100%}
@media(max-width:640px){.dse-b-r-ligne>.dse-b-r-colonne{flex-basis:100%}}
@media(min-width:641px) and (max-width:1024px){.dse-b-appareil--ordinateur{display:none}.dse-b-appareil--tablette{display:contents}}
@media(max-width:640px){.dse-b-appareil--ordinateur{display:none}.dse-b-appareil--mobile{display:contents}}
.dse-b-contenu{max-width:1200px;margin:0 auto}.dse-b-section--pleine-largeur>.dse-b-contenu{max-width:none}
.dse-b-ligne{display:flex;flex-wrap:wrap;gap:var(--dse-b-espace,24px)}
.dse-b-colonne{flex:0 0 calc(var(--dse-b-l)*1% - var(--dse-b-espace,24px));min-width:0;max-width:100%}
@media(max-width:1024px){.dse-b-colonne{flex-basis:calc(var(--dse-b-lt)*1% - var(--dse-b-espace,24px))}}
@media(min-width:641px) and (max-width:1024px){.dse-b-cache-tablette{display:none}}
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
