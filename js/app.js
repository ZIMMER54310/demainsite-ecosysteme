"use strict";

const CONFIG_URL = "data/site.json";

const $ = (id) => document.getElementById(id);
const text = (id, value = "") => { const node = $(id); if (node) node.textContent = value; };

function applyTheme(theme = {}) {
  const root = document.documentElement;
  const map = {
    primary: "--primary",
    primaryDark: "--primary-dark",
    secondary: "--secondary",
    accent: "--accent"
  };
  Object.entries(map).forEach(([key, variable]) => {
    if (theme[key]) root.style.setProperty(variable, theme[key]);
  });
}

function createLink(item, className = "") {
  const link = document.createElement("a");
  link.href = item.url || "#";
  link.textContent = item.label || item.titre || "Ouvrir";
  if (className) link.className = className;
  if (item.externe) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  return link;
}

function renderLinks(containerId, items = [], className = "") {
  const container = $(containerId);
  container.replaceChildren(...items.map((item) => createLink(item, className)));
}

function renderCards(containerId, items = [], type = "card") {
  const container = $(containerId);
  const nodes = items.map((item) => {
    const article = document.createElement("article");
    article.className = type;

    if (item.icone && type === "card") {
      const icon = document.createElement("div");
      icon.className = "card-icon";
      icon.textContent = item.icone;
      icon.setAttribute("aria-hidden", "true");
      article.appendChild(icon);
    }

    const title = document.createElement("h3");
    title.textContent = item.titre || "";
    article.appendChild(title);

    if (item.description) {
      const paragraph = document.createElement("p");
      paragraph.textContent = item.description;
      article.appendChild(paragraph);
    }

    if (item.url) article.appendChild(createLink({ label: item.lien || "Découvrir", url: item.url }));
    return article;
  });
  container.replaceChildren(...nodes);
}

function setSection(prefix, section = {}) {
  text(`${prefix}Eyebrow`, section.surTitre);
  text(`${prefix}Title`, section.titre);
  text(`${prefix}Text`, section.texte);
}

function render(config) {
  document.documentElement.lang = config.langue || "fr";
  document.title = config.seo?.titre || config.site?.nom || "DemainSite";
  document.querySelector('meta[name="description"]').content = config.seo?.description || "";

  applyTheme(config.theme);
  text("brandMark", config.site?.initiales || "DS");
  text("brandName", config.site?.nom);
  text("brandTagline", config.site?.signature);
  $("brandLink").href = config.site?.urlAccueil || "./";

  renderLinks("mainMenu", config.navigation);

  text("heroEyebrow", config.hero?.surTitre);
  text("heroTitle", config.hero?.titre);
  text("heroText", config.hero?.texte);
  renderLinks("heroActions", config.hero?.actions, "button button-primary");

  text("statusTitle", config.statut?.titre);
  text("statusText", config.statut?.texte);

  setSection("services", config.services);
  renderCards("serviceGrid", config.services?.elements, "card");

  setSection("univers", config.univers);
  renderCards("universGrid", config.univers?.elements, "universe");

  setSection("cta", config.appelAction);
  renderLinks("ctaActions", config.appelAction?.actions, "button button-secondary");

  text("footerText", config.piedDePage?.texte);
  renderLinks("footerMenu", config.piedDePage?.liens);
}

function showError(error) {
  $("errorPanel").hidden = false;
  text("errorText", error.message || String(error));
  text("statusTitle", "Configuration indisponible");
  text("statusText", "Vérifiez le fichier data/site.json.");
  console.error(error);
}

function setupMenu() {
  const button = $("menuButton");
  const menu = $("mainMenu");
  button.addEventListener("click", () => {
    const open = menu.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
  });
}

async function start() {
  setupMenu();
  try {
    const response = await fetch(CONFIG_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Chargement JSON impossible (${response.status}).`);
    render(await response.json());
  } catch (error) {
    showError(error);
  }
}

document.addEventListener("DOMContentLoaded", start);
