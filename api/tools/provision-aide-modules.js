"use strict";

// Aide guidee des modules : AIDE-CONTENU / AIDE-DESIGN sur chaque type (OBJ-MODULE-SITE-PUBLIC-TYPE)
// et description SharePoint des colonnes de contenu (affichee sous chaque champ du formulaire).
// Le cockpit lit uniquement SharePoint ; les textes ci-dessous ne servent qu'au premier remplissage (valeurs vides seulement).
// Modes : --plan (lecture seule) | --apply (schema) | --seed (textes initiaux) | --verify. Aucune suppression ni ecrasement.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const dse = require("../shared/dse");
const P = require("../shared/provisionnement");
const { cle, TL } = P;

const LT = "OBJ-MODULE-SITE-PUBLIC-TYPE";
const LISTES = [{ nom: LT, creer: false, colonnes: [TL("AIDE-CONTENU"), TL("AIDE-DESIGN")] }];

const DESIGN_TEXTE = "Réglez la police, la taille, la couleur et l'alignement du texte, puis vérifiez l'affichage sur tablette et mobile.";
const DESIGN_MEDIA = "Réglez la largeur, les coins arrondis et l'espacement autour du média ; vérifiez le recadrage sur mobile.";
const DESIGN_BLOC = "Choisissez la couleur de fond, les marges intérieures et la bordure ; gardez un bon contraste entre texte et fond.";
const DESIGN_LISTE = "Réglez l'espacement entre les éléments et le fond du bloc ; vérifiez le nombre d'éléments par ligne sur mobile.";

