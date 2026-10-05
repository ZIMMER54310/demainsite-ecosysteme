"use strict";

/*
 * Registre et planificateur des synchronisations executees par le moteur OVH.
 * Reglages (mode, frequence, unite, dernier passage) : liste SharePoint OBJ-SYNCHRO, une ligne par synchronisation
 * (colonne Title = code). Sans ligne enregistree, le reglage par defaut du moteur s'applique.
 * Une verification a lieu chaque minute ; chaque synchronisation a son propre verrou.
 */

const dse = require("./dse");
const ecriture = require("./ecriture");
const { cle } = require("./provisionnement");

const LISTE = "OBJ-SYNCHRO";
const MODES = ["AUTOMATIQUE", "MANUEL"];
const UNITES = { MINUTES: 60 * 1000, HEURES: 60 * 60 * 1000, JOURS: 24 * 60 * 60 * 1000 };
const MIN_MS = 5 * 60 * 1000;
const MAX_MS = 365 * UNITES.JOURS;
const CACHE_MS = 5 * 60 * 1000;
const HISTORIQUE_MAX = 10;

function minutesMedias() {
  const m = Number(process.env.DSE_MEDIA_SYNCHRO_MINUTES ?? 15);
  return Number.isFinite(m) && m > 0 ? Math.max(5, Math.round(m)) : null;
}

const resumeMedias = (r) => r.ok === false ? r.erreur
  : `${r.fichiers || 0} fichier(s) analysé(s), ${(r.crees || []).length} fiche(s) créée(s), ${(r.erreurs || []).length} erreur(s)`;

const REGISTRE = [
  {
    code: "MEDIAS-BIBLIOTHEQUE", titre: "Médias : bibliothèque vers catalogue",
    description: "Crée en brouillon la fiche des fichiers déposés dans la bibliothèque des médias (ajout seulement).",
    defaut: () => minutesMedias() ? { mode: "AUTOMATIQUE", frequence: minutesMedias(), unite: "MINUTES" } : { mode: "MANUEL", frequence: 15, unite: "MINUTES" },
    lancer: async (acteur) => {
      const s = require("./medias-synchro");
      await s.synchroniser({ acteur });
      const d = s.etat().dernier || {};
      return { ok: d.ok !== false, resume: resumeMedias(d) };
    }
  },
  {
    code: "SAUVEGARDE-LISTES", titre: "Sauvegarde des listes dans le coffre-fort",
    description: "Copie chaque tableau de données modifié dans le coffre-fort (dossier des sauvegardes). Rien n'est supprimé.",
    defaut: () => ({ mode: "AUTOMATIQUE", frequence: 1, unite: "JOURS" }),
    dernierConnu: () => require("./sauvegarde-listes").dateDerniereSauvegarde(),
    lancer: async (acteur) => {
      const r = await require("./sauvegarde-listes").sauvegarder({ acteur });
      return { ok: !r.erreurs.length,
        resume: `${r.listes} liste(s), ${r.deposees} copiée(s), ${r.inchangees} inchangée(s), ${r.elements} fiche(s)${r.erreurs.length ? `, ${r.erreurs.length} erreur(s)` : ""}` };
    }
  },
  {
    code: "RECHARGEMENT-DONNEES", titre: "Rechargement des données affichées",
    description: "Vide les copies temporaires du moteur : les sites et le cockpit relisent immédiatement les données à jour.",
    defaut: () => ({ mode: "MANUEL", frequence: 1, unite: "HEURES" }),
    lancer: async () => {
      ecriture.invaliderCaches();
      try { require("./builder-source").viderCache(); } catch { /* cache optionnel */ }
      return { ok: true, resume: "Données rechargées." };
    }
  }
];

const etats = new Map(REGISTRE.map((s) => [s.code, { enCours: null, historique: [], dernierConnu: null }]));
let cache = null;

function periodeMs(r) {
  const ms = Number(r.frequence) * (UNITES[r.unite] || 0);
  return Number.isFinite(ms) && ms > 0 ? Math.min(MAX_MS, Math.max(MIN_MS, ms)) : null;
}

function valider({ mode, frequence, unite }) {
  if (!MODES.includes(mode)) return "Mode inconnu.";
  if (!UNITES[unite]) return "Unité inconnue.";
  const f = Number(frequence);
  if (!Number.isInteger(f) || f < 1) return "La fréquence doit être un nombre entier positif.";
  const ms = f * UNITES[unite];
  if (ms < MIN_MS) return "La fréquence minimale est de 5 minutes.";
  if (ms > MAX_MS) return "La fréquence maximale est de 365 jours.";
  return null;
}

