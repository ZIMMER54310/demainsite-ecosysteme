"use strict";

// Provisionneur idempotent du DSE Builder (Page > Section > Ligne > Colonne > Module).
// Modes : --plan (lecture seule) | --apply | --seed | --verify. Aucune suppression, aucun renommage.
// Sans Sites.Manage.All, --apply et --seed s'arretent avant toute ecriture ; --verify reste possible.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const dse = require("../shared/dse");
const P = require("../shared/provisionnement");
const { cle, T, TL, N, B, D, L, ETAT, ETAT_VEROUILLE } = P;

/* ---------- Schema ---------- */

const STYLE_ESPACES = (prefixe) => ["HAUT", "BAS", "GAUCHE", "DROITE"].map((c) => N(`${prefixe}-${c}`));
const POLICES = [
  "Arial", "Arial Black", "Aptos", "Bahnschrift", "Calibri", "Cambria", "Cambria Math", "Candara", "Comic Sans MS",
  "Consolas", "Constantia", "Corbel", "Courier New", "Franklin Gothic Medium", "Garamond", "Georgia", "Impact",
  "Lucida Console", "Lucida Sans Unicode", "Palatino Linotype", "Segoe UI", "Tahoma", "Times New Roman",
  "Trebuchet MS", "Verdana"
];
const REF = (extra = []) => [T("CODE"), T("NOTE-COURTE"), N("ORDRE-AFFICHAGE"), ...extra, ...ETAT_VEROUILLE()];
const CONTENU = (...champs) => [L("OBJ-MODULE-SITE-PUBLIC", "OBJ-MODULE-SITE-PUBLIC"), N("ORDRE-AFFICHAGE"), ...champs, ...ETAT_VEROUILLE()];
const STYLE_BASE = () => [L("OBJ-MODELE-BUILDER", "OBJ-MODELE-BUILDER"), L("OBJ-STYLE-PRESET", "OBJ-STYLE-PRESET")];
const SYNCHRO = () => [B("GLOBAL"), B("SYNCHRONISE-CONTENU"), B("SYNCHRONISE-DESIGN"), B("SYNCHRONISE-AVANCE")];

const REFERENTIELS_SIMPLES = [
  "OBJ-SECTION-TYPE", "OBJ-LIGNE-STRUCTURE", "OBJ-NIVEAU-TITRE", "OBJ-ALIGNEMENT", "OBJ-ALIGNEMENT-HORIZONTAL",
  "OBJ-ALIGNEMENT-VERTICAL", "OBJ-MODE-AFFICHAGE", "OBJ-BOUTON-TYPE", "OBJ-OUVERTURE-LIEN", "OBJ-MODE-GALERIE",
  "OBJ-CATALOGUE-TYPE", "OBJ-APPAREIL", "OBJ-STYLE-TYPE", "OBJ-ESPACEMENT", "OBJ-ANIMATION", "OBJ-TRANSITION",
  "OBJ-MODELE-TYPE", "OBJ-ENVIRONNEMENT", "OBJ-STATUT-VERSION", "OBJ-FORMULAIRE"
];

