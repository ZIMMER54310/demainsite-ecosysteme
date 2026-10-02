// Styles du Builder : seules des proprietes CSS explicitement autorisees sont generees. Jamais de CSS arbitraire.
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const POLICES = { SANS: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", SERIF: "Georgia,'Times New Roman',serif", MONO: "ui-monospace,Menlo,Consolas,monospace" };
const ALIGNEMENTS = { GAUCHE: "left", CENTRE: "center", DROITE: "right", JUSTIFIE: "justify" };

const nb = (v, min, max) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Math.min(max, Math.max(min, Number(v))) : null);

function espaces(propriete, valeurs) {
  if (!valeurs || typeof valeurs !== "object") return [];
  return [["haut", "top"], ["bas", "bottom"], ["gauche", "left"], ["droite", "right"]]
    .map(([cle, cote]) => [cote, nb(valeurs[cle], 0, 400)])
    .filter(([, v]) => v !== null)
    .map(([cote, v]) => `${propriete}-${cote}:${v}px`);
}

export function declarations(style = {}) {
  const s = style || {};
  const d = [];
  if (HEX.test(s.couleurTexte || "")) d.push(`color:${s.couleurTexte}`);
  if (HEX.test(s.couleurFond || "")) d.push(`background-color:${s.couleurFond}`);
  if (POLICES[s.police]) d.push(`font-family:${POLICES[s.police]}`);
  if (nb(s.tailleTexte, 8, 96) !== null) d.push(`font-size:${nb(s.tailleTexte, 8, 96)}px`);
  if (nb(s.poidsPolice, 100, 900) !== null) d.push(`font-weight:${Math.round(nb(s.poidsPolice, 100, 900) / 100) * 100}`);
  if (nb(s.hauteurLigne, 1, 3) !== null) d.push(`line-height:${nb(s.hauteurLigne, 1, 3)}`);
  if (ALIGNEMENTS[s.alignement]) d.push(`text-align:${ALIGNEMENTS[s.alignement]}`);
  if (nb(s.largeur, 1, 100) !== null) d.push(`width:${nb(s.largeur, 1, 100)}%`);
  if (nb(s.largeurMaximale, 1, 2400) !== null) d.push(`max-width:${nb(s.largeurMaximale, 1, 2400)}px`);
  d.push(...espaces("margin", s.marge), ...espaces("padding", s.padding));
  if (nb(s.bordureLargeur, 0, 20) !== null) d.push(`border:${nb(s.bordureLargeur, 0, 20)}px solid ${HEX.test(s.couleurBordure || "") ? s.couleurBordure : "currentColor"}`);
  if (nb(s.bordureRayon, 0, 200) !== null) d.push(`border-radius:${nb(s.bordureRayon, 0, 200)}px`);
  return d;
}

export function attributStyle(style) {
  const d = declarations(style);
  return d.length ? ` style="${d.join(";")}"` : "";
}

// Les surcharges tablette/mobile sont portees par des variables et des media queries generees ici, jamais fournies par SharePoint.
export function reglesResponsive(identifiant, responsive = {}) {
  const requetes = { TABLETTE: "(max-width:1024px)", MOBILE: "(max-width:640px)" };
  const sortie = [];
  for (const [appareil, media] of Object.entries(requetes)) {
    const r = responsive?.[appareil];
    if (!r) continue;
    const d = declarations({ largeur: r.largeur, tailleTexte: r.tailleTexte, alignement: r.alignement, marge: r.marge, padding: r.padding });
    if (d.length) sortie.push(`@media ${media}{.${identifiant}{${d.map((x) => `${x} !important`).join(";")}}}`);
  }
  return sortie.join("");
}
