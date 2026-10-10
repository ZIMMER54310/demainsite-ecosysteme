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
  IMAGE_DISPOSITION: "Titre et texte de l’image : affichage et placement",
  COINS: "Coins arrondis indépendants", BORDURE_HAUT: "Bordure du haut", BORDURE_DROITE: "Bordure de droite", BORDURE_BAS: "Bordure du bas", BORDURE_GAUCHE: "Bordure de gauche",
  TYPO_TITRE: "Typographie du titre", TYPO_TEXTE: "Typographie du texte",
  TYPO: "Typographie", FOND: "Fond", DIMENSIONS: "Dimensions", ESPACEMENT: "Marges et espacements internes",
  BORDURE: "Bordure et coins", OMBRE: "Ombre", ALIGNEMENT: "Disposition des éléments", IMAGE_POSITION: "Position de l’image", SURVOL: "Survol (bouton, lien)"
};
const COTES = [["Haut", "haut"], ["Droite", "droite"], ["Bas", "bas"], ["Gauche", "gauche"]];
const GRAISSES = [
  ["100", "Très fin"], ["200", "Extra-fin"], ["300", "Fin"], ["400", "Normal"], ["500", "Moyen"],
  ["600", "Demi-gras"], ["700", "Gras"], ["800", "Extra gras"], ["900", "Ultra gras"]
];
// cle -> [groupe, libelle, nature, unite, min, max, pas]
const CHAMPS = {
  imagePosition: ["IMAGE_POSITION", "Position dans la colonne", "choix"],
  imageTitreMasque: ["IMAGE_DISPOSITION", "Masquer le titre", "ouinon"],
  imageTexteMasque: ["IMAGE_DISPOSITION", "Masquer le texte", "ouinon"],
  imageTitrePosition: ["IMAGE_DISPOSITION", "Position du titre", "choix"],
  imageTextePosition: ["IMAGE_DISPOSITION", "Position du texte", "choix"],
  imageTitreMode: ["IMAGE_DISPOSITION", "Placement du titre", "choix"],
  imageTexteMode: ["IMAGE_DISPOSITION", "Placement du texte", "choix"],
  ...Object.fromEntries([["HautGauche", "haut gauche"], ["HautDroite", "haut droite"], ["BasDroite", "bas droite"], ["BasGauche", "bas gauche"]].map(([k, l]) => [`bordureRayon${k}`, ["COINS", `Coin ${l}`, "nombre", "px", 0, 200, 1]])),
  ...Object.fromEntries(COTES.flatMap(([k]) => [
    [`bordureEpaisseur${k}`, [`BORDURE_${k.toUpperCase()}`, "Épaisseur", "nombre", "px", 0, 20, 0.5]],
    [`bordureCouleur${k}`, [`BORDURE_${k.toUpperCase()}`, "Couleur", "couleur"]],
    [`bordureStyle${k}`, [`BORDURE_${k.toUpperCase()}`, "Style", "choix"]]
  ])),
  police: ["TYPO", "Police", "police"], couleurTexte: ["TYPO", "Couleur du texte", "couleur"],
  tailleTexte: ["TYPO", "Taille du texte", "nombre", "px", 8, 96, 1], poidsPolice: ["TYPO", "Graisse", "poids"],
  soulignement: ["TYPO", "Soulignement", "ouinon"],
  soulignementCouleur: ["TYPO", "Couleur du soulignement", "couleur"],
  soulignementStyle: ["TYPO", "Style du soulignement", "choix"],
  soulignementEpaisseur: ["TYPO", "Épaisseur du soulignement", "nombre", "px", 0, 10, 0.5],
  soulignementDistance: ["TYPO", "Distance sous le texte", "nombre", "px", 0, 20, 0.5],
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
    ? ((nature === "media" ? o.medias : o.polices) || []).find((x) => x.ref === herite)?.titre || "défini"
    : nature === "poids" ? GRAISSES.find(([poids]) => poids === String(herite))?.[1] || String(herite)
      : String(herite === true ? "oui" : herite))}</span>`;
  const n = e(nom);
  let champ;
  const visuels = {
    alignement: [["GAUCHE", "Aligner à gauche", "gauche"], ["CENTRE", "Centrer", "centre"], ["DROITE", "Aligner à droite", "droite"], ["JUSTIFIE", "Justifier", "justifie"]],
    stylePolice: [["NORMAL", "Normal", "N"], ["ITALIQUE", "Italique", "I"]],
    soulignement: [["OUI", "Souligner", "U"], ["NON", "Sans soulignement", "U"]],
    transformation: [["AUCUNE", "Casse d’origine", "—"], ["MAJUSCULES", "Majuscules", "AA"], ["MINUSCULES", "Minuscules", "aa"], ["CAPITALES", "Initiales en majuscules", "Aa"]],
    imagePosition: [["GAUCHE", "Placer l’image à gauche", "Gauche"], ["CENTRE", "Centrer l’image", "Centre"], ["DROITE", "Placer l’image à droite", "Droite"]]
  };
  if (visuels[cle]) {
    const actif = typeof valeur === "boolean" ? valeur ? "OUI" : "NON" : valeur ?? "";
    champ = `<input type="hidden" name="${n}" value="${e(actif)}"><span class="design-outils" role="group" aria-label="${e(libelle)}">${visuels[cle].map(([v, titre, icone]) => {
      if (cle === "alignement") {
        const x = v === "DROITE" ? 7 : v === "CENTRE" ? 4 : 1;
        icone = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M1 4h22M${x} 9h${v === "JUSTIFIE" ? 22 : 16}M1 14h22M${x} 19h${v === "JUSTIFIE" ? 22 : 16}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
      } else icone = `<span aria-hidden="true" class="design-icone--${cle === "soulignement" ? v === "OUI" ? "souligne" : "non-souligne" : cle === "stylePolice" && v === "ITALIQUE" ? "italique" : "normal"}">${e(icone)}</span>`;
      return `<button type="button" class="btn btn-mini design-outil" data-design-outil="${n}" data-design-valeur="${v}" aria-label="${e(titre)}" title="${e(titre)}" aria-pressed="${String(actif) === v}">${icone}</button>`;
    }).join("")}</span>`;
  } else if (nature === "couleur") {
    const v = HEX.test(String(valeur || "")) ? valeur : "";
    champ = `<span class="design-couleur"><input type="color" value="${e(v || (HEX.test(String(herite || "")) ? herite : "#000000"))}" data-design-pipette="${n}" aria-label="${e(libelle)}">
      <input name="${n}" value="${e(v)}" placeholder="${e(herite || "#rrggbb")}" pattern="#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?" maxlength="7" size="8"></span>`;
  } else if (nature === "nombre") {
    const curseur = /^bordure(Largeur|Rayon|Epaisseur)/.test(cle)
      ? `<input type="range" min="${min}" max="${max}" step="${pas}" value="${e(vide(valeur) ? herite ?? 0 : valeur)}" data-design-curseur="${n}" aria-label="${e(libelle)} : curseur">` : "";
    champ = `${curseur}<span class="design-nombre"><input type="number" name="${n}" value="${e(vide(valeur) ? "" : valeur)}" placeholder="${e(vide(herite) ? "" : herite)}" min="${min}" max="${max}" step="${pas}">${unite ? `<span>${e(unite)}</span>` : ""}</span>`;
  } else if (nature === "poids") {
    champ = `<select name="${n}"><option value="">${vide(herite) ? "Par défaut" : "Hérité"}</option>${GRAISSES.map(([poids, titre]) => `<option value="${poids}"${String(poids) === String(valeur) ? " selected" : ""}>${titre}</option>`).join("")}</select>`;
  } else if (nature === "ouinon") {
    champ = `<select name="${n}"><option value="">${vide(herite) ? "Par défaut" : "Hérité"}</option><option value="OUI"${valeur === true ? " selected" : ""}>Oui</option><option value="NON"${valeur === false ? " selected" : ""}>Non</option></select>`;
  } else {
    const choixLocal = /^bordureStyle(Haut|Droite|Bas|Gauche)$/.test(cle) ? o.choix?.bordureStyle : /^image.*Position$/.test(cle) ? ["HAUT", "BAS", "GAUCHE", "DROITE"] : /^image.*Mode$/.test(cle) ? ["AUTOUR", "SUPERPOSE"] : o.choix?.[cle];
    const nomsBordures = { AUCUNE: "Aucune", PLEINE: "──── Trait continu", TIRETS: "— — Tirets", POINTILLES: "···· Pointillés", DOUBLE: "════ Double" };
    const nomsDisposition = { DEBUT: "Au début", CENTRE: "Au centre", FIN: "À la fin", "ESPACE-ENTRE": "Espacer entre les éléments", "ESPACE-AUTOUR": "Espacer autour des éléments" };
    const opts = nature === "choix" ? (choixLocal || []).map((x) => ({ ref: x, titre: /^bordureStyle/.test(cle) ? nomsBordures[x] || lisible(x) :
      cle === "justification" ? nomsDisposition[x] || lisible(x) : x === "SUPERPOSE" ? "Sur l’image" : x === "AUTOUR" ? "Autour de l’image" : lisible(x) }))
      : nature === "alignement" ? (o.alignements || []).map((x) => ({ ref: x, titre: lisible(x) }))
        : nature === "police" ? o.polices || [] : o.medias || [];
    if (!opts.length && nature !== "media") return "";
    champ = `<select name="${n}"><option value="">${vide(herite) ? "Par défaut" : "Hérité"}</option>${opts.map((x) => `<option value="${e(x.ref)}"${String(x.ref) === String(valeur) ? " selected" : ""}>${e(x.titre)}</option>`).join("")}</select>`;
    if (nature === "media") {
      champ += opts.length ? `<span class="constructeur-medias constructeur-medias--mini">${opts.slice(0, 24).map((m) => `<img src="${e(m.url)}" alt="${e(m.titre)}" title="${e(m.titre)}" loading="lazy" data-design-media="${e(m.ref)}" data-design-cible="${n}">`).join("")}</span>`
        : `<span class="muted">Aucune image autorisée pour ce site.</span>`;
    }

  }
  const balise = visuels[cle] ? "div" : "label";
  return `<${balise} class="design-champ${ESPACES.has(cle) ? " design-champ--cote" : ""}"><span class="design-champ-tete"><span>${e(libelle)}${indication}</span>
    <button type="button" class="btn btn-mini design-reset" data-design-reset="${n}" title="Revenir à la valeur héritée" aria-label="Réinitialiser ${e(libelle)}">↺</button></span>${champ}</${balise}>`;
}

