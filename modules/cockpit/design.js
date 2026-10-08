// Panneau Design du Constructeur DSE : CONTENU | DESIGN | RESPONSIVE | AVANCE.
// Les reglages proposes dependent des groupes declares pour le type d'element (renvoyes par le serveur) ;
// l'apercu instantane reutilise le generateur CSS du rendu public (aucune valeur de design fixee ici).
import { escapeHtml as e } from "../public/outils.js";
import { cssElement } from "../builder/styles.js";

export const APPAREILS_APERCU = Object.freeze([
  { cle: "ORDINATEUR", libelle: "🖥 Ordinateur", largeur: 1280 },
  { cle: "TABLETTE", libelle: "📱 Tablette", largeur: 800 },
  { cle: "MOBILE", libelle: "📱 Mobile", largeur: 390 }
]);

const GROUPES = {
  TYPO: "Typographie", FOND: "Fond", DIMENSIONS: "Dimensions", ESPACEMENT: "Marges et espacements internes",
  BORDURE: "Bordures et coins arrondis", OMBRE: "Ombre", ALIGNEMENT: "Alignement des éléments", SURVOL: "Survol (bouton, lien)"
};
const COTES = [["Haut", "haut"], ["Droite", "droite"], ["Bas", "bas"], ["Gauche", "gauche"]];
// cle -> [groupe, libelle, nature, unite, min, max, pas]
const CHAMPS = {
  police: ["TYPO", "Police", "police"], couleurTexte: ["TYPO", "Couleur du texte", "couleur"],
  tailleTexte: ["TYPO", "Taille du texte", "nombre", "px", 8, 96, 1], poidsPolice: ["TYPO", "Graisse", "nombre", "", 100, 900, 100],
  stylePolice: ["TYPO", "Style", "choix"], hauteurLigne: ["TYPO", "Hauteur de ligne", "nombre", "×", 1, 3, 0.05],
  espacementLettres: ["TYPO", "Espacement des lettres", "nombre", "px", -5, 20, 0.5], transformation: ["TYPO", "Casse", "choix"],
  alignement: ["TYPO", "Alignement du texte", "alignement"],
  couleurFond: ["FOND", "Couleur de fond", "couleur"], fondOpacite: ["FOND", "Opacité de la couleur", "nombre", "%", 0, 100, 5],
  couleurDegrade: ["FOND", "Seconde couleur (dégradé)", "couleur"], degradeAngle: ["FOND", "Angle du dégradé", "nombre", "°", 0, 360, 5],
  fondMedia: ["FOND", "Image de fond", "media"], fondPosition: ["FOND", "Position de l'image", "choix"],
  fondTaille: ["FOND", "Taille de l'image", "choix"], fondRepetition: ["FOND", "Répétition", "choix"],
  largeur: ["DIMENSIONS", "Largeur", "nombre", "%", 0, 100, 1], largeurMinimale: ["DIMENSIONS", "Largeur minimale", "nombre", "px", 0, 2400, 10],
  largeurMaximale: ["DIMENSIONS", "Largeur maximale", "nombre", "px", 0, 2400, 10], hauteur: ["DIMENSIONS", "Hauteur", "nombre", "px", 0, 4000, 10],
  hauteurMinimale: ["DIMENSIONS", "Hauteur minimale", "nombre", "px", 0, 4000, 10], hauteurMaximale: ["DIMENSIONS", "Hauteur maximale", "nombre", "px", 0, 4000, 10],
  ...Object.fromEntries(COTES.flatMap(([k]) => [[`marge${k}`, ["ESPACEMENT", `Marge ${k.toLowerCase()}`, "nombre", "px", 0, 400, 1]],
    [`padding${k}`, ["ESPACEMENT", `Espacement interne ${k.toLowerCase()}`, "nombre", "px", 0, 400, 1]]])),
  bordureLargeur: ["BORDURE", "Épaisseur", "nombre", "px", 0, 20, 1], bordureStyle: ["BORDURE", "Style de bordure", "choix"],
  couleurBordure: ["BORDURE", "Couleur de bordure", "couleur"], bordureRayon: ["BORDURE", "Coins arrondis", "nombre", "px", 0, 200, 1],
  ombre: ["OMBRE", "Afficher une ombre", "ouinon"], ombreX: ["OMBRE", "Décalage horizontal", "nombre", "px", -100, 100, 1],
  ombreY: ["OMBRE", "Décalage vertical", "nombre", "px", -100, 100, 1], ombreFlou: ["OMBRE", "Flou", "nombre", "px", 0, 200, 1],
  ombreEtalement: ["OMBRE", "Étalement", "nombre", "px", -100, 100, 1], couleurOmbre: ["OMBRE", "Couleur de l'ombre", "couleur"],
  justification: ["ALIGNEMENT", "Répartition des éléments", "choix"],
  survolTexte: ["SURVOL", "Texte au survol", "couleur"], survolFond: ["SURVOL", "Fond au survol", "couleur"],
  survolBordure: ["SURVOL", "Bordure au survol", "couleur"],
  masque: ["", "Masquer sur cet appareil", "ouinon"]
};
const ESPACES = new Set(COTES.flatMap(([k]) => [`marge${k}`, `padding${k}`]));
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const lisible = (v) => String(v).toLowerCase().replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
const vide = (v) => v === undefined || v === null || v === "";

