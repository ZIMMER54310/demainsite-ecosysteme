import { CONFIG } from "../js/config.js";
import { escapeHtml as e } from "../modules/public/outils.js";
import { icon } from "./icons.js";
import { rendreVersion } from "../js/mise-a-jour.js";

export function renderHeader(status, user) {
  const ok = status?.succes === true;
  const initials = (user?.displayName || "").trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("");
  return `<div class="topbar">
    <a class="brand" href="#/cockpit"><span class="brand-mark">DS</span><span>${e(CONFIG.APP_NAME)}<small>Votre espace de gestion</small></span></a>
    ${user?.reconnu && user.fonctions?.includes("sites") ? `<form class="cockpit-recherche-globale" data-recherche-cockpit role="search">${icon("search")}<label class="sr-only" for="recherche-cockpit">Rechercher un site ou un domaine</label><input id="recherche-cockpit" name="q" type="search" placeholder="Rechercher un site, un domaine…"><button class="sr-only" type="submit">Rechercher</button></form>` : ""}
    <div class="topbar-actions">${rendreVersion()}<span class="status ${ok ? "" : "off"}">${ok ? "Service disponible" : "Service à vérifier"}</span>
    ${user?.authenticated ? `<details class="cockpit-profil"><summary aria-label="${e(user.displayName || "Mon espace")}"><span class="cockpit-avatar">${e(initials || "DS")}</span><span>${e(user.displayName || "Mon espace")}<small>${e(user.role?.titre || "")}</small></span></summary><a href="/api/v1/auth/deconnexion">Se déconnecter</a></details>` : ""}</div>
  </div>`;
}
