"use strict";

/*
 * Lecture SharePoint (GET uniquement) des donnees du catalogue.
 * Reutilise les fonctions Graph de shared/dse.js ; aucune ecriture.
 *
 * Structure SharePoint attendue (voir api/README.md) :
 *   OBJ-ARTICLE, OBJ-CATALOGUE (produits), OBJ-SERVICE,
 *   OBJ-CATALOGUE-THEME / -CATEGORIE / -COLLECTION (referentiels).
 * Une liste absente est simplement ignoree.
 */

const dse = require("./dse");
const statutsSite = require("./statuts-site");
const catalogue = require("./catalogue");
const schemaBuilder = require("./builder-schema");

const LISTES_CONTENU = {
  article: ["OBJ-ARTICLE"],
  produit: ["OBJ-CATALOGUE"],
  service: ["OBJ-SERVICE"]
};

const LISTES_REFERENTIEL = {
  theme: ["OBJ-THEME", "OBJ-CATALOGUE-THEME"],
  categorie: ["OBJ-CATEGORIE", "OBJ-CATALOGUE-CATEGORIE"],
  collection: ["OBJ-COLLECTION", "OBJ-CATALOGUE-COLLECTION"]
};

const LISTE_SITES = ["OBJ-SITE-PUBLIC"];

