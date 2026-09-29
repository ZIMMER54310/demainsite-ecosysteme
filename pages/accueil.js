import { getSiteByDomain } from "../services/domaine.service.js";
import { getSiteFull } from "../services/site.service.js";
import { setState } from "../js/state.js";

/* =========================================================
   OUTILS
   ========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normaliserDomaine(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function valeurConfiguration(configuration, nom) {
  if (!configuration || typeof configuration !== "object") {
    return null;
  }

  return configuration[nom] ?? null;
}

function valeurUrl(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "object") {
    return String(
      value.Url ??
      value.URL ??
      value.url ??
      value.Description ??
      ""
    ).trim();
  }

  return "";
}

/* =========================================================
   NETTOYAGE DU TEXTE SHAREPOINT
   ========================================================= */

function decoderEntitesHtml(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = String(value ?? "");
  return textarea.value;
}

function texteSharePoint(value) {
  if (!value) {
    return "";
  }

  const decode =
    decoderEntitesHtml(value);

  const element =
    document.createElement("div");

  element.innerHTML = decode;

  return String(
    element.textContent ??
    element.innerText ??
    ""
  )
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
   ETATS SHAREPOINT
   ========================================================= */

function relationEst(
  element,
  relation,
  idAttendu
) {
  const valeur =
    element?.relations?.[relation];

  if (!valeur) {
    return false;
  }

  const valeurs =
    Array.isArray(valeur)
      ? valeur
      : [valeur];

  return valeurs.some(
    (item) =>
      String(item?.id ?? "") ===
      String(idAttendu)
  );
}

function estActif(element) {
  return relationEst(
    element,
    "OBJ-ACTIF",
    "1"
  );
}

function estValide(element) {
  return relationEst(
    element,
    "OBJ-VALIDE",
    "1"
  );
}

/* =========================================================
   PAGE PUBLIQUE PAR DEFAUT
   ========================================================= */

function pagePublique({
  titre,
  message,
  etat = "indisponible"
}) {
  const icone =
    etat === "maintenance"
      ? "🚧"
      : "🌐";

  return `
    <div class="dse-public-page">

      <div class="dse-public-overlay"></div>

      <main class="dse-public-centre">

        <section class="dse-public-card">

          <div class="dse-public-marque">
            <div class="dse-public-logo">DS</div>
            <span>DemainSite Ecosystème</span>
          </div>

          <div class="dse-public-icone">
            ${icone}
          </div>

          <h1>
            ${escapeHtml(titre)}
          </h1>

          <p class="dse-public-message">
            ${escapeHtml(message)}
          </p>

          <form
            class="dse-domain-search"
            id="dse-domain-search"
            autocomplete="off"
          >
            <label for="dse-domain-input">
              Vous recherchez un site ?
            </label>

            <div class="dse-domain-search-line">

              <input
                id="dse-domain-input"
                name="domaine"
                type="text"
                inputmode="url"
                placeholder="Tapez le nom du site recherché"
                aria-label="Nom de domaine recherché"
              >

              <button type="submit">
                Rechercher
              </button>

            </div>

            <p class="dse-domain-example">
              Exemple :
              <strong>dseco.fr</strong>
            </p>

            <p
              class="dse-domain-result"
              id="dse-domain-result"
              aria-live="polite"
            ></p>

          </form>

          <div class="dse-public-separateur"></div>

          <div class="dse-public-signature">
            DemainSite Ecosystème
          </div>

        </section>

      </main>

    </div>
  `;
}

/* =========================================================
   RECHERCHE DE LA PAGE RACINE
   ========================================================= */

function trouverPageRacine(data) {
  const pages =
    Array.isArray(data?.pages?.donnees)
      ? data.pages.donnees
      : [];

  if (!pages.length) {
    return null;
  }

  /*
   * La page publique n'est plus identifiée
   * par son titre "Accueil".
   *
   * La route "/" définit la page racine.
   * Les relations avec le site et les modules
   * restent portées par les ID SharePoint.
   */
  return (
    pages.find((page) => {
      const url =
        valeurConfiguration(
          page?.configuration,
          "URL"
        );

      return String(url ?? "").trim() === "/";
    }) ??
    null
  );
}

/* =========================================================
   MODULES DE LA PAGE
   ========================================================= */

function modulesPage(page) {
  if (!Array.isArray(page?.modules)) {
    return [];
  }

  return [...page.modules]
    .sort(
      (a, b) =>
        Number(a?.ordre ?? 0) -
        Number(b?.ordre ?? 0)
    );
}

/* =========================================================
   CONTENU HERO
   ========================================================= */

function trouverHero(page) {
  const modules =
    modulesPage(page);

  for (const module of modules) {
    const contenus =
      module?.contenus?.hero;

    if (
      !Array.isArray(contenus) ||
      !contenus.length
    ) {
      continue;
    }

    /*
     * Aucun titre "HERO" n'est nécessaire
     * pour établir la relation.
     *
     * Le contenu spécialisé a déjà été associé
     * au module par l'API au moyen des ID SharePoint.
     */
    const contenusTries =
      [...contenus]
        .sort(
          (a, b) =>
            Number(a?.ordre ?? 0) -
            Number(b?.ordre ?? 0)
        );

    const contenuPublie =
      contenusTries.find(
        (contenu) =>
          estActif(contenu) &&
          estValide(contenu)
      );

    if (contenuPublie) {
      return {
        module,
        contenu: contenuPublie
      };
    }

    /*
     * Tant que les états du module parent
     * sont en cours de mise en cohérence dans
     * SharePoint, aucun statut n'est inventé ici.
     */
  }

  return null;
}

/* =========================================================
   RENDU HERO
   ========================================================= */

function rendreHero(hero) {
  if (!hero?.contenu) {
    return "";
  }

  const configuration =
    hero.contenu.configuration ?? {};

  const titre =
    valeurConfiguration(
      configuration,
      "TITRE-PRINCIPAL"
    ) ?? "";

  const sousTitre =
    valeurConfiguration(
      configuration,
      "SOUS-TITRE"
    ) ?? "";

  const texte =
    texteSharePoint(
      valeurConfiguration(
        configuration,
        "TEXTE"
      )
    );

  const bouton1Texte =
    valeurConfiguration(
      configuration,
      "BOUTON-1-TEXTE"
    ) ?? "";

  const bouton1Url =
    valeurUrl(
      valeurConfiguration(
        configuration,
        "BOUTON-1-URL"
      )
    );

  const bouton2Texte =
    valeurConfiguration(
      configuration,
      "BOUTON-2-TEXTE"
    ) ?? "";

  const bouton2Url =
    valeurUrl(
      valeurConfiguration(
        configuration,
        "BOUTON-2-URL"
      )
    );

  const boutons = [];

  if (
    bouton1Texte &&
    bouton1Url
  ) {
    boutons.push(`
      ${escapeHtml(bouton1Url)}
        ${escapeHtml(bouton1Texte)}
      </a>
    `);
  }

  if (
    bouton2Texte &&
    bouton2Url
  ) {
    boutons.push(`
      "
      >
        ${escapeHtml(bouton2Texte)}
      </a>
    `);
  }

  return `
    <section
      class="dse-hero"
      data-module-id="${escapeHtml(hero.module?.id ?? "")}"
      data-contenu-id="${escapeHtml(hero.contenu?.id ?? "")}"
    >

      <div class="dse-hero-inner">

        ${
          sousTitre
            ? `
              <p class="dse-hero-kicker">
                ${escapeHtml(sousTitre)}
              </p>
            `
            : ""
        }

        ${
          titre
            ? `
              <h1 class="dse-hero-title">
                ${escapeHtml(titre)}
              </h1>
            `
            : ""
        }

        ${
          texte
            ? `
              <p class="dse-hero-text">
                ${escapeHtml(texte)}
              </p>
            `
            : ""
        }

        ${
          boutons.length
            ? `
              <div class="dse-hero-actions">
                ${boutons.join("")}
              </div>
            `
            : ""
        }

      </div>

    </section>
  `;
}

/* =========================================================
   RENDU DU SITE PUBLIC
   ========================================================= */

function rendreSitePublic({
  site,
  page,
  hero
}) {
  const nomSite =
    site?.nom ??
    page?.configuration?.[
      "Titre OBJ-PAGE-SITE-PUBLIC"
    ] ??
    "DemainSite Ecosystème";

  return `
    <div
      class="dse-site-public"
      data-site-id="${escapeHtml(site?.id ?? "")}"
      data-page-id="${escapeHtml(page?.id ?? "")}"
    >

      <main class="dse-site-public-main">

        ${
          hero
            ? rendreHero(hero)
            : `
              <section class="dse-public-centre">
                <div class="dse-public-card">

                  <h1>
                    ${escapeHtml(nomSite)}
                  </h1>

                  <p class="dse-public-message">
                    Cette page est en préparation.
                  </p>

                </div>
              </section>
            `
        }

      </main>

    </div>
  `;
}

/* =========================================================
   RECHERCHE PUBLIQUE DE DOMAINE
   ========================================================= */

async function verifierDomaine(domaine) {
  const resultat =
    document.querySelector(
      "#dse-domain-result"
    );

  const domaineNormalise =
    normaliserDomaine(domaine);

  if (!domaineNormalise) {
    if (resultat) {
      resultat.textContent =
        "Saisissez un nom de domaine.";
    }

    return;
  }

  if (resultat) {
    resultat.textContent =
      "Recherche en cours...";
  }

  try {
    const response =
      await getSiteByDomain(
        domaineNormalise
      );

    const site =
      response?.donnees ??
      response;

    const siteId =
      site?.id ??
      site?.ID ??
      site?.siteId ??
      site?.siteID;

    if (!siteId) {
      if (resultat) {
        resultat.textContent =
          "Aucun site actif trouvé pour ce domaine.";
      }

      return;
    }

    window.location.href =
      `https://${domaineNormalise}`;

  } catch (error) {
    console.error(
      "[DSE] Recherche domaine impossible",
      error
    );

    if (resultat) {
      resultat.textContent =
        "Aucun site actif trouvé pour ce domaine.";
    }
  }
}

/* =========================================================
   ACTIVATION DU FORMULAIRE
   ========================================================= */

export function activerRecherchePublique() {
  const formulaire =
    document.querySelector(
      "#dse-domain-search"
    );

  const champ =
    document.querySelector(
      "#dse-domain-input"
    );

  if (!formulaire || !champ) {
    return;
  }

  formulaire.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      await verifierDomaine(
        champ.value
      );
    }
  );
}