export function controleTypographie(cle, valeur, herite, nom) {
  return controle(cle, valeur, herite, {}, nom);
}

// Groupes ouverts dans le panneau Design (memorise pendant la session, partage entre elements).
const stockage = typeof sessionStorage === "undefined" ? null : sessionStorage;
const OUVERTS = new Set(JSON.parse(stockage?.getItem("dse.design.groupes") || "[\"FOND\"]"));
export function memoriserGroupe(groupe, ouvert) {
  if (ouvert) OUVERTS.add(groupe); else OUVERTS.delete(groupe);
  stockage?.setItem("dse.design.groupes", JSON.stringify([...OUVERTS]));
}

function groupeHtml(groupe, cles, valeurs, herite, design, prefixe = "") {
  const champs = cles.map((c) => controle(c, valeurs[c], herite[c], design, `${prefixe}${c}`)).filter(Boolean).join("");
  if (!champs) return "";
  const nom = groupe ? GROUPES[groupe] || groupe : "Visibilité";
  const modifies = cles.filter((c) => !vide(valeurs[c])).length;
  return `<details class="design-groupe design-groupe--${(groupe || "visibilite").toLowerCase()}" data-design-groupe="${e(groupe || "VISIBILITE")}"${OUVERTS.has(groupe || "VISIBILITE") ? " open" : ""}>
    <summary><span>${e(nom)}</span>${modifies ? `<span class="design-groupe-compte" title="${modifies} réglage(s) personnalisé(s)">${modifies}</span>` : ""}</summary>
    <div class="design-grille">${champs}</div></details>`;
}

