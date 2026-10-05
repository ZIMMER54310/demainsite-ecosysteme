"use strict";

/*
 * Import d'un media depuis le cockpit :
 *   1. depot du fichier dans la bibliotheque "DSE - MEDIAS" sous SITE-PUBLIC/<domaine>/<TYPE>/ (jamais d'ecrasement) ;
 *   2. creation de l'element OBJ-MEDIA (portee SITE, site et client relies par ID natif SharePoint).
 * Types et formats acceptes proviennent des listes OBJ-MEDIA-TYPE et OBJ-MEDIA-FORMAT.
 * Aucune suppression : si la fiche ne peut pas etre creee, le fichier depose est conserve et signale.
 */

const dse = require("./dse");
const ecriture = require("./ecriture");
const { cleChamp } = require("./catalogue");
const C = require("./constructeur");

const BIBLIOTHEQUE = () => process.env.DSE_MEDIA_LIBRARY || "DSE - MEDIAS";
const PREFIXE = "SITE-PUBLIC";
const TRONCON = 320 * 1024 * 16; // multiple de 320 Kio exige par Graph
const tailleMaxOctets = () => {
  const mo = Number(process.env.DSE_MEDIA_TELEVERSEMENT_MAX_MO);
  return (Number.isFinite(mo) && mo > 0 ? Math.min(mo, 250) : 50) * 1024 * 1024;
};

/* Controle technique de signature : un fichier renomme ne passe pas pour un autre format. */
const SIGNATURES = {
  PNG: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  JPG: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  JPEG: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  GIF: (b) => b.subarray(0, 4).toString("latin1") === "GIF8",
  WEBP: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  AVIF: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" && /^avi[fs]/.test(b.subarray(8, 12).toString("latin1")),
  ICO: (b) => b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0,
  SVG: (b) => /<svg[\s>]/i.test(b.subarray(0, 4096).toString("utf8")),
  PDF: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  MP4: (b) => b.subarray(4, 8).toString("latin1") === "ftyp",
  MOV: (b) => b.subarray(4, 8).toString("latin1") === "ftyp",
  WEBM: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  MP3: (b) => b.subarray(0, 3).toString("latin1") === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  WAV: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WAVE",
  OGG: (b) => b.subarray(0, 4).toString("latin1") === "OggS"
};

let cacheRef = { expire: 0, valeur: null };
let cacheDrive = { expire: 0, id: null };