function controle(cle, valeur, herite, design, nom) {
  const [, libelle, nature, unite, min, max, pas] = CHAMPS[cle];
  const o = design.options || {};
  const indication = vide(herite) ? "" : ` <span class="muted design-herite">hérité : ${e(nature === "media" || nature === "police"
    ? ((nature === "media" ? o.medias : o.polices) || []).find((x) => x.ref === herite)?.titre || "défini" : String(herite === true ? "oui" : herite))}</span>`;
  const n = e(nom);
  let champ;
  if (nature === "couleur") {
    const v = HEX.test(String(valeur || "")) ? valeur : "";
    champ = `<span class="design-couleur"><input type="color" value="${e(v || (HEX.test(String(herite || "")) ? herite : "#000000"))}" data-design-pipette="${n}" aria-label="${e(libelle)}">
      <input name="${n}" value="${e(v)}" placeholder="${e(herite || "#rrggbb")}" pattern="#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?" maxlength="7" size="8"></span>`;
  } else if (nature === "nombre") {
    champ = `<span class="design-nombre"><input type="number" name="${n}" value="${e(vide(valeur) ? "" : valeur)}" placeholder="${e(vide(herite) ? "" : herite)}" min="${min}" max="${max}" step="${pas}">${unite ? `<span>${e(unite)}</span>` : ""}</span>`;
  } else if (nature === "ouinon") {
    champ = `<select name="${n}"><option value="">${vide(herite) ? "Par défaut" : "Hérité"}</option><option value="OUI"${valeur === true ? " selected" : ""}>Oui</option><option value="NON"${valeur === false ? " selected" : ""}>Non</option></select>`;
  } else {
    const opts = nature === "choix" ? (o.choix?.[cle] || []).map((x) => ({ ref: x, titre: lisible(x) }))
      : nature === "alignement" ? (o.alignements || []).map((x) => ({ ref: x, titre: lisible(x) }))
        : nature === "police" ? o.polices || [] : o.medias || [];
    if (!opts.length && nature !== "media") return "";
    champ = `<select name="${n}"><option value="">${vide(herite) ? "Par défaut" : "Hérité"}</option>${opts.map((x) => `<option value="${e(x.ref)}"${x.ref === valeur ? " selected" : ""}>${e(x.titre)}</option>`).join("")}</select>`;
    if (nature === "media") {
      champ += opts.length ? `<span class="constructeur-medias constructeur-medias--mini">${opts.slice(0, 24).map((m) => `<img src="${e(m.url)}" alt="${e(m.titre)}" title="${e(m.titre)}" loading="lazy" data-design-media="${e(m.ref)}" data-design-cible="${n}">`).join("")}</span>`
        : `<span class="muted">Aucune image autorisée pour ce site.</span>`;
    }
  }
  return `<label class="design-champ${ESPACES.has(cle) ? " design-champ--cote" : ""}"><span>${e(libelle)}${indication}</span>${champ}
    <button type="button" class="btn btn-mini design-reset" data-design-reset="${n}" title="Revenir à la valeur héritée" aria-label="Réinitialiser ${e(libelle)}">↺</button></label>`;
}

