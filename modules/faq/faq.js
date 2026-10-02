import { escapeHtml, urlSure } from "../public/outils.js";
import { champ, titreRelation, booleen, urlMedia, premier } from "../builder/champs.js";

export function rendreFaq(contenu) {
  const items = (contenu || []).map((e) => {
    const q = champ(e, "QUESTION") || e?.titre || "";
    const r = champ(e, "REPONSE");
    return q && r ? `<details class="dse-b-faq-item"${booleen(e, "OUVERTPARDEFAUT") ? " open" : ""}><summary>${escapeHtml(q)}</summary><p>${escapeHtml(r)}</p></details>` : "";
  }).filter(Boolean);
  return items.length ? `<div class="dse-b-faq">${items.join("")}</div>` : "";
}
