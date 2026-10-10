import { getState } from "../js/state.js";
import { escapeHtml } from "../modules/public/outils.js";
import { icon, iconForRoute } from "./icons.js";
import { navigationSite, elementActif } from "../modules/cockpit/navigation-site.js";
// Navigation du cockpit unique : construite par le serveur selon utilisateur, role, perimetre et applications.
const repli = [["/cockpit", "🏠", "Cockpit"]];

const domaineValide = (d) => typeof d === "string" && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d);
const libellePublic = `${icon("globe")}<span>Voir le site</span><span class="nav-public-externe">${icon("external")}</span>`;
function lienPublic(site, libelle, classe = "") {
  return `<a class="nav-link ${classe}" href="https://${escapeHtml(site.domainePrincipal)}/" target="_blank" rel="noopener noreferrer" title="Ouvrir le site public dans un nouvel onglet">${libelle}</a>`;
}

export function rendreVoirSite(user, current) {
  if (!user?.authenticated || !user.reconnu || !current.startsWith("/cockpit")) return "";
  const sites = Array.isArray(user.sitesPublics) ? user.sitesPublics : [];
  const selection = /^\/cockpit\/site\/([^/]+)/.exec(current);
  let site = null;
  if (selection) {
    let domaine;
    try { domaine = decodeURIComponent(selection[1]).trim().toLowerCase().replace(/^www\./, ""); }
    catch { domaine = null; }
    const correspondants = sites.filter((s) => s.domainePrincipal === domaine || s.domaines?.includes(domaine));
    if (correspondants.length === 1) site = correspondants[0];
  } else if (sites.length === 1) site = sites[0];

  if (site && domaineValide(site.domainePrincipal)) return lienPublic(site, libellePublic, "nav-public");
  if (selection || sites.length <= 1) {
    return `<div class="nav-link nav-public nav-public-indisponible" aria-disabled="true" title="${selection && !site ? "Site hors périmètre ou indisponible" : "Domaine principal non renseigné"}">${libellePublic}</div>`;
  }
  return `<details class="nav-public"><summary class="nav-link">${libellePublic}</summary>
    <div class="nav-public-choix" aria-label="Choisir un site public">${sites.map((s) =>
      domaineValide(s.domainePrincipal)
        ? lienPublic(s, `<span>${escapeHtml(s.nom)}<small>${escapeHtml(s.domainePrincipal)}</small></span>`)
        : `<span class="nav-link nav-public-indisponible">${escapeHtml(s.nom)} · Domaine principal non renseigné</span>`
    ).join("")}</div></details>`;
}

// Espaces clients du perimetre (fournis par le serveur) : lien direct si peu nombreux, sinon via « Mes sites ».
export function rendreEspacesClients(user, current, lien) {
  if (user?.porteeGlobale) return lien("/cockpit/espaces", "Espaces", "users", current === "/cockpit/espaces");
  const clients = Array.isArray(user?.clients) ? user.clients : [];
  if (!clients.length) return "";
  if (clients.length > 3) return lien("/cockpit/sites", "Espaces clients", "users", false);
  return clients.map((c) => lien(`/cockpit/client/${encodeURIComponent(c.id)}${user.contexte?.domaine ? `?domaine=${encodeURIComponent(user.contexte.domaine)}` : ""}`, `Espace ${c.titre || "client"}`, "users",
    current === `/cockpit/client/${encodeURIComponent(c.id)}`)).join("");
}

// Gestion transverse (medias, pages, En-tetes, Footer, articles de tous les sites du perimetre).
export function rendreGestionContenus(user, current, lien, { domaineSelectionne = null } = {}) {
  if (!user?.fonctions?.includes("sites") || !["logo-medias", "pages", "entete", "footer"].some((f) => user.fonctions.includes(f))) return "";
  const domaine = domaineSelectionne || user.contexte?.domaine || "";
  const libelle = domaineSelectionne ? "Gérer ce site"
    : user.porteeGlobale ? "Gérer tous les sites" : "Gérer ce site";
  return lien(`/cockpit/contenus${domaine ? `?domaine=${encodeURIComponent(domaine)}` : ""}`,
    libelle, "grid", current === "/cockpit/contenus");
}

function groupeAccordeon({ id, titre, classe, ouvert, contenu }) {
  return `<details class="cockpit-nav-groupe ${classe}" name="cockpit-navigation" data-nav-groupe="${id}"${ouvert ? " open" : ""}>
    <summary class="cockpit-nav-accordeon"><span>${escapeHtml(titre)}</span><span class="cockpit-nav-chevron" aria-hidden="true"></span></summary>
    <div class="cockpit-nav-contenu">${contenu}</div>
  </details>`;
}

/*
 * Menu du site selectionne : carte du site (conservee pendant LOADING et ERROR), Vue d'ensemble,
 * « Construire le site » et ses fonctions autorisees (ouvertes dans la partie construction),
 * puis Voir le site / Changer de site. Les entrees viennent des droits renvoyes par le serveur.
 */
