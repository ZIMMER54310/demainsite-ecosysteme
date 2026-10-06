import { escapeHtml } from "../public/outils.js";

// Galerie des sites : cartes deja filtrees par l'API selon les droits SharePoint resolus.
export const CRITERES_GALERIE = ["q", "statut", "cockpit", "tri", "sens", "page", "parPage"];
const TRIS = { nom: "Nom", statut: "Statut", domaine: "Domaine principal" };
const MESSAGE_PASC_ARA = `<p class="galerie-humain"><strong>L’IA vous aide, l’humain reste présent.</strong>
  Pasc ARA IA vous accompagne et vous conseille. Pasc ARA, humain, reste toujours disponible lorsque l’intervention humaine est nécessaire.</p>`;

export function lienGalerie(criteres = {}, changement = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...criteres, ...changement })) if (CRITERES_GALERIE.includes(k) && v) p.set(k, v);
  const q = p.toString();
  return `#/cockpit/galerie${q ? `?${q}` : ""}`;
}

const initiales = (nom) => String(nom || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase();

function carte(c) {
  const titreId = `galerie-${Math.random().toString(36).slice(2, 9)}`;
  const visuel = c.logo
    ? `<img src="${escapeHtml(c.logo)}" alt="Logo de ${escapeHtml(c.nom)}" loading="lazy">`
    : `<span class="galerie-initiales" aria-hidden="true">${escapeHtml(initiales(c.nom))}</span>`;
  const statut = c.statut?.titre
    ? `<span class="galerie-statut"${c.statut.couleur && /^#[0-9a-f]{3,8}$/i.test(c.statut.couleur) ? ` style="--statut:${c.statut.couleur}"` : ""}>${escapeHtml(c.statut.titre)}</span>`
    : `<span class="galerie-statut galerie-statut-vide">Statut non renseigné</span>`;
  return `<li class="galerie-carte" aria-labelledby="${titreId}">
    <div class="galerie-visuel">${visuel}</div>
    <div class="galerie-corps">
      <h3 id="${titreId}">${escapeHtml(c.nom)}</h3>
      ${statut}
      <p class="galerie-domaine">${c.domainePrincipal ? escapeHtml(c.domainePrincipal) : "Domaine principal non renseigné"}</p>
    </div>
    <div class="galerie-actions">
      ${c.urlSite ? `<a class="btn btn-secondary" href="${escapeHtml(c.urlSite)}" target="_blank" rel="noopener noreferrer"
        aria-label="Voir le site ${escapeHtml(c.nom)} (nouvel onglet)">Voir le site</a>` : ""}
      ${c.cockpit ? `<button class="btn btn-primary" type="button" data-ouvrir-cockpit="${escapeHtml(decodeURIComponent(c.cockpit.url.split("/").pop()))}" data-nom="${escapeHtml(c.nom)}"
        aria-label="Ouvrir le cockpit de ${escapeHtml(c.nom)}">Ouvrir le cockpit</button>` : ""}
    </div>
  </li>`;
}

export function rendreGalerie(resultat, erreur = null) {
  const entete = `<header class="cockpit-entete"><h1>Galerie</h1>
    <p>Les sites DemainSite Écosystème auxquels vous avez accès.</p></header>`;
  if (erreur) {
    const refus = erreur.status === 403;
    return `<section class="cockpit galerie">${entete}<div class="card" role="${refus ? "status" : "alert"}">
      <p>${refus ? "La Galerie n’est pas disponible pour votre compte. Rapprochez-vous de votre administrateur si vous pensez qu’elle devrait l’être."
        : "La Galerie est momentanément indisponible. Merci de réessayer dans quelques instants."}</p>
      ${refus ? "" : `<button class="btn btn-secondary" type="button" data-galerie-reessayer>Réessayer</button>`}
      <a class="btn btn-secondary" href="#/cockpit">Retour au cockpit</a></div>${MESSAGE_PASC_ARA}</section>`;
  }
  const r = resultat;
  const c = r.criteres || {};
  const opt = (v, t, sel) => `<option value="${escapeHtml(v)}"${v === sel ? " selected" : ""}>${escapeHtml(t)}</option>`;
  const filtres = `<form class="galerie-filtres card" data-filtres-galerie role="search" aria-label="Rechercher dans la Galerie">
    <label>Rechercher<input type="search" name="q" value="${escapeHtml(c.q || "")}" placeholder="Nom ou domaine" maxlength="100"></label>
    ${r.options.statuts.length > 1 ? `<label>Statut<select name="statut">${opt("", "Tous", c.statut)}${r.options.statuts.map((s) => opt(s, s, c.statut)).join("")}</select></label>` : ""}
    ${r.options.cockpit ? `<label>Cockpit<select name="cockpit">${opt("", "Tous", c.cockpit)}${opt("oui", "Disponible", c.cockpit)}${opt("non", "Non disponible", c.cockpit)}</select></label>` : ""}
    <label>Trier par<select name="tri">${r.options.tris.map((t) => opt(t, TRIS[t] || t, c.tri)).join("")}</select></label>
    <label>Ordre<select name="sens">${opt("asc", "Croissant", c.sens)}${opt("desc", "Décroissant", c.sens)}</select></label>
    <button class="btn btn-primary" type="submit">Rechercher</button>
  </form>`;
  const liste = r.elements.length
    ? `<ul class="galerie-grille" role="list">${r.elements.map(carte).join("")}</ul>`
    : `<div class="card" role="status"><p>Aucun site ne correspond à votre recherche.</p><a class="btn btn-secondary" href="#/cockpit/galerie">Réinitialiser</a></div>`;
  const pagination = r.pages > 1 ? `<nav class="galerie-pagination" aria-label="Pagination de la Galerie">
    ${r.page > 1 ? `<a class="btn btn-secondary" href="${lienGalerie(c, { page: r.page - 1 })}" rel="prev">Précédent</a>` : ""}
    <span aria-current="page">Page ${r.page} sur ${r.pages}</span>
    ${r.page < r.pages ? `<a class="btn btn-secondary" href="${lienGalerie(c, { page: r.page + 1 })}" rel="next">Suivant</a>` : ""}
  </nav>` : "";
  return `<section class="cockpit galerie">${entete}${filtres}
    <p class="galerie-compte" role="status">${r.total} site${r.total > 1 ? "s" : ""}${r.total !== r.totalSites ? ` sur ${r.totalSites}` : ""}</p>
    ${liste}${pagination}<p data-galerie-message role="alert" class="galerie-message"></p>${MESSAGE_PASC_ARA}</section>`;
}

export const chargementGalerie = `<section class="cockpit galerie" aria-busy="true"><p role="status">Chargement de la Galerie…</p></section>`;
