"use strict";

// Bulles d'aide Pasc ARA IA des icones d'action du constructeur (survol) : liste OBJ-AIDE-ACTION.
// Le cockpit lit uniquement SharePoint ; les valeurs ci-dessous ne servent qu'au premier remplissage (champs vides seulement).
// Modes : --plan (lecture seule) | --apply (schema) | --seed (valeurs initiales) | --verify. Aucune suppression ni ecrasement.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const dse = require("../shared/dse");
const P = require("../shared/provisionnement");
const { T, TL, N, ETAT_VEROUILLE } = P;

const LISTE = "OBJ-AIDE-ACTION";
const LISTES = [{ nom: LISTE, creer: true, colonnes: [T("ICONE"), T("LIBELLE"), TL("AIDE"), N("ORDRE-AFFICHAGE"), ...ETAT_VEROUILLE()] }];

// [code action, icone, libelle, explication]
const AIDES = [
  ["colonnes", "▥", "Colonnes", "Découpe la ligne en plusieurs colonnes (de 1 à 6) et règle la largeur de chacune en %. Une colonne ajoutée est créée en brouillon ; une colonne retirée est seulement désactivée et ses modules sont déplacés dans la dernière colonne conservée : rien n'est effacé."],
  ["ajouter", "＋", "Ajouter", "Ajoute un élément à l'intérieur : une ligne dans une section, un module dans une colonne. Le nouvel élément est créé en brouillon, invisible des visiteurs tant qu'il n'est pas validé."],
  ["modifier", "✏️", "Modifier", "Ouvre les réglages de l'élément (contenu ou apparence) dans le panneau Design à gauche."],
  ["renommer", "🏷", "Renommer", "Change le nom de repère de l'élément dans le constructeur. Ce nom n'est pas affiché aux visiteurs."],
  ["design", "🎨", "Design", "Règle l'apparence : couleurs, marges, alignement, bordures… La prévisualisation se met à jour en direct."],
  ["dupliquer", "⧉", "Dupliquer", "Crée une copie de l'élément et de tout son contenu juste après lui, en brouillon. Pratique pour créer une variante."],
  ["supprimer", "🗑", "Supprimer", "Retire l'élément de la page après confirmation. Il reste conservé dans SharePoint (désactivation) et peut être réactivé."],
  ["deplacer", "✥", "Déplacer", "Glissez-déposez pour changer l'élément de place, ou utilisez les flèches pour le monter ou le descendre."],
  ["contenu", "✏️", "Contenu", "Ouvre le formulaire guidé du module pour saisir ou corriger son contenu, avec l'aide de Pasc ARA IA."],
  ["activer", "✅", "Valider et activer", "Rend l'élément visible des visiteurs une fois le contenu vérifié."]
];

async function semer(token, siteId) {
  const etat = await P.lireEtat(token, siteId, LISTES);
  if (P.planifierListes(etat, LISTES).length) throw new Error("Schéma incomplet : lancer --apply d'abord.");
  const col = (nom) => P.nomInterne(etat, LISTE, nom);
  const elements = await P.elementsDe(token, siteId, etat.ids[LISTE]);
  const vide = (v) => v === undefined || v === null || v === "";
  const bilan = { crees: 0, completes: 0 };
  for (const [i, [code, icone, libelle, aide]] of AIDES.entries()) {
    const n = elements.length;
    const id = await P.creerSiAbsent(token, siteId, etat.ids[LISTE], code, {}, elements);
    bilan.crees += elements.length - n;
    const item = elements.find((x) => String(x.id) === String(id));
    const valeurs = {
      [col("ICONE")]: icone, [col("LIBELLE")]: libelle, [col("AIDE")]: aide, [col("ORDRE-AFFICHAGE")]: (i + 1) * 10,
      [`${col("OBJ-ACTIF")}LookupId`]: 1, [`${col("OBJ-VALIDE")}LookupId`]: 1, [`${col("OBJ-VEROUILLE")}LookupId`]: 2
    };
    const manquants = Object.fromEntries(Object.entries(valeurs).filter(([k]) => vide(item?.fields?.[k])));
    if (!Object.keys(manquants).length) continue;
    console.log(`ACTION ${LISTE} « ${code} » ${Object.keys(manquants).join(", ")}`);
    await P.appel(token, "PATCH", `/sites/${siteId}/lists/${etat.ids[LISTE]}/items/${id}/fields`, manquants);
    bilan.completes++;
  }
  return bilan;
}

async function principal(mode) {
  console.log(`DEBUT aides des actions (${mode})`);
  const g = await require("../shared/ecriture").contexteGraph();
  const token = g.token, site = { id: g.siteGraphId };
  const etat = await P.lireEtat(token, site.id, LISTES);
  const plan = P.planifierListes(etat, LISTES);
  if (mode === "plan" || mode === "verify") {
    P.afficherPlan(plan);
    return plan.length ? 2 : 0;
  }
  console.log(`Sauvegarde du schéma : ${P.sauvegarder(etat, "aides-actions")}`);
  if (mode === "apply") console.log("BILAN", await P.appliquerPlan(token, site.id, etat, LISTES));
  else console.log("BILAN", JSON.stringify(await semer(token, site.id)));
  dse.viderCacheGraph?.();
  return 0;
}

module.exports = { LISTES, AIDES };

if (require.main === module) P.lancer(principal, ["plan", "apply", "seed", "verify"]);
