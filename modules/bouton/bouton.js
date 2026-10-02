import { escapeHtml, urlSure } from "../public/outils.js";
import { champ, titreRelation, booleen, urlMedia, premier } from "../builder/champs.js";

export function rendreBouton(contenu) {
  const boutons = (contenu || []).map((e) => {
    const libelle = champ(e, "LIBELLE");
    const url = urlSure(champ(e, "URL"));
    if (!libelle || !url) return "";
    const type = titreRelation(e, "OBJBOUTONTYPE").toLowerCase().replace(/[^a-z]/g, "") || "principal";
    const externe = /^https?:\/\//i.test(url) || titreRelation(e, "OBJOUVERTURELIEN").toUpperCase() === "NOUVEL-ONGLET";
    return `<a class="dse-b-bouton dse-b-bouton--${escapeHtml(type)}" href="${escapeHtml(url)}"${externe ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(libelle)}</a>`;
  }).filter(Boolean);
  return boutons.length ? `<div class="dse-b-boutons">${boutons.join("")}</div>` : "";
}
