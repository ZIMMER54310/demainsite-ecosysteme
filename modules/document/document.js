import { escapeHtml, urlSure } from "../public/outils.js";
import { champ, titreRelation, booleen, urlMedia, premier } from "../builder/champs.js";

export function rendreDocument(contenu, ctx) {
  const liens = (contenu || []).map((e) => {
    const src = urlMedia(e?.media?.[0], ctx);
    if (!src) return "";
    const libelle = champ(e, "LIBELLETELECHARGEMENT") || e?.media?.[0]?.titre || "Télécharger";
    return `<a class="dse-b-bouton dse-b-bouton--secondaire" href="${escapeHtml(src)}" download rel="noopener noreferrer">${escapeHtml(libelle)}</a>`;
  }).filter(Boolean);
  return liens.length ? `<div class="dse-b-document">${liens.join("")}</div>` : "";
}
