// Catalogue multiplateforme (articles, produits, services) : rendu reutilisable.
// Les fonctions rendre*/formater* sont PURES (testables sous Node) ; monterCatalogue pilote le DOM.

import { escapeHtml, urlSure } from "../public/outils.js";
import { rendreRecherche, requeteRecherche } from "../recherche/recherche.js";
import {
  rendreFiltres,
  selectionVide,
  selectionActive,
  modifierSelection,
  parametresRequete
} from "../filtres/filtres.js";

const LIBELLES_TYPE = { article: "Article", produit: "Produit", service: "Service" };

export function formaterPrix(prix) {
  if (!prix || !Number.isFinite(Number(prix.montant))) {
    return "";
  }

  const montant = Number(prix.montant);
  const devise = String(prix.devise ?? "").trim();

  if (/^[A-Za-z]{3}$/.test(devise)) {
    try {
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency: devise.toUpperCase() }).format(montant);
    } catch {
      // Code de devise inconnu : repli ci-dessous.
    }
  }

  const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(montant);
  return devise ? `${nombre} ${devise}` : nombre;
}

function lienCarte(element) {
  const url = urlSure(element.url);

  if (url) {
    return { url, externe: /^https?:/i.test(url), libelle: null };
  }

  // Portail : lien sortant controle vers la plateforme qui porte le contenu.
  const plateforme = (element.plateformes ?? []).find((p) => p.domaine);

  if (plateforme && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(plateforme.domaine)) {
    return { url: `https://${plateforme.domaine}`, externe: true, libelle: `Voir sur ${plateforme.titre ?? plateforme.domaine}` };
  }

  return null;
}

function etiquettes(element) {
  return [
    ...(element.themes ?? []),
    ...(element.categories ?? []),
    ...(element.collections ?? [])
  ]
    .map((r) => r.titre)
    .filter(Boolean)
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("");
}

export function rendreCarte(element, { portail = false } = {}) {
  const lien = lienCarte(element);
  const titre = escapeHtml(element.titre);
  const prix = formaterPrix(element.prix);
  const mediaUrl = urlSure(element.media?.url, { lien: false });

  const entete = lien && !lien.libelle
    ? `<a href="${escapeHtml(lien.url)}"${lien.externe ? ' rel="noopener noreferrer"' : ""}>${titre}</a>`
    : titre;

  const plateformes = portail
    ? (element.plateformes ?? []).map((p) => p.titre).filter(Boolean)
    : [];

  return `
    <article class="dse-carte" data-type="${escapeHtml(element.type)}" data-cle="${escapeHtml(element.cle)}">
      <div class="dse-carte-media">
        ${
          mediaUrl
            ? `<img src="${escapeHtml(mediaUrl)}" alt="" loading="lazy" data-dse-media>`
            : `<span class="dse-carte-sans-media" aria-hidden="true">${escapeHtml((LIBELLES_TYPE[element.type] ?? "").charAt(0))}</span>`
        }
      </div>
      <div class="dse-carte-corps">
        <p class="dse-carte-type">${escapeHtml(LIBELLES_TYPE[element.type] ?? "")}</p>
        <h3 class="dse-carte-titre">${entete}</h3>
        ${element.resume ? `<p class="dse-carte-resume">${escapeHtml(element.resume)}</p>` : ""}
        ${etiquettes(element) ? `<ul class="dse-carte-etiquettes">${etiquettes(element)}</ul>` : ""}
        ${plateformes.length ? `<p class="dse-carte-plateformes">${escapeHtml(plateformes.join(" · "))}</p>` : ""}
        ${prix ? `<p class="dse-carte-prix">${escapeHtml(prix)}</p>` : ""}
        ${element.disponibilite ? `<p class="dse-carte-disponibilite">${escapeHtml(element.disponibilite)}</p>` : ""}
        ${lien && lien.libelle ? `<p><a class="dse-carte-lien" href="${escapeHtml(lien.url)}" rel="noopener noreferrer">${escapeHtml(lien.libelle)}</a></p>` : ""}
        <button type="button" class="dse-carte-lies" data-dse-lies="${escapeHtml(element.cle)}" aria-expanded="false">Contenus liés</button>
        <ul class="dse-carte-liste-lies" hidden></ul>
      </div>
    </article>
  `;
}

export function rendreCartes(elements, options = {}) {
  return `<div class="dse-cartes">${(elements ?? []).map((e) => rendreCarte(e, options)).join("")}</div>`;
}

export function rendreVide(filtrage) {
  return `
    <p class="dse-catalogue-vide">
      ${filtrage ? "Aucun résultat ne correspond à votre recherche." : "Aucun contenu à afficher pour le moment."}
    </p>
  `;
}

export function rendreChargement() {
  return `<p class="dse-catalogue-chargement" role="status">Chargement en cours…</p>`;
}

export function rendrePagination(donnees) {
  if (!donnees || (donnees.pages ?? 1) <= 1) {
    return "";
  }

  return `
    <nav class="dse-pagination" aria-label="Pagination">
      <button type="button" data-dse-page="${donnees.page - 1}" ${donnees.page <= 1 ? "disabled" : ""}>Précédent</button>
      <span>Page ${donnees.page} sur ${donnees.pages}</span>
      <button type="button" data-dse-page="${donnees.page + 1}" ${donnees.page >= donnees.pages ? "disabled" : ""}>Suivant</button>
    </nav>
  `;
}