const COINS = ["HautGauche", "HautDroite", "BasDroite", "BasGauche"];
const BORDURES = {
  bordureLargeur: "bordureEpaisseur", couleurBordure: "bordureCouleur", bordureStyle: "bordureStyle"
};
const valeurEffective = (valeurs, herite, cle) => !vide(valeurs[cle]) ? valeurs[cle] : herite[cle];
function coinsIdentiques(valeurs, herite) {
  const global = valeurEffective(valeurs, herite, "bordureRayon") ?? 0;
  const coins = COINS.map((c) => valeurEffective(valeurs, herite, `bordureRayon${c}`) ?? global);
  return coins.every((v) => Number(v) === Number(global));
}

function bordureHtml(cles, valeurs, herite, design, prefixe) {
  const champ = (cle) => cles.includes(cle) ? controle(cle, valeurs[cle], herite[cle], design, `${prefixe}${cle}`) : "";
  const parCote = (cote) => Object.entries(BORDURES).map(([global, debut]) => {
    const cle = `${debut}${cote}`;
    const valeursHeritees = { ...herite, [cle]: valeurEffective(valeurs, herite, cle) ?? valeurEffective(valeurs, herite, global) };
    return cles.includes(cle) ? controle(cle, valeurs[cle], valeursHeritees[cle], design, `${prefixe}${cle}`) : "";
  }).join("");
  const uniformes = coinsIdentiques(valeurs, herite);
  const modifies = cles.filter((c) => !vide(valeurs[c])).length;
  return `<details class="design-groupe design-groupe--bordure" data-design-groupe="BORDURE"${OUVERTS.has("BORDURE") ? " open" : ""}>
    <summary><span>Bordure et coins</span>${modifies ? `<span class="design-groupe-compte" title="${modifies} réglage(s) personnalisé(s)">${modifies}</span>` : ""}</summary>
    <div class="design-bordure" data-design-bordure="${e(prefixe)}">
      <h4>Bordure</h4>
      <div class="design-cotes" role="group" aria-label="Côté de la bordure à modifier">
        <button type="button" class="btn btn-mini design-cotes-haut" data-design-cote="Haut" aria-pressed="false">Haut</button>
        <button type="button" class="btn btn-mini design-cotes-gauche" data-design-cote="Gauche" aria-pressed="false">Gauche</button>
        <button type="button" class="btn btn-mini design-cotes-tous" data-design-cote="Tous" aria-pressed="true">Tous les côtés</button>
        <button type="button" class="btn btn-mini design-cotes-droite" data-design-cote="Droite" aria-pressed="false">Droite</button>
        <button type="button" class="btn btn-mini design-cotes-bas" data-design-cote="Bas" aria-pressed="false">Bas</button>
      </div>
      <p class="c-aide">Choisissez tous les côtés pour un contour uniforme, ou cliquez sur un côté pour le personnaliser. Modifier un réglage « Tous les côtés » remplace ce réglage sur les quatre côtés.</p>
      <div data-design-bordure-cote="Tous"><h5>Tous les côtés</h5><div class="design-grille">${Object.keys(BORDURES).map(champ).join("")}</div></div>
      ${COTES.map(([c]) => `<div data-design-bordure-cote="${c}" hidden><h5>Bordure ${c === "Haut" ? "du haut" : c === "Bas" ? "du bas" : `de ${c.toLowerCase()}`}</h5><div class="design-grille">${parCote(c)}</div></div>`).join("")}
      <h4>Coins arrondis</h4>
      <label class="design-coins-lies"><input type="checkbox" data-design-coins-lies${uniformes ? " checked" : ""}>Même arrondi pour les quatre coins</label>
      <p class="c-aide">0 donne un coin droit. Augmentez la valeur pour l’arrondir davantage. Décochez pour régler chaque coin sur le dessin.</p>
      <div data-design-coins-global${uniformes ? "" : " hidden"}>${champ("bordureRayon")}</div>
      <div class="design-coins" data-design-coins-details${uniformes ? " hidden" : ""}>${COINS.map((c) => {
        const cle = `bordureRayon${c}`;
        return `<div class="design-coin design-coin--${c.toLowerCase()}">${cles.includes(cle) ? controle(cle, valeurs[cle],
          valeurEffective(valeurs, herite, cle) ?? valeurEffective(valeurs, herite, "bordureRayon"), design, `${prefixe}${cle}`) : ""}</div>`;
      }).join("")}</div>
    </div></details>`;
}

