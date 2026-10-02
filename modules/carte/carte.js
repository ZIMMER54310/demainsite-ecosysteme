import { escapeHtml, urlSure } from "../public/outils.js";
import { champ, titreRelation, booleen, urlMedia, premier } from "../builder/champs.js";

export function rendreCarte(contenu, ctx) {
  const cartes = (contenu || []).map((e) => {
    const titre = champ(e, "TITRE") || e?.titre || "";
    if (!titre) return "";
    const texte = champ(e, "TEXTE");
    const image = urlMedia(e?.media?.[0], ctx);
    const url = urlSure(champ(e, "URL"));
    const corps = `${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">` : ""}<h3>${escapeHtml(titre)}</h3>${texte ? `<p>${escapeHtml(texte)}</p>` : ""}`;
    return `<article class="dse-b-carte">${url ? `<a href="${escapeHtml(url)}">${corps}</a>` : corps}</article>`;
  }).filter(Boolean);
  return cartes.length ? `<div class="dse-b-cartes">${cartes.join("")}</div>` : "";
}
