"use strict";

/*
 * Couche d'ecriture generique et securisee : Cockpit -> API -> SharePoint.
 *
 * Workflow : lecture actuelle -> validation serveur -> apercu (jeton signe) -> confirmation
 * -> nouveau controle des droits -> controle de concurrence -> ecriture -> relecture
 * -> journal OBJ-JRN -> invalidation des caches -> resultat.
 *
 * - Aucune suppression : seules les operations PATCH (modifier) et POST (ajouter) existent.
 * - Rien n'est accepte du navigateur hormis les valeurs saisies : liste, element, colonnes
 *   et site sont recalcules cote serveur, puis figes dans un jeton signe (HMAC) lie a l'utilisateur.
 * - Idempotence : une confirmation rejouee ne reecrit rien (cle d'idempotence + etat deja applique).
 * - Les noms techniques (listes, colonnes, ID) ne sont jamais renvoyes au navigateur.
 */

const crypto = require("crypto");
const dse = require("./dse");
const session = require("../auth/session");

const DUREE_JETON_S = 900;
const MAX_MULTILIGNE = 10000;
const JOURNAL_MAX = 30;

const executees = new Map();
const etatJournal = { dernier: null };
const journalLocal = [];

const hash = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const cleChamp = (nom) => `c${hash(["champ", nom]).slice(0, 10)}`;
const normaliserTexte = (v) => (v === undefined || v === null ? "" : String(v));

/* Libelles d'interface des colonnes de texte communes (aucun nom technique affiche). */
function libelleChamp(col) {
  if (col.name === "Title") return "Titre";
  const n = String(col.displayName || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (n === "NOTECOURTE") return "Texte court";
  if (n === "NOTELONGUE") return "Texte détaillé";
  const brut = String(col.displayName || "").replace(/^OBJ[-_ ]?/i, "").replace(/[-_]+/g, " ").trim().toLowerCase();
  return brut ? brut.charAt(0).toUpperCase() + brut.slice(1) : "Champ";
}

/*
 * Colonnes modifiables : texte, non systeme, non identifiant, non riche (HTML).
 * Deduites de la structure SharePoint reelle de la liste.
 */
function champsModifiables(colonnes) {
  return colonnes.filter((c) => c.text && !c.readOnly && !c.hidden &&
    !String(c.name).startsWith("_") && !/^(LinkTitle|File_x0020_Type)/.test(c.name) &&
    !/^ID[-_ ]/i.test(String(c.displayName || "")) && !/^ID[-_]/i.test(String(c.name)) && c.text.textType !== "richText")
    .map((c) => ({
      cle: cleChamp(c.name),
      nom: c.name,
      libelle: libelleChamp(c),
      multiligne: !!c.text.allowMultipleLines,
      max: c.text.allowMultipleLines ? MAX_MULTILIGNE : Number(c.text.maxLength) || 255
    }));
}

/* Validation serveur : types, longueur, caracteres de controle, retours ligne. */
function validerValeurs(champs, valeurs) {
  const erreurs = [];
  const propres = {};
  if (!valeurs || typeof valeurs !== "object" || Array.isArray(valeurs)) return { erreurs: ["Saisie invalide."], propres };
  const connus = new Map(champs.map((c) => [c.cle, c]));
  for (const cle of Object.keys(valeurs)) if (!connus.has(cle)) erreurs.push("Un champ inconnu a été transmis.");
  for (const [cle, champ] of connus) {
    if (!Object.hasOwn(valeurs, cle)) continue;
    const brut = valeurs[cle];
    if (typeof brut !== "string") { erreurs.push(`${champ.libelle} : valeur invalide.`); continue; }
    let v = brut.replace(/\r\n?/g, "\n");
    v = champ.multiligne ? v.replace(/[ \t]+$/gm, "").trim() : v.trim();
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(v)) { erreurs.push(`${champ.libelle} : caractères non autorisés.`); continue; }
    if (!champ.multiligne && /\n/.test(v)) { erreurs.push(`${champ.libelle} : une seule ligne est autorisée.`); continue; }
    if (v.length > champ.max) { erreurs.push(`${champ.libelle} : ${champ.max} caractères maximum.`); continue; }
    propres[champ.nom] = v;
  }
  return { erreurs: [...new Set(erreurs)], propres };
}

function differences(champs, avant, apres) {
  return champs
    .filter((c) => Object.hasOwn(apres, c.nom) && normaliserTexte(avant[c.nom]) !== apres[c.nom])
    .map((c) => ({ libelle: c.libelle, avant: normaliserTexte(avant[c.nom]), apres: apres[c.nom], nom: c.nom }));
}

