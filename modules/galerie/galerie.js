import { escapeHtml, urlSure } from "../public/outils.js";
import { champ, titreRelation, booleen, urlMedia, premier } from "../builder/champs.js";

export function rendreGalerie(contenu, ctx) {
  const e = premier(contenu);
  const vignettes = (e?.media || []).map((m) => ({ src: urlMedia(m, ctx), alt: m.titre || "" })).filter((m) => m.src);
  if (!vignettes.length) return "";
  const colonnes = Math.min(6, Math.max(1, Number(champ(e, "NOMBRECOLONNES")) || 3));
  const mode = titreRelation(e, "OBJMODEGALERIE").toLowerCase().replace(/[^a-z]/g, "") || "grille";
  return `<div class="dse-b-galerie dse-b-galerie--${escapeHtml(mode)}" style="--dse-b-colonnes:${colonnes}">${vignettes.map((m) => `<img src="${escapeHtml(m.src)}" alt="${escapeHtml(m.alt)}" loading="lazy">`).join("")}</div>`;
}