// [code, aide au contenu, aide au design]
const TYPES = [
  ["TITRE", "Écrivez un titre court et clair (idéalement moins de 70 caractères) qui annonce le contenu qui suit. Choisissez le niveau : H1 une seule fois par page, H2 pour les grandes parties, H3 pour les sous-parties.", DESIGN_TEXTE],
  ["TEXTE", "Rédigez votre paragraphe : une idée par paragraphe, des phrases courtes, un vocabulaire simple. Laissez une ligne vide pour créer un nouveau paragraphe.", DESIGN_TEXTE],
  ["TEXTE-ENRICHI", "Rédigez un texte plus long, structuré en paragraphes. Allez à l'essentiel dès la première phrase ; laissez une ligne vide entre deux paragraphes.", DESIGN_TEXTE],
  ["FAQ", "Formulez la question telle qu'un visiteur la poserait, puis donnez une réponse directe en 2 à 4 phrases.", DESIGN_BLOC],
  ["ACCORDEON", "Donnez un intitulé court au volet, puis le texte révélé à l'ouverture. Cochez « ouvert par défaut » seulement pour le volet le plus important.", DESIGN_BLOC],
  ["ONGLETS", "Préparez des onglets aux intitulés courts (1 à 3 mots) et un contenu équilibré dans chacun.", DESIGN_BLOC],
  ["IMAGE", "Choisissez une image de la médiathèque, décrivez-la dans le texte alternatif (lu par les lecteurs d'écran) et ajoutez si besoin une légende ou un lien.", DESIGN_MEDIA],
  ["IMAGE-TEXTE", "Choisissez l'image, décrivez-la dans le texte alternatif, puis rédigez une légende courte qui complète le texte voisin.", DESIGN_MEDIA],
  ["GALERIE", "Sélectionnez les médias à afficher et le nombre de colonnes. Privilégiez des images de même format pour une grille régulière.", DESIGN_MEDIA],
  ["CARROUSEL", "Sélectionnez les images à faire défiler. Si la lecture est automatique, laissez au moins 5 secondes entre deux images.", DESIGN_MEDIA],
  ["VIDEO", "Choisissez une vidéo de la médiathèque ou collez un lien externe (https://…). Ajoutez une miniature ; évitez la lecture automatique avec le son.", DESIGN_MEDIA],
  ["AUDIO", "Choisissez le fichier audio ou un lien externe, ajoutez une image et, si possible, la transcription écrite pour l'accessibilité.", DESIGN_MEDIA],
  ["DOCUMENT", "Choisissez le document et rédigez un libellé explicite (ex. « Télécharger la brochure (PDF, 2 Mo) »).", DESIGN_BLOC],
  ["TELECHARGEMENT", "Choisissez le fichier et indiquez clairement ce que le visiteur va télécharger (nom, format, poids).", DESIGN_BLOC],
  ["ICONE", "Choisissez une icône simple qui illustre l'idée du bloc voisin.", "Réglez la taille et la couleur de l'icône ; gardez la même couleur pour toutes les icônes de la section."],
  ["MEDIA-ASSOCIES", "Ce module affiche automatiquement les médias liés à la page : vérifiez simplement que les médias sont bien associés.", DESIGN_LISTE],
  ["BOUTON", "Écrivez un libellé d'action court (« Nous contacter », « Découvrir l'offre ») et l'adresse de destination (https://… ou page du site).", "Choisissez le style du bouton (principal ou secondaire), sa couleur et ses coins arrondis ; un seul bouton principal par section."],
  ["BOUTONS", "Préparez 2 ou 3 boutons au maximum, avec des libellés d'action courts et une destination pour chacun.", "Distinguez le bouton principal du secondaire par la couleur ; réglez l'espacement entre les boutons."],
  ["CTA", "Donnez un titre accrocheur, un texte court qui donne envie d'agir, puis reliez un bouton d'action.", DESIGN_BLOC],
  ["HERO", "Rédigez un titre principal fort, un sous-titre qui précise l'offre, une image de fond de qualité et 1 ou 2 boutons d'action.", "Choisissez la hauteur du bandeau, l'assombrissement de l'image et l'alignement du texte pour qu'il reste bien lisible."],
  ["CARTE", "Donnez un titre, un court texte de présentation, une image et un lien ou un bouton vers le détail.", DESIGN_BLOC],
  ["LISTE-CARTES", "Préparez des cartes homogènes : même longueur de texte et images de même format.", DESIGN_LISTE],
  ["CHIFFRES-CLES", "Choisissez 3 ou 4 chiffres marquants, chacun accompagné d'un libellé court.", DESIGN_LISTE],
  ["BANDEAU-ALERTE", "Écrivez un message court et important (date, fermeture, nouveauté), avec un lien si besoin.", "Choisissez une couleur de fond visible mais lisible ; gardez le bandeau sur une seule ligne si possible."],
  ["SEPARATEUR", "Aucun texte à saisir : ce module sépare visuellement deux parties.", "Réglez l'épaisseur, la couleur et la largeur du trait ainsi que l'espace au-dessus et en dessous."],
  ["ESPACEMENT", "Aucun texte à saisir : ce module ajoute de l'espace vide.", "Réglez la hauteur de l'espace pour chaque appareil (souvent plus petite sur mobile)."],
  ["SERVICES", "Choisissez le type de contenu et les filtres (thème, catégorie, collection) pour afficher automatiquement les services voulus.", DESIGN_LISTE],
  ["CATALOGUE", "Choisissez le type de catalogue, les filtres et le nombre d'éléments ; activez la recherche ou la pagination si la liste est longue.", DESIGN_LISTE],
  ["ARTICLES", "Choisissez les filtres (thème, catégorie) et le nombre d'articles à afficher automatiquement.", DESIGN_LISTE],
  ["ARTICLES-ASSOCIES", "Les articles liés s'affichent automatiquement : choisissez le nombre d'articles à montrer.", DESIGN_LISTE],
  ["COLLECTIONS", "Choisissez la collection et le nombre d'éléments à afficher.", DESIGN_LISTE],
  ["RECHERCHE", "Choisissez sur quel catalogue porte la recherche.", DESIGN_BLOC],
  ["FILTRES", "Choisissez le catalogue à filtrer et activez les filtres utiles au visiteur.", DESIGN_BLOC],
  ["PRODUITS", "Choisissez les filtres (catégorie, collection) et le nombre de produits à afficher.", DESIGN_LISTE],
  ["PRODUITS-ASSOCIES", "Les produits liés s'affichent automatiquement : choisissez le nombre à montrer.", DESIGN_LISTE],
  ["PANIER", "Aucun texte à saisir : le panier affiche les articles choisis par le visiteur.", DESIGN_BLOC],
  ["CONTACT", "Vérifiez que les coordonnées du site (adresse, téléphone, e-mail) sont à jour dans les réglages du site.", DESIGN_BLOC],
  ["FORMULAIRE", "Choisissez le formulaire, donnez-lui un titre, le message de confirmation affiché après l'envoi et l'e-mail qui reçoit les demandes.", DESIGN_BLOC],
  ["CONNEXION", "Aucun texte à saisir : ce module affiche l'accès à l'espace connecté.", DESIGN_BLOC],
  ["AVIS", "Les avis validés s'affichent automatiquement : vérifiez qu'ils sont publiés.", DESIGN_LISTE],
  ["TEMOIGNAGES", "Les témoignages publiés s'affichent automatiquement ; privilégiez des témoignages courts avec prénom et photo.", DESIGN_LISTE],
  ["RESEAUX-SOCIAUX", "Les liens vers vos réseaux viennent des réglages du site : vérifiez qu'ils sont à jour.", "Réglez la taille et la couleur des icônes et l'espacement entre elles."],
  ["HEADER", "L'en-tête reprend le logo et le menu du site : modifiez-les dans l'onglet En-têtes.", DESIGN_BLOC],
  ["NAVIGATION", "Le menu affiché vient de l'onglet Menus : vérifiez l'ordre et les intitulés des liens.", "Réglez la police, la couleur des liens et l'espacement ; vérifiez le menu replié sur mobile."],
  ["FIL-ARIANE", "Aucun texte à saisir : le chemin de la page est calculé automatiquement.", DESIGN_TEXTE],
  ["FOOTER", "Le pied de page reprend les informations du site : modifiez-les dans l'onglet Pieds de page.", DESIGN_BLOC],
  ["PASCARA-IA", "Ce module affichera l'assistant Pasc ARA IA aux visiteurs.", DESIGN_BLOC]
];

