"use strict";

/*
 * Route publique de lecture d'un media du catalogue OBJ-MEDIA.
 * LECTURE SEULE : aucune ecriture SharePoint.
 *
 * - OBJ-MEDIA (ID natif SharePoint de l'element) reste le catalogue ;
 * - le fichier physique est lu dans la bibliotheque "DSE - MEDIAS" uniquement
 *   (le drive stocke dans l'element n'est jamais utilise tel quel) ;
 * - seuls les chemins sous SITE-PUBLIC/ sont servis ;
 * - l'element doit etre actif, valide, et le fichier de type image.
 */

const dse = require("./shared/dse");

const BIBLIOTHEQUE =
  () => process.env.DSE_MEDIA_LIBRARY || "DSE - MEDIAS";
const PREFIXE_PUBLIC = "SITE-PUBLIC/";
const TAILLE_MAX = 15 * 1024 * 1024;
const TYPES_IMAGE = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"
]);

let cacheDrive = { id: null, expiration: 0 };

function normaliser(nom) {
  return String(nom).replace(/_x00[0-9a-f]{2}_/gi, "").toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function champ(fields, debut) {
  const cle = Object.keys(fields).find(
    (nom) => !nom.includes("@") && normaliser(nom).startsWith(debut)
  );
  const v = cle ? fields[cle] : "";
  return v === null || v === undefined ? "" : String(v).trim();
}

function erreur(status, code, message) {
  return dse.creerErreur(code, status, message);
}

async function idBibliotheque(token, siteId) {
  if (cacheDrive.id && cacheDrive.expiration > Date.now()) {
    return cacheDrive.id;
  }
  const r = await dse.graph(
    token,
    `/sites/${siteId}/drives?$select=id,name`
  );
  const drive = (r.value || []).find((d) => d.name === BIBLIOTHEQUE());
  if (!drive) {
    throw erreur(502, "DSE-MEDIA-BIBLIOTHEQUE-ABSENTE",
      "La bibliotheque des medias est introuvable.");
  }
  cacheDrive = { id: drive.id, expiration: Date.now() + 10 * 60 * 1000 };
  return drive.id;
}

function cheminSur(chemin) {
  const propre = String(chemin).replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = propre.split("/");
  return propre.startsWith(PREFIXE_PUBLIC) &&
    !segments.some((s) => s === ".." || s === "." || s === "")
    ? propre
    : "";
}

async function servirMedia(req, res) {
  const mediaId = String(req.params.mediaId || "");
  if (!/^[0-9]{1,9}$/.test(mediaId)) {
    throw erreur(400, "DSE-MEDIA-ID-INVALIDE",
      "L'identifiant du media est invalide.");
  }

  const token = await dse.obtenirJetonGraph();
  const site = await dse.obtenirSiteGraph(token);

  let element;
  try {
    element = await dse.graph(
      token,
      `/sites/${site.id}/lists/OBJ-MEDIA/items/${mediaId}?expand=fields`
    );
  } catch (e) {
    throw e.status === 404
      ? erreur(404, "DSE-MEDIA-INTROUVABLE", "Media introuvable.")
      : e;
  }

  const f = element.fields || {};
  if (
    String(f.OBJ_x002d_ACTIFLookupId) !== "1" ||
    String(f.OBJ_x002d_VALIDELookupId) !== "1"
  ) {
    throw erreur(404, "DSE-MEDIA-INTROUVABLE", "Media introuvable.");
  }

  const driveId = await idBibliotheque(token, site.id);
  const chemin = cheminSur(champ(f, "MEDIAPATH"));
  const graphId = champ(f, "MEDIAGRAPHID");

  let fichier = null;
  if (chemin) {
    try {
      fichier = await dse.graph(
        token,
        `/drives/${driveId}/root:/${chemin.split("/")
          .map(encodeURIComponent).join("/")}`
      );
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }
  if (!fichier && !chemin && /^[A-Za-z0-9_-]+$/.test(graphId)) {
    try {
      fichier = await dse.graph(token, `/drives/${driveId}/items/${graphId}`);
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }

  const type = fichier?.file?.mimeType;
  if (!fichier || !TYPES_IMAGE.has(type)) {
    throw erreur(404, "DSE-MEDIA-FICHIER-INTROUVABLE",
      "Le fichier du media est introuvable.");
  }
  if (Number(fichier.size) > TAILLE_MAX) {
    throw erreur(413, "DSE-MEDIA-TROP-VOLUMINEUX",
      "Le fichier du media est trop volumineux.");
  }
  // Le chemin reel doit rester dans la partie publique.
  const parent = String(fichier.parentReference?.path || "");
  if (!/\/root:\/SITE-PUBLIC(\/|$)/.test(parent)) {
    throw erreur(404, "DSE-MEDIA-FICHIER-INTROUVABLE",
      "Le fichier du media est introuvable.");
  }

  const etag = `"${fichier.eTag || fichier.id}"`;
  res.set({
    ETag: etag,
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff"
  });
  if (req.headers["if-none-match"] === etag) {
    return res.status(304).end();
  }

  const url = fichier["@microsoft.graph.downloadUrl"];
  if (!url || !/^https:\/\//.test(url)) {
    throw erreur(502, "DSE-MEDIA-CONTENU-INDISPONIBLE",
      "Le contenu du media est indisponible.");
  }
  const rep = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!rep.ok) {
    throw erreur(502, "DSE-MEDIA-CONTENU-INDISPONIBLE",
      "Le contenu du media est indisponible.");
  }
  const contenu = Buffer.from(await rep.arrayBuffer());
  res.status(200).type(type).set("Content-Length", String(contenu.length))
    .send(contenu);
}

module.exports = function routeMedia(req, res) {
  servirMedia(req, res).catch((e) => {
    if (res.headersSent) return;
    const status = e.codeDse ? e.status || 500 : 500;
    if (!e.codeDse) console.error("[DSE MEDIA]", e.message);
    res.status(status).set("Cache-Control", "no-store").json({
      succes: false,
      erreur: {
        code: e.codeDse || "DSE-MEDIA-ERREUR",
        message: e.codeDse ? e.message : "Le service des medias est indisponible."
      },
      meta: { genereLe: new Date().toISOString() }
    });
  });
};