function groupeHtml(groupe, cles, valeurs, herite, design, prefixe = "") {
  const champs = cles.map((c) => controle(c, valeurs[c], herite[c], design, `${prefixe}${c}`)).filter(Boolean).join("");
  return champs ? `<fieldset class="design-groupe design-groupe--${groupe.toLowerCase()}"><legend>${e(GROUPES[groupe] || groupe)}</legend><div class="design-grille">${champs}</div></fieldset>` : "";
}

export function panneauDesign(design, { ref, contenu = "", onglet = "design", appareil = "TABLETTE", renommable = false, aideDesign = "" } = {}) {
  const g = design.groupes || [];
  const clesDe = (groupe, filtre = () => true) => Object.keys(CHAMPS).filter((c) => CHAMPS[c][0] === groupe && filtre(c));
  const designHtml = g.map((x) => groupeHtml(x, clesDe(x), design.valeurs || {}, design.herite || {}, design)).join("")
    || `<p class="muted">Aucun réglage de design n'est déclaré pour ce type d'élément.</p>`;
  const autorises = new Set(design.champsResponsive || []);
  const responsiveHtml = ["TABLETTE", "MOBILE"].map((a) => {
    const herite = { ...(design.herite || {}), ...(design.responsiveHerite?.[a] || {}) };
    const blocs = g.map((x) => groupeHtml(x, clesDe(x, (c) => autorises.has(c)), design.responsive?.[a] || {}, herite, design, `${a}.`)).join("");
    return `<div class="design-appareil" data-design-appareil="${a}"${a === appareil ? "" : " hidden"}>
      ${groupeHtml("", autorises.has("masque") ? ["masque"] : [], design.responsive?.[a] || {}, {}, design, `${a}.`).replace("<legend></legend>", "<legend>Visibilité</legend>")}${blocs}</div>`;
  }).join("");
  const presets = design.options?.presets || [];
  const onglets = [["contenu", "CONTENU"], ["design", "DESIGN"], ["responsive", "RESPONSIVE"], ["avance", "AVANCÉ"]];
  return `<form class="card design-panneau" data-design-form data-ref="${e(ref)}">
    <header class="design-entete"><div><span class="constructeur-type">${e(design.libelle || "")}</span> <strong>🎨 ${e(design.titre || "")}</strong>${renommable ? ` <button type="button" class="btn btn-mini design-renommer" data-c-action="renommer" data-ref="${e(ref)}" title="Modifier le nom" aria-label="Modifier le nom">✏️</button>` : ""}</div>
      <button type="button" class="btn btn-mini" data-design-fermer aria-label="Fermer le panneau Design">✕</button></header>
    <nav class="design-onglets" role="tablist">${onglets.map(([k, l]) => `<button type="button" role="tab" class="btn btn-mini ${k === onglet ? "btn-primary" : "btn-secondary"}" aria-selected="${k === onglet}" data-design-onglet="${k}">${l}</button>`).join("")}</nav>
    <section data-design-volet="contenu"${onglet === "contenu" ? "" : " hidden"}>${contenu}</section>
    <section data-design-volet="design"${onglet === "design" ? "" : " hidden"}>${aideDesign ? `<p class="c-aide-bloc">💡 ${e(aideDesign)}</p>` : ""}${designHtml}</section>
    <section data-design-volet="responsive"${onglet === "responsive" ? "" : " hidden"}>
      <p class="muted">Une valeur saisie ici remplace la valeur ordinateur uniquement sur l'appareil choisi. Laissez vide pour conserver la valeur générale.</p>
      <div class="constructeur-boutons">${["TABLETTE", "MOBILE"].map((a) => `<button type="button" class="btn btn-mini ${a === appareil ? "btn-primary" : "btn-secondary"}" data-design-choix-appareil="${a}">${a === "TABLETTE" ? "📱 Tablette" : "📱 Mobile"}</button>`).join("")}</div>
      ${responsiveHtml}</section>
    <section data-design-volet="avance"${onglet === "avance" ? "" : " hidden"}>
      <p class="muted">Ordre d'application : thème du site → style partagé → style de l'élément → réglage responsive. La valeur la plus précise l'emporte.</p>
      ${design.partage ? `<p class="alerte-info">Cet élément utilise un style partagé. Vos modifications créeront un style propre à cet élément ; le style partagé restera inchangé.</p>` : ""}
      ${presets.length ? `<label>Appliquer un style existant <select data-design-preset><option value="">— Suivre le thème du site —</option>${presets.map((p) => `<option value="${e(p.ref)}"${p.actuel ? " selected" : ""}>${e(p.titre)}</option>`).join("")}</select></label>
        <button type="button" class="btn btn-secondary" data-design-appliquer>Appliquer ce style</button>` : `<p class="muted">Aucun style partagé disponible pour ce site.</p>`}
    </section>
    <div class="constructeur-boutons design-actions"><button class="btn btn-primary" type="submit">💾 Enregistrer le design</button>
      <span class="muted">L'aperçu se met à jour pendant la saisie.</span></div>
  </form>`;
}

