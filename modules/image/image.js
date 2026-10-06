import { escapeHtml, urlSure } from "../public/outils.js";
import { champ, titreRelation, booleen, urlMedia, premier } from "../builder/champs.js";

export function rendreImage(contenu, ctx) {
  const e = premier(contenu);
  const src = urlMedia(e?.media?.[0], ctx);
  if (!src) return "";
  const alt = champ(e, "TEXTEALTERNATIF");
  const legende = champ(e, "LEGENDE");
  const lien = urlSure(champ(e, "LIEN"));
  const img = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="${ctx?.apercu ? "eager" : "lazy"}" class="dse-b-image-img">`;
  return `<figure class="dse-b-image">${lien ? `<a href="${escapeHtml(lien)}">${img}</a>` : img}${legende ? `<figcaption>${escapeHtml(legende)}</figcaption>` : ""}</figure>`;
}