const LISTES = [
  ...REFERENTIELS_SIMPLES.map((nom) => ({
    nom, creer: true,
    colonnes: nom === "OBJ-LIGNE-STRUCTURE" ? REF([N("NOMBRE-COLONNES"), T("DEFINITION-GRILLE")]) : REF()
  })),
  // Valeurs techniques bornees : validees a la lecture (couleur hexadecimale, famille de police autorisee).
  { nom: "OBJ-LARGEUR", creer: true, colonnes: REF([N("VALEUR-MAXIMALE")]) },
  { nom: "OBJ-COULEUR", creer: true, colonnes: REF([T("VALEUR-HEX")]) },
  { nom: "OBJ-POLICE", creer: true, colonnes: REF([T("FAMILLE")]) },

  {
    nom: "OBJ-STYLE-PRESET", creer: true,
    colonnes: [T("CODE-STYLE"), L("OBJ-STYLE-TYPE", "OBJ-STYLE-TYPE"), L("OBJ-COULEUR-TEXTE", "OBJ-COULEUR"),
      L("OBJ-COULEUR-FOND", "OBJ-COULEUR"), L("OBJ-POLICE", "OBJ-POLICE"), N("TAILLE-TEXTE"), N("POIDS-POLICE"), B("SOULIGNEMENT"),
      T("STYLE-POLICE"), T("TRANSFORMATION-TEXTE"), N("HAUTEUR-LIGNE"), N("ESPACEMENT-LETTRES"),
      TL("TYPO-TITRE"), TL("TYPO-TEXTE"),
      L("ALIGNEMENT", "OBJ-ALIGNEMENT"), N("LARGEUR"), N("LARGEUR-MAXIMALE"),
      ...STYLE_ESPACES("MARGE"), ...STYLE_ESPACES("PADDING"), N("BORDURE-LARGEUR"), N("BORDURE-RAYON"),
      L("OBJ-COULEUR-BORDURE", "OBJ-COULEUR"), T("OMBRE"), ...ETAT_VEROUILLE()]
  },
  {
    nom: "OBJ-STYLE-RESPONSIVE", creer: true,
    colonnes: [L("OBJ-STYLE-PRESET", "OBJ-STYLE-PRESET"), L("OBJ-APPAREIL", "OBJ-APPAREIL"), N("LARGEUR"), N("TAILLE-TEXTE"),
      L("ALIGNEMENT", "OBJ-ALIGNEMENT"), ...STYLE_ESPACES("MARGE"), ...STYLE_ESPACES("PADDING"), B("MASQUE"), ...ETAT_VEROUILLE()]
  },

  {
    nom: "OBJ-SECTION-SITE", creer: true,
    colonnes: [L("OBJ-PAGES-SITE", "OBJ-PAGES-SITE"), L("OBJ-SECTION-TYPE", "OBJ-SECTION-TYPE"), ...STYLE_BASE(),
      L("OBJ-MEDIA-ARRIERE-PLAN", "OBJ-MEDIA"), N("ORDRE-AFFICHAGE"), L("LARGEUR-CONTENU", "OBJ-LARGEUR"),
      N("HAUTEUR-MINIMUM"), T("ANCRAGE"), ...SYNCHRO(), ...ETAT_VEROUILLE()]
  },
  {
    nom: "OBJ-LIGNE-SITE", creer: true,
    colonnes: [L("OBJ-SECTION-SITE", "OBJ-SECTION-SITE"), L("OBJ-LIGNE-STRUCTURE", "OBJ-LIGNE-STRUCTURE"), ...STYLE_BASE(),
      N("ORDRE-AFFICHAGE"), N("LARGEUR-MAXIMALE"), N("ESPACEMENT-COLONNES"),
      L("OBJ-ALIGNEMENT-HORIZONTAL", "OBJ-ALIGNEMENT-HORIZONTAL"), L("OBJ-ALIGNEMENT-VERTICAL", "OBJ-ALIGNEMENT-VERTICAL"),
      L("OBJ-MODE-AFFICHAGE", "OBJ-MODE-AFFICHAGE"), B("GLOBAL"), ...ETAT_VEROUILLE()]
  },
  {
    nom: "OBJ-COLONNE-SITE", creer: true,
    colonnes: [L("OBJ-LIGNE-SITE", "OBJ-LIGNE-SITE"), N("ORDRE-AFFICHAGE"), N("LARGEUR"), N("LARGEUR-TABLETTE"),
      N("LARGEUR-MOBILE"), N("DECALAGE"), L("OBJ-ALIGNEMENT", "OBJ-ALIGNEMENT"), L("OBJ-STYLE-PRESET", "OBJ-STYLE-PRESET"),
      L("OBJ-MEDIA-ARRIERE-PLAN", "OBJ-MEDIA"), ...ETAT_VEROUILLE()]
  },
  {
    nom: "OBJ-MODULE-SITE-PUBLIC", creer: false,
    colonnes: [L("OBJ-COLONNE-SITE", "OBJ-COLONNE-SITE"), ...STYLE_BASE(), N("ORDRE-AFFICHAGE"), ...SYNCHRO(),
      B("VISIBLE-ORDINATEUR"), B("VISIBLE-TABLETTE"), B("VISIBLE-MOBILE"), T("CLASSE-CSS"), T("ANCRAGE-CSS")]
  },
  { nom: "OBJ-MODULE-SITE-PUBLIC-TYPE", creer: false, colonnes: [] },
  { nom: "OBJ-PAGES-SITE", creer: false, colonnes: [B("AFFICHER-BANDEAU-CHANTIER")] },

  { nom: "OBJ-MODULE-TITRE", creer: true, colonnes: CONTENU(T("TEXTE"), L("OBJ-NIVEAU-TITRE", "OBJ-NIVEAU-TITRE"), L("OBJ-ALIGNEMENT", "OBJ-ALIGNEMENT")) },
  { nom: "OBJ-MODULE-TEXTE", creer: true, colonnes: CONTENU(TL("CONTENU"), TL("TEXTE-ENRICHI"), L("OBJ-ALIGNEMENT", "OBJ-ALIGNEMENT")) },
  {
    nom: "OBJ-MODULE-BOUTON", creer: true,
    colonnes: CONTENU(T("LIBELLE"), T("URL"), L("OBJ-BOUTON-TYPE", "OBJ-BOUTON-TYPE"), L("OBJ-MEDIA-ICONE", "OBJ-MEDIA"),
      L("OBJ-OUVERTURE-LIEN", "OBJ-OUVERTURE-LIEN"))
  },
  { nom: "OBJ-MODULE-IMAGE", creer: true, colonnes: CONTENU(L("OBJ-MEDIA", "OBJ-MEDIA"), T("TEXTE-ALTERNATIF"), T("LEGENDE"), T("LIEN"), L("OBJ-ALIGNEMENT", "OBJ-ALIGNEMENT")) },
  { nom: "OBJ-MODULE-GALERIE", creer: true, colonnes: CONTENU(L("OBJ-MEDIA", "OBJ-MEDIA", true), N("NOMBRE-COLONNES"), L("OBJ-MODE-GALERIE", "OBJ-MODE-GALERIE")) },
  {
    nom: "OBJ-MODULE-VIDEO", creer: true,
    colonnes: CONTENU(L("OBJ-MEDIA", "OBJ-MEDIA"), T("URL-EXTERNE"), L("OBJ-MEDIA-MINIATURE", "OBJ-MEDIA"),
      B("LECTURE-AUTOMATIQUE"), B("MUET"), B("BOUCLE"), B("CONTROLES"))
  },
  {
    nom: "OBJ-MODULE-AUDIO", creer: true,
    colonnes: CONTENU(L("OBJ-MEDIA", "OBJ-MEDIA"), T("URL-EXTERNE"), L("OBJ-MEDIA-IMAGE", "OBJ-MEDIA"), B("CONTROLES"), TL("TRANSCRIPTION"))
  },
  { nom: "OBJ-MODULE-DOCUMENT", creer: true, colonnes: CONTENU(L("OBJ-MEDIA", "OBJ-MEDIA"), T("LIBELLE-TELECHARGEMENT"), B("AFFICHER-APERCU")) },
  { nom: "OBJ-MODULE-CTA", creer: true, colonnes: CONTENU(T("TITRE"), TL("TEXTE"), L("OBJ-MEDIA", "OBJ-MEDIA"), L("OBJ-MODULE-BOUTON", "OBJ-MODULE-BOUTON", true)) },
  { nom: "OBJ-MODULE-FAQ", creer: true, colonnes: CONTENU(T("QUESTION"), TL("REPONSE"), B("OUVERT-PAR-DEFAUT")) },
  {
    nom: "OBJ-MODULE-CARTE", creer: true,
    colonnes: CONTENU(T("TITRE"), TL("TEXTE"), L("OBJ-MEDIA", "OBJ-MEDIA"), T("URL"), L("OBJ-MODULE-BOUTON", "OBJ-MODULE-BOUTON", true))
  },
  {
    nom: "OBJ-MODULE-CARROUSEL", creer: true,
    colonnes: CONTENU(L("OBJ-MEDIA", "OBJ-MEDIA", true), B("LECTURE-AUTOMATIQUE"), N("DELAI"), B("BOUCLE"), B("AFFICHER-NAVIGATION"))
  },
  {
    nom: "OBJ-MODULE-FORMULAIRE", creer: true,
    colonnes: CONTENU(L("OBJ-FORMULAIRE", "OBJ-FORMULAIRE"), T("TITRE"), TL("TEXTE-CONFIRMATION"), T("EMAIL-DESTINATION"), B("VALIDATION-OBLIGATOIRE"))
  },
  {
    nom: "OBJ-MODULE-CATALOGUE", creer: true,
    colonnes: CONTENU(L("OBJ-CATALOGUE-TYPE", "OBJ-CATALOGUE-TYPE"), L("OBJ-SITE-PUBLIC", "OBJ-SITE-PUBLIC", true),
      L("OBJ-THEME", "OBJ-THEME", true), L("OBJ-CATEGORIE", "OBJ-CATEGORIE", true), L("OBJ-COLLECTION", "OBJ-COLLECTION", true),
      N("NOMBRE-ELEMENTS"), B("AFFICHER-RECHERCHE"), B("AFFICHER-FILTRES"), B("AFFICHER-PAGINATION"))
  },

  {
    nom: "OBJ-MODELE-BUILDER", creer: true,
    colonnes: [L("OBJ-MODELE-TYPE", "OBJ-MODELE-TYPE"), L("OBJ-SITE-PUBLIC", "OBJ-SITE-PUBLIC", true),
      L("OBJ-SECTION-SITE", "OBJ-SECTION-SITE"), L("OBJ-LIGNE-SITE", "OBJ-LIGNE-SITE"),
      L("OBJ-MODULE-SITE-PUBLIC", "OBJ-MODULE-SITE-PUBLIC"), ...SYNCHRO(), N("VERSION"), ...ETAT_VEROUILLE()]
  },
  {
    nom: "OBJ-MODELE-INSTANCE", creer: true,
    colonnes: [L("OBJ-MODELE-BUILDER", "OBJ-MODELE-BUILDER"), L("OBJ-PAGES-SITE", "OBJ-PAGES-SITE"),
      L("OBJ-SECTION-SITE", "OBJ-SECTION-SITE"), L("OBJ-LIGNE-SITE", "OBJ-LIGNE-SITE"),
      L("OBJ-MODULE-SITE-PUBLIC", "OBJ-MODULE-SITE-PUBLIC"), B("SURCHARGE-CONTENU"), B("SURCHARGE-DESIGN"),
      B("SURCHARGE-AVANCE"), ...ETAT_VEROUILLE()]
  },
  {
    nom: "OBJ-VERSION-PAGE", creer: true,
    colonnes: [L("OBJ-PAGES-SITE", "OBJ-PAGES-SITE"), N("NUMERO-VERSION"), L("OBJ-STATUT-VERSION", "OBJ-STATUT-VERSION"),
      D("DATE-VERSION"), TL("NOTE-VERSION"), TL("SNAPSHOT-JSON"), ...ETAT_VEROUILLE()]
  },
  {
    nom: "OBJ-PUBLICATION-PAGE", creer: true,
    colonnes: [L("OBJ-PAGES-SITE", "OBJ-PAGES-SITE"), L("OBJ-VERSION-PAGE", "OBJ-VERSION-PAGE"),
      L("OBJ-ENVIRONNEMENT", "OBJ-ENVIRONNEMENT"), L("OBJ-DOMAINE", "OBJ-NOM DE DOMAINE"), D("DATE-PUBLICATION"),
      T("RESULTAT"), N("CODE-HTTP"), ...ETAT_VEROUILLE()]
  }
];

