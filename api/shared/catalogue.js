"use strict";

/*
 * Moteur PUR du catalogue multiplateforme (articles, produits, services).
 *
 * Aucun acces reseau : il travaille sur des elements deja lus dans SharePoint
 * ({ id, ordre, configuration, relations }, meme forme que construireElementPublic).
 * Les relations utilisent les ID natifs SharePoint ; les libelles ne servent
 * qu'a l'affichage. Aucun theme, article ou produit n'est code en dur.
 */

const TYPES = ["article", "produit", "service"];

const FACETTES = [
  "type",
  "plateforme",
  "theme",
  "categorie",
  "collection",
  "format",
  "visibilite",
  "disponibilite"
];

// Noms de colonnes acceptes (normalises par cleChamp) : ils decrivent la structure SharePoint attendue.
const ALIAS = {
  titre: ["TITRE", "TITLE", "NOM", "NOMARTICLE", "NOMPRODUIT", "NOMSERVICE", "TITREPRINCIPAL"],
  resume: ["RESUME", "NOTECOURTE", "DESCRIPTIONPRODUIT", "DESCRIPTION", "CHAPEAU"],
  url: ["URL", "LIEN", "URLPUBLIQUE"],
  prix: ["PRIX", "MONTANT"],
  devise: ["DEVISE", "OBJGEODEVISE"],
  format: ["FORMAT", "FORMATPRODUIT", "OBJCATALOGUEFORMAT"],
  visibilite: ["VISIBILITE", "OBJVISIBILITE"],
  public: ["PUBLIC", "VISIBLEPUBLIC"],
  disponibilite: ["DISPONIBILITE", "OBJDISPONIBILITE", "STATUTPRODUIT"],
  disponible: ["DISPONIBLE"],
  agregation: ["AGREGATIONPORTAIL", "AGREGATION", "VISIBLEPORTAIL"],
  theme: ["OBJCATALOGUETHEME", "THEME", "THEMES"],
  categorie: ["OBJCATALOGUECATEGORIE", "CATEGORIE", "CATEGORIES", "TYPEPRODUIT"],
  collection: ["OBJCATALOGUECOLLECTION", "COLLECTION", "COLLECTIONS"],
  plateforme: ["OBJSITEPUBLIC", "PLATEFORME", "PLATEFORMES"],
  media: ["OBJMEDIA", "MEDIA"],
  actif: ["OBJACTIF", "ACTIF"],
  valide: ["OBJVALIDE", "VALIDER", "VALIDE"],
  liensArticle: ["OBJARTICLE", "ARTICLE", "ARTICLES", "ARTICLESLIES"],
  liensProduit: ["OBJCATALOGUE", "PRODUIT", "PRODUITS", "PRODUITSLIES"],
  liensService: ["OBJSERVICE", "SERVICE", "SERVICES", "SERVICESLIES"]
};

// Valeurs de visibilite explicitement NON publiques ; une valeur absente ne rend pas public a elle seule (voir estPublic).
const VISIBILITES_NON_PUBLIQUES = ["prive", "interne", "restreint", "brouillon", "non public", "masque"];

/* =========================================================
   TEXTE
   ========================================================= */

