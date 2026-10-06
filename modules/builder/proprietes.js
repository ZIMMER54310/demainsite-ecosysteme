export const codeChamp = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().replace(/^DESIGN/, "");
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const LONGUEUR = /^(?:0|(?:\d+(?:\.\d+)?)(?:px|%|rem|em|vh|vw)?)$/;
const choix = {
  ALIGNEMENT: ["GAUCHE", "CENTRE", "DROITE", "JUSTIFIE"],
  FLEX: ["BLOCK", "ROW", "COLUMN", "ROW-REVERSE", "COLUMN-REVERSE"],
  POSITION: ["STATIC", "RELATIVE", "ABSOLUTE", "STICKY"],
  GRAISSE: ["100", "200", "300", "400", "500", "600", "700", "800", "900"]
};
const listesLongueurs = (v, max = 4) => {
  const valeurs = String(v).trim().split(/\s+/);
  return valeurs.length <= max && valeurs.every((x) => LONGUEUR.test(x) && parseFloat(x) <= 4000);
};
const longueur = (v) => /^\d+(?:\.\d+)?$/.test(String(v)) ? `${v}px` : String(v);
const couleur = "(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8}))";
const degrade = new RegExp(`^linear-gradient\\((\\d{1,3})deg,\\s*${couleur},\\s*${couleur}\\)$`);
const bordure = new RegExp(`^(\\d+(?:\\.\\d+)?)(?:px)?\\s+(solid|dashed|dotted|double|none)\\s+${couleur}$`);
const ombre = new RegExp(`^(-?\\d+(?:\\.\\d+)?)(?:px)?\\s+(-?\\d+(?:\\.\\d+)?)(?:px)?\\s+(\\d+(?:\\.\\d+)?)(?:px)?\\s+(-?\\d+(?:\\.\\d+)?)(?:px)?\\s+${couleur}$`);

export function controleChamp(c) {
  const code = codeChamp(c.cle);
  if (c.nature === "MEDIA") return { type: "media" };
  if (c.nature === "BOOLEEN") return { type: "booleen" };
  if (c.nature === "NOMBRE") return { type: "number", min: code === "OPACITE" ? 0 : undefined, max: code === "OPACITE" ? 1 : undefined };
  if (choix[code] && c.categorie === "DESIGN") return { type: "select", options: choix[code] };
  if (c.categorie === "DESIGN" && ["COULEURTEXTE", "COULEURFOND"].includes(code)) return { type: "couleur" };
  if (["MARGE", "ESPACEMENTINTERNE"].includes(code) && c.categorie === "DESIGN") return { type: "cotes" };
  const aides = {
    DEGRADE: "linear-gradient(90deg, #112233, #445566)",
    BORDURE: "1px solid #112233", OMBRE: "0px 4px 12px 0px #112233",
    GRID: "Nombre de colonnes (1 à 12)", POLICE: "Nom de famille de police",
    TAILLETEXTE: "Nombre en px, ou unité px/rem/em", LARGEUR: "px, %, rem, em, vw ou auto",
    HAUTEUR: "px, %, rem, em, vh ou auto", RAYON: "Valeur avec unité", GAP: "Écart horizontal / vertical avec unité"
  };
  return { type: code === "TEXTE" ? "textarea" : "text", aide: aides[code] || "" };
}