// Types de modules : ceux deja presents ne sont jamais recrees (comparaison par titre).
const TYPES_MODULES = [
  "TITRE", "TEXTE", "TEXTE-ENRICHI", "BOUTON", "BOUTONS", "IMAGE", "IMAGE-TEXTE", "GALERIE", "CARROUSEL", "VIDEO", "AUDIO",
  "DOCUMENT", "TELECHARGEMENT", "ICONE", "SEPARATEUR", "ESPACEMENT", "HERO", "CTA", "CARTE", "LISTE-CARTES", "FAQ", "ACCORDEON",
  "ONGLETS", "CHIFFRES-CLES", "AVIS", "TEMOIGNAGES", "FORMULAIRE", "CONTACT", "RESEAUX-SOCIAUX", "CATALOGUE", "ARTICLES",
  "PRODUITS", "SERVICES", "COLLECTIONS", "RECHERCHE", "FILTRES", "PRODUITS-ASSOCIES", "ARTICLES-ASSOCIES", "MEDIA-ASSOCIES",
  "HEADER", "NAVIGATION", "FIL-ARIANE", "FOOTER", "BANDEAU-ALERTE", "CONNEXION", "PANIER", "PASCARA-IA"
];

const VALEURS = {
  "OBJ-SECTION-TYPE": ["STANDARD", "PLEINE-LARGEUR", "SPECIALE", "GLOBALE", "HEADER", "FOOTER"],
  "OBJ-LIGNE-STRUCTURE": ["100", "50-50", "33-33-33", "25-25-25-25", "33-66", "66-33", "25-75", "75-25", "25-50-25", "20-20-20-20-20", "GRILLE-AUTO"],
  "OBJ-NIVEAU-TITRE": ["H1", "H2", "H3", "H4", "H5", "H6"],
  "OBJ-ALIGNEMENT": ["GAUCHE", "CENTRE", "DROITE", "JUSTIFIE"],
  "OBJ-ALIGNEMENT-HORIZONTAL": ["DEBUT", "CENTRE", "FIN", "ESPACE-ENTRE"],
  "OBJ-ALIGNEMENT-VERTICAL": ["HAUT", "CENTRE", "BAS", "ETIRE"],
  "OBJ-MODE-AFFICHAGE": ["BLOC", "FLEX", "GRILLE"],
  "OBJ-BOUTON-TYPE": ["PRINCIPAL", "SECONDAIRE", "LIEN", "ICONE"],
  "OBJ-OUVERTURE-LIEN": ["MEME-FENETRE", "NOUVEL-ONGLET"],
  "OBJ-MODE-GALERIE": ["GRILLE", "MOSAIQUE", "DIAPORAMA"],
  "OBJ-CATALOGUE-TYPE": ["TOUS", "ARTICLES", "PRODUITS", "SERVICES", "COLLECTIONS"],
  "OBJ-APPAREIL": ["ORDINATEUR", "TABLETTE", "MOBILE"],
  "OBJ-MODELE-TYPE": ["PAGE", "SECTION", "LIGNE", "MODULE", "HEADER", "FOOTER", "HERO", "CTA", "CARTE", "CATALOGUE"],
  "OBJ-ENVIRONNEMENT": ["BROUILLON", "RECETTE", "PRODUCTION"],
  "OBJ-STATUT-VERSION": ["BROUILLON", "PUBLIEE", "ARCHIVEE"]
};