async function referentiels(g) {
  if (cacheRef.valeur && cacheRef.expire > Date.now()) return cacheRef.valeur;
  const lire = async (nom) => {
    const l = dse.trouverListe(g.listes, [nom]);
    if (!l) return [];
    const items = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${l.id}/items?$expand=fields($select=Title)&$top=200`);
    return items.map((i) => ({ id: String(i.id), titre: String(i.fields?.Title || "").trim() })).filter((x) => x.titre);
  };
  const valeur = { types: await lire("OBJ-MEDIA-TYPE"), formats: await lire("OBJ-MEDIA-FORMAT") };
  cacheRef = { expire: Date.now() + 5 * 60 * 1000, valeur };
  return valeur;
}

const refType = (id) => `typeMedia.${C.signer(`typeMedia:${id}`)}`;

/* Options du formulaire (aucun ID natif expose : references signees). */
async function options(g) {
  const { types, formats } = await referentiels(g);
  return {
    types: types.map((t) => ({ ref: refType(t.id), titre: t.titre })),
    formats: formats.map((f) => cleChamp(f.titre)).filter(Boolean),
    tailleMaxMo: Math.round(tailleMaxOctets() / 1024 / 1024)
  };
}

function nomSur(nom) {
  const brut = String(nom || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const point = brut.lastIndexOf(".");
  const base = (point > 0 ? brut.slice(0, point) : brut).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "media";
  const ext = (point > 0 ? brut.slice(point + 1) : "").replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, 8);
  return { base, ext };
}

const segment = (v) => String(v).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80);
const chemin = (p) => p.split("/").map(encodeURIComponent).join("/");

async function idBibliotheque(g) {
  if (cacheDrive.id && cacheDrive.expire > Date.now()) return cacheDrive.id;
  const drives = await dse.collecter(g.token, `/sites/${g.siteGraphId}/drives?$select=id,name`);
  const d = drives.find((x) => x.name === BIBLIOTHEQUE());
  if (!d) throw Object.assign(new Error("Bibliothèque des médias indisponible."), { refus: true });
  cacheDrive = { id: d.id, expire: Date.now() + 30 * 60 * 1000 };
  return d.id;
}

async function graphBrut(g, methode, url, corps, entetes = {}) {
  const auth = url.startsWith("https://graph.microsoft.com/") ? { Authorization: `Bearer ${g.token}` } : {};
  const r = await fetch(url, { method: methode, headers: { ...auth, ...entetes }, body: corps, signal: AbortSignal.timeout(120000) });
  const json = await r.json().catch(() => null);
  return { status: r.status, json };
}

/* Premier nom libre (base, base-2, base-3...) : aucun fichier existant n'est jamais remplace. */
async function cheminLibre(g, driveId, dossier, base, ext) {
  for (let i = 1; i <= 50; i++) {
    const nom = `${base}${i > 1 ? `-${i}` : ""}.${ext}`;
    const r = await graphBrut(g, "GET", `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${chemin(`${dossier}/${nom}`)}?$select=id`);
    if (r.status === 404) return `${dossier}/${nom}`;
    if (r.status !== 200) throw new Error(`Contrôle du nom refusé (${r.status}).`);
  }
  throw Object.assign(new Error("Trop de fichiers portent déjà ce nom. Merci de renommer le fichier."), { refus: true });
}

async function deposer(g, driveId, cheminFichier, contenu) {
  const session = await graphBrut(g, "POST",
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${chemin(cheminFichier)}:/createUploadSession`,
    JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "fail" } }), { "Content-Type": "application/json" });
  if (session.status === 409) return { conflit: true };
  const url = session.json?.uploadUrl;
  if (session.status !== 200 || !/^https:\/\//.test(url || "")) throw new Error(`Session d'envoi refusée (${session.status}).`);
  let dernier = null;
  for (let debut = 0; debut < contenu.length; debut += TRONCON) {
    const fin = Math.min(debut + TRONCON, contenu.length);
    dernier = await graphBrut(g, "PUT", url, contenu.subarray(debut, fin), {
      "Content-Length": String(fin - debut), "Content-Range": `bytes ${debut}-${fin - 1}/${contenu.length}`
    });
    if (dernier.status === 409) return { conflit: true };
    if (![200, 201, 202].includes(dernier.status)) throw new Error(`Envoi du fichier refusé (${dernier.status}).`);
  }
  if (!dernier?.json?.id) throw new Error("Dépôt du fichier non confirmé.");
  return { item: dernier.json };
}

async function colonneTexte(w, liste, debut) {
  const cle = cleChamp(debut);
  const c = (await w.cols(liste)).find((x) => !x.lookup && !x.readOnly && cleChamp(x.displayName).startsWith(cle));
  return c ? c.name : null;
}

/*
 * televerser : perimetre deja controle par l'appelant (droit d'ecriture logo-medias sur le site).
 * Retour : { message, nouveau, crees } ou { refus } ou { erreur, status, crees }.
 */
