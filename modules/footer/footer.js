// Moteur FOOTER generique (pur, sans DOM) : meme rendu pour tous les domaines DSE.
// Contenu 100 % issu de SharePoint (liste OBJ-MODULE-FOOTER, relation vers OBJ-MODULE-SITE-PUBLIC).
// Champs lus (configuration) : TITRE-PRINCIPAL, TEXTE, MENTIONS, LIEN-1..4-TEXTE/URL, BOUTIQUE-TEXTE/URL.
// Aucun footer configure => rien (ou signature minimale avec le nom du site) ; jamais d'erreur.
import {
  escapeHtml,
  valeurConfiguration,
  urlSure
} from "../public/outils.js";

const NB_LIENS = 4;

export function lienExterne(url) {
  return /^https?:\/\//i.test(url);
}

function rendreLien(texte, url, classe) {
  const libelle = String(texte ?? "").trim();
  const cible = urlSure(url);

  if (!libelle || !cible) {
    return "";
  }

  const externe = lienExterne(cible)
    ? ' target="_blank" rel="noopener noreferrer"'
    : "";

  return `<a class="${classe}" href="${escapeHtml(cible)}"${externe}>${escapeHtml(libelle)}</a>`;
}

export function liensFooter(configuration) {
  const liens = [];

  for (let i = 1; i <= NB_LIENS; i += 1) {
    const html = rendreLien(
      valeurConfiguration(configuration, `LIEN-${i}-TEXTE`),
      valeurConfiguration(configuration, `LIEN-${i}-URL`),
      "dse-footer-lien"
    );

    if (html) {
      liens.push(html);
    }
  }

  return liens;
}

export function rendreFooter(footer, { nomSite = "", nettoyerTexte = (v) => String(v ?? "") } = {}) {
  const configuration = footer?.contenu?.configuration ?? null;

  if (!configuration) {
    const nom = String(nomSite ?? "").trim();
    return nom
      ? `<footer class="dse-footer dse-footer--minimal"><div class="dse-footer-inner"><p class="dse-footer-mentions">${escapeHtml(nom)}</p></div></footer>`
      : "";
  }

  const marque = String(valeurConfiguration(configuration, "TITRE-PRINCIPAL") ?? nomSite ?? "").trim();
  const texte = nettoyerTexte(valeurConfiguration(configuration, "TEXTE"));
  const mentions = nettoyerTexte(valeurConfiguration(configuration, "MENTIONS"));
  const liens = liensFooter(configuration);
  const boutique = rendreLien(
    valeurConfiguration(configuration, "BOUTIQUE-TEXTE"),
    valeurConfiguration(configuration, "BOUTIQUE-URL"),
    "dse-footer-boutique"
  );

  return `
    <footer class="dse-footer">
      <div class="dse-footer-inner">
        ${marque ? `<p class="dse-footer-marque">${escapeHtml(marque)}</p>` : ""}
        ${texte ? `<p class="dse-footer-texte">${escapeHtml(texte)}</p>` : ""}
        ${liens.length || boutique ? `<nav class="dse-footer-liens">${liens.join("")}${boutique}</nav>` : ""}
        ${mentions ? `<p class="dse-footer-mentions">${escapeHtml(mentions)}</p>` : ""}
      </div>
    </footer>
  `;
}