// Modeles globaux initiaux : non valides, sans contenu invente. "sites" = ID natifs OBJ-SITE-PUBLIC concernes.
const MODELES = [
  { titre: "HEADER-GROUPE-DSE", type: "HEADER", sites: [1, 2, 3], global: true },
  { titre: "FOOTER-GROUPE-DSE", type: "FOOTER", sites: [1, 2, 3], global: true },
  { titre: "HERO-DEMAINSITE", type: "HERO", sites: [1], global: false },
  { titre: "HERO-PASCLAURE", type: "HERO", sites: [2], global: false },
  { titre: "HERO-BLOGS-SITE", type: "HERO", sites: [3], global: false },
  { titre: "CTA-DEVIS", type: "CTA", sites: [1], global: false },
  { titre: "CATALOGUE-PRODUITS", type: "CATALOGUE", sites: [1, 2, 3], global: false },
  { titre: "CATALOGUE-ARTICLES", type: "CATALOGUE", sites: [1, 3], global: false }
];

// Compositions de depart : structure seulement (section > ligne > colonne > module), jamais de contenu metier.
const COMPOSITIONS = {
  4: [["Header", "HEADER"], ["Hero", "HERO"], ["Univers du groupe", "LISTE-CARTES"], ["Catalogue agrégé", "CATALOGUE"],
    ["Articles", "ARTICLES"], ["Services", "SERVICES"], ["CTA", "CTA"], ["Footer", "FOOTER"]],
  1: [["Header groupe", "HEADER"], ["Hero", "HERO"], ["Services", "SERVICES"], ["Réalisations", "LISTE-CARTES"], ["Produits", "PRODUITS"],
    ["Articles", "ARTICLES"], ["CTA devis", "CTA"], ["Footer groupe", "FOOTER"]],
  2: [["Header groupe", "HEADER"], ["Hero", "HERO"], ["Collections", "COLLECTIONS"], ["Produits", "PRODUITS"], ["Galerie", "GALERIE"],
    ["Licences", "LISTE-CARTES"], ["Articles associés", "ARTICLES-ASSOCIES"], ["Footer groupe", "FOOTER"]],
  3: [["Header groupe", "HEADER"], ["Hero", "HERO"], ["Articles récents", "ARTICLES"], ["Thèmes", "FILTRES"], ["Dossiers", "COLLECTIONS"],
    ["Produits associés", "PRODUITS-ASSOCIES"], ["Services associés", "SERVICES"], ["Footer groupe", "FOOTER"]]
};