const valeursDe = (fields, noms) => Object.fromEntries(noms.map((n) => [n, normaliserTexte(fields?.[n])]));

/* ---------------- Jeton de confirmation ---------------- */

/*
 * L'operation preparee reste cote serveur ; le navigateur ne recoit qu'un jeton signe
 * contenant une cle opaque liee a l'utilisateur (aucun nom de liste ni ID technique).
 */
const enAttente = new Map();
const enCours = new Set();

function emettreJeton(identite, operation) {
  const cle = crypto.randomUUID();
  const expire = Date.now() + DUREE_JETON_S * 1000;
  for (const [k, v] of enAttente) if (v.expire < Date.now()) enAttente.delete(k);
  enAttente.set(cle, { op: operation, expire, f: identite.fournisseur, sub: identite.sujet });
  const jeton = session.signer({ t: "dse-ecriture", f: identite.fournisseur, sub: identite.sujet, cle }, DUREE_JETON_S);
  return { jeton, cle };
}

function lireJeton(identite, jeton) {
  const d = session.verifier(String(jeton || ""));
  if (!d || d.t !== "dse-ecriture" || !d.cle) return { erreur: "Cette confirmation a expiré. Merci de recommencer." };
  if (d.f !== identite.fournisseur || d.sub !== identite.sujet) return { erreur: "Cette confirmation ne vous appartient pas." };
  if (executees.has(d.cle) || enCours.has(d.cle)) return { cle: d.cle, op: null };
  const e = enAttente.get(d.cle);
  if (!e || e.expire < Date.now() || e.f !== d.f || e.sub !== d.sub) return { erreur: "Cette confirmation a expiré. Merci de recommencer." };
  return { cle: d.cle, op: e.op };
}

/* ---------------- Acces SharePoint ---------------- */

async function contexteGraph() {
  const token = await dse.obtenirJetonGraph();
  const site = await dse.obtenirSiteGraph(token);
  const listes = await dse.collecter(token, `/sites/${site.id}/lists?$select=id,displayName,name`);
  return { token, siteGraphId: site.id, listes };
}

async function lireItemFrais(g, listId, itemId) {
  const r = await dse.graphSansCache(g.token, `/sites/${g.siteGraphId}/lists/${listId}/items/${encodeURIComponent(itemId)}?$expand=fields`);
  return r?.fields || {};
}

/* ---------------- Journal OBJ-JRN (texte uniquement : aucun Lookup OBJ-REF / OBJ-REL) ---------------- */

const tronquer = (v, n) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

async function journaliser(g, { cle, action, nom, ancien, nouveau, notes, succes }) {
  const liste = dse.trouverListe(g.listes, ["OBJ-JRN"]);
  const horodatage = new Date();
  const entree = {
    le: horodatage.toISOString(), action, nom, succes,
    ok: false, erreur: null
  };
  if (!liste) {
    entree.erreur = "Journal indisponible";
  } else {
    const champs = {
      Title: `DSE-COCKPIT-${horodatage.toISOString().replace(/\D/g, "").slice(0, 14)}-${cle.slice(0, 8)}`,
      DATEEVENEMENT: horodatage.toISOString(),
      ACTION: tronquer(action, 255),
      NOM: tronquer(nom, 255),
      CODE: cle,
      CLEIDEMPOTENCE: cle,
      ANCIENNEVALEUR: JSON.stringify(ancien),
      NOUVELLEVALEUR: JSON.stringify(nouveau),
      NOTES: notes,
      STATUTJRN: succes ? "SUCCÈS" : "ÉCHEC"
    };
    try {
      await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${liste.id}/items`, { fields: champs });
      entree.ok = true;
    } catch (e) {
      // STATUT-JRN peut refuser la valeur : l'entree est conservee sans ce champ plutot que perdue.
      try {
        delete champs.STATUTJRN;
        await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${liste.id}/items`, { fields: champs });
        entree.ok = true;
      } catch (e2) {
        entree.erreur = e2.message;
        console.error("[DSE ecriture] journal", e2.message, e2.detailGraph || "");
      }
    }
  }
  etatJournal.dernier = entree;
  journalLocal.unshift(entree);
  journalLocal.length = Math.min(journalLocal.length, JOURNAL_MAX);
  return entree;
}

/* ---------------- Invalidation des caches apres ecriture ---------------- */

