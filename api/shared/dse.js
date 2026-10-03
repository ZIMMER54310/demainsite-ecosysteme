"use strict";

const { obtenirJetonGraph } = require("../auth/graph");

const http = require("http");
const https = require("https");

const TAILLE_LOT_GRAPH = 10;
const GRAPH_REESSAIS_MAX = 2;
const GRAPH_ATTENTE_MAX_MS = 5000;

/* =========================================================
   REQUETES HTTP
   ========================================================= */

function requete(url, options = {}, corps = null) {
  return new Promise((resolve, reject) => {
    const cible =
      url instanceof URL
        ? url
        : new URL(url);

    const client =
      cible.protocol === "http:"
        ? http
        : https;

    const req = client.request(
      cible,
      options,
      (res) => {
        let data = "";

        res.setEncoding("utf8");

        res.on(
          "data",
          (chunk) => {
            data += chunk;
          }
        );

        res.on(
          "end",
          () => {
            let body = data;

            try {
              body = data
                ? JSON.parse(data)
                : null;
            } catch (_) {
              // La réponse n'est pas au format JSON.
            }

            resolve({
              status: res.statusCode,
              headers: res.headers,
              body
            });
          }
        );
      }
    );

    req.setTimeout(
      15000,
      () => {
        req.destroy(
          new Error("DSE-HTTP-TIMEOUT")
        );
      }
    );

    req.on("error", reject);
    req.end(corps || undefined);
  });
}

/* =========================================================
   CORRELATION ET REPONSES
   ========================================================= */

function correlationId(req) {
  return (
    req.headers["x-dse-correlation-id"] ||
    `${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`
  );
}

function origineAutorisee(req) {
  const origine = req.headers.origin;

  if (!origine) {
    return null;
  }

  const autorisees = (
    process.env.DSE_ALLOWED_ORIGINS || ""
  )
    .split(",")
    .map((valeur) => valeur.trim())
    .filter(Boolean);

  return autorisees.includes(origine)
    ? origine
    : null;
}

function reponseJson(
  context,
  req,
  status,
  body,
  id
) {
  const headers = {
    "Content-Type":
      "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-DSE-API-Version": "0.9",
    "X-DSE-Correlation-Id": id
  };

  const origine =
    origineAutorisee(req);

  if (origine) {
    headers["Access-Control-Allow-Origin"] =
      origine;

    headers.Vary = "Origin";
  }

  context.res = {
    status,
    headers,
    body
  };
}

/* =========================================================
   ERREURS
   ========================================================= */

function creerErreur(
  code,
  status,
  message
) {
  const erreur =
    new Error(message);

  erreur.codeDse = code;
  erreur.status = status;

  return erreur;
}

/* =========================================================
   MICROSOFT GRAPH
   ========================================================= */

/*
 * Cache memoire court des lectures Graph (GET) : fusionne les appels identiques
 * simultanes et evite de relire SharePoint a chaque rendu. Duree reglable par
 * DSE_GRAPH_CACHE_MS (0 = desactive). Les erreurs ne sont jamais mises en cache.
 */
const GRAPH_CACHE = new Map();
const GRAPH_CACHE_MAX = 2000;
const dureeCacheGraph = () => {
  const v = Number(process.env.DSE_GRAPH_CACHE_MS);
  return Number.isFinite(v) && v >= 0 ? v : 60000;
};