const planifier = (etat) => P.planifierListes(etat, LISTES);

/* ---------- Seed ---------- */

async function semer(token, siteId) {
  const etat = await P.lireEtat(token, siteId, LISTES);
  const manquantes = LISTES.filter((l) => !etat.ids[l.nom]).map((l) => l.nom);
  if (manquantes.length) throw new Error(`Schema incomplet (--apply requis) : ${manquantes.join(", ")}`);

  const lecture = {};
  const items = async (liste) => (lecture[liste] ||= await P.elementsDe(token, siteId, etat.ids[liste]));
  const col = (liste, nom) => P.nomInterne(etat, liste, nom);
  const etatChamps = (liste, valide = 1) => ({
    [`${col(liste, "OBJ-ACTIF")}LookupId`]: 1,
    [`${col(liste, "OBJ-VALIDE")}LookupId`]: valide,
    ...(col(liste, "OBJ-VEROUILLE") ? { [`${col(liste, "OBJ-VEROUILLE")}LookupId`]: 2 } : {})
  });
  const lookup = (liste, nom, id) => ({ [`${col(liste, nom)}LookupId`]: Number(id) });
  const multi = (liste, nom, ids) => ({
    [`${col(liste, nom)}LookupId@odata.type`]: "Collection(Edm.Int32)",
    [`${col(liste, nom)}LookupId`]: ids.map(Number)
  });
  const creer = async (liste, titre, champs) => P.creerSiAbsent(token, siteId, etat.ids[liste], titre, champs, await items(liste));
  const idDe = async (liste, titre) => (await items(liste)).find((i) => cle(i.fields?.Title) === cle(titre))?.id;

  const bilan = { referentiels: 0, types: 0, modeles: 0, structure: 0 };
  const compter = async (liste, fn) => { const n = (await items(liste)).length; await fn(); return (await items(liste)).length - n; };

  // Referentiels (valides : ce sont des valeurs techniques, pas du contenu).
  for (const [liste, valeurs] of Object.entries(VALEURS)) {
    for (const [i, titre] of valeurs.entries()) {
      bilan.referentiels += await compter(liste, () => creer(liste, titre, {
        ...etatChamps(liste), [col(liste, "CODE")]: titre, [col(liste, "ORDRE-AFFICHAGE")]: i + 1,
        ...(liste === "OBJ-LIGNE-STRUCTURE" ? {
          [col(liste, "NOMBRE-COLONNES")]: titre === "GRILLE-AUTO" ? 0 : titre.split("-").length,
          [col(liste, "DEFINITION-GRILLE")]: titre
        } : {})
      }));
    }
  }
  for (const [i, famille] of POLICES.entries()) {
    bilan.referentiels += await compter("OBJ-POLICE", () => creer("OBJ-POLICE", famille, {
      ...etatChamps("OBJ-POLICE"), [col("OBJ-POLICE", "CODE")]: famille, [col("OBJ-POLICE", "FAMILLE")]: famille,
      [col("OBJ-POLICE", "ORDRE-AFFICHAGE")]: i + 1
    }));
  }

  // Types de modules : completer sans doublon.
  const listeTypes = "OBJ-MODULE-SITE-PUBLIC-TYPE";
  for (const titre of TYPES_MODULES) {
    bilan.types += await compter(listeTypes, () => creer(listeTypes, titre, etatChamps(listeTypes)));
  }

  // Modeles globaux : toujours non valides.
  const listeModeles = "OBJ-MODELE-BUILDER";
  for (const m of MODELES) {
    bilan.modeles += await compter(listeModeles, async () => creer(listeModeles, m.titre, {
      ...etatChamps(listeModeles, 2),
      ...lookup(listeModeles, "OBJ-MODELE-TYPE", await idDe("OBJ-MODELE-TYPE", m.type)),
      ...multi(listeModeles, "OBJ-SITE-PUBLIC", m.sites),
      [col(listeModeles, "GLOBAL")]: m.global, [col(listeModeles, "VERSION")]: 1,
      [col(listeModeles, "SYNCHRONISE-CONTENU")]: m.global, [col(listeModeles, "SYNCHRONISE-DESIGN")]: m.global,
      [col(listeModeles, "SYNCHRONISE-AVANCE")]: false
    }));
  }

  // Compositions initiales : pages existantes uniquement, elements non valides.
  const pages = await items("OBJ-PAGES-SITE");
  const colSitePage = col("OBJ-PAGES-SITE", "OBJ-SITE-PUBLIC");
  const racines = (id) => pages.find((p) => String(p.fields?.[`${colSitePage}LookupId`]) === String(id) && String(p.fields?.URL || "/").trim() === "/");
  const largeur100 = await idDe("OBJ-LIGNE-STRUCTURE", "100");
  const hero = await idDe(listeTypes, "HERO");

  for (const [site, plan] of Object.entries(COMPOSITIONS)) {
    const page = racines(site);
    if (!page) { console.log(`ARRET composition site ${site} : page racine absente (aucune creation)`); continue; }

    for (const [i, [libelle, type]] of plan.entries()) {
      const nom = `S${site} · ${libelle}`;
      const typeSection = type === "HEADER" || type === "FOOTER" ? type : type === "HERO" ? "PLEINE-LARGEUR" : "STANDARD";

      bilan.structure += await compter("OBJ-MODULE-SITE-PUBLIC", async () => {
        const s = await creer("OBJ-SECTION-SITE", nom, {
          ...etatChamps("OBJ-SECTION-SITE", 2), ...lookup("OBJ-SECTION-SITE", "OBJ-PAGES-SITE", page.id),
          ...lookup("OBJ-SECTION-SITE", "OBJ-SECTION-TYPE", await idDe("OBJ-SECTION-TYPE", typeSection)),
          [col("OBJ-SECTION-SITE", "ORDRE-AFFICHAGE")]: (i + 1) * 10
        });
        const l = await creer("OBJ-LIGNE-SITE", nom, {
          ...etatChamps("OBJ-LIGNE-SITE", 2), ...lookup("OBJ-LIGNE-SITE", "OBJ-SECTION-SITE", s),
          ...lookup("OBJ-LIGNE-SITE", "OBJ-LIGNE-STRUCTURE", largeur100), [col("OBJ-LIGNE-SITE", "ORDRE-AFFICHAGE")]: 10
        });
        const c = await creer("OBJ-COLONNE-SITE", nom, {
          ...etatChamps("OBJ-COLONNE-SITE", 2), ...lookup("OBJ-COLONNE-SITE", "OBJ-LIGNE-SITE", l),
          [col("OBJ-COLONNE-SITE", "ORDRE-AFFICHAGE")]: 10, [col("OBJ-COLONNE-SITE", "LARGEUR")]: 100
        });

        // HERO deja en production (mode historique) : jamais duplique, simple rattachement a la colonne.
        const existant = type === "HERO"
          ? (await items("OBJ-MODULE-SITE-PUBLIC")).find((m) =>
            String(m.fields?.[`${col("OBJ-MODULE-SITE-PUBLIC", "OBJ-PAGES-SITE")}LookupId`]) === String(page.id) &&
            String(m.fields?.[`${col("OBJ-MODULE-SITE-PUBLIC", "OBJMODULESITEPUBLICTYPE")}LookupId`]) === String(hero))
          : null;

        if (existant) {
          if (!existant.fields?.[`${col("OBJ-MODULE-SITE-PUBLIC", "OBJ-COLONNE-SITE")}LookupId`]) {
            console.log(`ACTION rattacher HERO existant (page ${page.id}) a la colonne ${c}`);
            await P.appel(token, "PATCH", `/sites/${siteId}/lists/${etat.ids["OBJ-MODULE-SITE-PUBLIC"]}/items/${existant.id}/fields`,
              lookup("OBJ-MODULE-SITE-PUBLIC", "OBJ-COLONNE-SITE", c));
          }
          return;
        }

        await creer("OBJ-MODULE-SITE-PUBLIC", nom, {
          ...etatChamps("OBJ-MODULE-SITE-PUBLIC", 2), ...lookup("OBJ-MODULE-SITE-PUBLIC", "OBJ-COLONNE-SITE", c),
          ...lookup("OBJ-MODULE-SITE-PUBLIC", "OBJ-PAGES-SITE", page.id),
          ...lookup("OBJ-MODULE-SITE-PUBLIC", "OBJMODULESITEPUBLICTYPE", await idDe(listeTypes, type)),
          [col("OBJ-MODULE-SITE-PUBLIC", "ORDRE-AFFICHAGE")]: 10,
          [col("OBJ-MODULE-SITE-PUBLIC", "VISIBLE-ORDINATEUR")]: true,
          [col("OBJ-MODULE-SITE-PUBLIC", "VISIBLE-TABLETTE")]: true,
          [col("OBJ-MODULE-SITE-PUBLIC", "VISIBLE-MOBILE")]: true
        });
      });
    }
  }

  return bilan;
}

