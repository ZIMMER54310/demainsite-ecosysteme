import { escapeHtml, urlSure } from "../public/outils.js";
import { champ, titreRelation, booleen, urlMedia, premier } from "../builder/champs.js";

export function rendreCta(contenu, ctx) {
  const e = premier(contenu);
  const titre = champ(e, "TITRE") || e?.titre || "";
  const texte = champ(e, "TEXTE");
  if (!titre && !texte) return "";
  const image = urlMedia(e?.media?.[0], ctx);
  return `<div class="dse-b-cta">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : ""}${titre ? `<h2>${escapeHtml(titre)}</h2>` : ""}${texte ? `<p>${escapeHtml(texte)}</p>` : ""}</div>`;
}
