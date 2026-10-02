import { escapeHtml, urlSure } from "../public/outils.js";
import { champ, titreRelation, booleen, urlMedia, premier } from "../builder/champs.js";

export function rendreVideo(contenu, ctx) {
  const e = premier(contenu);
  const src = urlMedia(e?.media?.[0], ctx);
  const externe = urlSure(champ(e, "URLEXTERNE"), { lien: false });
  const source = src || externe;
  if (!source) return "";
  const affiche = (e?.media || [])[1] ? urlMedia(e.media[1], ctx) : "";
  return `<video class="dse-b-video" src="${escapeHtml(source)}"${booleen(e, "CONTROLES", true) ? " controls" : ""}${booleen(e, "MUET") ? " muted" : ""}${booleen(e, "BOUCLE") ? " loop" : ""}${booleen(e, "LECTUREAUTOMATIQUE") && booleen(e, "MUET") ? " autoplay" : ""} playsinline preload="metadata"${affiche ? ` poster="${escapeHtml(affiche)}"` : ""}></video>`;
}