// Description SharePoint des colonnes (aide sous chaque champ). Cle = nom affiche de la colonne.
const COMMUN = { Titre: "Nom de repère de ce contenu dans le cockpit.", "OBJ-MEDIA": "Choisissez le média dans la médiathèque du site." };
const COLONNES = {
  "OBJ-MODULE-TITRE": { TEXTE: "Le titre affiché aux visiteurs : court et explicite.", "OBJ-NIVEAU-TITRE": "H1 une seule fois par page ; H2 pour les grandes parties ; H3 pour les sous-parties.", "OBJ-ALIGNEMENT": "Position du titre : gauche, centré ou droite." },
  "OBJ-MODULE-TEXTE": { CONTENU: "Texte affiché aux visiteurs. Laissez une ligne vide entre deux paragraphes.", "TEXTE-ENRICHI": "Texte long mis en forme automatiquement en paragraphes.", "OBJ-ALIGNEMENT": "Alignement du texte (à gauche est le plus lisible)." },
  "OBJ-MODULE-BOUTON": { LIBELLE: "Texte du bouton : un verbe d'action court (ex. « Nous contacter »).", URL: "Destination du bouton (https://… ou /page/).", "OBJ-BOUTON-TYPE": "Principal pour l'action la plus importante, secondaire pour les autres.", "OBJ-MEDIA-ICONE": "Icône facultative affichée dans le bouton.", "OBJ-OUVERTURE-LIEN": "Même onglet pour le site, nouvel onglet pour un site externe." },
  "OBJ-MODULE-IMAGE": { "TEXTE-ALTERNATIF": "Décrivez l'image en une phrase pour les personnes malvoyantes.", LEGENDE: "Texte facultatif affiché sous l'image.", LIEN: "Adresse facultative ouverte au clic sur l'image.", "OBJ-ALIGNEMENT": "Position de l'image dans la colonne." },
  "OBJ-MODULE-GALERIE": { "NOMBRE-COLONNES": "Nombre d'images par ligne sur ordinateur (3 ou 4 conseillé).", "OBJ-MODE-GALERIE": "Grille régulière ou mosaïque." },
  "OBJ-MODULE-CARROUSEL": { "LECTURE-AUTOMATIQUE": "Fait défiler les images sans action du visiteur.", DELAI: "Durée d'affichage de chaque image, en secondes (5 conseillé).", BOUCLE: "Revient à la première image après la dernière.", "AFFICHER-NAVIGATION": "Affiche les flèches et les points de navigation." },
  "OBJ-MODULE-VIDEO": { "URL-EXTERNE": "Lien d'une vidéo hébergée ailleurs (https://…), si elle n'est pas dans la médiathèque.", "OBJ-MEDIA-MINIATURE": "Image affichée avant la lecture." },
  "OBJ-MODULE-AUDIO": { "URL-EXTERNE": "Lien d'un audio hébergé ailleurs (https://…).", "OBJ-MEDIA-IMAGE": "Image affichée avec le lecteur.", TRANSCRIPTION: "Texte de l'enregistrement, pour l'accessibilité et le référencement." },
  "OBJ-MODULE-DOCUMENT": { "LIBELLE-TELECHARGEMENT": "Texte du lien, ex. « Télécharger la brochure (PDF, 2 Mo) ».", "AFFICHER-APERCU": "Affiche un aperçu du document dans la page." },
  "OBJ-MODULE-CTA": { TITRE: "Phrase d'accroche qui donne envie d'agir.", TEXTE: "Une ou deux phrases qui expliquent l'intérêt de l'action.", "OBJ-MODULE-BOUTON": "Bouton d'action relié à cet appel." },
  "OBJ-MODULE-CARTE": { TITRE: "Titre de la carte.", TEXTE: "Courte présentation (2 ou 3 phrases).", URL: "Lien vers le détail (https://… ou /page/).", "OBJ-MODULE-BOUTON": "Bouton facultatif affiché sur la carte." },
  "OBJ-MODULE-HERO": { "TITRE-PRINCIPAL": "Grand titre du bandeau : votre promesse en quelques mots.", "SOUS-TITRE": "Phrase qui précise le titre.", TEXTE: "Texte complémentaire facultatif.", "IMAGE-URL": "Lien d'une image de fond externe (https://…), sinon choisissez un média.", "IMAGE-ALT": "Description de l'image de fond.", "IMAGE-TITRE": "Titre de l'image (infobulle).", "BOUTON-1-TEXTE": "Texte du bouton principal.", "BOUTON-1-URL": "Destination du bouton principal.", "BOUTON-2-TEXTE": "Texte du bouton secondaire (facultatif).", "BOUTON-2-URL": "Destination du bouton secondaire.", "NOTE-COURTE": "Note interne courte (non affichée).", "NOTE-LONGUE": "Note interne détaillée (non affichée)." },
  "OBJ-MODULE-FAQ": { QUESTION: "La question telle que le visiteur la poserait.", REPONSE: "Réponse directe en 2 à 4 phrases.", "OUVERT-PAR-DEFAUT": "Affiche la réponse dès le chargement de la page." },
  "OBJ-MODULE-FORMULAIRE": { "OBJ-FORMULAIRE": "Formulaire à afficher.", TITRE: "Titre affiché au-dessus du formulaire.", "TEXTE-CONFIRMATION": "Message affiché après l'envoi.", "EMAIL-DESTINATION": "Adresse e-mail qui reçoit les demandes.", "VALIDATION-OBLIGATOIRE": "Les demandes doivent être validées avant traitement." },
  "OBJ-MODULE-CATALOGUE": { "OBJ-CATALOGUE-TYPE": "Type d'éléments à afficher.", "OBJ-THEME": "Filtre facultatif par thème.", "OBJ-CATEGORIE": "Filtre facultatif par catégorie.", "OBJ-COLLECTION": "Filtre facultatif par collection.", "NOMBRE-ELEMENTS": "Nombre maximal d'éléments affichés.", "AFFICHER-RECHERCHE": "Ajoute une zone de recherche.", "AFFICHER-FILTRES": "Ajoute des filtres pour le visiteur.", "AFFICHER-PAGINATION": "Découpe la liste en pages." }
};