export function actualiserBordures(form, recalculerCoins = false) {
  for (const zone of form.querySelectorAll("[data-design-bordure]")) {
    const lie = zone.querySelector("[data-design-coins-lies]");
    if (recalculerCoins) {
      const effectif = (cle) => { const x = form.elements.namedItem(`${zone.dataset.designBordure}${cle}`); return x?.value || x?.placeholder || 0; };
      const coins = COINS.map((c) => { const x = form.elements.namedItem(`${zone.dataset.designBordure}bordureRayon${c}`); return x?.value || x?.placeholder || effectif("bordureRayon"); });
      lie.checked = coins.every((v) => Number(v) === Number(effectif("bordureRayon")));
    }
    zone.querySelector("[data-design-coins-global]").hidden = !lie.checked;
    zone.querySelector("[data-design-coins-details]").hidden = lie.checked;
    for (const range of zone.querySelectorAll("[data-design-curseur]")) {
      const x = form.elements.namedItem(range.dataset.designCurseur);
      range.value = x?.value || x?.placeholder || 0;
    }
    for (const pipette of zone.querySelectorAll("[data-design-pipette]")) {
      const x = form.elements.namedItem(pipette.dataset.designPipette);
      const v = x?.value || x?.placeholder;
      if (HEX.test(v || "")) pipette.value = v.length === 4 ? `#${v.slice(1).split("").map((c) => c + c).join("")}` : v;
    }
  }
}