/* ---------- Principal ---------- */

async function verifier(token, siteId, etat) {
  const actions = planifier(etat);
  for (const a of actions) console.log(`MANQUE ${a.liste}${a.colonne ? "." + a.colonne.name : ""}${a.message ? " " + a.message : ""}`);
  let ok = actions.length === 0;
  if (!ok) return false;

  const controles = { ...VALEURS, "OBJ-POLICE": POLICES, "OBJ-MODULE-SITE-PUBLIC-TYPE": TYPES_MODULES, "OBJ-MODELE-BUILDER": MODELES.map((m) => m.titre) };
  for (const [liste, valeurs] of Object.entries(controles)) {
    const items = await P.elementsDe(token, siteId, etat.ids[liste]);
    const manquants = valeurs.filter((v) => !items.some((i) => cle(i.fields?.Title) === cle(v)));
    if (manquants.length) { ok = false; console.log(`MANQUE valeurs ${liste} : ${manquants.join(", ")}`); }
  }

  // Les compositions initiales ne doivent jamais etre validees par le provisionneur.
  const sections = await P.elementsDe(token, siteId, etat.ids["OBJ-SECTION-SITE"]);
  const valide = P.nomInterne(etat, "OBJ-SECTION-SITE", "OBJ-VALIDE");
  const sectionsInitiales = sections.filter((s) => /^S\d · /.test(s.fields?.Title || ""));
  console.log(`Sections de composition initiale : ${sectionsInitiales.length}`);
  void valide;
  return ok;
}