async function colonnesAvecDescription(token, siteId, listId) {
  return dse.collecter(token, `/sites/${siteId}/lists/${listId}/columns?$select=id,name,displayName,description,readOnly,hidden`);
}

async function semer(token, siteId, appliquer) {
  const etat = await P.lireEtat(token, siteId, LISTES);
  if (P.planifierListes(etat, LISTES).length) throw new Error("Schéma incomplet : lancer --apply d'abord.");
  const vide = (v) => v === undefined || v === null || String(v).trim() === "";
  const bilan = { typesCompletes: 0, typesAbsents: [], descriptions: 0, colonnesAbsentes: [] };
  const nC = P.nomInterne(etat, LT, "AIDE-CONTENU"), nD = P.nomInterne(etat, LT, "AIDE-DESIGN");
  const types = await P.elementsDe(token, siteId, etat.ids[LT]);
  for (const [code, contenu, design] of TYPES) {
    const t = types.find((x) => cle(x.fields?.Title) === cle(code));
    if (!t) { bilan.typesAbsents.push(code); continue; }
    const manquants = Object.fromEntries(Object.entries({ [nC]: contenu, [nD]: design }).filter(([k]) => vide(t.fields?.[k])));
    if (!Object.keys(manquants).length) continue;
    console.log(`ACTION ${LT} « ${code} » ${Object.keys(manquants).join(", ")}`);
    if (appliquer) await P.appel(token, "PATCH", `/sites/${siteId}/lists/${etat.ids[LT]}/items/${t.id}/fields`, manquants);
    bilan.typesCompletes++;
  }
  for (const [liste, textes] of Object.entries(COLONNES)) {
    const id = etat.ids[liste];
    if (!id) { bilan.colonnesAbsentes.push(liste); continue; }
    const cols = await colonnesAvecDescription(token, siteId, id);
    for (const [nom, description] of Object.entries({ ...COMMUN, ...textes })) {
      // Nom exact d'abord : « Titre » (colonne Title) et « TITRE » coexistent dans certaines listes.
      const c = cols.find((x) => !x.readOnly && x.displayName === nom) || cols.find((x) => !x.readOnly && cle(x.displayName) === cle(nom));
      if (!c) { if (!COMMUN[nom]) bilan.colonnesAbsentes.push(`${liste}/${nom}`); continue; }
      if (!vide(c.description)) continue;
      console.log(`ACTION ${liste} colonne « ${c.displayName} » description`);
      if (appliquer) await P.appel(token, "PATCH", `/sites/${siteId}/lists/${id}/columns/${c.id}`, { description });
      bilan.descriptions++;
    }
  }
  return bilan;
}

async function principal(mode) {
  console.log(`DEBUT aide guidée des modules (${mode})`);
  const g = await require("../shared/ecriture").contexteGraph();
  const token = g.token, siteId = g.siteGraphId;
  const etat = await P.lireEtat(token, siteId, LISTES);
  const plan = P.planifierListes(etat, LISTES);
  if (mode === "plan" || mode === "verify") {
    P.afficherPlan(plan);
    if (plan.length) return 2;
    const bilan = await semer(token, siteId, false);
    console.log("RESTE", JSON.stringify(bilan));
    return bilan.typesCompletes || bilan.descriptions ? 2 : 0;
  }
  console.log(`Sauvegarde du schéma : ${P.sauvegarder(etat, "aide-modules")}`);
  if (mode === "apply") console.log("BILAN", await P.appliquerPlan(token, siteId, etat, LISTES));
  else console.log("BILAN", JSON.stringify(await semer(token, siteId, true)));
  dse.viderCacheGraph?.();
  return 0;
}

module.exports = { LISTES, TYPES, COLONNES };

if (require.main === module) P.lancer(principal, ["plan", "apply", "seed", "verify"]);