async function graph(token, pathOuUrl) {
  const duree = dureeCacheGraph();
  if (!duree) return graphSansCache(token, pathOuUrl);
  const cle = String(pathOuUrl);
  const maintenant = Date.now();
  const entree = GRAPH_CACHE.get(cle);
  if (entree && entree.expire > maintenant) {
    const valeur = await entree.promesse;
    return valeur && typeof valeur === "object" && !Buffer.isBuffer(valeur) ? structuredClone(valeur) : valeur;
  }
  const promesse = graphSansCache(token, pathOuUrl);
  if (GRAPH_CACHE.size >= GRAPH_CACHE_MAX) {
    for (const [k, v] of GRAPH_CACHE) if (v.expire <= maintenant) GRAPH_CACHE.delete(k);
    if (GRAPH_CACHE.size >= GRAPH_CACHE_MAX) GRAPH_CACHE.delete(GRAPH_CACHE.keys().next().value);
  }
  GRAPH_CACHE.set(cle, { expire: maintenant + duree, promesse });
  try {
    const valeur = await promesse;
    return valeur && typeof valeur === "object" && !Buffer.isBuffer(valeur) ? structuredClone(valeur) : valeur;
  } catch (e) {
    if (GRAPH_CACHE.get(cle)?.promesse === promesse) GRAPH_CACHE.delete(cle);
    throw e;
  }
}

function viderCacheGraph() {
  GRAPH_CACHE.clear();
}

/*
 * Ecriture Graph (PATCH/POST uniquement, jamais DELETE) : sans cache, reessais 429/503.
 * Reservee a la couche d'ecriture du cockpit (shared/ecriture.js).
 */
async function graphEcriture(token, methode, chemin, corps) {
  if (!["PATCH", "POST"].includes(methode)) throw creerErreur("DSE-ECRITURE-METHODE", 500, "Méthode d'écriture refusée");
  const url = new URL(`https://graph.microsoft.com/v1.0${chemin}`);
  const donnees = JSON.stringify(corps || {});
  const options = {
    method: methode,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(donnees)
    }
  };
  let resultat = await requete(url, options, donnees);
  for (let t = 0; t < GRAPH_REESSAIS_MAX && (resultat.status === 429 || resultat.status === 503); t++) {
    const s = Number(resultat.headers["retry-after"]);
    await new Promise((r) => setTimeout(r, Number.isFinite(s) && s >= 0 ? Math.min(s * 1000, GRAPH_ATTENTE_MAX_MS) : 1000 * (t + 1)));
    resultat = await requete(url, options, donnees);
  }
  if (resultat.status < 200 || resultat.status >= 300) {
    const erreur = creerErreur("DSE-GRAPH-ECRITURE-REFUSEE", resultat.status, `Microsoft Graph HTTP ${resultat.status}`);
    erreur.detailGraph = resultat.body?.error?.message || null;
    throw erreur;
  }
  return resultat.body;
}

async function graphSansCache(
  token,
  pathOuUrl
) {
  const url =
    pathOuUrl.startsWith("https://")
      ? new URL(pathOuUrl)
      : new URL(
        `https://graph.microsoft.com/v1.0${pathOuUrl}`
      );

  const options = {
    method: "GET",
    headers: {
      Authorization:
        `Bearer ${token}`,
      Accept: "application/json"
    }
  };

  let resultat =
    await requete(url, options);

  // Reessais limites sur 429/503 : Retry-After respecte, plafonne.
  for (
    let tentative = 0;
    tentative < GRAPH_REESSAIS_MAX &&
    (resultat.status === 429 ||
      resultat.status === 503);
    tentative++
  ) {
    const attenteSecondes =
      Number(resultat.headers["retry-after"]);

    const attenteMs =
      Number.isFinite(attenteSecondes) &&
      attenteSecondes >= 0
        ? Math.min(
          attenteSecondes * 1000,
          GRAPH_ATTENTE_MAX_MS
        )
        : 1000 * (tentative + 1);

    await new Promise(
      (resume) =>
        setTimeout(resume, attenteMs)
    );

    resultat =
      await requete(url, options);
  }

  if (
    resultat.status < 200 ||
    resultat.status >= 300
  ) {
    throw creerErreur(
      "DSE-GRAPH-REFUSE",
      resultat.status,
      `Microsoft Graph HTTP ${resultat.status}`
    );
  }

  return resultat.body;
}

