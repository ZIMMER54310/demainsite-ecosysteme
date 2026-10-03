// Outils PURS (sans DOM) du rendu public, partages par HERO, FOOTER et tout futur module.

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function valeurConfiguration(configuration, nom) {
  if (!configuration || typeof configuration !== "object") {
    return null;
  }

  const valeur = configuration[nom] ?? null;

  // "ND" = non defini dans SharePoint : jamais affiche publiquement.
  return typeof valeur === "string" && valeur.trim().toUpperCase() === "ND"
    ? null
    : valeur;
}

export function valeurUrl(value) {
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
export function urlSure(value, { lien = true } = {}) {
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

export function relationEst(
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

export function estActif(element) {
  return relationEst(
    element,
    "OBJ-ACTIF",
    "1"
  );
}

export function estValide(element) {
  return relationEst(
    element,
    "OBJ-VALIDE",
    "1"
  );
}

export function modulesPage(page) {
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

export function trouverContenuModule(page, cle) {
  const modules =
    modulesPage(page);

  for (const module of modules) {
    // Le module parent doit être actif ; la validation de publication
    // est portée par le contenu spécialisé (HERO, FOOTER…) lui-même.
    if (!estActif(module)) {
      continue;
    }

    const contenus =
      module?.contenus?.[cle];

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