function invaliderCaches() {
  dse.viderCacheGraph();
  for (const m of ["./catalogue-source", "./resume-sites", "./builder-source", "../auth/droits"]) {
    try { require(m).viderCache?.(); } catch { /* module absent : rien a vider */ }
  }
}

/* ---------------- Execution d'une operation confirmee ---------------- */

/*
 * op : { type: "modifier"|"ajouter", listId, itemId?, champs: {nom: valeur}, avant: hash,
 *        action, nom, notes, verifier?: {listId, filtre} }
 * revalider(op) : nouveau controle des droits au moment de la confirmation (obligatoire).
 */
async function executer({ identite, jeton, revalider, acteur }) {
  const lu = lireJeton(identite, jeton);
  if (lu.erreur) return { status: 400, erreur: lu.erreur };
  const { cle, op } = lu;
  if (executees.has(cle)) return { status: 200, ...executees.get(cle), deja: true };
  if (enCours.has(cle)) return { status: 409, erreur: "Cet enregistrement est déjà en cours." };
  enCours.add(cle);
  try {
    return await executerOperation({ cle, op, revalider, acteur });
  } finally {
    enCours.delete(cle);
  }
}

async function executerOperation({ cle, op, revalider, acteur }) {
  const refus = await revalider(op);
  if (refus) return { status: 403, erreur: refus };
  enAttente.delete(cle);

  const g = await contexteGraph();
  const noms = Object.keys(op.champs || {});
  let ancien = {};
  if (op.type === "modifier") {
    ancien = valeursDe(await lireItemFrais(g, op.listId, op.itemId), noms);
    if (hash(ancien) === hash(op.champs)) {
      const r = { succes: true, journal: null, message: "Cette modification est déjà appliquée." };
      executees.set(cle, r);
      return { status: 200, ...r, deja: true };
    }
    if (hash(ancien) !== op.avant) return { status: 409, erreur: "Les données ont été modifiées entre-temps. Merci de relire puis de recommencer." };
  } else if (op.type === "ajouter") {
    if (op.doublon && await op.doublon(g)) return { status: 409, erreur: "Cet élément existe déjà." };
  } else {
    return { status: 400, erreur: "Opération non autorisée." };
  }

  let relu;
  let itemId = op.itemId || null;
  try {
    if (op.type === "modifier") {
      await dse.graphEcriture(g.token, "PATCH", `/sites/${g.siteGraphId}/lists/${op.listId}/items/${encodeURIComponent(op.itemId)}/fields`, op.champs);
    } else {
      const cree = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${op.listId}/items`, { fields: op.champs });
      itemId = String(cree?.id || "");
    }
    relu = valeursDe(await lireItemFrais(g, op.listId, itemId), noms);
  } catch (e) {
    console.error("[DSE ecriture]", e.message, e.detailGraph || "");
    const journal = await journaliser(g, { cle, action: op.action, nom: op.nom, ancien, nouveau: op.champs, notes: `${op.notes} | Acteur : ${acteur} | Erreur : ${e.message}`, succes: false });
    return { status: 502, erreur: "L'enregistrement n'a pas pu être effectué. Aucune donnée n'a été modifiée ou la modification est incomplète.", journal: resumeJournal(journal) };
  }
  invaliderCaches();
  const conforme = noms.every((n) => normaliserTexte(relu[n]) === normaliserTexte(op.champs[n]));
  const journal = await journaliser(g, {
    cle, action: op.action, nom: op.nom, ancien, nouveau: relu,
    notes: `${op.notes} | Élément ${itemId} | Acteur : ${acteur} | Relecture ${conforme ? "conforme" : "NON conforme"}`,
    succes: conforme
  });
  const r = { succes: conforme, relecture: conforme ? "conforme" : "différente", journal: resumeJournal(journal) };
  executees.set(cle, r);
  if (executees.size > 500) executees.delete(executees.keys().next().value);
  return { status: conforme ? 200 : 502, ...r, ...(conforme ? {} : { erreur: "La relecture ne correspond pas à la valeur demandée." }) };
}

const resumeJournal = (j) => (j ? { enregistre: j.ok, le: j.le } : null);

function etatJournalisation() {
  return { dernier: etatJournal.dernier ? { ...etatJournal.dernier } : null, recentes: journalLocal.map((x) => ({ ...x })) };
}

module.exports = {
  champsModifiables, validerValeurs, differences, valeursDe, hash, emettreJeton, lireJeton,
  contexteGraph, lireItemFrais, executer, journaliser, invaliderCaches, etatJournalisation,
  _test: { libelleChamp, cleChamp, executees, enAttente }
};
