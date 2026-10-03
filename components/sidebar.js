import { getState } from "../js/state.js";
import { escapeHtml } from "../public/outils.js";
// Navigation du cockpit unique : construite par le serveur selon utilisateur, role, perimetre et applications.
const repli = [["/cockpit", "🏠", "Cockpit"]];
export function renderSidebar() {
  const current = (location.hash.slice(1) || "/").split("?")[0];
  const menu = getState()?.user?.menu;
  const entrees = Array.isArray(menu) && menu.length
    ? menu.filter((m) => typeof m.url === "string" && m.url.startsWith("/cockpit")).map((m) => [m.url, m.icone || "•", m.libelle || ""])
    : repli;
  return `<nav class="sidebar" aria-label="Navigation principale"><div class="nav-list">${entrees.map(([p, i, l]) => `<a class="nav-link ${current === p ? "active" : ""}" href="#${escapeHtml(p)}"><span aria-hidden="true">${escapeHtml(i)}</span><span>${escapeHtml(l)}</span></a>`).join("")}</div></nav>`;
}
