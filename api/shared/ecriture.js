"use strict";

/*
 * Couche d'ecriture generique et securisee : Cockpit -> API -> SharePoint.
 *
 * Workflow : lecture actuelle -> validation serveur -> apercu (jeton signe) -> confirmation
 * -> nouveau controle des droits -> controle de concurrence -> ecriture -> relecture
 * -> invalidation des caches -> resultat.
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

const executees = new Map();
const journauxEnAttente = new Map();

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
    !/^ID[-_ ]/i.test(String(c.displayName || "")) && !/^(ID[-_]|ComplianceAssetId)/i.test(String(c.name)) && c.text.textType !== "richText")
    .map((c) => ({
      cle: cleChamp(c.name),
      nom: c.name,
      libelle: libelleChamp(c),
      obligatoire: !!c.required,
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
    if (champ.obligatoire && !v) { erreurs.push(`${champ.libelle} : valeur obligatoire.`); continue; }
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
const ressourcesEnCours = new Set();

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

async function lireItemFrais(g, listId, itemId, selectionChamps = null) {
  const expansion = selectionChamps ? `fields($select=${selectionChamps.join(",")})` : "fields";
  const r = await dse.graphSansCache(g.token, `/sites/${g.siteGraphId}/lists/${listId}/items/${encodeURIComponent(itemId)}?$expand=${expansion}`);
  return r?.fields || {};
}

async function collecterFrais(g, chemin) {
  const items = [];
  let suivant = chemin;
  for (let page = 0; suivant && page < 100; page++) {
    const r = await dse.graphSansCache(g.token, suivant);
    if (!Array.isArray(r.value)) throw new Error("Réponse de lecture des éléments invalide.");
    items.push(...r.value);
    suivant = r["@odata.nextLink"];
  }
  if (suivant) throw new Error("Lecture incomplète : limite de pagination atteinte.");
  return items;
}

/* Compatibilite des anciennes reponses API : aucune lecture/ecriture de journal SharePoint. */
async function etatStructureJournal() {
  return { disponible: true, desactive: true };
}

async function journaliser(_g, { action, succes }) {
  if (succes === false) console.warn("[DSE diagnostic]", String(action || "Opération refusée").slice(0, 255));
  return { ok: false, desactive: true };
}

/* ---------------- Invalidation des caches apres ecriture ---------------- */

