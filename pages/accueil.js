import { getSiteByDomain } from "../services/domaine.service.js";
import { getSiteFull } from "../services/site.service.js";
import { setState } from "../js/state.js";
import { CONFIG } from "../js/config.js";

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

  const valeur = configuration[nom] ?? null;

  // "ND" = non defini dans SharePoint : jamais affiche publiquement.
  return typeof valeur === "string" && valeur.trim().toUpperCase() === "ND"
    ? null
    : valeur;
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

/*
 * N'accepte que les URL navigables sûres :
 * http(s), mailto, tel, ou chemin relatif au site.
 * Toute autre forme (javascript:, data:, //hote…) est ignorée.
 */
function urlSure(value, { lien = true } = {}) {
  // Les listes SharePoint ajoutent parfois un libellé d'interface après l'URL.
  const url =
    valeurUrl(value).split(/\s+/)[0];

  if (!url) {
    return "";
  }

  if (
    url.startsWith("/") &&
    !url.startsWith("//")
  ) {
    return url;
  }

  if (lien && url.startsWith("#")) {
    return url;
  }

  try {
    const protocole =
      new URL(url).protocol;

    const autorises =
      lien
        ? ["http:", "https:", "mailto:", "tel:"]
        : ["http:", "https:"];

    return autorises.includes(protocole)
      ? url
      : "";
  } catch {
    return "";
  }
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

function pageConstruction(site) {
  const nom = String(site?.nom || "").trim();

  return pagePublique({
    titre: "Site en construction",
    message:
      (nom && nom !== String(site?.domaines?.[0] || "") ? `${nom} sera prochainement disponible.` : "Ce site sera prochainement disponible."),
    etat: "construction",
    marque: nom || String(site?.domaines?.[0] || "").trim() || "Site en construction",
    recherche: false
  });
}

function pagePublique({
  titre,
  message,
  etat = "indisponible",
  marque = "DemainSite Ecosystème",
  recherche = true
}) {
  const icone =
    etat === "maintenance" || etat === "construction"
      ? "🚧"
      : "🌐";

  return `
    <div class="dse-public-page">

      <div class="dse-public-overlay"></div>

      <main class="dse-public-centre">

        <section class="dse-public-card">

          <div class="dse-public-marque">
            <div class="dse-public-logo">DS</div>
            <span>${escapeHtml(marque)}</span>
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

          ${recherche ? `<form
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

          </form>` : ""}

          <div class="dse-public-separateur"></div>

          <div class="dse-public-signature">
            ${escapeHtml(marque)}
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
    if (!estActif(module) || !estValide(module)) {
      continue;
    }

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
   IMAGE HERO
   ========================================================= */

const CHAMPS_URL_MEDIA = [
  "MEDIA-URL",
  "URL"
];

function idsRelation(element, relation) {
  const valeur =
    element?.relations?.[relation];

  if (!valeur) {
    return [];
  }

  return (
    Array.isArray(valeur)
      ? valeur
      : [valeur]
  )
    .map((item) => String(item?.id ?? ""))
    .filter(Boolean);
}

/*
 * Priorité 1 : média OBJ-MEDIA hydraté par l'API, retenu
 * uniquement si son ID natif SharePoint correspond à la
 * relation OBJ-MEDIA du contenu et s'il expose une URL
 * exploitable par le navigateur.
 * Priorité 2 : IMAGE-URL historique, en repli.
 */
function imageHero(contenu) {
  const idsMedia =
    idsRelation(contenu, "OBJ-MEDIA");

  const medias =
    (
      Array.isArray(contenu?.media)
        ? contenu.media
        : [contenu?.media]
    ).filter(Boolean);

  for (const media of medias) {
    if (!idsMedia.includes(String(media?.id ?? ""))) {
      continue;
    }

    // Le fichier est servi par l'API a partir de l'ID natif OBJ-MEDIA.
    const candidats = [
      media.url,
      ...CHAMPS_URL_MEDIA.map((champ) =>
        valeurConfiguration(
          media.configuration,
          champ
        )
      ),
      `${CONFIG.API_BASE_URL}/media/${encodeURIComponent(media.id)}`
    ];

    for (const candidat of candidats) {
      const url =
        urlSure(candidat, { lien: false });

      if (url) {
        return {
          url,
          source: "OBJ-MEDIA",
          mediaId: String(media.id)
        };
      }
    }
  }

  const repli =
    urlSure(
      valeurConfiguration(
        contenu?.configuration,
        "IMAGE-URL"
      ),
      { lien: false }
    );

  return repli
    ? { url: repli, source: "IMAGE-URL", mediaId: "" }
    : null;
}

/*
 * Une image inaccessible (ex. lien SharePoint non public)
 * est retirée proprement au lieu d'afficher une image cassée.
 */
document.addEventListener(
  "error",
  (event) => {
    const cible = event.target;

    if (
      cible instanceof HTMLImageElement &&
      cible.classList.contains("dse-hero-image")
    ) {
      cible
        .closest(".dse-hero")
        ?.classList.remove("dse-hero--avec-image");

      cible
        .closest(".dse-hero-media")
        ?.remove();
    }
  },
  true
);

function rendreBoutonHero(texte, url, variante) {
  const href =
    urlSure(url);

  if (!texte || !href) {
    return "";
  }

  return `
      <a
        class="btn ${variante} dse-hero-bouton"
        href="${escapeHtml(href)}"
      >
        ${escapeHtml(texte)}
      </a>
    `;
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

  const altImage =
    String(
      valeurConfiguration(
        configuration,
        "IMAGE-ALT"
      ) ?? ""
    ).trim();

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

  const boutons = [
    rendreBoutonHero(
      bouton1Texte,
      bouton1Url,
      "btn-primary"
    ),
    rendreBoutonHero(
      bouton2Texte,
      bouton2Url,
      "btn-secondary"
    )
  ].filter(Boolean);

  const image =
    imageHero(hero.contenu);

  return `
    <section
      class="dse-hero${image ? " dse-hero--avec-image" : ""}"
      data-module-id="${escapeHtml(hero.module?.id ?? "")}"
      data-contenu-id="${escapeHtml(hero.contenu?.id ?? "")}"
    >

      ${
        image
          ? `
            <figure
              class="dse-hero-media"
              data-image-source="${escapeHtml(image.source)}"
              data-media-id="${escapeHtml(image.mediaId)}"
            >
              <img
                class="dse-hero-image"
                src="${escapeHtml(image.url)}"
                alt="${escapeHtml(altImage === "ND" ? "" : altImage)}"
                decoding="async"
                fetchpriority="high"
              >
            </figure>
          `
          : ""
      }

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

    if (site?.etat === "construction") {
      return pageConstruction(site);
    }

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
      return pageConstruction(site);
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

    const pageRacine =
      trouverPageRacine(
        siteComplet
      );

    const page =
      pageRacine &&
      estActif(pageRacine) &&
      estValide(pageRacine)
        ? pageRacine
        : null;

    if (!page) {
      return pageConstruction(site);
    }

    /* -----------------------------------------------------
       PAGE → MODULE → HERO
       ----------------------------------------------------- */

    const hero =
      trouverHero(page);

    const nomPublic = String(
      siteComplet.site?.nom ?? site?.nom ?? ""
    ).trim();

    if (nomPublic) {
      document.title = nomPublic;
    }

    document
      .querySelector('meta[name="description"]')
      ?.remove();

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