"use strict";

// Catalogue visuel des modules : categories (OBJ-MODULE-CATEGORIE) + libelle, icone, ordre et categorie de chaque type.
// Le cockpit lit uniquement SharePoint ; les valeurs ci-dessous ne servent qu'au premier remplissage (champs vides seulement).
// Modes : --plan (lecture seule) | --apply (schema) | --seed (valeurs initiales) | --verify. Aucune suppression ni ecrasement.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const dse = require("../shared/dse");
const P = require("../shared/provisionnement");
const { cle, T, N, L, ETAT_VEROUILLE } = P;

const LISTES = [
  { nom: "OBJ-MODULE-CATEGORIE", creer: true, colonnes: [T("ICONE"), T("NOTE-COURTE"), N("ORDRE-AFFICHAGE"), ...ETAT_VEROUILLE()] },
  { nom: "OBJ-MODULE-SITE-PUBLIC-TYPE", creer: false,
    colonnes: [T("LIBELLE"), T("ICONE"), N("ORDRE-AFFICHAGE"), L("OBJ-MODULE-CATEGORIE", "OBJ-MODULE-CATEGORIE")] }
];

// [categorie, icone, description, [[code type, libelle, icone], ...]]
const CATALOGUE = [
  ["Texte", "✍️", "Titres, paragraphes et contenus repliables", [
    ["TITRE", "Titre", "🔠"], ["TEXTE", "Texte", "📝"], ["TEXTE-ENRICHI", "Texte enrichi", "📄"],
    ["FAQ", "FAQ", "❓"], ["ACCORDEON", "Accordéon", "🪗"], ["ONGLETS", "Onglets", "🗂️"]]],
  ["Média", "🖼️", "Images, vidéos, sons et fichiers", [
    ["IMAGE", "Image", "🖼️"], ["IMAGE-TEXTE", "Image + texte", "📰"], ["GALERIE", "Galerie", "🗃️"],
    ["CARROUSEL", "Carrousel", "🎠"], ["VIDEO", "Vidéo", "🎬"], ["AUDIO", "Audio", "🎵"], ["DOCUMENT", "Document", "📑"],
    ["TELECHARGEMENT", "Téléchargement", "⬇️"], ["ICONE", "Icône", "✳️"], ["MEDIA-ASSOCIES", "Médias associés", "🔗"]]],
  ["Boutons et actions", "👆", "Boutons et appels à l'action", [
    ["BOUTON", "Bouton", "🔘"], ["BOUTONS", "Groupe de boutons", "🎛️"], ["CTA", "Appel à l'action", "📣"]]],
  ["Mise en page", "📐", "Bandeaux, cartes, séparateurs et espaces", [
    ["HERO", "Bandeau principal (Hero)", "🌄"], ["CARTE", "Carte", "🃏"], ["LISTE-CARTES", "Liste de cartes", "🗄️"],
    ["CHIFFRES-CLES", "Chiffres clés", "📊"], ["BANDEAU-ALERTE", "Bandeau d'alerte", "⚠️"],
    ["SEPARATEUR", "Séparateur", "➖"], ["ESPACEMENT", "Espacement", "↕️"]]],
  ["Contenus dynamiques", "📚", "Listes alimentées automatiquement", [
    ["SERVICES", "Services", "🧰"], ["CATALOGUE", "Catalogue", "📚"], ["ARTICLES", "Articles", "🗞️"],
    ["ARTICLES-ASSOCIES", "Articles associés", "🔗"], ["COLLECTIONS", "Collections", "🧺"]]],
  ["Recherche et filtres", "🔎", "Trouver et trier les contenus", [
    ["RECHERCHE", "Recherche", "🔍"], ["FILTRES", "Filtres", "🎚️"]]],
  ["Commerce", "🛒", "Produits et panier", [
    ["PRODUITS", "Produits", "🛍️"], ["PRODUITS-ASSOCIES", "Produits associés", "🔗"], ["PANIER", "Panier", "🛒"]]],
  ["Contact et formulaires", "✉️", "Échanger avec les visiteurs", [
    ["CONTACT", "Contact", "📇"], ["FORMULAIRE", "Formulaire", "🧾"], ["CONNEXION", "Connexion", "🔐"]]],
  ["Social et avis", "⭐", "Avis, témoignages et réseaux", [
    ["AVIS", "Avis", "⭐"], ["TEMOIGNAGES", "Témoignages", "💬"], ["RESEAUX-SOCIAUX", "Réseaux sociaux", "🌐"]]],
  ["Navigation", "🧭", "En-tête, menus et pied de page", [
    ["HEADER", "En-tête", "🔝"], ["NAVIGATION", "Menu de navigation", "🧭"], ["FIL-ARIANE", "Fil d'Ariane", "➡️"],
    ["FOOTER", "Pied de page", "🔚"]]],
  ["Intelligence artificielle", "🤖", "Assistants intelligents", [["PASCARA-IA", "PASCARA IA", "🤖"]]]
];