// Variable de repli : ID natifs (OBJ-SITE-PUBLIC) des sites portail, ex. "4". Prioritaire : colonne PORTAIL-CATALOGUE.
function portailsEnvironnement() {
  return String(process.env.DSE_CATALOGUE_PORTAIL_SITE_IDS || "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^\d+$/.test(v));
}

function idsLookup(fields, colonne) {
  const brut = fields[colonne.name];

  if (Array.isArray(brut) && brut.some((v) => v && typeof v === "object")) {
    return brut
      .map((v) => String(v?.LookupId ?? ""))
      .filter((v) => /^\d+$/.test(v));
  }

  return dse.idsLookupColonne(fields, colonne);
}

async function titresListe(token, siteGraphId, listId, cache) {
  // La promesse est mise en cache : des lectures paralleles ne relisent jamais deux fois la meme liste.
  if (!cache.has(listId)) {
    // Une liste systeme ou inaccessible ne doit pas bloquer le catalogue.
    cache.set(listId, dse.collecter(
      token,
      `/sites/${siteGraphId}/lists/${listId}/items?$expand=fields($select=Title)&$top=200`
    ).catch(() => []).then((items) => new Map(items.map((i) => [String(i.id), i.fields?.Title ?? null]))));
  }
  return cache.get(listId);
}

// Meme forme que construireElementPublic, mais les titres des Lookup sont resolus par lot.
async function lireElements(token, siteGraphId, liste, cacheTitres, { exclureChamps = [] } = {}) {
  if (schemaBuilder.estListeChamps(liste.displayName || liste.name)) exclureChamps = [...exclureChamps, "APPAREIL"];
  let colonnes, items;
  if (exclureChamps.length) {
    colonnes = (await dse.chargerColonnesListe(token, siteGraphId, liste.id)).filter((c) =>
      !exclureChamps.includes(catalogue.cleChamp(c.name)) && !exclureChamps.includes(catalogue.cleChamp(c.displayName)));
    const noms = schemaBuilder.selectionChamps(colonnes).split(",");
    items = await dse.collecter(token,
      `/sites/${siteGraphId}/lists/${liste.id}/items?$expand=fields($select=${noms.join(",")})&$top=200`);
    items = items.map((item) => ({ ...item, fields: Object.fromEntries(noms.filter((n) =>
      Object.hasOwn(item.fields || {}, n)).map((n) => [n, item.fields[n]])) }));
  } else {
    [colonnes, items] = await Promise.all([
      dse.chargerColonnesListe(token, siteGraphId, liste.id),
      dse.chargerItemsListe(token, siteGraphId, liste.id)
    ]);
  }
  const lookups = colonnes.filter((c) => c.lookup?.listId && !c.hidden);

  const elements = [];

  for (const item of items) {
    const fields = item.fields || {};
    const liens = {};

    for (const colonne of lookups) {
      const ids = idsLookup(fields, colonne);
      if (!ids.length) continue;

      const titres = await titresListe(token, siteGraphId, colonne.lookup.listId, cacheTitres);
      const valeurs = ids.map((id) => ({ id: String(id), titre: titres.get(String(id)) ?? null }));

      liens[colonne.displayName || colonne.name] = colonne.lookup.allowMultipleValues ? valeurs : valeurs[0];
    }

    elements.push({
      id: String(item.id),
      ordre: dse.ordreElement(fields, colonnes),
      configuration: dse.champsPublicsParNomAffiche(fields, colonnes),
      relations: liens,
      _fields: fields,
      _colonnes: colonnes
    });
  }

  return elements;
}

function lireSites(elements, mediaListId = null) {
  return elements.map((el) => {
    const colonnes = el._colonnes || [];
    const fields = el._fields || {};
    const colonneDomaine = (el._colonnes || []).find(
      (c) => c.lookup && catalogue.cleChamp(c.displayName || c.name).includes("NOMDEDOMAINE") &&
        !catalogue.cleChamp(c.displayName || c.name).includes("PRINCIPAL")
    );
    // Domaine principal designe explicitement : Lookup (ID natif + titre resolu) ou texte.
    const colonnePrincipal = colonnes.find((c) => catalogue.cleChamp(c.displayName || c.name).includes("DOMAINEPRINCIPAL"));
    const lienPrincipal = colonnePrincipal ? el.relations?.[colonnePrincipal.displayName || colonnePrincipal.name] : null;
    const brutPrincipal = colonnePrincipal ? fields[colonnePrincipal.name] : null;
    const relationPrincipal = Array.isArray(lienPrincipal) ? lienPrincipal[0] : lienPrincipal;
    const domainePrincipal = dse.normaliserDomaine(
      relationPrincipal?.titre ??
      (Array.isArray(brutPrincipal) ? brutPrincipal[0]?.LookupValue : (brutPrincipal?.LookupValue ?? brutPrincipal))
    ) || null;
    const domainePrincipalId = colonnePrincipal?.lookup
      ? (relationPrincipal?.id ?? dse.idsLookupColonne(fields, colonnePrincipal)[0] ?? null)
      : null;

    const valeurs = colonneDomaine ? fields[colonneDomaine.name] : [];
    const entreesDomaines = (Array.isArray(valeurs) ? valeurs : [])
      .map((v) => ({ id: v?.LookupId != null ? String(v.LookupId) : null, domaine: dse.normaliserDomaine(v?.LookupValue) }))
      .filter((v) => v.domaine);
    const domaines = entreesDomaines.map((v) => v.domaine);

    const colonneClient = colonnes.find(
      (c) => c.lookup && catalogue.cleChamp(c.displayName || c.name) === "OBJCLIENT"
    );
    const lienClient = colonneClient ? el.relations?.[colonneClient.displayName || colonneClient.name] : null;
    const client = Array.isArray(lienClient) ? lienClient[0] : lienClient;

    const marque = catalogue.champ(el, ["PORTAILCATALOGUE", "PORTAIL"]);
    const colonneStatut = colonnes.find(
      (c) => c.lookup && catalogue.cleChamp(c.displayName || c.name).includes("SITESSTATUT")
    );
    const lienStatut = colonneStatut ? el.relations?.[colonneStatut.displayName || colonneStatut.name] : null;
    const colonnePagePublique = colonnes.find(
      (c) => c.lookup && catalogue.cleChamp(c.displayName || c.name) === "PAGEPUBLIQUE"
    );
    const lienPagePublique = colonnePagePublique
      ? el.relations?.[colonnePagePublique.displayName || colonnePagePublique.name]
      : null;
    const valeurChamp = (noms) => {
      const colonne = colonnes.find((c) =>
        noms.includes(catalogue.cleChamp(c.displayName || c.name)) ||
        noms.includes(catalogue.cleChamp(c.name))
      );
      return colonne ? fields[colonne.name] ?? null : null;
    };

    return {
      id: el.id,
      titre: catalogue.titreElement(el) || null,
      domaines,
      domaineIds: entreesDomaines.map((v) => v.id).filter(Boolean),
      domainePrincipal,
      domainePrincipalId: domainePrincipalId != null ? String(domainePrincipalId) : null,
      clientId: client?.id != null ? String(client.id) : null,
      client: client?.titre || null,
      actif: catalogue.etatOui(el, catalogue.ALIAS.actif),
      valide: catalogue.etatOui(el, catalogue.ALIAS.valide),
      statutColonne: Boolean(colonneStatut),
      statutId: lienStatut?.id ?? null,
      pagePubliqueId: lienPagePublique?.id ?? null,
      dateDebut: valeurChamp(["DATEDEBUT"]),
      dateFin: valeurChamp(["DATEFIN"]),
      mediaSituation: statutsSite.mediaElement(colonnes, fields, mediaListId, ["SITUATION"]),
      portail: marque !== null ? catalogue.vrai(marque) : portailsEnvironnement().includes(el.id)
    };
  });
}

function nettoyer(elements) {
  return elements.map(({ _fields, _colonnes, ...reste }) => reste);
}

/* Referentiel valide = actif ET valide ; liste absente => null (aucun filtrage). */
function idsReferentielValides(elements) {
  return new Set(
    elements
      .filter((el) =>
        catalogue.etatOui(el, catalogue.ALIAS.actif) &&
        catalogue.etatOui(el, catalogue.ALIAS.valide))
      .map((el) => el.id)
  );
}

async function chargerDonnees() {
  const token = await dse.obtenirJetonGraph();
  const siteGraph = await dse.obtenirSiteGraph(token);
  const listes = await dse.collecter(token, `/sites/${siteGraph.id}/lists?$select=id,displayName,name`);
  const cacheTitres = new Map();

  const listeSites = dse.trouverListe(listes, LISTE_SITES);
  if (!listeSites) {
    throw dse.creerErreur("DSE-API-LISTE-SITE-PUBLIC-ININTROUVABLE", 404, "OBJ-SITE-PUBLIC introuvable");
  }

  const listeMedias = dse.trouverListe(listes, ["OBJ-MEDIA"]);
  const mediaListId = listeMedias ? String(listeMedias.id).toLowerCase() : null;
  const lire = (liste) => lireElements(token, siteGraph.id, liste, cacheTitres);
  const listeStatuts = dse.trouverListe(listes, statutsSite.LISTE_STATUTS);
  const entreesContenu = Object.entries(LISTES_CONTENU).map(([type, noms]) => [type, dse.trouverListe(listes, noms)]);
  const entreesReferentiel = Object.entries(LISTES_REFERENTIEL).map(([kind, noms]) => [kind, dse.trouverListe(listes, noms)]);

  // Listes independantes lues en parallele (le cache Graph fusionne les doublons).
  const [elementsSites, contenus, elementsStatuts, refs] = await Promise.all([
    lire(listeSites),
    Promise.all(entreesContenu.map(([, liste]) => (liste ? lire(liste) : null))),
    listeStatuts ? lire(listeStatuts) : null,
    Promise.all(entreesReferentiel.map(([, liste]) => (liste ? lire(liste) : null)))
  ]);

  const sites = lireSites(elementsSites, mediaListId);

  const elements = {};
  const disponibles = {};

  entreesContenu.forEach(([type, liste], i) => {
    disponibles[type] = Boolean(liste);
    elements[type] = liste ? nettoyer(contenus[i]) : [];
  });

  let statuts = null;
  if (listeStatuts) {
    statuts = new Map();
    for (const el of elementsStatuts) {
      statuts.set(el.id, {
        id: el.id,
        titre: catalogue.titreElement(el) || null,
        code: catalogue.champ(el, ["CODE"]),
        noteCourte: catalogue.champ(el, ["NOTECOURTE"]),
        noteLongue: catalogue.champ(el, ["NOTELONGUE"]),
        couleur: catalogue.champ(el, ["COULEUR", "COULEURSTATUT"]),
        media: statutsSite.mediaElement(el._colonnes, el._fields, mediaListId),
        actif: catalogue.etatOui(el, catalogue.ALIAS.actif),
        valide: catalogue.etatOui(el, catalogue.ALIAS.valide)
      });
    }
  }

  const referentiels = {};
  entreesReferentiel.forEach(([kind, liste], i) => {
    referentiels[kind] = liste ? idsReferentielValides(refs[i]) : null;
  });

  return { sites, elements, referentiels, disponibles, statuts };
}

/* Cache memoire court : evite de relire SharePoint a chaque frappe de recherche. */
let cache = null;
let enCours = null;

function dureeCacheMs() {
  const s = Number(process.env.DSE_CATALOGUE_CACHE_SECONDES);
  return (Number.isFinite(s) && s >= 0 ? s : 60) * 1000;
}

async function obtenirIndex() {
  if (cache && Date.now() - cache.le < dureeCacheMs()) return cache.index;

  if (!enCours) {
    enCours = chargerDonnees()
      .then((donnees) => {
        const index = catalogue.construireIndex(donnees);
        index.disponibles = donnees.disponibles;
        index.statuts = donnees.statuts;
        cache = { le: Date.now(), index };
        return index;
      })
      .finally(() => { enCours = null; });
  }

  return enCours;
}

function viderCache() {
  cache = null;
}

module.exports = {
  LISTES_CONTENU,
  LISTES_REFERENTIEL,
  obtenirIndex,
  viderCache,
  lireElements,
  lireSites,
  idsReferentielValides
};