export function actionBordure(element, form) {
  const zone = element.closest("[data-design-bordure]");
  if (!zone) return false;
  if (element.dataset.designCote) {
    for (const b of zone.querySelectorAll("[data-design-cote]")) b.setAttribute("aria-pressed", String(b === element));
    for (const p of zone.querySelectorAll("[data-design-bordure-cote]")) p.hidden = p.dataset.designBordureCote !== element.dataset.designCote;
    return true;
  }
  const prefixe = zone.dataset.designBordure;
  let champ = element;
  if (element.dataset.designCurseur || element.dataset.designPipette) {
    champ = form.elements.namedItem(element.dataset.designCurseur || element.dataset.designPipette);
    champ.value = element.value;
  }
  if (element.matches("[data-design-coins-lies]")) {
    if (element.checked) {
      const rayon = form.elements.namedItem(`${prefixe}bordureRayon`);
      const premier = COINS.map((c) => form.elements.namedItem(`${prefixe}bordureRayon${c}`)).find((x) => x?.value !== "");
      if (rayon) rayon.value = premier?.value || premier?.placeholder || rayon.value || rayon.placeholder || "0";
      for (const c of COINS) { const x = form.elements.namedItem(`${prefixe}bordureRayon${c}`); if (x) x.value = rayon?.value || ""; }
    }
  } else {
    const cle = champ.name?.slice(prefixe.length);
    const base = BORDURES[cle];
    const cibles = base ? COTES.map(([c]) => `${base}${c}`) : cle === "bordureRayon" && zone.querySelector("[data-design-coins-lies]").checked ? COINS.map((c) => `bordureRayon${c}`) : [];
    for (const c of cibles) { const x = form.elements.namedItem(`${prefixe}${c}`); if (x) x.value = champ.value; }
  }
  actualiserBordures(form);
  return true;
}