async function semer(token, siteId) {
  const etat = await P.lireEtat(token, siteId, LISTES);
  if (P.planifierListes(etat, LISTES).length) throw new Error("Schéma incomplet : lancer --apply d'abord.");
  const col = (liste, nom) => P.nomInterne(etat, liste, nom);
  const LC = "OBJ-MODULE-CATEGORIE", LT = "OBJ-MODULE-SITE-PUBLIC-TYPE";
  const categories = await P.elementsDe(token, siteId, etat.ids[LC]);
  const types = await P.elementsDe(token, siteId, etat.ids[LT]);
  const vide = (v) => v === undefined || v === null || v === "";
  const completer = async (liste, item, valeurs) => {
    const manquants = Object.fromEntries(Object.entries(valeurs).filter(([k]) => vide(item.fields?.[k])));
    if (!Object.keys(manquants).length) return 0;
    console.log(`ACTION ${liste} « ${item.fields?.Title} » ${Object.keys(manquants).join(", ")}`);
    await P.appel(token, "PATCH", `/sites/${siteId}/lists/${etat.ids[liste]}/items/${item.id}/fields`, manquants);
    return 1;
  };
  const bilan = { categoriesCreees: 0, categoriesCompletees: 0, typesCompletes: 0, typesAbsents: [] };
  const nCat = `${col(LT, "OBJ-MODULE-CATEGORIE")}LookupId`;
  for (const [i, [titre, icone, note, membres]] of CATALOGUE.entries()) {
    const n = categories.length;
    const id = await P.creerSiAbsent(token, siteId, etat.ids[LC], titre, {}, categories);
    bilan.categoriesCreees += categories.length - n;
    const cat = categories.find((x) => String(x.id) === String(id));
    bilan.categoriesCompletees += await completer(LC, cat, {
      [col(LC, "ICONE")]: icone, [col(LC, "NOTE-COURTE")]: note, [col(LC, "ORDRE-AFFICHAGE")]: (i + 1) * 10,
      [`${col(LC, "OBJ-ACTIF")}LookupId`]: 1, [`${col(LC, "OBJ-VALIDE")}LookupId`]: 1, [`${col(LC, "OBJ-VEROUILLE")}LookupId`]: 2
    });
    for (const [j, [code, libelle, iconeType]] of membres.entries()) {
      const type = types.find((x) => cle(x.fields?.Title) === cle(code));
      if (!type) { bilan.typesAbsents.push(code); continue; }
      bilan.typesCompletes += await completer(LT, type, {
        [col(LT, "LIBELLE")]: libelle, [col(LT, "ICONE")]: iconeType, [col(LT, "ORDRE-AFFICHAGE")]: (j + 1) * 10, [nCat]: Number(id)
      });
    }
  }
  const sansCategorie = types.filter((t) => vide(t.fields?.[nCat]) && !CATALOGUE.some(([, , , m]) => m.some(([c]) => cle(c) === cle(t.fields?.Title))));
  if (sansCategorie.length) console.log(`INFO types sans catégorie (classés « Autres ») : ${sansCategorie.map((t) => t.fields.Title).join(", ")}`);
  return bilan;
}

async function principal(mode) {
  console.log(`DEBUT catalogue des modules (${mode})`);
  // Meme contexte que les autres evolutions de schema (Sites.Selected avec droit de gestion sur le site DSE).
  const g = await require("../shared/ecriture").contexteGraph();
  const token = g.token, site = { id: g.siteGraphId };
  const etat = await P.lireEtat(token, site.id, LISTES);
  const plan = P.planifierListes(etat, LISTES);
  if (mode === "plan" || mode === "verify") {
    P.afficherPlan(plan);
    return plan.length ? 2 : 0;
  }
  console.log(`Sauvegarde du schéma : ${P.sauvegarder(etat, "categories-modules")}`);
  if (mode === "apply") console.log("BILAN", await P.appliquerPlan(token, site.id, etat, LISTES));
  else console.log("BILAN", JSON.stringify(await semer(token, site.id)));
  dse.viderCacheGraph?.();
  return 0;
}

module.exports = { LISTES, CATALOGUE };

if (require.main === module) P.lancer(principal, ["plan", "apply", "seed", "verify"]);
