// Recherche textuelle du catalogue : outils PURS (sans DOM) + gabarit HTML.
// La recherche reelle est faite par l'API ; ici on normalise la saisie et on rend le champ.

import { escapeHtml } from "../public/outils.js";

export const LONGUEUR_MINIMALE = 2;

// Ignore casse, accents et espaces multiples (meme regle que l'API).
export function normaliserTexte(valeur) {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Une saisie trop courte est ignoree (elle n'efface pas le catalogue).
export function requeteRecherche(saisie) {
  const texte = String(saisie ?? "").replace(/\s+/g, " ").trim();
  return normaliserTexte(texte).length >= LONGUEUR_MINIMALE ? texte : "";
}

export function rendreRecherche({ valeur = "", identifiant = "dse-catalogue-q" } = {}) {
  return `
    <div class="dse-recherche" role="search">
      <label class="dse-recherche-label" for="${escapeHtml(identifiant)}">Rechercher</label>
      <input
        id="${escapeHtml(identifiant)}"
        class="dse-recherche-champ"
        type="search"
        name="q"
        value="${escapeHtml(valeur)}"
        autocomplete="off"
        maxlength="120"
        placeholder="Titre, thème, catégorie, collection…"
        data-dse-recherche
      >
    </div>
  `;
}
