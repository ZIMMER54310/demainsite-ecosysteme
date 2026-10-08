// En-tete public generique (fonction PURE, sans DOM).
// Alimente par SharePoint : OBJ-ENTETE-SITE (titre, NOTE-COURTE), OBJ-LOGO-SITE (media
// resolu par l'API depuis OBJ-MEDIA) et OBJ-MENU-SITE (liens renseignes uniquement).
// Seuls les elements actifs et valides sont affiches ; a defaut, le nom du site.
import { escapeHtml, urlSure, estActif, estValide } from "../public/outils.js";

const publie = (el) => Boolean(el) && estActif(el) && estValide(el);

const cle = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]/g, "");

function champ(element, ...prefixes) {
  const configuration = element?.configuration || {};
  const nom = Object.keys(configuration).find((k) => prefixes.some((p) => cle(k).startsWith(p)));
  const v = nom ? configuration[nom] : null;
  const t = typeof v === "string" ? v.trim() : v;
  return t && String(t).toUpperCase() !== "ND" ? t : null;
}

const liste = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function rendreArbreMenu(entrees, pageUrl) {
  if (!Array.isArray(entrees)) return "";
  return entrees.map((item) => {
    const href = urlSure(item?.url);
    const titre = String(item?.titre ?? "").trim();
    if (!href || !titre) return "";
    const active = pageUrl && urlSure(pageUrl) === href;
    const cible = item.nouvelleFenetre ? ' target="_blank" rel="noopener noreferrer"' : "";
    const enfants = rendreArbreMenu(item.enfants, pageUrl);
    return `<li><a href="${escapeHtml(href)}"${active ? ' aria-current="page"' : ""}${cible}>${escapeHtml(titre)}</a>${enfants ? `<ul>${enfants}</ul>` : ""}</li>`;
  }).join("");
}

export function rendreEntete({ nomSite = "", entete = null, logo = null, menu = [], menuArbre = null, pageUrl = "", nettoyerTexte = (v) => String(v ?? "") } = {}) {
  const e = liste(entete).find(publie) || null;
  const l = liste(logo).find(publie) || null;
  const titre = String((e && champ(e, "TITRE")) || nomSite || "").trim();
  const accroche = e ? String(nettoyerTexte(champ(e, "NOTECOURTE")) ?? "").trim() : "";
  const image = urlSure(l?.media?.url, { lien: false });
  const liens = liste(menu).filter(publie).map((m) => ({
    texte: String(champ(m, "TITRE") ?? "").trim(),
    url: urlSure(champ(m, "URL", "LIEN"))
  })).filter((m) => m.texte && m.url);
  const arbre = rendreArbreMenu(menuArbre?.entrees, pageUrl);
  const navigation = arbre
    ? `<nav class="dse-entete-menu" aria-label="Navigation principale"><ul>${arbre}</ul></nav>`
    : liens.length
      ? `<nav class="dse-entete-menu" aria-label="Menu principal">${liens.map((m) => `<a href="${escapeHtml(m.url)}">${escapeHtml(m.texte)}</a>`).join("")}</nav>`
      : "";

  if (!titre && !image && !navigation) return "";

  return `<div class="dse-site-public-header" role="banner">
      <a href="/" aria-label="${escapeHtml(titre || "Accueil")}">${image ? `<img class="dse-entete-logo" src="${escapeHtml(image)}" alt="${escapeHtml(titre)}">` : ""}${titre ? `<span>${escapeHtml(titre)}</span>` : ""}</a>
      ${accroche ? `<p class="dse-entete-accroche">${escapeHtml(accroche)}</p>` : ""}
      ${navigation}
    </div>`;
}

export const renderEnteteModule=data=>`<div class="module card"><h3>En-tête</h3><p class="muted">${data?"En-tête disponible.":"Aucune donnée associée."}</p></div>`;
