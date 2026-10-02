import { escapeHtml, urlSure } from "../public/outils.js";

// Desinfection par liste blanche (sans DOM) : toute balise ou attribut non autorise est neutralise en texte.
const BALISES = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "a"]);

export function nettoyerHtml(source) {
  const texte = String(source ?? "").replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, "");
  let sortie = "";
  let reste = texte;

  while (reste.length) {
    const debut = reste.indexOf("<");
    if (debut < 0) { sortie += escapeHtml(reste); break; }

    sortie += escapeHtml(reste.slice(0, debut));
    const fin = reste.indexOf(">", debut);
    if (fin < 0) { sortie += escapeHtml(reste.slice(debut)); break; }

    const balise = reste.slice(debut + 1, fin);
    reste = reste.slice(fin + 1);
    const m = /^(\/?)([a-z0-9]+)([^]*)$/i.exec(balise.trim());
    const nom = m?.[2]?.toLowerCase();
    if (!m || !BALISES.has(nom)) continue;

    if (m[1]) { sortie += `</${nom}>`; continue; }
    if (nom === "a") {
      const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(m[3]);
      const url = urlSure(href?.[1] ?? href?.[2] ?? "");
      sortie += url ? `<a href="${escapeHtml(url)}" rel="noopener noreferrer">` : "<a>";
    } else {
      sortie += `<${nom}>`;
    }
  }
  return sortie;
}