export function panneauDesign(design, { ref, contenu = "", onglet = "design", appareil = "TABLETTE", renommable = false, aideDesign = "", colonnes = false, aideColonnes = "", statut = "" } = {}) {
  const g = design.groupes || [];
  const groupes = [...g];
  const image = ["IMAGE", "IMAGE-TEXTE"].includes(design.type);
  if (image) {
    groupes.unshift("IMAGE_DISPOSITION", "IMAGE_POSITION");
    const index = groupes.indexOf("ALIGNEMENT");
    if (index !== -1) groupes.splice(index, 1);
  }
  const clesDe = (groupe, filtre = () => true) => Object.keys(CHAMPS).filter((c) => CHAMPS[c][0] === groupe && filtre(c));
  const groupesHtml = (valeurs, herite, prefixe = "", filtre = () => true) => {
    const doubles = design.typographieSeparee ? ["typoTitre", "typoTexte"].map((cle) => groupeHtml(cle === "typoTitre" ? "TYPO_TITRE" : "TYPO_TEXTE",
      clesDe("TYPO"), valeurs[cle] || {}, { ...Object.fromEntries(clesDe("TYPO").map((c) => [c, herite[c]])), ...(herite[cle] || {}) }, design, `${prefixe}${cle}.`)).join("") : "";
    return doubles + groupes.filter((x) => !design.typographieSeparee || x !== "TYPO").map((x) => x === "BORDURE"
      ? bordureHtml(Object.keys(CHAMPS).filter((c) => /^(BORDURE|COINS)/.test(CHAMPS[c][0]) && filtre(c)), valeurs, herite, design, prefixe)
      : groupeHtml(x, clesDe(x, filtre), valeurs, herite, design, prefixe)).join("");
  };
  const designHtml = groupesHtml(design.valeurs || {}, design.herite || {})
    || `<p class="muted">Aucun réglage de design n'est déclaré pour ce type d'élément.</p>`;
  const autorises = new Set(design.champsResponsive || []);
  const responsiveHtml = ["TABLETTE", "MOBILE"].map((a) => {
    const herite = { ...(design.herite || {}), ...(design.valeurs || {}), ...(design.responsiveHerite?.[a] || {}) };
    for (const cle of ["typoTitre", "typoTexte"]) herite[cle] = { ...(design.herite?.[cle] || {}), ...(design.valeurs?.[cle] || {}), ...(design.responsiveHerite?.[a]?.[cle] || {}) };
    const blocs = groupesHtml(design.responsive?.[a] || {}, herite, `${a}.`, (c) => autorises.has(c));
    return `<div class="design-appareil" data-design-appareil="${a}"${a === appareil ? "" : " hidden"}>
      ${groupeHtml("", autorises.has("masque") ? ["masque"] : [], design.responsive?.[a] || {}, {}, design, `${a}.`)}${blocs}</div>`;
  }).join("");
  const presets = design.options?.presets || [];
  const onglets = [["contenu", "CONTENU"], ["design", "DESIGN"], ["responsive", "RESPONSIVE"], ["avance", "AVANCÉ"]];
  return `<form class="card design-panneau" data-design-form data-ref="${e(ref)}">
    <header class="design-entete"><div><span class="constructeur-type">${e(design.libelle || "")}</span> <strong>🎨 ${e(design.titre || "")}</strong>${renommable ? ` <button type="button" class="btn btn-mini design-renommer" data-c-action="renommer" data-ref="${e(ref)}" title="Modifier le nom" aria-label="Modifier le nom">✏️</button>` : ""}${colonnes ? ` <button type="button" class="btn btn-mini constructeur-colonnes-btn" data-c-action="colonnes" data-ref="${e(ref)}"${aideColonnes} title="Colonnes : découper la ligne et régler les largeurs" aria-label="Colonnes de la ligne">▥ Colonnes</button>` : ""}${statut ? `<div>${statut}</div>` : ""}</div>
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
    const chemin = el.name.split(".");
    const a = ["TABLETTE", "MOBILE"].includes(chemin[0]) ? chemin.shift() : null;
    const cible = ["typoTitre", "typoTexte"].includes(chemin[0]) ? chemin.shift() : null;
    const cle = chemin[0];
    if (chemin.length !== 1) continue;
    if (!CHAMPS[cle]) continue;
    let val = String(el.value || "").trim();
    if (CHAMPS[cle][2] === "ouinon") val = val === "OUI" ? true : val === "NON" ? false : "";
    let dest = a ? v.responsive[a] : v;
    if (cible) dest = dest[cible] ||= {};
    dest[cle] = val;
  }

  return v;
}

export function appliquerValeursDesign(form, valeurs) {
  for (const input of form.querySelectorAll("[name]")) {
    const chemin = input.name.split(".");
    if (["TABLETTE", "MOBILE"].includes(chemin[0])) chemin.unshift("responsive");
    const v = chemin.reduce((objet, cle) => objet?.[cle], valeurs);
    input.value = v === true ? "OUI" : v === false ? "NON" : v ?? "";
  }
  for (const outil of form.querySelectorAll("[data-design-outil]")) {
    const input = [...form.querySelectorAll("[name]")].find((x) => x.name === outil.dataset.designOutil);
    outil.setAttribute("aria-pressed", String(input?.value === outil.dataset.designValeur));
  }
  actualiserBordures(form, true);
}

/* Valeurs plates (formulaire) -> style imbrique attendu par le generateur CSS. */
function imbriquer(plat, design) {
  const s = {};
  for (const [k, v] of Object.entries(plat)) {
    if (["typoTitre", "typoTexte"].includes(k)) { s[k] = imbriquer(v, design); continue; }
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
  for (const k of ["soulignementEpaisseur", "soulignementDistance"]) if (s[k] !== undefined) s[k] = Number(s[k]);
  return s;
}

const fusion = (base, ajout) => {
  const sortie = { ...base };
  for (const [k, v] of Object.entries(ajout)) if (!vide(v)) sortie[k] = v && typeof v === "object" ? fusion(base[k] || {}, v) : v;
  return sortie;
};

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
