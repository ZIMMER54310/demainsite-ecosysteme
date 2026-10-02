import { escapeHtml, urlSure } from "../public/outils.js";
import { champ, titreRelation, booleen, urlMedia, premier } from "../builder/champs.js";

export function rendreTitre(contenu) {
  const e = premier(contenu);
  const texte = champ(e, "TEXTE") || e?.titre || "";
  if (!texte) return "";
  const niveau = /^H[1-6]$/.test(titreRelation(e, "OBJNIVEAUTITRE").toUpperCase()) ? titreRelation(e, "OBJNIVEAUTITRE").toLowerCase() : "h2";
  return `<${niveau} class="dse-b-titre">${escapeHtml(texte)}</${niveau}>`;
}