async function obtenirSiteGraph(token) {
  const hostname =
    process.env.DSE_SHAREPOINT_HOSTNAME;

  const sitePath =
    process.env.DSE_SHAREPOINT_SITE_PATH;

  if (!hostname || !sitePath) {
    throw creerErreur(
      "DSE-CONFIG-SHAREPOINT-ABSENTE",
      500,
      "Configuration SharePoint absente"
    );
  }

  return graph(
    token,
    `/sites/${hostname}:${sitePath}` +
    "?$select=id,displayName,webUrl"
  );
}

/* =========================================================
   OUTILS GENERAUX
   ========================================================= */

function normaliserDomaine(valeur) {
  if (
    valeur === null ||
    valeur === undefined
  ) {
    return "";
  }

  let texte =
    String(valeur)
      .trim()
      .toLowerCase();

  try {
    if (texte.includes("://")) {
      texte =
        new URL(texte)
          .hostname
          .toLowerCase();
    }
  } catch (_) {
    // La valeur reste traitée comme un domaine simple.
  }

  return texte
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

function valeursProfondes(objet) {
  const valeurs = [];

  function parcourir(valeur) {
    if (
      valeur === null ||
      valeur === undefined
    ) {
      return;
    }

    if (Array.isArray(valeur)) {
      valeur.forEach(parcourir);
      return;
    }

    if (typeof valeur === "object") {
      Object.values(valeur)
        .forEach(parcourir);

      return;
    }

    valeurs.push(valeur);
  }

  parcourir(objet);

  return valeurs;
}

function contientDomaine(
  objet,
  domaine
) {
  return valeursProfondes(objet)
    .some(
      (valeur) =>
        normaliserDomaine(valeur) ===
        domaine
    );
}

function nomNormalise(valeur) {
  return String(valeur || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toUpperCase()
    .replace(
      /[^A-Z0-9]/g,
      ""
    );
}

function trouverChamp(
  fields,
  colonnes,
  motifs
) {
  for (const colonne of colonnes) {
    const noms = [
      colonne.name,
      colonne.displayName
    ].map(nomNormalise);

    const trouve =
      motifs.some(
        (motif) =>
          noms.some(
            (nom) =>
              nom.includes(motif)
          )
      );

    if (!trouve) {
      continue;
    }

    if (
      Object.prototype
        .hasOwnProperty
        .call(
          fields,
          colonne.name
        )
    ) {
      return fields[colonne.name];
    }

    const cleLookup =
      `${colonne.name}LookupId`;

    if (
      Object.prototype
        .hasOwnProperty
        .call(
          fields,
          cleLookup
        )
    ) {
      return fields[cleLookup];
    }
  }

  return null;
}

function booleenPublic(valeur) {
  if (
    valeur === true ||
    valeur === 1
  ) {
    return true;
  }

  const texte =
    String(valeur || "")
      .trim()
      .toLowerCase();

  return [
    "true",
    "oui",
    "yes",
    "1",
    "actif",
    "valide",
    "publie"
  ].includes(texte);
}

async function collecter(
  token,
  cheminInitial,
  maximumPages = 20
) {
  const elements = [];

  let suivant =
    cheminInitial;

  let page = 0;

  while (
    suivant &&
    page < maximumPages
  ) {
    const body =
      await graph(
        token,
        suivant
      );

    if (Array.isArray(body.value)) {
      elements.push(...body.value);
    }

    suivant =
      body["@odata.nextLink"] ||
      null;

    page++;
  }

  if (suivant) {
    throw creerErreur(
      "DSE-GRAPH-PAGINATION-LIMITE",
      502,
      `Microsoft Graph pagination exceeded ${maximumPages} pages`
    );
  }

  return elements;
}

/* =========================================================
   LISTES SHAREPOINT
   ========================================================= */

function trouverListe(
  listes,
  noms
) {
  const nomsAttendus =
    (
      Array.isArray(noms)
        ? noms
        : [noms]
    )
      .map(
        (nom) =>
          String(nom || "")
            .trim()
            .toUpperCase()
      );

  return listes.find(
    (element) => {
      const nom =
        String(
          element.displayName ||
          element.name ||
          ""
        )
          .trim()
          .toUpperCase();

      return nomsAttendus.includes(nom);
    }
  ) || null;
}

async function chargerColonnesListe(
  token,
  siteGraphId,
  listeId
) {
  return collecter(
    token,
    `/sites/${siteGraphId}` +
    `/lists/${listeId}` +
    "/columns" +
    "?$select=" +
    "id,name,displayName,hidden," +
    "lookup,boolean,text,number,dateTime"
  );
}

async function chargerItemsListe(
  token,
  siteGraphId,
  listeId
) {
  return collecter(
    token,
    `/sites/${siteGraphId}` +
    `/lists/${listeId}` +
    "/items" +
    "?$expand=fields&$top=200"
  );
}

/**
 * Charge des éléments par leurs IDs SharePoint natifs numériques.
 * `itemIds` accepte un ID ou un tableau d'IDs; les valeurs non numériques sont ignorées.
 * `onError(erreur, id)` est appelé pour chaque élément qui échoue; ces éléments sont omis du résultat.
 */
async function chargerElementsParIds(
  token,
  siteGraphId,
  listeId,
  itemIds,
  onError
) {
  const ids =
    [...new Set(
      convertirIdsLookup(itemIds)
    )];

  if (!ids.length) {
    return [];
  }

  const colonnes =
    await chargerColonnesListe(
      token,
      siteGraphId,
      listeId
    );

  const elements = [];

  for (
    let debut = 0;
    debut < ids.length;
    debut += TAILLE_LOT_GRAPH
  ) {
    const lot =
      await Promise.all(
        ids
          .slice(
            debut,
            debut + TAILLE_LOT_GRAPH
          )
          .map(
            async (id) => {
              try {
                const item =
                  await graph(
                    token,
                    `/sites/${siteGraphId}` +
                    `/lists/${listeId}` +
                    `/items/${id}` +
                    "?$expand=fields"
                  );

                return await construireElementPublic(
                  token,
                  siteGraphId,
                  item,
                  colonnes
                );
              } catch (erreur) {
                if (typeof onError === "function") {
                  onError(erreur, id);
                }

                return null;
              }
            }
          )
      );

    elements.push(
      ...lot.filter(Boolean)
    );
  }

  return elements;
}

/* =========================================================
   LOOKUPS SHAREPOINT
   ========================================================= */

function convertirIdsLookup(valeur) {
  const valeurs =
    Array.isArray(valeur)
      ? valeur
      : (
        valeur === null ||
        valeur === undefined
          ? []
          : [valeur]
      );

  return valeurs
    .map(
      (element) =>
        String(element)
          .trim()
    )
    .filter(
      (element) =>
        /^\d+$/.test(element)
    );
}

function idsLookupColonne(
  fields,
  colonne
) {
  if (!colonne || !colonne.name) {
    return [];
  }

  const cleLookup =
    `${colonne.name}LookupId`;

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        fields,
        cleLookup
      )
  ) {
    return convertirIdsLookup(
      fields[cleLookup]
    );
  }

  if (
    Object.prototype
      .hasOwnProperty
      .call(
        fields,
        colonne.name
      )
  ) {
    return convertirIdsLookup(
      fields[colonne.name]
    );
  }

  return [];
}

