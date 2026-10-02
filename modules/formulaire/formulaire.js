import { escapeHtml, urlSure } from "../public/outils.js";
import { champ, titreRelation, booleen, urlMedia, premier } from "../builder/champs.js";

// Le formulaire n'est affiche que s'il est configure ; l'envoi est traite par un service dedie, jamais par SharePoint cote visiteur.
export function rendreFormulaire(contenu) {
  const e = premier(contenu);
  const titre = champ(e, "TITRE") || e?.titre || "";
  if (!e || !titre) return "";
  return `<form class="dse-b-formulaire" aria-label="${escapeHtml(titre)}" novalidate><h2>${escapeHtml(titre)}</h2><label>Nom<input name="nom" autocomplete="name" required></label><label>Courriel<input name="courriel" type="email" autocomplete="email" required></label><label>Message<textarea name="message" rows="5" required></textarea></label><button type="submit" class="dse-b-bouton dse-b-bouton--principal" disabled>Envoyer</button></form>`;
}