// Resume annonce aux lecteurs d'ecran (aria-live).
export function resumeResultats(total) {
  const n = Number(total) || 0;
  return n === 0 ? "Aucun résultat" : n === 1 ? "1 résultat" : `${n} résultats`;
}

export function rendreResultats(donnees, selection) {
  const elements = donnees?.elements ?? [];

  return `
    <p class="dse-catalogue-compteur" role="status" aria-live="polite">${escapeHtml(resumeResultats(donnees?.total))}</p>
    ${elements.length ? rendreCartes(elements, { portail: Boolean(donnees?.site?.portail) }) : rendreVide(selectionActive(selection))}
    ${rendrePagination(donnees)}
  `;
}

export function rendreCatalogue(donnees, selection = selectionVide()) {
  return `
    <div class="dse-catalogue-outils">
      ${rendreRecherche({ valeur: selection.q ?? "" })}
      <div data-dse-filtres>${rendreFiltres(donnees?.facettes, selection)}</div>
    </div>
    <div data-dse-resultats aria-busy="false">${rendreResultats(donnees, selection)}</div>
  `;
}

/* =========================================================
   MONTAGE DANS LE DOM
   ========================================================= */

export async function monterCatalogue(racine, { domaine, apiGet, delai = 300 } = {}) {
  if (!racine || !domaine) {
    return;
  }

  const get = apiGet ?? (await import("../../js/api.js")).apiGet;
  let selection = selectionVide();
  let minuteur = null;
  let sequence = 0;

  const charger = async (premier = false) => {
    const numero = ++sequence;
    const zone = racine.querySelector("[data-dse-resultats]");

    if (zone) {
      zone.setAttribute("aria-busy", "true");
      zone.innerHTML = rendreChargement();
    }

    let reponse;

    try {
      reponse = await get("/catalogue", parametresRequete(selection, domaine));
    } catch {
      // Echec : message public neutre, jamais de detail technique.
      if (numero === sequence && zone) {
        zone.setAttribute("aria-busy", "false");
        zone.innerHTML = `<p class="dse-catalogue-vide">Le catalogue est momentanément indisponible.</p>`;
      }

      if (premier) racine.hidden = true;
      return;
    }

    if (numero !== sequence) {
      return; // reponse perimee
    }

    const donnees = reponse?.donnees ?? reponse;

    // Aucun contenu configure pour ce site : la section n'apparait pas.
    if (premier && !donnees?.total && !selectionActive(selection)) {
      racine.hidden = true;
      return;
    }

    racine.hidden = false;

    if (premier) {
      racine.innerHTML = `<h2 class="dse-catalogue-titre">Catalogue</h2>${rendreCatalogue(donnees, selection)}`;
      return;
    }

    racine.querySelector("[data-dse-filtres]").innerHTML = rendreFiltres(donnees.facettes, selection);
    racine.querySelector("[data-dse-resultats]").innerHTML = rendreResultats(donnees, selection);
    racine.querySelector("[data-dse-resultats]").setAttribute("aria-busy", "false");
  };

  racine.addEventListener("input", (evenement) => {
    if (!evenement.target.matches("[data-dse-recherche]")) return;

    clearTimeout(minuteur);
    minuteur = setTimeout(() => {
      selection = modifierSelection(selection, "q", requeteRecherche(evenement.target.value));
      charger();
    }, delai);
  });

  racine.addEventListener("change", (evenement) => {
    const cle = evenement.target.dataset?.dseFiltre;
    if (!cle) return;

    selection = modifierSelection(selection, cle, evenement.target.value);
    charger();
  });

  racine.addEventListener("click", async (evenement) => {
    const cible = evenement.target.closest?.("button");
    if (!cible) return;

    if (cible.hasAttribute("data-dse-reinit")) {
      selection = selectionVide();
      const champ = racine.querySelector("[data-dse-recherche]");
      if (champ) champ.value = "";
      charger();
      return;
    }

    if (cible.dataset.dsePage) {
      selection = { ...selection, page: Number(cible.dataset.dsePage) };
      charger();
      return;
    }

    if (cible.dataset.dseLies) {
      const liste = cible.nextElementSibling;
      const ouvert = cible.getAttribute("aria-expanded") === "true";

      cible.setAttribute("aria-expanded", String(!ouvert));
      liste.hidden = ouvert;

      if (ouvert || liste.dataset.charge) return;

      try {
        const reponse = await get(`/catalogue/element/${encodeURIComponent(cible.dataset.dseLies)}`, { domaine });
        const lies = (reponse?.donnees ?? reponse)?.lies ?? [];

        liste.innerHTML = lies.length
          ? lies.map((l) => {
              const url = urlSure(l.url);
              const titre = escapeHtml(l.titre);
              return `<li>${url ? `<a href="${escapeHtml(url)}">${titre}</a>` : titre}</li>`;
            }).join("")
          : "<li>Aucun contenu lié.</li>";

        liste.dataset.charge = "1";
      } catch {
        liste.innerHTML = "<li>Contenus liés indisponibles.</li>";
      }
    }
  });

  // Image de media absente ou refusee : on retombe sur le visuel neutre.
  racine.addEventListener("error", (evenement) => {
    const image = evenement.target;

    if (image?.matches?.("img[data-dse-media]")) {
      image.replaceWith(Object.assign(document.createElement("span"), {
        className: "dse-carte-sans-media",
        textContent: ""
      }));
    }
  }, true);

  await charger(true);
}
