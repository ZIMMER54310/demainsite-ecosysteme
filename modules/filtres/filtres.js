// Filtres du catalogue : les options viennent des donnees (facettes renvoyees par l'API).
// Outils PURS (sans DOM) + gabarit HTML.

import { escapeHtml } from "../public/outils.js";

export const FACETTES = [
  ["type", "Type de contenu"],
  ["plateforme", "Plateforme"],
  ["theme", "Thème"],
  ["categorie", "Catégorie"],
  ["collection", "Collection"],
  ["format", "Format"],
  ["visibilite", "Visibilité"],
  ["disponibilite", "Disponibilité"]
];

// Libelles des 3 types structurels du catalogue (pas du contenu metier).
const LIBELLES_TYPE = { article: "Articles", produit: "Produits", service: "Services" };

export function libelleOption(facette, option) {
  if (facette === "type") {
    return LIBELLES_TYPE[option.valeur] ?? option.libelle;
  }

  return option.libelle;
}

export function selectionVide() {
  return { q: "", page: 1 };
}

export function selectionActive(selection) {
  return Object.entries(selection ?? {}).some(
    ([cle, valeur]) => cle !== "page" && valeur !== "" && valeur != null
  );
}

export function modifierSelection(selection, cle, valeur) {
  const suivante = { ...selection, [cle]: valeur, page: 1 };

  if (valeur === "" || valeur == null) {
    delete suivante[cle];
  }

  return suivante;
}

// Parametres de requete API (valeurs vides retirees).
export function parametresRequete(selection, domaine, limite = 12) {
  const parametres = { domaine, limite };

  for (const [cle, valeur] of Object.entries(selection ?? {})) {
    if (valeur !== "" && valeur != null && !(cle === "page" && Number(valeur) <= 1)) {
      parametres[cle] = valeur;
    }
  }

  return parametres;
}

/*
 * Une facette n'est affichee que si elle peut reellement filtrer :
 * au moins 2 options, ou une option deja selectionnee (pour pouvoir la retirer).
 */
export function facettesAffichables(facettes, selection) {
  return FACETTES.filter(([cle]) => {
    const options = facettes?.[cle] ?? [];
    return options.length >= 2 || (selection?.[cle] && options.length >= 1);
  });
}

export function rendreFiltres(facettes, selection = {}) {
  const groupes = facettesAffichables(facettes, selection)
    .map(([cle, titre]) => {
      const options = (facettes[cle] ?? [])
        .map((option) => `
          <option
            value="${escapeHtml(option.valeur)}"
            ${String(selection[cle] ?? "") === String(option.valeur) ? "selected" : ""}
          >${escapeHtml(libelleOption(cle, option))} (${Number(option.nombre) || 0})</option>
        `)
        .join("");

      return `
        <div class="dse-filtre">
          <label for="dse-filtre-${cle}">${escapeHtml(titre)}</label>
          <select id="dse-filtre-${cle}" data-dse-filtre="${cle}">
            <option value="">Tous</option>
            ${options}
          </select>
        </div>
      `;
    })
    .join("");

  if (!groupes && !selectionActive(selection)) {
    return "";
  }

  return `
    <div class="dse-filtres">
      ${groupes}
      <button
        type="button"
        class="dse-bouton-secondaire dse-filtres-reinit"
        data-dse-reinit
        ${selectionActive(selection) ? "" : "disabled"}
      >Réinitialiser</button>
    </div>
  `;
}
