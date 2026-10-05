"use strict";

/*
 * Synchronisation bibliotheque "DSE - MEDIAS" -> liste OBJ-MEDIA (sens unique, ajout seulement).
 * Perimetre : dossier SITE-PUBLIC uniquement (les documents de travail ne deviennent jamais des medias).
 * Pour chaque fichier sans fiche (ni MEDIA-GRAPH-ID ni MEDIA-PATH correspondant) :
 *   - format : extension retrouvee dans OBJ-MEDIA-FORMAT, sinon fichier signale "format non reference" ;
 *   - type : dossier du chemin retrouve dans OBJ-MEDIA-TYPE, sinon type "AUTRE" du referentiel ;
 *   - site/client : dossier du chemin egal a un domaine d'OBJ-SITE-PUBLIC -> portee SITE, sinon portee GLOBAL ;
 *   - etat brouillon : la fiche n'est utilisable qu'apres validation dans SharePoint ou le cockpit.
 * Aucune suppression, aucune modification de fiche existante, aucun fichier deplace ou renomme.
 */

const dse = require("./dse");
const ecriture = require("./ecriture");
const { cleChamp } = require("./catalogue");
const C = require("./constructeur");

const PREFIXE = "SITE-PUBLIC";
const LISTE = "OBJ-MEDIA";
const MAX_PAR_PASSAGE = () => Math.max(1, Math.min(Number(process.env.DSE_MEDIA_SYNCHRO_MAX) || 100, 500));

let enCours = null;
let dernier = null;

async function idBibliotheque(g) {
  const drives = await dse.collecter(g.token, `/sites/${g.siteGraphId}/drives?$select=id,name`);
  const d = drives.find((x) => x.name === (process.env.DSE_MEDIA_LIBRARY || "DSE - MEDIAS"));
  if (!d) throw Object.assign(new Error("Bibliothèque des médias indisponible."), { refus: true });
  return d.id;
}

async function fichiersSitePublic(g, driveId) {
  const sortie = [];
  const racine = await dse.graphSansCache(g.token, `/drives/${driveId}/root:/${PREFIXE}?$select=id,folder`).catch(() => null);
  if (!racine?.id) return sortie;
  const parcourir = async (id, chemin, profondeur) => {
    if (profondeur > 8) return;
    const enfants = await dse.collecter(g.token, `/drives/${driveId}/items/${id}/children?$select=id,name,folder,file,size&$top=200`);
    for (const e of enfants) {
      if (e.folder) await parcourir(e.id, `${chemin}/${e.name}`, profondeur + 1);
      else if (e.file) sortie.push({ id: e.id, chemin: `${chemin}/${e.name}`, nom: e.name });
    }
  };
  await parcourir(racine.id, PREFIXE, 0);
  return sortie;
}