async function typographieChantier(mode) {
  const definitions = LISTES.filter((l) => ["OBJ-POLICE", "OBJ-PAGES-SITE", "OBJ-STYLE-PRESET"].includes(l.nom))
    .map((l) => l.nom === "OBJ-STYLE-PRESET" ? { ...l, creer: false, colonnes: l.colonnes.filter((c) =>
      ["SOULIGNEMENT", "STYLE-POLICE", "TRANSFORMATION-TEXTE", "ESPACEMENT-LETTRES", "TYPO-TITRE", "TYPO-TEXTE"].includes(c.name)) } : l);
  const { token, site, large } = await P.contexteProvisionnement(mode);
  let etat = await P.lireEtat(token, site.id, definitions);
  const plan = P.planifierListes(etat, definitions);
  P.afficherPlan(plan);
  if (mode === "plan") return 0;
  if (mode === "apply") {
    if (!large) throw new Error("Droit de provisionnement absent. Aucune ecriture effectuee.");
    console.log(`Sauvegarde du schema : ${P.sauvegarder(etat, "typographie-chantier")}`);
    await P.appliquerPlan(token, site.id, etat, definitions);
    etat = await P.lireEtat(token, site.id, definitions);
  } else if (mode !== "verify") throw new Error("Utiliser --plan, --apply ou --verify avec --typographie-chantier.");
  if (P.planifierListes(etat, definitions).length) throw new Error("Schema typographie/chantier incomplet.");
  const liste = "OBJ-POLICE";
  const existants = await P.elementsDe(token, site.id, etat.ids[liste]);
  if (mode === "apply") {
    const champsEtat = {};
    for (const [champ, titre] of [["OBJ-ACTIF", "OUI"], ["OBJ-VALIDE", "OUI"], ["OBJ-VEROUILLE", "NON"]]) {
      const colonne = P.nomInterne(etat, liste, champ);
      if (!colonne && champ === "OBJ-VEROUILLE") continue;
      const valeurs = etat.ids[champ] ? await P.elementsDe(token, site.id, etat.ids[champ]) : [];
      const valeur = valeurs.find((v) => cle(v.fields?.Title) === cle(titre));
      if (!colonne || !valeur) throw new Error(`Etat officiel manquant : ${champ} / ${titre}.`);
      champsEtat[`${colonne}LookupId`] = Number(valeur.id);
    }
    for (const [i, famille] of POLICES.entries()) {
      await P.creerSiAbsent(token, site.id, etat.ids[liste], famille, {
        ...champsEtat,
        [P.nomInterne(etat, liste, "CODE")]: famille,
        [P.nomInterne(etat, liste, "FAMILLE")]: famille,
        [P.nomInterne(etat, liste, "ORDRE-AFFICHAGE")]: i + 1
      }, existants);
    }
  }
  const relus = await P.elementsDe(token, site.id, etat.ids[liste]);
  const manquantes = POLICES.filter((famille) => !relus.some((v) => cle(v.fields?.Title) === cle(famille) &&
    v.fields?.[P.nomInterne(etat, liste, "FAMILLE")] === famille));
  if (manquantes.length) throw new Error(`Polices absentes ou incompletes : ${manquantes.join(", ")}.`);
  console.log(`VERIFICATION OK : schema typographie/chantier et ${POLICES.length} familles de polices relus.`);
  return 0;
}

