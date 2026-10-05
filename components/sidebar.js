import { getState } from "../js/state.js";
import { escapeHtml } from "../modules/public/outils.js";
import { icon, iconForRoute } from "./icons.js";
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
  const current = (location.hash.slice(1) || "/").split("?")[0];
  const user = getState()?.user;
  const menu = user?.menu;
  const entrees = Array.isArray(menu) && menu.length
    ? menu.filter((m) => typeof m.url === "string" && m.url.startsWith("/cockpit")).map((m) => [m.url, m.icone || "•", m.libelle || ""])
    : repli;
  return `<nav class="sidebar" aria-label="Navigation principale"><div class="nav-list">${rendreVoirSite(user, current)}${entrees.map(([p, , l]) => `<a class="nav-link ${current === p ? "active" : ""}"${current === p ? ' aria-current="page"' : ""} href="#${escapeHtml(p)}" title="${escapeHtml(l)}">${icon(iconForRoute(p))}<span>${escapeHtml(l)}</span></a>`).join("")}</div>
    <div class="cockpit-sidebar-bas"><button type="button" class="nav-link" data-reduire-menu aria-expanded="true">${icon("panel")}<span>Réduire le menu</span></button><small>${escapeHtml(user?.role?.titre || "Espace de gestion")}</small></div></nav>`;
}
