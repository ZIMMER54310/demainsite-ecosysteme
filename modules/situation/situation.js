// Page publique generique « Situation du site » (fonction PURE, sans DOM).
// Une seule page pour toute situation non ACTIF, y compris un statut futur :
// titre, texte, details et media proviennent de SharePoint (API par domaine).
// Le code ne connait aucun statut ; seul un repli neutre existe si SharePoint ne fournit rien.
import { escapeHtml, urlSure } from "../public/outils.js";
import { rendreFooter } from "../footer/footer.js";

const REPLI_TITRE = "Site momentanément indisponible";

const texte = (v, nettoyer) => {
  const t = String((nettoyer ? nettoyer(v) : v) ?? "").trim();
  return t && t.toUpperCase() !== "ND" ? t : "";
};

export function rendreSituation(situation, {
  nomSite = "",
  domaine = "",
  footer = null,
  nettoyerTexte = null
} = {}) {
  const s = situation && typeof situation === "object" ? situation : {};
  const nom = texte(nomSite);
  const titre = texte(s.titre, nettoyerTexte) || REPLI_TITRE;
  const message = texte(s.texte, nettoyerTexte);
  const details = texte(s.details, nettoyerTexte);
  const fond = urlSure(s.media?.url, { lien: false });
  const marque = nom || texte(domaine);
  const code = String(s.code ?? "").replace(/[^A-Z0-9-]/gi, "").toLowerCase();

  return `
    <div class="dse-public-page dse-situation${fond ? " dse-situation-media" : ""}"${code ? ` data-situation="${escapeHtml(code)}"` : ""}${fond ? ` style="background-image:url('${escapeHtml(encodeURI(fond))}')"` : ""}>
      <div class="dse-public-overlay"></div>
      ${nom ? `<div class="dse-site-public-header" role="banner"><a href="/" aria-label="${escapeHtml(nom)}">${escapeHtml(nom)}</a></div>` : ""}
      <main class="dse-public-centre">
        <section class="dse-public-card">
          ${marque ? `<div class="dse-public-marque"><span>${escapeHtml(marque)}</span></div>` : ""}
          <h1>${escapeHtml(titre)}</h1>
          ${message ? `<p class="dse-public-message">${escapeHtml(message)}</p>` : ""}
          ${details ? `<p class="dse-public-soustitre">${escapeHtml(details)}</p>` : ""}
        </section>
      </main>
      ${rendreFooter(footer, { nomSite: nom, nettoyerTexte: nettoyerTexte || undefined })}
    </div>`;
}
