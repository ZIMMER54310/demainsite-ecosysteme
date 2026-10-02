import { escapeHtml } from "../public/outils.js";
import { champ, premier } from "../builder/champs.js";
import { nettoyerHtml } from "./nettoyer.js";

export function rendreTexte(contenu) {
  const e = premier(contenu);
  const riche = champ(e, "TEXTEENRICHI");
  const simple = champ(e, "CONTENU");
  const html = riche ? nettoyerHtml(riche) : simple ? `<p>${escapeHtml(simple).replace(/\n+/g, "<br>")}</p>` : "";
  return html ? `<div class="dse-b-texte">${html}</div>` : "";
}
