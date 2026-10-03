import { getState } from "../js/state.js";
// Navigation du cockpit unique, filtree par les fonctions accordees par le serveur.
const links = [
  ["/cockpit", "🏠", "Cockpit", null],
  ["/cockpit/sites", "🌐", "Mes sites", "sites"],
  ["/cockpit/creer", "✨", "Créer un site", "creer"]
];
export function renderSidebar() {
  const current = (location.hash.slice(1) || "/").split("?")[0];
  const fonctions = new Set(getState()?.user?.fonctions || []);
  const visibles = links.filter(([, , , f]) => !f || fonctions.has(f));
  return `<nav class="sidebar" aria-label="Navigation principale"><div class="nav-list">${visibles.map(([p, i, l]) => `<a class="nav-link ${current === p ? "active" : ""}" href="#${p}"><span>${i}</span><span>${l}</span></a>`).join("")}</div></nav>`;
}