function invaliderCaches() {
  dse.viderCacheGraph();
  for (const m of ["./catalogue-source", "./resume-sites", "./builder-source", "../auth/droits"]) {
    try { require(m).viderCache?.(); } catch (e) { console.error("[DSE ecriture] invalidation cache", m, e.message); }
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
  if (executees.has(cle)) {
    const resultat = executees.get(cle);
    const journal = journauxEnAttente.get(cle);
    if (journal) {
      if (enCours.has(cle)) return { status: 409, erreur: "Journalisation déjà en cours." };
      enCours.add(cle);
      try {
        resultat.journal = await require("./journal-comptes").enregistrer(await contexteGraph(), journal);
        resultat.succes = true;
        delete resultat.erreur;
        journauxEnAttente.delete(cle);
      } catch (e) {
        console.error("[DSE Comptes reprise journal]", e.message);
      } finally { enCours.delete(cle); }
    }
    return { status: resultat.succes ? 200 : 502, ...resultat, deja: true };
  }
  if (enCours.has(cle)) return { status: 409, erreur: "Cet enregistrement est déjà en cours." };
  const ressource = `${op.listId}:${op.journalComptes ? op.cleDoublon || op.itemId || cle : op.itemId || op.cleDoublon || cle}`;
  if (ressourcesEnCours.has(ressource)) return { status: 409, erreur: "Une modification de cet élément est déjà en cours." };
  enCours.add(cle);
  ressourcesEnCours.add(ressource);
  try {
    return await executerOperation({ cle, op, revalider, acteur });
  } finally {
    enCours.delete(cle);
    ressourcesEnCours.delete(ressource);
  }
}

async function executerOperation({ cle, op, revalider, acteur }) {
  const refus = await revalider(op);
  if (refus) {
    console.warn("[DSE ecriture] autorisation refusée");
    return { status: 403, erreur: refus };
  }
  enAttente.delete(cle);

  const g = await contexteGraph();
  if (op.verifierCible) {
    const refusCible = await op.verifierCible(g);
    if (refusCible) return { status: 409, erreur: refusCible };
  }
  const noms = Object.keys(op.champs || {});
  let ancien = {};
  let etag = null;
  if (op.type === "modifier") {
    const expansion = op.selectionChamps ? `fields($select=${op.selectionChamps.join(",")})` : "fields";
    const version = await dse.graphSansCache(g.token, `/sites/${g.siteGraphId}/lists/${op.listId}/items/${encodeURIComponent(op.itemId)}?$expand=${expansion}`);
    if (op.verifierVersion) {
      const refusVersion = op.verifierVersion(version?.fields || {});
      if (refusVersion) return { status: 409, erreur: refusVersion };
    }
    ancien = valeursDe(version?.fields, noms);
    etag = version?.eTag || version?.["@odata.etag"] || version?.fields?.["@odata.etag"] || null;
    if (!etag) return { status: 409, erreur: "La version de ces données n'a pas pu être vérifiée. Écriture refusée." };
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
      await dse.graphEcriture(g.token, "PATCH", `/sites/${g.siteGraphId}/lists/${op.listId}/items/${encodeURIComponent(op.itemId)}/fields`, op.champs, etag);
    } else {
      const cree = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${op.listId}/items`, { fields: op.champs });
      itemId = String(cree?.id || "");
    }
    relu = valeursDe(await lireItemFrais(g, op.listId, itemId, op.selectionChamps), noms);
  } catch (e) {
    console.error("[DSE ecriture]", e.message);
    if (e.status === 412 || e.statusCode === 412) return { status: 409, erreur: "Les données ont été modifiées entre-temps. Merci de les relire." };
    invaliderCaches();
    return { status: 502, erreur: "L'enregistrement ou sa vérification a échoué. Relisez les données avant de recommencer." };
  }
  invaliderCaches();
  const conforme = noms.every((n) => normaliserTexte(relu[n]) === normaliserTexte(op.champs[n]));
  const r = { succes: conforme, relecture: conforme ? "conforme" : "différente", journal: null };
  if (conforme && op.journalComptes) {
    const journal = { cle: `DSE-COMPTES-${cle}`, action: op.action, avant: ancien, apres: relu,
      contexte: { ...op.contexteJournal, itemId } };
    try {
      r.journal = await require("./journal-comptes").enregistrer(g, journal);
    } catch (e) {
      console.error("[DSE Comptes journal]", e.message);
      r.succes = false;
      r.enregistrementEffectue = true;
      r.erreur = "L'opération est enregistrée et relue, mais sa journalisation a échoué. Rejouer la même confirmation reprend uniquement le journal, sans réécrire les données.";
      journauxEnAttente.set(cle, journal);
    }
  }
  executees.set(cle, r);
  if (executees.size > 500) {
    const ancienne = executees.keys().next().value;
    executees.delete(ancienne);
    journauxEnAttente.delete(ancienne);
  }
  return { status: r.succes ? 200 : 502, ...r, ...(conforme ? {} : { erreur: "La relecture ne correspond pas à la valeur demandée." }) };
}

function etatJournalisation() {
  return { desactive: true, dernier: null, recentes: [] };
}

module.exports = {
  champsModifiables, validerValeurs, differences, valeursDe, hash, emettreJeton, lireJeton,
  contexteGraph, lireItemFrais, collecterFrais, executer, journaliser, invaliderCaches, etatJournalisation, etatStructureJournal,
  _test: { libelleChamp, cleChamp, executees, enAttente }
};
