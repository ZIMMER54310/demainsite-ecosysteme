import { estActif, estValide } from "../public/outils.js";
export const renderSeoModule=data=>`<div class="module card"><h3>SEO</h3><p class="muted">${data?"Informations SEO disponibles.":"Aucune donnée associée."}</p></div>`;
// SEO public generique (OBJ-SEO actif + valide) : Title -> titre, NOTE-COURTE -> description.

const cleSeo = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]/g, "");

function texteSeo(configuration, prefixe, nettoyer) {
  const nom = Object.keys(configuration || {}).find((k) => cleSeo(k).startsWith(prefixe));
  const v = nom ? String(nettoyer(configuration[nom]) ?? "").trim() : "";
  return v && v.toUpperCase() !== "ND" ? v : "";
}

export function donneesSeo(seo, { nomSite = "", nettoyerTexte = (v) => String(v ?? "") } = {}) {
  const el = (Array.isArray(seo) ? seo : [seo]).find((s) => s && estActif(s) && estValide(s));
  return {
    titre: (el && texteSeo(el.configuration, "TITRE", nettoyerTexte)) || String(nomSite || "").trim(),
    description: el ? texteSeo(el.configuration, "NOTECOURTE", nettoyerTexte) : ""
  };
}

// Applique au document ; sans description SharePoint, la meta description est retiree.
export function appliquerSeo(doc, { titre, description }) {
  if (!doc) return;
  if (titre) doc.title = titre;
  let meta = doc.querySelector('meta[name="description"]');
  if (!description) { meta?.remove(); return; }
  if (!meta) { meta = doc.createElement("meta"); meta.setAttribute("name", "description"); doc.head.appendChild(meta); }
  meta.setAttribute("content", description);
}
