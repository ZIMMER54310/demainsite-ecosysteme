import { getSiteByDomain } from "../services/domaine.service.js";
import { getSiteFull } from "../services/site.service.js";
import { setState } from "../js/state.js";

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

function pagePublique({
  titre,
  message,
  etat = "indisponible"
}) {
  const icone = etat === "maintenance" ? "🚧" : "🌐";

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

          <h1>${escapeHtml(titre)}</h1>

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
              Exemple : <strong>dseco.fr</strong>
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

function trouverAccueil(data) {
  const pages =
    Array.isArray(data?.pages)
      ? data.pages
      : Array.isArray(data?.pages?.donnees)
        ? data.pages.donnees
        : Array.isArray(data?.site?.pages)
          ? data.site.pages
          : [];

  return pages.find((page) => {
    const nom = String(
      page?.nom ??
      page?.titre ??
      page?.title ??
      ""
    )
      .trim()
      .toLowerCase();

    return nom === "accueil";
  });
}

async function verifierDomaine(domaine) {
  const resultat =
    document.querySelector("#dse-domain-result");

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
      await getSiteByDomain(domaineNormalise);

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

export function activerRecherchePublique() {
  const formulaire =
    document.querySelector("#dse-domain-search");

  const champ =
    document.querySelector("#dse-domain-input");

  if (!formulaire || !champ) {
    return;
  }

  formulaire.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      await verifierDomaine(champ.value);
    }
  );
}

export async function accueilPage(domaine) {
  document.body.classList.add("dse-public");

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
    const reponseSite =
      await getSiteByDomain(domaineCourant);

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

    setState({
      currentDomain: domaineCourant,
      currentSite: site,
      currentSiteFull: siteComplet
    });

    const accueil =
      trouverAccueil(siteComplet);

    if (!accueil) {
      return pagePublique({
        titre: "Bientôt en ligne",
        message:
          "Ce site est actuellement en préparation.",
        etat: "maintenance"
      });
    }

    const titre =
      accueil?.titre ??
      accueil?.title ??
      accueil?.nom ??
      "Bienvenue";

    return pagePublique({
      titre,
      message: ""
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