async function principal(mode) {
  if (process.argv.includes("--typographie-chantier")) return typographieChantier(mode);
  console.log(`DEBUT provisionnement DSE Builder (${mode})`);
  const { token, site, large } = await P.contexteProvisionnement(mode);
  const etat = await P.lireEtat(token, site.id, LISTES);

  if (mode === "plan") { P.afficherPlan(planifier(etat)); return 0; }

  if (mode === "verify") {
    const ok = await verifier(token, site.id, etat);
    console.log(ok ? "VERIFICATION OK" : "VERIFICATION INCOMPLETE");
    return ok ? 0 : 2;
  }

  if (!large) {
    console.log("ARRET : le jeton ne contient pas Sites.Manage.All. Aucune ecriture effectuee.");
    return 3;
  }

  console.log(`Sauvegarde du schema : ${P.sauvegarder(etat, "builder")}`);

  if (mode === "apply") {
    const bilan = await P.appliquerPlan(token, site.id, etat, LISTES);
    console.log(`BILAN listes creees : ${bilan.listes}, colonnes creees : ${bilan.colonnes}`);
  } else {
    console.log(`BILAN ${JSON.stringify(await semer(token, site.id))}`);
  }
  return 0;
}

module.exports = { LISTES, VALEURS, POLICES, TYPES_MODULES, MODELES, COMPOSITIONS, planifier, typographieChantier };

if (require.main === module) P.lancer(principal, ["plan", "apply", "seed", "verify"]);