async function colonnes(g, liste) {
  const cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id);
  const trouver = (nom) => cols.find((c) => cle(c.displayName) === cle(nom) || cle(c.name) === cle(nom))?.name || null;
  return { mode: trouver("MODE"), frequence: trouver("FREQUENCE"), unite: trouver("UNITE"),
    derniere: trouver("DERNIERE-EXECUTION"), resultat: trouver("DERNIER-RESULTAT"), description: trouver("DESCRIPTION") };
}

/* Lecture des reglages enregistres (cache court, invalide a chaque enregistrement). */
async function reglages(frais = false) {
  if (!frais && cache && cache.expire > Date.now()) return cache.valeur;
  const g = await ecriture.contexteGraph();
  const liste = dse.trouverListe(g.listes, [LISTE]);
  if (!liste) {
    cache = { expire: Date.now() + CACHE_MS, valeur: { disponible: false, lignes: new Map() } };
    return cache.valeur;
  }
  const c = await colonnes(g, liste);
  const items = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields&$top=200`);
  const lignes = new Map();
  for (const i of items) {
    const f = i.fields || {};
    const code = String(f.Title || "").trim().toUpperCase();
    if (!code || lignes.has(code)) continue;
    lignes.set(code, { itemId: String(i.id), mode: f[c.mode] || null, frequence: f[c.frequence] ?? null, unite: f[c.unite] || null,
      derniere: f[c.derniere] || null, resultat: f[c.resultat] || null });
  }
  cache = { expire: Date.now() + CACHE_MS, valeur: { disponible: true, lignes, listeId: liste.id, colonnes: c } };
  return cache.valeur;
}

function effectif(s, ligne) {
  const d = s.defaut();
  if (!ligne) return { ...d, enregistre: false };
  const r = { mode: ligne.mode || d.mode, frequence: Number(ligne.frequence) || d.frequence, unite: ligne.unite || d.unite };
  return valider(r) ? { ...d, enregistre: true, invalide: true } : { ...r, enregistre: true };
}

/* Ecrit le dernier passage dans la ligne existante (aucune ligne creee automatiquement). */
async function memoriserPassage(code, le, resume) {
  try {
    const r = await reglages(true);
    const ligne = r.lignes.get(code);
    if (!r.disponible || !ligne) return;
    const champs = {};
    if (r.colonnes.derniere) champs[r.colonnes.derniere] = le;
    if (r.colonnes.resultat) champs[r.colonnes.resultat] = String(resume || "").slice(0, 255);
    if (!Object.keys(champs).length) return;
    const g = await ecriture.contexteGraph();
    await dse.graphEcriture(g.token, "PATCH", `/sites/${g.siteGraphId}/lists/${r.listeId}/items/${ligne.itemId}/fields`, champs);
    cache = null;
  } catch (e) {
    console.error("[DSE synchro] memorisation", code, e.message);
  }
}

function lancer(code, acteur = "Synchronisation automatique") {
  const s = REGISTRE.find((x) => x.code === code);
  if (!s) return null;
  const etat = etats.get(code);
  if (etat.enCours) return etat.enCours;
  const debut = new Date();
  etat.enCours = (async () => {
    let r;
    try { r = await s.lancer(acteur); }
    catch (e) {
      console.error("[DSE synchro]", code, e.message);
      r = { ok: false, resume: e.refus ? e.message : "Synchronisation momentanément indisponible." };
    }
    const entree = { le: debut.toISOString(), fin: new Date().toISOString(), acteur, ok: r.ok, resume: r.resume };
    etat.historique.unshift(entree);
    etat.historique.length = Math.min(etat.historique.length, HISTORIQUE_MAX);
    etat.dernierConnu = entree.le;
    await memoriserPassage(code, entree.le, `${r.ok ? "OK" : "ERREUR"} - ${r.resume}`);
    return entree;
  })().finally(() => { etat.enCours = null; });
  return etat.enCours;
}

async function dernierPassage(s, ligne) {
  const etat = etats.get(s.code);
  const dates = [etat.dernierConnu, ligne?.derniere].filter(Boolean).map((d) => Date.parse(d)).filter(Number.isFinite);
  if (!dates.length && s.dernierConnu && !etat.lectureCoffre) {
    etat.lectureCoffre = true;
    try { const d = await s.dernierConnu(); if (d) etat.dernierConnu = d; } catch (e) { console.error("[DSE synchro] dernier", s.code, e.message); }
    if (etat.dernierConnu) dates.push(Date.parse(etat.dernierConnu));
  }
  return dates.length ? Math.max(...dates) : null;
}

async function verifier() {
  let r;
  try { r = await reglages(); } catch (e) { console.error("[DSE synchro] reglages", e.message); return; }
  for (const s of REGISTRE) {
    const e = effectif(s, r.lignes.get(s.code));
    if (e.mode !== "AUTOMATIQUE" || etats.get(s.code).enCours) continue;
    const periode = periodeMs(e);
    const dernier = await dernierPassage(s, r.lignes.get(s.code));
    if (periode && (dernier === null || dernier + periode <= Date.now())) lancer(s.code);
  }
}

let minuteur = null;
function demarrer() {
  if (minuteur || process.env.DSE_SYNCHRO_DESACTIVEE === "1") return null;
  setTimeout(() => verifier(), 2 * 60 * 1000).unref();
  minuteur = setInterval(() => verifier(), 60 * 1000);
  minuteur.unref();
  return minuteur;
}

async function vue() {
  let r = { disponible: false, lignes: new Map() };
  let erreurReglages = null;
  try { r = await reglages(); } catch (e) { erreurReglages = "Réglages momentanément illisibles : réglages par défaut appliqués."; console.error("[DSE synchro] vue", e.message); }
  const synchronisations = [];
  for (const s of REGISTRE) {
    const ligne = r.lignes.get(s.code);
    const e = effectif(s, ligne);
    const etat = etats.get(s.code);
    const derniere = etat.historique[0] || (ligne?.derniere ? { le: ligne.derniere, ok: !/^ERREUR/.test(ligne.resultat || ""), resume: ligne.resultat || "" } : null);
    const dernier = [etat.dernierConnu, ligne?.derniere].filter(Boolean).map(Date.parse).filter(Number.isFinite);
    const periode = periodeMs(e);
    synchronisations.push({
      code: s.code, titre: s.titre, description: s.description, mode: e.mode, frequence: e.frequence, unite: e.unite,
      enregistre: e.enregistre, invalide: Boolean(e.invalide), enCours: Boolean(etat.enCours), derniere,
      prochaine: e.mode === "AUTOMATIQUE" && periode ? new Date((dernier.length ? Math.max(...dernier) : Date.now()) + periode).toISOString() : null,
      historique: etat.historique
    });
  }
  return { reglagesDisponibles: r.disponible, erreurReglages, modes: MODES, unites: Object.keys(UNITES), synchronisations };
}

/* Enregistre un reglage : mise a jour de la ligne existante, sinon creation unique (controle de doublon par code). */
async function enregistrer({ code, mode, frequence, unite, acteur }) {
  const s = REGISTRE.find((x) => x.code === code);
  if (!s) return { refus: "Synchronisation inconnue." };
  const voulu = { mode: String(mode || "").toUpperCase(), frequence: Number(frequence), unite: String(unite || "").toUpperCase() };
  const erreur = valider(voulu);
  if (erreur) return { refus: erreur };
  const r = await reglages(true);
  if (!r.disponible) return { refus: "La liste des réglages est indisponible." };
  const c = r.colonnes;
  if (!c.mode || !c.frequence || !c.unite) return { refus: "La liste des réglages est incomplète." };
  const g = await ecriture.contexteGraph();
  const ligne = r.lignes.get(code);
  const ancien = ligne ? { mode: ligne.mode, frequence: ligne.frequence, unite: ligne.unite } : { ...s.defaut(), parDefaut: true };
  if (ligne && ancien.mode === voulu.mode && Number(ancien.frequence) === voulu.frequence && ancien.unite === voulu.unite) {
    return { deja: true, message: "Réglage déjà enregistré." };
  }
  const champs = { [c.mode]: voulu.mode, [c.frequence]: voulu.frequence, [c.unite]: voulu.unite };
  let itemId = ligne?.itemId;
  if (ligne) await dse.graphEcriture(g.token, "PATCH", `/sites/${g.siteGraphId}/lists/${r.listeId}/items/${ligne.itemId}/fields`, champs);
  else {
    if (c.description) champs[c.description] = s.description;
    const cree = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${r.listeId}/items`, { fields: { Title: code, ...champs } });
    itemId = cree?.id || null;
  }
  // Graph peut relire l'ancienne valeur quelques secondes : le cache garde directement la valeur ecrite.
  r.lignes.set(code, { ...(ligne || { derniere: null, resultat: null }), itemId: itemId ? String(itemId) : null, ...voulu });
  const j = await ecriture.journaliser(g, {
    cle: ecriture.hash(["synchro-reglage", code, ancien, voulu, Date.now()]), action: "Synchronisations : réglage",
    nom: `Réglage ${code} · ${voulu.mode === "AUTOMATIQUE" ? `toutes les ${voulu.frequence} ${voulu.unite.toLowerCase()}` : "manuel"}`,
    ancien, nouveau: voulu, notes: `Acteur : ${acteur} | Élément OBJ-SYNCHRO ${itemId || "?"}`, succes: true, contexte: { synchronisation: code }
  });
  return { message: "Réglage enregistré.", journal: { enregistre: j.ok } };
}

module.exports = { REGISTRE, lancer, vue, enregistrer, demarrer, verifier, _test: { valider, periodeMs, effectif, etats } };