function rendreSiteSelectionne(vue, user, route, current, lien) {
  const items = navigationSite(vue, user?.niveau);
  const { actif, parent } = elementActif(items, route);
  const enfants = items.filter((x) => x.enfant);
  const ouvert = Boolean(parent) || (actif && actif.enfant);
  const statut = vue.provisoire ? `<em class="cockpit-site-statut">Chargement…</em>`
    : vue.statut?.titre ? `<em class="cockpit-site-statut${vue.statut.actif ? " est-actif" : ""}">${escapeHtml(vue.statut.titre)}</em>` : "";
  const entree = (x) => {
    if (x.enfant) return "";
    if (/\/construire$/.test(x.url) && enfants.length) {
      const estParent = parent === x;
      return `<div class="cockpit-nav-construire${ouvert ? " est-ouvert" : ""}">${lien(x.url, x.libelle, x.icone, estParent && !actif, estParent && actif ? "is-parent-actif" : "", ` aria-expanded="${ouvert ? "true" : "false"}"`)}
        <div class="cockpit-nav-enfants" role="group" aria-label="${escapeHtml(x.libelle)}"${ouvert ? "" : " hidden"}>${enfants.map((y) => lien(y.url, y.libelle, y.icone, actif === y)).join("")}</div></div>`;
    }
    return lien(x.url, x.libelle, x.icone, actif === x || (parent === x && !actif));
  };
  return `<div aria-label="Travail sur le site sélectionné">
    <div class="cockpit-site-selection"><a href="#${escapeHtml(`/cockpit/site/${encodeURIComponent(vue.acces || vue.domaine)}`)}" title="${escapeHtml(vue.nom || vue.domaine)}">${icon("globe")}<span><strong>${escapeHtml(vue.nom || vue.domaine || vue.acces)}</strong><small>${escapeHtml(vue.domaine || vue.acces)}</small>${statut}</span></a></div>
    ${items.map(entree).join("")}
    ${rendreGestionContenus(user, current, lien, { domaineSelectionne: vue.acces || vue.domaine })}
    ${rendreVoirSite(user, current)}</div>`;
}

export function renderSidebar() {
  const route = location.hash.slice(1) || "/";
  const current = route.split("?")[0];
  const user = getState()?.user;
  if (!user?.authenticated) {
    return `<nav class="sidebar" aria-label="Navigation principale"><a class="nav-link nav-public" href="/" title="Retour au site">${icon("globe")}<span>Voir le site</span></a></nav>`;
  }
  const menu = user?.menu;
  const entrees = Array.isArray(menu) && menu.length
    ? menu.filter((m) => typeof m.url === "string" && m.url.startsWith("/cockpit")).map((m) => [m.url, m.icone || "•", m.libelle || ""])
    : repli;
  const selection = /^\/cockpit\/site\/([^/]+)/.exec(current);
  const vue = getState().selectedSite;
  const correspond = selection && vue && selection[1] === encodeURIComponent(vue.acces || vue.domaine);
  const lien = (p, l, i, actif, classe = "", attributs = "") => `<a class="nav-link ${actif ? "active" : ""} ${classe}"${actif ? ' aria-current="page"' : ""}${attributs} href="#${escapeHtml(p)}" title="${escapeHtml(l)}">${icon(i)}<span>${escapeHtml(l)}</span></a>`;
  const renderItems = (items) => items.map(([p, , l]) => lien(p,
    correspond && p === "/cockpit" ? "Cockpit général" : l,
    iconForRoute(p.split("?")[0]), current === p.split("?")[0])).join("");
  const navigation = entrees.filter(([p]) => ["/cockpit", "/cockpit/sites"].includes(p.split("?")[0]));
  const fonctionsGlobales = entrees.filter(([p]) =>
    !["/cockpit", "/cockpit/sites"].includes(p.split("?")[0]) && !p.startsWith("/cockpit/site/"));
  const siteSelectionne = selection
    ? correspond ? rendreSiteSelectionne(vue, user, route, current, lien)
      : `<p class="muted cockpit-nav-site-attente" role="status">${vue?.provisoire ? "Chargement du site…" : "Les fonctions du site apparaîtront après vérification du contexte."}</p>`
    : `<p class="muted cockpit-nav-site-attente">Sélectionnez un site pour afficher ses fonctions.</p>`;
  const navigationContenu = navigation.map(([p, , l]) => [p, "",
    selection && p.split("?")[0] === "/cockpit/sites" ? "Changer de site"
      : correspond && p === "/cockpit" ? "Cockpit général" : l]);
  if (selection && user?.fonctions?.includes("sites") &&
      !navigationContenu.some(([p]) => p.split("?")[0] === "/cockpit/sites")) {
    navigationContenu.push(["/cockpit/sites", "", "Changer de site"]);
  }
  const globalContenu = `${renderItems(fonctionsGlobales)}${!selection && user?.porteeGlobale ? rendreGestionContenus(user, current, lien) : ""}${rendreEspacesClients(user, current, lien)}`;
  const groupeActif = selection ? "site"
    : navigation.some(([p]) => p.split("?")[0] === current) ? "navigation" : "global";
  return `<nav class="sidebar" aria-label="Navigation principale"><div class="nav-list">
    ${groupeAccordeon({ id: "navigation", titre: "Navigation générale", classe: "cockpit-nav-administration",
      ouvert: groupeActif === "navigation", contenu: renderItems(navigationContenu) })}
    ${groupeAccordeon({ id: "site", titre: "Site sélectionné", classe: "cockpit-nav-site",
      ouvert: groupeActif === "site", contenu: siteSelectionne })}
    ${groupeAccordeon({ id: "global", titre: "Fonctions globales", classe: "cockpit-nav-global",
      ouvert: groupeActif === "global", contenu: globalContenu })}
  </div>
    <div class="cockpit-sidebar-bas"><button type="button" class="nav-link" data-reduire-menu aria-expanded="true">${icon("panel")}<span>Réduire le menu</span></button><small>Espace de gestion</small><small>${escapeHtml(user?.displayName || "")}</small></div></nav>`;
}