export function erreurValeur(c, valeur) {
  if (valeur === null || valeur === "") return null;
  const code = codeChamp(c.cle), v = String(valeur);
  if (c.nature === "BOOLEEN") return typeof valeur === "boolean" ? null : "Booléen requis.";
  if (c.nature === "MEDIA") return typeof valeur === "string" ? null : "Référence média requise.";
  if (c.nature === "NOMBRE" && (!["number", "string"].includes(typeof valeur) || !Number.isFinite(Number(valeur)))) return "Nombre requis.";
  if (code === "OPACITE" && c.categorie === "DESIGN") return Number(v) >= 0 && Number(v) <= 1 ? null : "Opacité comprise entre 0 et 1.";
  if (c.nature !== "NOMBRE" && typeof valeur !== "string") return "Texte requis.";
  if (c.categorie === "CONTENU" && code === "LIEN") return /^(https?:\/\/[^\s<>"']+|\/(?!\/)[^\s<>"']*|#[A-Za-z][\w-]*|mailto:[^\s<>"']+|tel:[+\d ()-]+)$/i.test(v) ? null : "Lien non autorisé.";
  if (c.categorie === "AVANCE") {
    if (code === "CLASSECSS") return /^(?:[A-Za-z][\w-]*(?: +[A-Za-z][\w-]*)*)$/.test(v) && v.length <= 255 ? null : "Classes CSS invalides.";
    if (code === "IDCSS") return /^[A-Za-z][\w-]{0,63}$/.test(v) ? null : "Identifiant CSS invalide.";
  }
  if (c.categorie !== "DESIGN" || c.nature === "MEDIA") return null;
  if (["COULEURTEXTE", "COULEURFOND"].includes(code)) return HEX.test(v) ? null : "Couleur hexadécimale requise.";
  if (choix[code]) return choix[code].includes(v) ? null : "Choix non autorisé.";
  if (["TAILLETEXTE", "LARGEUR", "HAUTEUR", "RAYON", "GAP", "MARGE", "ESPACEMENTINTERNE"].includes(code)) {
    if (["LARGEUR", "HAUTEUR"].includes(code) && v === "auto") return null;
    return listesLongueurs(v, ["MARGE", "ESPACEMENTINTERNE"].includes(code) ? 4 : code === "GAP" ? 2 : 1) ? null : "Dimension ou espacement invalide.";
  }
  if (code === "GRID") return /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 12 ? null : "Grille comprise entre 1 et 12 colonnes.";
  if (code === "POLICE") return /^[A-Za-z0-9 -]{2,80}$/.test(v) ? null : "Famille de police invalide.";
  if (code === "DEGRADE") { const m = degrade.exec(v); return m && Number(m[1]) <= 360 ? null : "Dégradé linéaire invalide."; }
  if (code === "BORDURE") { const m = bordure.exec(v); return m && Number(m[1]) <= 20 ? null : "Bordure invalide (largeur, style, couleur)."; }
  if (code === "OMBRE") { const m = ombre.exec(v); return m && m.slice(1, 5).every((n) => Math.abs(Number(n)) <= 200) ? null : "Ombre invalide (X Y flou étalement couleur)."; }
  return null;
}

export function declarationsGeneriques(champs, appareil, apiBase = "/api/v1") {
  const css = [];
  const ajouter = (prop, v) => css.push(`${prop}:${v}`);
  for (const c of champs) {
    const v = c.surcharges?.[appareil] ?? c.valeur;
    if (v === null || v === "" || v === undefined || c.categorie !== "DESIGN" || erreurValeur(c, v)) continue;
    const code = codeChamp(c.cle);
    const simple = { COULEURTEXTE: "color", COULEURFOND: "background-color", GRAISSE: "font-weight",
      OPACITE: "opacity", DEGRADE: "background-image" };
    if (simple[code]) ajouter(simple[code], v);
    else if (code === "POLICE") ajouter("font-family", `"${v}"`);
    else if (code === "ALIGNEMENT") ajouter("text-align", { GAUCHE: "left", CENTRE: "center", DROITE: "right", JUSTIFIE: "justify" }[v]);
    else if (code === "POSITION") ajouter("position", v.toLowerCase());
    else if (code === "FLEX") {
      ajouter("display", v === "BLOCK" ? "block" : "flex");
      if (v !== "BLOCK") ajouter("flex-direction", v.toLowerCase());
    } else if (code === "GRID") { ajouter("display", "grid"); ajouter("grid-template-columns", `repeat(${v},minmax(0,1fr))`); }
    else if (code === "IMAGEFOND" && /^\d{1,12}$/.test(String(v))) {
      const base = /^[A-Za-z0-9:/._-]{1,200}$/.test(apiBase) ? apiBase : "/api/v1";
      ajouter("background-image", `url("${base}/media/${v}")`);
      ajouter("background-size", "cover");
      ajouter("background-position", "center");
    } else if (["BORDURE", "OMBRE"].includes(code)) {
      const m = (code === "BORDURE" ? bordure : ombre).exec(String(v));
      ajouter(code === "BORDURE" ? "border" : "box-shadow", code === "BORDURE" ? `${m[1]}px ${m[2]} ${m[3]}` :
        `${m[1]}px ${m[2]}px ${m[3]}px ${m[4]}px ${m[5]}`);
    } else {
      const prop = { TAILLETEXTE: "font-size", LARGEUR: "width", HAUTEUR: "height", RAYON: "border-radius",
        GAP: "gap", MARGE: "margin", ESPACEMENTINTERNE: "padding" }[code];
      if (prop) ajouter(prop, String(v).split(/\s+/).map(longueur).join(" "));
    }
  }
  return css;
}