async function referentiel(g, nom) {
  const l = dse.trouverListe(g.listes, [nom]);
  if (!l) return [];
  const items = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${l.id}/items?$expand=fields($select=Title)&$top=200`);
  return items.map((i) => ({ id: String(i.id), titre: String(i.fields?.Title || "").trim() })).filter((x) => x.titre);
}

async function colonneTexte(w, debut) {
  const c = (await w.cols(LISTE)).find((x) => !x.lookup && !x.readOnly && cleChamp(x.displayName).startsWith(cleChamp(debut)));
  return c ? c.name : null;
}

/* Deduction purement fondee sur le chemin et les referentiels SharePoint (testee sans acces reseau). */
function analyser(fichier, { types, formats, sites }) {
  const segments = fichier.chemin.split("/").slice(1, -1);
  const point = fichier.nom.lastIndexOf(".");
  const ext = point > 0 ? fichier.nom.slice(point + 1) : "";
  const format = formats.find((f) => cleChamp(f.titre) === cleChamp(ext));
  if (!format) return { ignore: `format « ${ext || "inconnu"} » non référencé` };
  const domaine = segments.map((s) => s.toLowerCase()).find((s) => sites.some((x) => x.domaines.includes(s))) || null;
  const site = domaine ? sites.find((x) => x.domaines.includes(domaine)) : null;
  const correspond = (seg, t) => { const a = cleChamp(seg), b = cleChamp(t.titre); return a === b || (a.length > b.length && a.startsWith(b) && a.length - b.length <= 1); };
  const type = segments.map((s) => types.find((t) => correspond(s, t))).find(Boolean) || types.find((t) => cleChamp(t.titre) === "AUTRE") || null;
  if (!type) return { ignore: "type de média introuvable" };
  return {
    titre: (point > 0 ? fichier.nom.slice(0, point) : fichier.nom).trim().slice(0, 255),
    format, type, site, portee: site ? "SITE" : "GLOBAL", aClasser: cleChamp(type.titre) === "AUTRE"
  };
}

async function executer({ acteur }) {
  const g = await ecriture.contexteGraph();
  const driveId = await idBibliotheque(g);
  const w = new C.Ecrivain(g);
  const liste = w.liste(LISTE);
  const [fichiers, types, formats, fiches, index] = await Promise.all([
    fichiersSitePublic(g, driveId), referentiel(g, "OBJ-MEDIA-TYPE"), referentiel(g, "OBJ-MEDIA-FORMAT"),
    ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields&$top=500`),
    require("../auth/droits").sitesIndex()
  ]);
  const sites = [...(index.sites?.values ? index.sites.values() : index.sites || [])]
    .map((s) => ({ id: String(s.id), clientId: s.clientId ? String(s.clientId) : null, domaines: (s.domaines || []).map((x) => String(x).toLowerCase()) }));
  const colPath = await colonneTexte(w, "MEDIA-PATH");
  const colGraph = await colonneTexte(w, "MEDIA-GRAPH-ID");
  const colDrive = await colonneTexte(w, "MEDIA-DRIVE-ID");
  if (!colPath && !colGraph) throw Object.assign(new Error("Colonnes de rattachement des médias indisponibles."), { refus: true });
  const connus = new Set();
  for (const f of fiches) {
    for (const col of [colPath, colGraph]) if (col && f.fields?.[col]) connus.add(String(f.fields[col]).trim());
  }

  const rapport = { fichiers: fichiers.length, dejaReferences: 0, crees: [], ignores: [], erreurs: [] };
  const etats = await w.etats(LISTE, "brouillon");
  for (const fichier of fichiers) {
    if (connus.has(fichier.id) || connus.has(fichier.chemin)) { rapport.dejaReferences++; continue; }
    if (rapport.crees.length >= MAX_PAR_PASSAGE()) { rapport.reste = true; break; }
    const a = analyser(fichier, { types, formats, sites });
    if (a.ignore) { rapport.ignores.push({ chemin: fichier.chemin, raison: a.ignore }); continue; }
    try {
      const champs = { Title: a.titre || fichier.nom, ...etats };
      const relier = async (relation, valeur, cible = relation) => { const n = await w.lookup(LISTE, relation, cible); if (n && valeur) champs[n] = String(valeur); };
      await relier("OBJ-STATUS", await w.valeur("OBJ-STATUT", /^ACTIF$/), "OBJ-STATUT");
      await relier("OBJ-MEDIA-TYPE", a.type.id);
      await relier("OBJ-MEDIA-FORMAT", a.format.id);
      await relier("OBJ-MEDIA-PORTEE", await w.valeur("OBJ-MEDIA-PORTEE", new RegExp(`^${a.portee}$`)));
      if (a.site) {
        await relier("OBJ-SITE-PUBLIC", a.site.id);
        if (a.site.clientId) await relier("OBJ-CLIENT", a.site.clientId);
      }
      if (colPath) champs[colPath] = fichier.chemin;
      if (colGraph) champs[colGraph] = fichier.id;
      if (colDrive) champs[colDrive] = driveId;
      const note = await w.simple(LISTE, "NOTE-COURTE");
      if (note) champs[note] = `Ajouté par synchronisation de la bibliothèque (${acteur})${a.aClasser ? " - type à classer" : ""}`.slice(0, 255);
      const id = await w.creer(LISTE, champs);
      connus.add(fichier.id);
      rapport.crees.push({ id, chemin: fichier.chemin, type: a.type.titre, portee: a.portee, aClasser: a.aClasser });
    } catch (e) {
      console.error("[DSE medias] synchro", fichier.chemin, e.message);
      rapport.erreurs.push({ chemin: fichier.chemin, raison: "création de la fiche refusée" });
    }
  }

  if (rapport.crees.length || rapport.erreurs.length) {
    const cle = ecriture.hash(["media-synchro", ...rapport.crees.map((c) => c.chemin), ...rapport.erreurs.map((c) => c.chemin)]);
    const journal = await ecriture.journaliser(g, {
      cle, action: "Médias : synchronisation bibliothèque", nom: `Synchronisation médias · ${rapport.crees.length} fiche(s) créée(s)`,
      ancien: {}, nouveau: { crees: rapport.crees.map((c) => ({ media: c.id, chemin: c.chemin })), erreurs: rapport.erreurs },
      notes: `Acteur : ${acteur} | Fichiers ${rapport.fichiers} | Déjà référencés ${rapport.dejaReferences} | Ignorés ${rapport.ignores.length}`,
      succes: !rapport.erreurs.length, contexte: { bibliotheque: PREFIXE }
    });
    rapport.journal = journal.ok;
    ecriture.invaliderCaches();
    require("./builder-source").viderCache();
  }
  return rapport;
}

/* Un seul passage a la fois (planification et bouton du cockpit partagent le meme verrou). */
function synchroniser({ acteur = "Synchronisation automatique" } = {}) {
  if (enCours) return enCours;
  const debut = new Date();
  enCours = executer({ acteur })
    .then((r) => (dernier = { ...r, le: debut.toISOString(), acteur, ok: true }))
    .catch((e) => {
      console.error("[DSE medias] synchro", e.message);
      return (dernier = { le: debut.toISOString(), acteur, ok: false, erreur: e.refus ? e.message : "Synchronisation momentanément indisponible." });
    })
    .finally(() => { enCours = null; });
  return enCours;
}

function demarrerPlanification() {
  const minutes = Number(process.env.DSE_MEDIA_SYNCHRO_MINUTES ?? 15);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const periode = Math.max(5, minutes) * 60 * 1000;
  setTimeout(() => synchroniser(), 2 * 60 * 1000).unref();
  return setInterval(() => synchroniser(), periode).unref();
}

const etat = () => ({ enCours: Boolean(enCours), dernier });

module.exports = { synchroniser, demarrerPlanification, etat, _test: { analyser } };
