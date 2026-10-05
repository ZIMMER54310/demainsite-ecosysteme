import { getState } from "../js/state.js";
import { escapeHtml } from "../modules/public/outils.js";
import { icon, iconForRoute } from "./icons.js";
import { navigationSite } from "../modules/cockpit/navigation-site.js";
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

export function renderSidebar() {
  const route = location.hash.slice(1) || "/";
  const current = route.split("?")[0];
  const user = getState()?.user;
  const menu = user?.menu;
  const entrees = Array.isArray(menu) && menu.length
    ? menu.filter((m) => typeof m.url === "string" && m.url.startsWith("/cockpit")).map((m) => [m.url, m.icone || "•", m.libelle || ""])
    : repli;
  const selection = /^\/cockpit\/site\/([^/]+)/.exec(current);
  const vue = getState().selectedSite;
  const correspond = selection && vue && selection[1] === encodeURIComponent(vue.acces || vue.domaine);
  const lien = (p, l, i, actif) => `<a class="nav-link ${actif ? "active" : ""}"${actif ? ' aria-current="page"' : ""} href="#${escapeHtml(p)}" title="${escapeHtml(l)}">${icon(i)}<span>${escapeHtml(l)}</span></a>`;
  const global = (items) => items.map(([p, , l]) => lien(p, correspond && p === "/cockpit" ? "Cockpit général" : l, iconForRoute(p), current === p)).join("");
  const local = correspond ? `<div class="cockpit-site-selection"><small>Site sélectionné</small><a href="#${escapeHtml(`/cockpit/site/${encodeURIComponent(vue.acces || vue.domaine)}`)}" title="${escapeHtml(vue.nom || vue.domaine)}">${icon("globe")}<span><strong>${escapeHtml(vue.nom || vue.domaine || vue.acces)}</strong><small>${escapeHtml(vue.domaine || vue.acces)}</small></span></a></div>
    ${navigationSite(vue, user?.niveau).map((x) => lien(x.url, x.libelle, x.icone, route === x.url)).join("")}
    ${rendreVoirSite(user, current)}${user?.fonctions?.includes("sites") ? lien("/cockpit/sites", "Changer de site", "arrow", false) : ""}` : "";
  return `<nav class="sidebar" aria-label="Navigation principale"><div class="nav-list">${correspond
    ? `${global(entrees.filter(([p]) => ["/cockpit", "/cockpit/sites"].includes(p)))}${local}<div class="cockpit-nav-globale">${global(entrees.filter(([p]) => !["/cockpit", "/cockpit/sites"].includes(p)))}</div>`
    : `${rendreVoirSite(user, current)}${global(entrees)}`}</div>
    <div class="cockpit-sidebar-bas"><button type="button" class="nav-link" data-reduire-menu aria-expanded="true">${icon("panel")}<span>Réduire le menu</span></button><small>${escapeHtml(user?.role?.titre || "Espace de gestion")}</small></div></nav>`;
}
