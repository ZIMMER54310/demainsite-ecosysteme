import { escapeHtml, urlSure } from "../public/outils.js";
import { champ, titreRelation, booleen, urlMedia, premier } from "../builder/champs.js";

export function rendreAudio(contenu, ctx) {
  const e = premier(contenu);
  const source = urlMedia(e?.media?.[0], ctx) || urlSure(champ(e, "URLEXTERNE"), { lien: false });
  if (!source) return "";
  const transcription = champ(e, "TRANSCRIPTION");
  return `<div class="dse-b-audio"><audio src="${escapeHtml(source)}" controls preload="metadata"></audio>${transcription ? `<details><summary>Transcription</summary><p>${escapeHtml(transcription)}</p></details>` : ""}</div>`;
}