/* =========================================================
   PAGE ACCUEIL PUBLIQUE
   ========================================================= */

export async function accueilPage(domaine) {
  document.body.classList.add(
    "dse-public"
  );

  const domaineCourant =
    normaliserDomaine(domaine);

  if (!domaineCourant) {
    return pagePublique({
      titre: "Domaine non disponible",
      message:
        "Aucun site actif n'est associé à cette adresse."
    });
  }

  try {
    /* -----------------------------------------------------
       DOMAINE → SITE
       ----------------------------------------------------- */

    const reponseSite =
      await getSiteByDomain(
        domaineCourant
      );

    const site =
      reponseSite?.donnees ??
      reponseSite;

    const siteId =
      site?.id ??
      site?.ID ??
      site?.siteId ??
      site?.siteID;

    if (!siteId) {
      return pagePublique({
        titre: "Domaine non disponible",
        message:
          "Aucun site actif n'est associé à cette adresse."
      });
    }

    /* -----------------------------------------------------
       SITE → DONNEES COMPLETES
       ----------------------------------------------------- */

    const reponseComplete =
      await getSiteFull(siteId);

    const siteComplet =
      reponseComplete?.donnees ??
      reponseComplete;

    if (!siteComplet) {
      return pagePublique({
        titre: "Bientôt en ligne",
        message:
          "Ce site est actuellement en préparation.",
        etat: "maintenance"
      });
    }

    /* -----------------------------------------------------
       ETAT GLOBAL
       ----------------------------------------------------- */

    setState({
      currentDomain:
        domaineCourant,

      currentSite:
        site,

      currentSiteFull:
        siteComplet
    });

    /* -----------------------------------------------------
       SITE → PAGE RACINE
       ----------------------------------------------------- */

    const page =
      trouverPageRacine(
        siteComplet
      );

    if (!page) {
      return pagePublique({
        titre: "Bientôt en ligne",
        message:
          "Ce site est actuellement en préparation.",
        etat: "maintenance"
      });
    }

    /* -----------------------------------------------------
       PAGE → MODULE → HERO
       ----------------------------------------------------- */

    const hero =
      trouverHero(page);

    /* -----------------------------------------------------
       RENDU
       ----------------------------------------------------- */

    return rendreSitePublic({
      site:
        siteComplet.site ??
        site,

      page,
      hero
    });

  } catch (error) {
    console.error(
      "[DSE] Accueil public indisponible",
      error
    );

    return pagePublique({
      titre: "Domaine non disponible",
      message:
        "Aucun site actif n'est associé à cette adresse."
    });
  }
}