function normaliserTexte(valeur) {
  return String(valeur ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function cleChamp(nom) {
  return String(nom ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const ENTITES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#039;": "'", "&nbsp;": " " };

function texteBrut(valeur, maximum = 320) {
  const texte = String(valeur ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|nbsp|#0?39);/g, (e) => ENTITES[e] ?? e)
    .replace(/\s+/g, " ")
    .trim();

  if (!texte || texte.toUpperCase() === "ND") {
    return "";
  }

  return texte.length > maximum
    ? `${texte.slice(0, maximum - 1).trimEnd()}…`
    : texte;
}

function urlPublique(valeur) {
  const brut = typeof valeur === "object" && valeur
    ? String(valeur.Url ?? valeur.URL ?? valeur.url ?? "")
    : String(valeur ?? "");

  const url = brut.trim().split(/\s+/)[0];

  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;

  try {
    return ["http:", "https:"].includes(new URL(url).protocol) ? url : "";
  } catch {
    return "";
  }
}

/* =========================================================
   LECTURE DES CHAMPS D'UN ELEMENT SHAREPOINT
   ========================================================= */

function champ(element, alias) {
  const configuration = element?.configuration || {};

  for (const nom of Object.keys(configuration)) {
    if (!alias.includes(cleChamp(nom))) continue;

    const valeur = configuration[nom];
    if (valeur === null || valeur === undefined) continue;
    if (typeof valeur === "string" && (!valeur.trim() || valeur.trim().toUpperCase() === "ND")) continue;

    return valeur;
  }

  return null;
}

function relations(element, alias) {
  const sortie = [];

  for (const [nom, valeur] of Object.entries(element?.relations || {})) {
    if (!alias.includes(cleChamp(nom))) continue;

    for (const v of Array.isArray(valeur) ? valeur : [valeur]) {
      if (v && v.id !== undefined && v.id !== null) {
        sortie.push({ id: String(v.id), titre: v.titre ? String(v.titre) : null });
      }
    }
  }

  return sortie;
}

function vrai(valeur) {
  if (typeof valeur === "boolean") return valeur;
  const texte = normaliserTexte(valeur);
  return ["1", "true", "oui", "yes"].includes(texte);
}

// Booleen SharePoint : colonne Oui/Non, ou Lookup vers OBJ-ACTIF / OBJ-VALIDE (ID natif 1 = oui).
function etatOui(element, alias) {
  const lies = relations(element, alias);
  if (lies.length) return lies.some((r) => r.id === "1");

  const valeur = champ(element, alias);
  return valeur === null ? false : vrai(valeur);
}

function titreElement(element) {
  const valeur = champ(element, ALIAS.titre);
  if (valeur) return texteBrut(valeur, 200);

  const cle = Object.keys(element?.configuration || {}).find((n) => cleChamp(n).startsWith("TITRE"));
  const repli = cle ? element.configuration[cle] : null;

  return repli ? texteBrut(repli, 200) : "";
}

/* =========================================================
   NORMALISATION D'UN ELEMENT
   ========================================================= */

function valeurTexteOuRelation(element, alias) {
  const lie = relations(element, alias)[0];
  if (lie && lie.titre) return lie.titre;

  const valeur = champ(element, alias);
  return valeur === null ? null : texteBrut(valeur, 120) || null;
}

function normaliserElement(type, element, options = {}) {
  if (!TYPES.includes(type) || !element || element.id === undefined) {
    return null;
  }

  const titre = titreElement(element);
  if (!titre) return null;

  const valides = options.referentiels || {};

  const filtrer = (kind, liste) =>
    valides[kind] instanceof Set
      ? liste.filter((r) => valides[kind].has(r.id))
      : liste;

  const montant = champ(element, ALIAS.prix);
  const nombre = montant === null ? NaN : Number(String(montant).replace(",", "."));

  const disponibleBrut = champ(element, ALIAS.disponible);
  let disponibilite = valeurTexteOuRelation(element, ALIAS.disponibilite);

  if (!disponibilite && disponibleBrut !== null) {
    disponibilite = vrai(disponibleBrut) ? "Disponible" : "Indisponible";
  }

  const visibilite = valeurTexteOuRelation(element, ALIAS.visibilite);
  const publicBrut = champ(element, ALIAS.public);
  const mediaLie = relations(element, ALIAS.media)[0];

  return {
    cle: `${type}-${element.id}`,
    type,
    id: String(element.id),
    ordre: Number.isFinite(Number(element.ordre)) ? Number(element.ordre) : 999999,
    titre,
    resume: texteBrut(champ(element, ALIAS.resume)),
    url: urlPublique(champ(element, ALIAS.url)),
    themes: filtrer("theme", relations(element, ALIAS.theme)),
    categories: filtrer("categorie", relations(element, ALIAS.categorie)),
    collections: filtrer("collection", relations(element, ALIAS.collection)),
    plateformes: relations(element, ALIAS.plateforme),
    format: valeurTexteOuRelation(element, ALIAS.format),
    visibilite,
    disponibilite,
    prix: Number.isFinite(nombre)
      ? { montant: nombre, devise: valeurTexteOuRelation(element, ALIAS.devise) }
      : null,
    mediaId: mediaLie ? mediaLie.id : null,
    liens: {
      article: relations(element, ALIAS.liensArticle).map((r) => r.id),
      produit: relations(element, ALIAS.liensProduit).map((r) => r.id),
      service: relations(element, ALIAS.liensService).map((r) => r.id)
    },
    agregation: etatOui(element, ALIAS.agregation),
    etat: {
      actif: etatOui(element, ALIAS.actif),
      valide: etatOui(element, ALIAS.valide),
      public: estPublic(visibilite, publicBrut)
    }
  };
}

// Public = pas de visibilite restrictive explicite et, si une colonne Public existe, elle doit valoir oui.
function estPublic(visibilite, publicBrut) {
  if (publicBrut !== null && !vrai(publicBrut)) return false;
  if (!visibilite) return true;
  return !VISIBILITES_NON_PUBLIQUES.includes(normaliserTexte(visibilite));
}

/* =========================================================
   INDEX
   ========================================================= */

/*
 * donnees = {
 *   sites: [{ id, titre, domaines[], actif, valide, portail }],
 *   elements: { article: [], produit: [], service: [] },
 *   referentiels: { theme: Set|null, categorie: Set|null, collection: Set|null }
 * }
 */
function construireIndex(donnees) {
  const items = [];
  const parCle = new Map();

  for (const type of TYPES) {
    for (const element of donnees?.elements?.[type] || []) {
      const item = normaliserElement(type, element, { referentiels: donnees.referentiels });
      if (item && !parCle.has(item.cle)) {
        parCle.set(item.cle, item);
        items.push(item);
      }
    }
  }

  // Liens bidirectionnels : un produit qui cite un article rend l'article visible depuis le produit.
  const inverses = new Map();
  const ajouterInverse = (cleA, typeB, idB) => {
    if (!inverses.has(cleA)) inverses.set(cleA, new Set());
    inverses.get(cleA).add(`${typeB}-${idB}`);
  };

  for (const item of items) {
    for (const typeCible of TYPES) {
      for (const idCible of item.liens[typeCible]) {
        const cible = `${typeCible}-${idCible}`;
        if (parCle.has(cible)) {
          ajouterInverse(item.cle, typeCible, idCible);
          ajouterInverse(cible, item.type, item.id);
        }
      }
    }
  }

  const sites = new Map((donnees?.sites || []).map((s) => [String(s.id), s]));

  return { items, parCle, inverses, sites };
}

function siteDuDomaine(index, domaine) {
  const attendu = String(domaine || "").trim().toLowerCase();
  if (!attendu) return null;

  for (const site of index.sites.values()) {
    if (site.actif && site.valide && (site.domaines || []).includes(attendu)) {
      return site;
    }
  }

  return null;
}

/* =========================================================
   PORTEE (protection entre domaines)
   ========================================================= */

function estPubliable(item) {
  return item.etat.actif && item.etat.valide && item.etat.public;
}

/*
 * Un contenu est visible sur un site seulement si :
 *  - il est actif, valide et public ;
 *  - le site figure dans ses plateformes (relation par ID natif) ;
 *  - OU le site est un portail ET le contenu autorise explicitement l'agregation.
 */
function enPortee(item, site) {
  if (!site || !estPubliable(item)) return false;

  if (item.plateformes.some((p) => p.id === String(site.id))) return true;

  return Boolean(site.portail && item.agregation);
}

function projeter(item, index, site) {
  const plateformes = [];

  for (const p of item.plateformes) {
    const cible = index.sites.get(p.id);
    if (!cible || !cible.actif || !cible.valide) continue;

    if (p.id === String(site.id)) {
      plateformes.push({ id: p.id, titre: cible.titre || p.titre });
    } else if (site.portail) {
      // Seul le portail connait les autres plateformes (liens sortants controles).
      plateformes.push({ id: p.id, titre: cible.titre || p.titre, domaine: (cible.domaines || [])[0] || null });
    }
  }

  return {
    cle: item.cle,
    type: item.type,
    id: item.id,
    titre: item.titre,
    resume: item.resume,
    url: item.url || null,
    themes: item.themes,
    categories: item.categories,
    collections: item.collections,
    plateformes,
    format: item.format,
    disponibilite: item.disponibilite,
    prix: item.prix,
    media: item.mediaId ? { id: item.mediaId, url: `/api/v1/media/${encodeURIComponent(item.mediaId)}` } : null
  };
}

/* =========================================================
   FILTRES
   ========================================================= */

function valeursFacette(item, facette) {
  const liste = (r) => r.map((x) => ({ valeur: x.id, libelle: x.titre || "" })).filter((x) => x.libelle);
  const texte = (v) => (v ? [{ valeur: normaliserTexte(v), libelle: v }] : []);

  switch (facette) {
    case "type": return [{ valeur: item.type, libelle: item.type }];
    case "plateforme": return item.plateformes.map((p) => ({ valeur: p.id, libelle: p.titre || "" })).filter((x) => x.libelle);
    case "theme": return liste(item.themes);
    case "categorie": return liste(item.categories);
    case "collection": return liste(item.collections);
    case "format": return texte(item.format);
    case "visibilite": return texte(item.visibilite || "Public");
    case "disponibilite": return texte(item.disponibilite);
    default: return [];
  }
}

function listeCritere(valeur) {
  if (valeur === undefined || valeur === null || valeur === "") return [];

  return (Array.isArray(valeur) ? valeur : String(valeur).split(","))
    .map((v) => normaliserTexte(v))
    .filter(Boolean);
}

function criteresNormalises(brut = {}) {
  const criteres = {};

  for (const facette of FACETTES) {
    const valeurs = listeCritere(brut[facette]);
    if (valeurs.length) criteres[facette] = valeurs;
  }

  const q = normaliserTexte(brut.q);
  if (q) criteres.q = q;

  return criteres;
}

function correspondFacette(item, facette, valeurs) {
  const presentes = valeursFacette(item, facette).map((v) => normaliserTexte(v.valeur));
  return valeurs.some((v) => presentes.includes(v));
}

function textePourRecherche(item) {
  return normaliserTexte([
    item.titre,
    item.resume,
    ...item.themes.map((r) => r.titre),
    ...item.categories.map((r) => r.titre),
    ...item.collections.map((r) => r.titre),
    ...item.plateformes.map((r) => r.titre)
  ].filter(Boolean).join(" "));
}

function correspondRecherche(item, q) {
  if (!q) return true;

  const botte = textePourRecherche(item);
  return q.split(" ").every((mot) => botte.includes(mot));
}

function scoreRecherche(item, q) {
  if (!q) return 0;

  const titre = normaliserTexte(item.titre);
  return q.split(" ").reduce((s, mot) => s + (titre.includes(mot) ? 2 : 1), 0);
}

function appliquerCriteres(items, criteres, sauf = null) {
  return items.filter((item) => {
    for (const facette of FACETTES) {
      if (facette === sauf || !criteres[facette]) continue;
      if (!correspondFacette(item, facette, criteres[facette])) return false;
    }

    return correspondRecherche(item, criteres.q);
  });
}

function calculerFacettes(items, criteres) {
  const sortie = {};

  for (const facette of FACETTES) {
    const compteurs = new Map();

    for (const item of appliquerCriteres(items, criteres, facette)) {
      for (const v of valeursFacette(item, facette)) {
        const cle = normaliserTexte(v.valeur);
        const courant = compteurs.get(cle) || { valeur: v.valeur, libelle: v.libelle, nombre: 0 };
        courant.nombre += 1;
        compteurs.set(cle, courant);
      }
    }

    sortie[facette] = [...compteurs.values()].sort(
      (a, b) => a.libelle.localeCompare(b.libelle, "fr", { sensitivity: "base" })
    );
  }

  return sortie;
}

/* =========================================================
   INTERROGATION
   ========================================================= */

function bornerEntier(valeur, defaut, min, max) {
  const n = Number.parseInt(valeur, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaut;
}

/*
 * options.types : restreint aux types voulus (articles, produits...).
 * Retourne uniquement des donnees publiques, deja limitees au site courant.
 */
function interroger(index, site, brut = {}, options = {}) {
  if (!site) {
    return { elements: [], total: 0, page: 1, limite: 0, facettes: {}, appliques: {} };
  }

  const types = options?.types ?? TYPES;

  const portee = index.items.filter((i) => types.includes(i.type) && enPortee(i, site));

  const criteres = criteresNormalises(brut);
  const trouves = appliquerCriteres(portee, criteres);

  trouves.sort((a, b) =>
    scoreRecherche(b, criteres.q) - scoreRecherche(a, criteres.q) ||
    a.ordre - b.ordre ||
    a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" })
  );

  const limite = bornerEntier(brut.limite, 24, 1, 60);
  const pages = Math.max(1, Math.ceil(trouves.length / limite));
  const page = Math.min(bornerEntier(brut.page, 1, 1, 100000), pages);

  const facettes = calculerFacettes(portee, criteres);

  // Le facettage par plateforme n'a de sens que sur un portail.
  if (!site.portail) facettes.plateforme = [];

  return {
    elements: trouves.slice((page - 1) * limite, page * limite).map((i) => projeter(i, index, site)),
    total: trouves.length,
    page,
    pages,
    limite,
    facettes,
    appliques: criteres
  };
}

/* Detail d'un element + elements lies (articles, produits, services) restes dans la portee du site. */
function detail(index, site, cle) {
  const item = index.parCle.get(String(cle));

  if (!site || !item || !enPortee(item, site)) return null;

  const lies = [...(index.inverses.get(item.cle) || [])]
    .map((c) => index.parCle.get(c))
    .filter((i) => i && enPortee(i, site))
    .map((i) => projeter(i, index, site));

  return { element: projeter(item, index, site), lies };
}

/* Themes, categories et collections disponibles pour le site (issus des donnees). */
function referentielsDuSite(index, site, types) {
  const resultat = interroger(index, site, { limite: 60 }, { types });
  const portee = index.items.filter((i) => (!types || types.includes(i.type)) && enPortee(i, site));
  const facettes = calculerFacettes(portee, {});

  return {
    themes: facettes.theme,
    categories: facettes.categorie,
    collections: facettes.collection,
    total: resultat.total
  };
}

module.exports = {
  TYPES,
  FACETTES,
  ALIAS,
  normaliserTexte,
  cleChamp,
  texteBrut,
  urlPublique,
  normaliserElement,
  construireIndex,
  siteDuDomaine,
  enPortee,
  interroger,
  detail,
  referentielsDuSite,
  criteresNormalises,
  champ,
  relations,
  etatOui,
  vrai,
  titreElement
};
