import { getSiteByDomain } from "../services/domaine.service.js";
import { getSiteFull } from "../services/site.service.js";
import { setState } from "../js/state.js";

function messagePage(titre, message) {
  return `
    <section class="page">
      <div class="card">
        <h1 class="page-title">${titre}</h1>
        <p>${message}</p>
      </div>
    </section>
  `;
}

function trouverAccueil(data) {
  const pages = Array.isArray(data?.pages)
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

export async function accueilPage(domaine) {
  const domaineCourant = String(domaine ?? "")
    .trim()
    .toLowerCase();

  if (!domaineCourant) {
    return messagePage(
      "Site indisponible",
      "Aucun domaine valide n'a été détecté."
    );
  }

  try {
    const reponseSite = await getSiteByDomain(domaineCourant);
    const site = reponseSite?.donnees ?? reponseSite;

    const siteId =
      site?.id ??
      site?.ID ??
      site?.siteId ??
      site?.siteID;

    if (!siteId) {
      return messagePage(
        "Site indisponible",
        "Aucun site n'est configuré pour ce domaine."
      );
    }

    const reponseComplete = await getSiteFull(siteId);
    const siteComplet =
      reponseComplete?.donnees ??
      reponseComplete;

    if (!siteComplet) {
      return messagePage(
        "Site en construction",
        "Ce site est actuellement en préparation ou en maintenance."
      );
    }

    setState({
      currentDomain: domaineCourant,
      currentSite: site,
      currentSiteFull: siteComplet
    });

    const accueil = trouverAccueil(siteComplet);

    if (!accueil) {
      return messagePage(
        "Site en construction",
        "Ce site est actuellement en préparation ou en maintenance."
      );
    }

    const titre =
      accueil?.titre ??
      accueil?.title ??
      accueil?.nom ??
      "Accueil";

    return messagePage(titre, "");
  } catch (error) {
    console.error("[DSE] Accueil indisponible", error);

    return messagePage(
      "Site indisponible",
      "Le site correspondant à ce domaine n'est pas disponible."
    );
  }
}