/* Valeurs du formulaire -> { cle: valeur, responsive: { TABLETTE: {}, MOBILE: {} } } ("" = valeur heritee). */
export function lireValeurs(form) {
  const v = { responsive: { TABLETTE: {}, MOBILE: {} } };
  for (const el of form.querySelectorAll("[name]")) {
    const [a, cle] = el.name.includes(".") ? el.name.split(".") : [null, el.name];
    if (!CHAMPS[cle]) continue;
    let val = String(el.value || "").trim();
    if (CHAMPS[cle][2] === "ouinon") val = val === "OUI" ? true : val === "NON" ? false : "";
    if (a) { if (v.responsive[a]) v.responsive[a][cle] = val; } else v[cle] = val;
  }
  return v;
}

/* Valeurs plates (formulaire) -> style imbrique attendu par le generateur CSS. */
function imbriquer(plat, design) {
  const s = {};
  for (const [k, v] of Object.entries(plat)) {
    if (vide(v) || ESPACES.has(k) || /^(ombre|survol)/.test(k) || ["police", "fondMedia", "couleurOmbre"].includes(k)) continue;
    s[k] = v;
  }
  for (const [nom, cible] of [["marge", "marge"], ["padding", "padding"]]) {
    const o = Object.fromEntries(COTES.filter(([k]) => !vide(plat[`${nom}${k}`])).map(([k, c]) => [c, Number(plat[`${nom}${k}`])]));
    if (Object.keys(o).length) s[cible] = o;
  }
  if (plat.ombre === true) s.ombre = Object.fromEntries([["x", plat.ombreX], ["y", plat.ombreY], ["flou", plat.ombreFlou], ["etalement", plat.ombreEtalement], ["couleur", plat.couleurOmbre]].filter(([, x]) => !vide(x)));
  const survol = Object.fromEntries([["couleurTexte", plat.survolTexte], ["couleurFond", plat.survolFond], ["couleurBordure", plat.survolBordure]].filter(([, x]) => !vide(x)));
  if (Object.keys(survol).length) s.survol = survol;
  const media = (design.options?.medias || []).find((m) => m.ref === plat.fondMedia);
  const id = /\/media\/(\d{1,12})$/.exec(media?.url || "")?.[1];
  if (id) s.fondMedia = id;
  const police = (design.options?.polices || []).find((p) => p.ref === plat.police)?.famille;
  if (police) { if (/^(SANS|SERIF|MONO)$/i.test(police)) s.police = police.toUpperCase(); else s.policeFamille = police; }
  for (const k of ["tailleTexte", "poidsPolice", "hauteurLigne", "espacementLettres", "fondOpacite", "degradeAngle", "largeur", "largeurMinimale", "largeurMaximale", "hauteur", "hauteurMinimale", "hauteurMaximale", "bordureLargeur", "bordureRayon"]) {
    if (s[k] !== undefined) s[k] = Number(s[k]);
  }
  return s;
}

const fusion = (base, ajout) => ({ ...base, ...Object.fromEntries(Object.entries(ajout).filter(([, x]) => !vide(x))) });

/* CSS instantane de l'element en cours d'edition (heritage + saisie), injecte dans l'apercu. */
export function cssApercu(identifiant, design, valeurs) {
  const { responsive: _, ...saisie } = valeurs;
  const general = fusion(design.herite || {}, saisie);
  const responsive = {};
  for (const a of ["TABLETTE", "MOBILE"]) {
    const r = imbriquer(fusion(design.responsiveHerite?.[a] || {}, valeurs.responsive?.[a] || {}), design);
    if (Object.keys(r).length) responsive[a] = r;
  }
  return cssElement(identifiant, design.type, imbriquer(general, design), responsive, { apiBase: "/api/v1" });
}
