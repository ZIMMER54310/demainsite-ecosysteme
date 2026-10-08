import { getSiteByDomain } from "../services/domaine.service.js";
import { getSiteFull } from "../services/site.service.js";
import { setState } from "../js/state.js";
import { CONFIG } from "../js/config.js";
import {
  escapeHtml,
  valeurConfiguration,
  valeurUrl,
  urlSure,
  estActif,
  estValide,
  relationEst,
  trouverContenuModule
} from "../modules/public/outils.js";
import { rendreFooter } from "../modules/footer/footer.js";
import { rendreBuilder, STYLES_BUILDER } from "../modules/builder/rendu.js";
import { apiGet } from "../js/api.js";
import { rendreSituation } from "../modules/situation/situation.js";
import { rendreEntete as enteteSharePoint } from "../modules/entete/entete.js";
import { donneesSeo, appliquerSeo } from "../modules/seo/seo.js";

/* =========================================================
   OUTILS
   ========================================================= */

function normaliserDomaine(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
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

  if (!globalThis.document) {
    return String(value).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
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
   PAGE GENERIQUE « SITUATION DU SITE »
   Une seule page pour toute situation non ACTIF : les données
   proviennent de SharePoint, le code ne connaît aucun statut.
   ========================================================= */

// En-tete SharePoint du site (OBJ-ENTETE-SITE, OBJ-LOGO-SITE, OBJ-MENU-SITE).
function donneesEntete(complet) {
  return {
    entete: complet?.entete?.donnees ?? null,
    logo: complet?.logo?.donnees ?? null,
    menu: complet?.menu?.donnees ?? [],
    menuArbre: complet?.menu?.menuPublie ?? null
  };
}

// Elements communs (En-tete, Footer) d'un site en situation : jamais de page.
function communsSituation(complet) {
  appliquerSeo(document, donneesSeo(complet?.seo?.donnees, { nomSite: complet?.site?.nom ?? "", nettoyerTexte: texteSharePoint }));
  return {
    footer: trouverFooter({ modules: complet?.communs?.modules ?? [] }),
    entete: donneesEntete(complet)
  };
}

function pageSituation(site = null, communs = {}) {
  return rendreSituation(site?.situation ?? null, {
    nomSite: site?.nom && site.nom !== site?.domaines?.[0] ? site.nom : "",
    domaine: site?.domaines?.[0] ?? "",
    footer: communs.footer ?? null,
    entete: communs.entete ?? null,
    nettoyerTexte: texteSharePoint
  });
}

async function chargerCommunsSituation(siteId) {
  if (!siteId) return {};
  try {
    return communsSituation((await getSiteFull(siteId))?.donnees);
  } catch {
    return {};
  }
}

/* =========================================================
   RECHERCHE DE LA PAGE RACINE
   ========================================================= */

function trouverPageRacine(data, pageId = null, siteId = null) {
  const pages =
    Array.isArray(data?.pages?.donnees)
      ? data.pages.donnees
      : [];

  if (!pages.length) {
    return null;
  }

  const pagesDuSite = siteId
    ? pages.filter((page) => relationEst(page, "OBJ-SITE-PUBLIC", siteId))
    : pages;

  if (pageId) {
    return pagesDuSite.find((page) => String(page.id) === String(pageId)) ?? null;
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
    pagesDuSite.find((page) => {
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

/* =========================================================
   CONTENU HERO
   ========================================================= */

const trouverHero = (page) => trouverContenuModule(page, "hero");
const trouverFooter = (page) => trouverContenuModule(page, "footer");

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
globalThis.document?.addEventListener?.(
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
  hero,
  footer,
  entete,
  composition
}) {
  const nomSite = String(
    site?.nom ??
    page?.configuration?.["Titre OBJ-PAGE-SITE-PUBLIC"] ??
    ""
  ).trim();
  const typesComposition = new Set(
    (composition?.sections || []).flatMap((section) =>
      (section.lignes || []).flatMap((ligne) =>
        (ligne.colonnes || []).flatMap((colonne) =>
          (colonne.modules || []).map((module) => String(module.type || "").toUpperCase())
        )
      )
    )
  );
  const pageUrl = String(page?.configuration?.URL ?? page?.url ?? "/");
  const enteteHistorique = () => enteteSharePoint({ nomSite, ...entete, pageUrl, nettoyerTexte: texteSharePoint });
  const footerHistorique = rendreFooter(footer, { nomSite, nettoyerTexte: texteSharePoint });
  // En-tete / Footer construits (Constructeur DSE) : prioritaires s'ils sont affectes a la page, actifs et valides.
  const zone = (z, classe) => {
    const html = z?.sections?.length ? rendreBuilder({ mode: "builder", sections: z.sections, style: z.style, responsive: z.responsive, theme: composition?.theme },
      { apiBase: CONFIG.API_BASE_URL,
        adapteurs: classe === "entete" ? { HEADER: enteteHistorique } : { FOOTER: () => footerHistorique },
        prefixe: classe === "entete" ? "e" : "f", typeConteneur: classe === "entete" ? "ENTETE" : "FOOTER" }) : "";
    return html ? `<${classe === "entete" ? "header" : "footer"} class="dse-b-${classe}"><style>${STYLES_BUILDER}</style>${html}</${classe === "entete" ? "header" : "footer"}>` : "";
  };
  const enteteConstruit = zone(composition?.entete, "entete");
  const footerConstruit = zone(composition?.footer, "footer");
  const rendreEntete = () => enteteConstruit || enteteHistorique();
  const footerHtml = footerConstruit || footerHistorique;

  // Mode Builder : prioritaire uniquement si une composition validee existe ; sinon rendu historique.
  const builder = rendreBuilder(composition, {
    apiBase: CONFIG.API_BASE_URL, prefixe: "p", typeConteneur: "PAGE",
    adapteurs: {
      HERO: () => (hero ? rendreHero(hero) : ""),
      FOOTER: () => footerHtml,
      HEADER: rendreEntete
    }
  });

  if (builder) {
    return `
    <div class="dse-site-public" data-site-id="${escapeHtml(site?.id ?? "")}" data-page-id="${escapeHtml(page?.id ?? "")}">
      <style>${STYLES_BUILDER}</style>
      ${typesComposition.has("HEADER") ? "" : rendreEntete()}
      <main class="dse-site-public-main">${builder}</main>
      ${typesComposition.has("FOOTER") ? "" : footerHtml}
    </div>`;
  }

  return `
    <div
      class="dse-site-public"
      data-site-id="${escapeHtml(site?.id ?? "")}"
      data-page-id="${escapeHtml(page?.id ?? "")}"
    >

      ${rendreEntete()}

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

        <section
          class="dse-catalogue"
          data-dse-catalogue
          aria-label="Catalogue"
          hidden
        ></section>

      </main>

      ${footerHtml}

    </div>
  `;
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
    return pageSituation();
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

    // Regle unique : ACTIF (etat "normal") = vrai site ; toute autre situation = page generique.
    if (site?.etat !== "normal" || !siteId) {
      return pageSituation(site, await chargerCommunsSituation(siteId));
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
      return pageSituation(site);
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

    const pageIdConfiguree = site?.pageId
      ?? siteComplet.site?.relations?.["PAGE-PUBLIQUE"]?.id
      ?? null;
    const pageRacine = trouverPageRacine(
      siteComplet,
      pageIdConfiguree,
      siteId
    );

    const page =
      pageRacine &&
      estActif(pageRacine) &&
      estValide(pageRacine)
        ? pageRacine
        : null;

    if (!page) {
      return pageSituation(site, communsSituation(siteComplet));
    }

    /* -----------------------------------------------------
       PAGE → MODULE → HERO
       ----------------------------------------------------- */

    const hero =
      trouverHero(page);

    const footer =
      trouverFooter(page);

    const nomPublic = String(
      siteComplet.site?.nom ?? site?.nom ?? ""
    ).trim();

    appliquerSeo(document, donneesSeo(siteComplet.seo?.donnees, { nomSite: nomPublic, nettoyerTexte: texteSharePoint }));

    /* -----------------------------------------------------
       RENDU
       ----------------------------------------------------- */

    const composition = await apiGet("/builder/page", { domaine: domaineCourant })
      .then((r) => r?.donnees ?? null);

    return rendreSitePublic({
      site:
        siteComplet.site ??
        site,

      page,
      hero,
      footer,
      entete: donneesEntete(siteComplet),
      composition
    });

  } catch {
    console.error("[DSE] Accueil public indisponible");

    return pageSituation();
  }
}
/* =========================================================
   RENDUS PUBLICS REUTILISES PAR L'APERCU DU COCKPIT
   (memes fonctions que le site visiteur : aucun ecart d'affichage)
   ========================================================= */

export function rendusPublics(siteComplet, siteId = null) {
  const page = trouverPageRacine(siteComplet, siteComplet?.site?.relations?.["PAGE-PUBLIQUE"]?.id ?? null, siteId);
  const nomSite = String(siteComplet?.site?.nom ?? "").trim();
  const footer = (page && trouverFooter(page)) || trouverFooter({ modules: siteComplet?.communs?.modules ?? [] });
  return {
    entete: enteteSharePoint({ nomSite, ...donneesEntete(siteComplet), pageUrl: String(page?.configuration?.URL ?? "/"), nettoyerTexte: texteSharePoint }),
    footer: rendreFooter(footer, { nomSite, nettoyerTexte: texteSharePoint }),
  };
}

export const rendreHeroPublic = (contenu) => rendreHero({ contenu });
