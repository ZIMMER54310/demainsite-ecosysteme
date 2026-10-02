import { escapeHtml, urlSure } from "../public/outils.js";
import { champ, titreRelation, booleen, urlMedia, premier } from "../builder/champs.js";

export function rendreCarrousel(contenu, ctx) {
  const e = premier(contenu);
  const images = (e?.media || []).map((m) => ({ src: urlMedia(m, ctx), alt: m.titre || "" })).filter((m) => m.src);
  if (!images.length) return "";
  // Defilement natif (scroll-snap) : aucun script fourni par SharePoint.
  return `<div class="dse-b-carrousel" role="region" aria-label="Carrousel" tabindex="0">${images.map((m) => `<img src="${escapeHtml(m.src)}" alt="${escapeHtml(m.alt)}" loading="lazy">`).join("")}</div>`;
}