function trouverColonneLookupVersListe(
  colonnes,
  listeCibleId
) {
  const cible =
    String(listeCibleId || "")
      .toLowerCase();

  if (!cible) {
    return null;
  }

  return (
    colonnes.find(
      (colonne) =>
        colonne.lookup &&
        colonne.lookup.listId &&
        String(
          colonne.lookup.listId
        ).toLowerCase() === cible
    ) ||
    null
  );
}

function correspondAuLookup(
  fields,
  colonneLookup,
  itemCibleId
) {
  const attendu =
    String(itemCibleId || "")
      .trim();

  if (!attendu) {
    return false;
  }

  return idsLookupColonne(
    fields,
    colonneLookup
  ).includes(attendu);
}

function correspondAUnDesLookups(
  fields,
  colonneLookup,
  itemCibleIds
) {
  const attendus =
    new Set(
      (
        Array.isArray(itemCibleIds)
          ? itemCibleIds
          : [itemCibleIds]
      )
        .map(
          (id) =>
            String(id || "")
              .trim()
        )
        .filter(Boolean)
    );

  if (!attendus.size) {
    return false;
  }

  return idsLookupColonne(
    fields,
    colonneLookup
  ).some(
    (id) =>
      attendus.has(id)
  );
}

async function resoudreLookupDomaine(
  token,
  siteId,
  item,
  colonnes,
  domaine
) {
  for (const colonne of colonnes) {
    if (
      !colonne.lookup ||
      !colonne.lookup.listId
    ) {
      continue;
    }

    const ids =
      idsLookupColonne(
        item.fields || {},
        colonne
      );

    for (const id of ids) {
      const lie =
        await graph(
          token,
          `/sites/${siteId}` +
          `/lists/${colonne.lookup.listId}` +
          `/items/${id}` +
          "?$expand=fields"
        );

      if (
        contientDomaine(
          lie.fields || {},
          domaine
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

/* =========================================================
   CHAMPS PUBLICS
   ========================================================= */

const CHAMPS_SYSTEME_INTERDITS =
  new Set([
    "Author",
    "AuthorLookupId",
    "Editor",
    "EditorLookupId",
    "Created",
    "Modified",
    "Attachments",
    "ContentType",
    "AppAuthor",
    "AppAuthorLookupId",
    "AppEditor",
    "AppEditorLookupId",
    "_UIVersionString",
    "ItemChildCount",
    "FolderChildCount"
  ]);

function estChampPublic(nom) {
  if (
    !nom ||
    CHAMPS_SYSTEME_INTERDITS
      .has(nom)
  ) {
    return false;
  }

  if (
    nom.startsWith("_") ||
    nom.startsWith("Compliance") ||
    nom.startsWith("MetaInfo")
  ) {
    return false;
  }

  return true;
}

function convertirValeurPublique(
  valeur
) {
  if (
    valeur === null ||
    valeur === undefined
  ) {
    return null;
  }

  if (Array.isArray(valeur)) {
    return valeur.map(
      convertirValeurPublique
    );
  }

  if (typeof valeur === "object") {
    const resultat = {};

    for (
      const [
        cle,
        contenu
      ] of Object.entries(valeur)
    ) {
      if (estChampPublic(cle)) {
        resultat[cle] =
          convertirValeurPublique(
            contenu
          );
      }
    }

    return resultat;
  }

  return valeur;
}

function champsPublicsParNomAffiche(
  fields,
  colonnes
) {
  const sortie = {};

  for (const colonne of colonnes) {
    if (
      colonne.hidden ||
      !estChampPublic(colonne.name)
    ) {
      continue;
    }

    const nomSortie =
      colonne.displayName ||
      colonne.name;

    if (
      Object.prototype
        .hasOwnProperty
        .call(
          fields,
          colonne.name
        )
    ) {
      sortie[nomSortie] =
        convertirValeurPublique(
          fields[colonne.name]
        );
    }
  }

  return sortie;
}

async function relationsLookup(
  token,
  siteId,
  fields,
  colonnes
) {
  const relations = {};
  const resolues = await Promise.all(
    colonnes.map((colonne) => resoudreColonneLookup(token, siteId, fields, colonne))
  );

  for (const entree of resolues) {
    if (entree) {
      relations[entree[0]] = entree[1];
    }
  }

  return relations;
}

async function resoudreColonneLookup(
  token,
  siteId,
  fields,
  colonne
) {
  if (
    !colonne.lookup ||
    !colonne.lookup.listId ||
    colonne.hidden
  ) {
    return null;
  }

  const ids =
    idsLookupColonne(
      fields,
      colonne
    );

  if (!ids.length) {
    return null;
  }

  const valeurs = await Promise.all(
    ids.map(async (id) => {
      try {
        const lie =
          await graph(
            token,
            `/sites/${siteId}` +
            `/lists/${colonne.lookup.listId}` +
            `/items/${id}` +
            "?$expand=fields"
          );

        return {
          id: String(lie.id),
          titre:
            lie.fields &&
            (
              lie.fields.Title ||
              lie.fields.TITRE ||
              lie.fields.NOM
            ) ||
            null
        };
      } catch (_) {
        return {
          id: String(id),
          titre: null
        };
      }
    })
  );

  if (valeurs.length) {
    const nomRelation =
      colonne.displayName ||
      colonne.name;

    return [
      nomRelation,
      colonne.lookup
        .allowMultipleValues
        ? valeurs
        : valeurs[0]
    ];
  }

  return null;
}

/* =========================================================
   ORDRE ET ELEMENT PUBLIC
   ========================================================= */

function ordreElement(
  fields,
  colonnes
) {
  const valeur =
    trouverChamp(
      fields,
      colonnes,
      [
        "ORDREAFFICHAGE",
        "ORDRE",
        "POSITION",
        "RANG"
      ]
    );

  const nombre =
    Number(valeur);

  return Number.isFinite(nombre)
    ? nombre
    : 999999;
}

async function construireElementPublic(
  token,
  siteGraphId,
  item,
  colonnes
) {
  const fields =
    item.fields || {};

  return {
    id: String(item.id),
    ordre:
      ordreElement(
        fields,
        colonnes
      ),
    configuration:
      champsPublicsParNomAffiche(
        fields,
        colonnes
      ),
    relations:
      await relationsLookup(
        token,
        siteGraphId,
        fields,
        colonnes
      )
  };
}

function trierElements(elements) {
  elements.sort(
    (a, b) =>
      a.ordre - b.ordre ||
      Number(a.id) - Number(b.id)
  );

  return elements;
}

/* =========================================================
   COMPOSANTS LIES DIRECTEMENT AU SITE
   ========================================================= */

const idListe = (v) =>
  String(v || "").replace(/[{}]/g, "").toLowerCase();

/*
 * Un element est rattache au site par un Lookup dont la liste cible est
 * OBJ-SITE-PUBLIC (ID natif de liste), quel que soit le nom de la colonne
 * (ex. "OBJ-SITE-PUBLIC" ou "OBJ-SITE"). Repli par nom pour les colonnes simples.
 */
function correspondAuSite(
  fields,
  colonnes,
  siteItemId,
  listeSiteId = null
) {
  const attendu =
    String(siteItemId);

  for (const colonne of colonnes) {
    const noms = [
      colonne.name,
      colonne.displayName
    ].map(nomNormalise);

    const lieAuSite =
      colonne.lookup?.listId && listeSiteId
        ? idListe(colonne.lookup.listId) === idListe(listeSiteId)
        : noms.some(
          (nom) =>
            nom.includes(
              "OBJSITEPUBLIC"
            ) ||
            nom === "SITE" ||
            nom.includes("IDSITE")
        );

    if (!lieAuSite) {
      continue;
    }

    const candidats = [
      fields[colonne.name],
      fields[
        `${colonne.name}LookupId`
      ]
    ];

    for (const candidat of candidats) {
      const valeurs =
        Array.isArray(candidat)
          ? candidat
          : [candidat];

      if (
        valeurs.some(
          (valeur) =>
            String(valeur) ===
            attendu
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

async function chargerComposantSite(
  token,
  siteGraphId,
  listes,
  definition,
  siteItemId
) {
  const liste =
    trouverListe(
      listes,
      definition.noms
    );

  if (!liste) {
    return {
      disponible: false,
      liste: definition.noms[0],
      elements: []
    };
  }

  const colonnes =
    await chargerColonnesListe(
      token,
      siteGraphId,
      liste.id
    );

  const items =
    await chargerItemsListe(
      token,
      siteGraphId,
      liste.id
    );

  const listeSite =
    trouverListe(
      listes,
      ["OBJ-SITE-PUBLIC"]
    );

  const trouves =
    items.filter(
      (item) =>
        correspondAuSite(
          item.fields || {},
          colonnes,
          siteItemId,
          listeSite?.id || null
        )
    );

  const elements = [];

  const listeMedia =
    trouverListe(
      listes,
      ["OBJ-MEDIA"]
    );

  const construits = await Promise.all(
    trouves.map((item) =>
      construireElementPublic(
        token,
        siteGraphId,
        item,
        colonnes
      )
    )
  );

  for (const [index, item] of trouves.entries()) {
    const element = construits[index];

    // Media generique : Lookup vers OBJ-MEDIA (ID natif) => /api/v1/media/:id.
    element.media =
      require("./statuts-site").mediaElement(
        colonnes,
        item.fields || {},
        listeMedia ? idListe(listeMedia.id) : null
      );

    elements.push(element);
  }

  trierElements(elements);

  return {
    disponible: true,
    liste:
      liste.displayName ||
      liste.name,
    listeId:
      String(liste.id),
    multiple:
      Boolean(
        definition.multiple
      ),
    elements
  };
}

/* =========================================================
   CHARGEMENT GENERIQUE PAR LOOKUP
   ========================================================= */

async function chargerElementsLies(
  token,
  siteGraphId,
  listes,
  options
) {
  const {
    nomsListe,
    listeParenteId,
    itemParentIds,
    multiple = true
  } = options;

  const noms =
    Array.isArray(nomsListe)
      ? nomsListe
      : [nomsListe];

  const liste =
    trouverListe(
      listes,
      noms
    );

  if (!liste) {
    return {
      disponible: false,
      liste: noms[0],
      listeId: null,
      lookup: null,
      multiple:
        Boolean(multiple),
      elements: []
    };
  }

  const colonnes =
    await chargerColonnesListe(
      token,
      siteGraphId,
      liste.id
    );

  const colonneLookup =
    trouverColonneLookupVersListe(
      colonnes,
      listeParenteId
    );

  if (!colonneLookup) {
    return {
      disponible: true,
      liste:
        liste.displayName ||
        liste.name,
      listeId:
        String(liste.id),
      lookup: null,
      multiple:
        Boolean(multiple),
      elements: []
    };
  }

  const items =
    await chargerItemsListe(
      token,
      siteGraphId,
      liste.id
    );

  const trouves =
    items.filter(
      (item) =>
        correspondAUnDesLookups(
          item.fields || {},
          colonneLookup,
          itemParentIds
        )
    );

  const elements = [];

  const listeMedia =
    trouverListe(
      listes,
      ["OBJ-MEDIA"]
    );

  const construits = await Promise.all(
    trouves.map((item) =>
      construireElementPublic(
        token,
        siteGraphId,
        item,
        colonnes
      )
    )
  );

  for (const [index, item] of trouves.entries()) {
    const element = construits[index];

    // Media generique : Lookup vers OBJ-MEDIA (ID natif) => /api/v1/media/:id.
    element.media =
      require("./statuts-site").mediaElement(
        colonnes,
        item.fields || {},
        listeMedia ? idListe(listeMedia.id) : null
      );

    elements.push(element);
  }

  trierElements(elements);

  return {
    disponible: true,
    liste:
      liste.displayName ||
      liste.name,
    listeId:
      String(liste.id),
    lookup: {
      colonneId:
        String(colonneLookup.id),
      nom:
        colonneLookup.name,
      nomAffiche:
        colonneLookup.displayName,
      cleLookup:
        `${colonneLookup.name}LookupId`,
      listeCibleId:
        String(
          colonneLookup.lookup.listId
        ),
      multiple:
        Boolean(
          colonneLookup.lookup
            .allowMultipleValues
        )
    },
    multiple:
      Boolean(multiple),
    elements
  };
}

/* =========================================================
   CHAINE SITE → PAGES → MODULES → CONTENUS
   ========================================================= */

async function chargerPagesSite(
  token,
  siteGraphId,
  listes,
  siteItemId
) {
  const listeSite =
    trouverListe(
      listes,
      ["OBJ-SITE-PUBLIC"]
    );

  if (!listeSite) {
    return {
      disponible: false,
      liste: "OBJ-PAGES-SITE",
      listeId: null,
      lookup: null,
      multiple: true,
      elements: []
    };
  }

  return chargerElementsLies(
    token,
    siteGraphId,
    listes,
    {
      nomsListe: [
        "OBJ-PAGES-SITE"
      ],
      listeParenteId:
        listeSite.id,
      itemParentIds: [
        siteItemId
      ],
      multiple: true
    }
  );
}

async function chargerModulesPages(
  token,
  siteGraphId,
  listes,
  pageItemIds
) {
  const listePages =
    trouverListe(
      listes,
      ["OBJ-PAGES-SITE"]
    );

  if (!listePages) {
    return {
      disponible: false,
      liste:
        "OBJ-MODULE-SITE-PUBLIC",
      listeId: null,
      lookup: null,
      multiple: true,
      elements: []
    };
  }

  return chargerElementsLies(
    token,
    siteGraphId,
    listes,
    {
      nomsListe: [
        "OBJ-MODULE-SITE-PUBLIC"
      ],
      listeParenteId:
        listePages.id,
      itemParentIds:
        pageItemIds,
      multiple: true
    }
  );
}

async function chargerContenusModules(
  token,
  siteGraphId,
  listes,
  options
) {
  const {
    nomsListeContenu,
    moduleItemIds
  } = options;

  const listeModules =
    trouverListe(
      listes,
      [
        "OBJ-MODULE-SITE-PUBLIC"
      ]
    );

  if (!listeModules) {
    const noms =
      Array.isArray(
        nomsListeContenu
      )
        ? nomsListeContenu
        : [nomsListeContenu];

    return {
      disponible: false,
      liste:
        noms[0] || null,
      listeId: null,
      lookup: null,
      multiple: true,
      elements: []
    };
  }

  return chargerElementsLies(
    token,
    siteGraphId,
    listes,
    {
      nomsListe:
        nomsListeContenu,
      listeParenteId:
        listeModules.id,
      itemParentIds:
        moduleItemIds,
      multiple: true
    }
  );
}

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  correlationId,
  reponseJson,
  obtenirJetonGraph,
  obtenirSiteGraph,
  graph,
  graphSansCache,
  graphEcriture,
  viderCacheGraph,
  creerErreur,

  normaliserDomaine,
  contientDomaine,
  nomNormalise,
  trouverChamp,
  booleenPublic,
  collecter,

  trouverListe,
  chargerColonnesListe,
  chargerItemsListe,
  chargerElementsParIds,

  convertirIdsLookup,
  idsLookupColonne,
  trouverColonneLookupVersListe,
  correspondAuLookup,
  correspondAUnDesLookups,
  resoudreLookupDomaine,

  estChampPublic,
  convertirValeurPublique,
  champsPublicsParNomAffiche,
  relationsLookup,

  ordreElement,
  construireElementPublic,
  trierElements,

  correspondAuSite,
  chargerComposantSite,

  chargerElementsLies,
  chargerPagesSite,
  chargerModulesPages,
  chargerContenusModules
};