async function televerser({ g, perimetre, typeRef, titre, nomFichier, contenu, acteur }) {
  if (!perimetre.peut("logo-medias")) return { refus: "Action non autorisée pour votre profil." };
  if (!Buffer.isBuffer(contenu) || !contenu.length) return { refus: "Aucun fichier reçu." };
  if (contenu.length > tailleMaxOctets()) return { refus: "Fichier trop volumineux." };

  const { types, formats } = await referentiels(g);
  const type = types.find((t) => refType(t.id) === typeRef);
  if (!type) return { refus: "Type de média inconnu." };
  const { base, ext } = nomSur(nomFichier);
  const format = formats.find((f) => cleChamp(f.titre) === ext.toUpperCase());
  if (!format) return { refus: `Format « ${ext || "inconnu"} » non référencé dans les formats de médias autorisés.` };
  const signature = SIGNATURES[ext.toUpperCase()];
  if (signature && !signature(contenu)) return { refus: "Le contenu du fichier ne correspond pas à son extension." };

  const domaine = segment((perimetre.info.domaines || [])[0] || "");
  if (!domaine) return { refus: "Domaine principal du site introuvable." };
  const dossier = `${PREFIXE}/${domaine}/${segment(type.titre) || "AUTRE"}`;
  const driveId = await idBibliotheque(g);

  let depot = null;
  let cheminFichier = null;
  for (let essai = 0; essai < 3 && !depot?.item; essai++) {
    cheminFichier = await cheminLibre(g, driveId, dossier, base, ext);
    depot = await deposer(g, driveId, cheminFichier, contenu);
  }
  if (!depot?.item) return { refus: "Un fichier du même nom vient d'être déposé. Merci de réessayer." };
  const fichier = { chemin: cheminFichier, graphId: depot.item.id, taille: contenu.length };

  try {
    const w = new C.Ecrivain(g);
    const L = "OBJ-MEDIA";
    const champs = { Title: String(titre || `${base}.${ext}`).trim().slice(0, 255), ...(await w.etats(L, "actif")) };
    const relier = async (relation, cible, valeur) => {
      const n = await w.lookup(L, relation, cible);
      if (n && valeur) champs[n] = String(valeur);
    };
    await relier("OBJ-VEROUILLE", "OBJ-VEROUILLE", await w.valeur("OBJ-VEROUILLE", /^NON/));
    await relier("OBJ-STATUS", "OBJ-STATUT", await w.valeur("OBJ-STATUT", /^ACTIF$/));
    await relier("OBJ-MEDIA-TYPE", "OBJ-MEDIA-TYPE", type.id);
    await relier("OBJ-MEDIA-FORMAT", "OBJ-MEDIA-FORMAT", format.id);
    await relier("OBJ-MEDIA-PORTEE", "OBJ-MEDIA-PORTEE", await w.valeur("OBJ-MEDIA-PORTEE", /^SITE$/));
    await relier("OBJ-SITE-PUBLIC", "OBJ-SITE-PUBLIC", perimetre.info.id);
    if (perimetre.clients.size === 1) await relier("OBJ-CLIENT", "OBJ-CLIENT", [...perimetre.clients][0]);
    for (const [col, v] of [["MEDIA-PATH", fichier.chemin], ["MEDIA-GRAPH-ID", fichier.graphId], ["MEDIA-DRIVE-ID", driveId]]) {
      const n = await colonneTexte(w, L, col);
      if (n) champs[n] = v;
    }
    const note = await w.simple(L, "NOTE-COURTE");
    if (note) champs[note] = `Importé depuis le cockpit par ${acteur}`.slice(0, 255);
    const id = await w.creer(L, champs);
    return {
      message: `Média « ${champs.Title} » ajouté à la bibliothèque du site.`,
      nouveau: { media: id, fichier: fichier.chemin, type: type.titre },
      crees: [...w.crees, { bibliotheque: BIBLIOTHEQUE(), chemin: fichier.chemin }]
    };
  } catch (e) {
    console.error("[DSE medias] fiche", e.message, e.detailGraph || "");
    return {
      erreur: `Le fichier a été déposé (${fichier.chemin}) mais sa fiche média n'a pas pu être créée. Il est conservé ; une vérification est nécessaire.`,
      status: 502, crees: [{ bibliotheque: BIBLIOTHEQUE(), chemin: fichier.chemin }]
    };
  }
}

module.exports = { options, televerser, tailleMaxOctets, _test: { nomSur, SIGNATURES, segment } };
