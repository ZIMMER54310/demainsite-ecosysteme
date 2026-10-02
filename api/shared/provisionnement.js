"use strict";

// Briques communes des provisionneurs SharePoint DSE (idempotents, sans suppression ni renommage).
const fs = require("node:fs");
const path = require("node:path");
const dse = require("./dse");

const SAUVEGARDES = path.join(__dirname, "..", ".sauvegardes");

const cle = (n) => String(n ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/* ---------- Declaration du schema ---------- */

const T = (name) => ({ name, type: "text" });
const TL = (name) => ({ name, type: "note" });
const N = (name) => ({ name, type: "number" });
const B = (name) => ({ name, type: "bool" });
const U = (name) => ({ name, type: "text" });
const D = (name) => ({ name, type: "date" });
const L = (name, liste, multiple = false) => ({ name, type: "lookup", liste, multiple });

const ETAT = () => [L("OBJ-ACTIF", "OBJ-ACTIF"), L("OBJ-VALIDE", "OBJ-VALIDE")];
const ETAT_VEROUILLE = () => [...ETAT(), L("OBJ-VEROUILLE", "OBJ-VEROUILLE")];

// Colonnes equivalentes deja utilisees dans DSE : pas de doublon sous un autre nom.
const EQUIVALENTS = { "OBJ-ACTIF": ["ACTIF"], "OBJ-VALIDE": ["VALIDER", "VALIDE"], "OBJ-DEVISE": ["DEVISE"] };

/* ---------- Acces Graph (ecriture) ---------- */

async function appel(token, methode, chemin, corps) {
  const reponse = await fetch(`https://graph.microsoft.com/v1.0${chemin}`, {
    method: methode,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
    body: corps ? JSON.stringify(corps) : undefined
  });
  const texte = await reponse.text();
  let json = null;
  try { json = texte ? JSON.parse(texte) : null; } catch (_) { /* corps non JSON */ }

  if (!reponse.ok) {
    const e = new Error(`HTTP ${reponse.status} ${json?.error?.code || ""}`.trim());
    e.status = reponse.status;
    throw e;
  }
  return json;
}

function colonneGraph(c, ids) {
  const base = { name: c.name, indexed: false };
  switch (c.type) {
    case "text": return { ...base, text: {} };
    case "note": return { ...base, text: { allowMultipleLines: true, textType: "plain" } };
    case "number": return { ...base, number: {} };
    case "bool": return { ...base, boolean: {}, defaultValue: { value: "false" } };
    case "date": return { ...base, dateTime: { displayAs: "default", format: "dateOnly" } };
    case "lookup": return { ...base, lookup: { listId: ids[c.liste], columnName: "Title", allowMultipleValues: Boolean(c.multiple) } };
    default: throw new Error(`Type inconnu ${c.type}`);
  }
}

/* ---------- Etat existant + plan ---------- */

async function lireEtat(token, siteId, definitions) {
  const listes = await dse.collecter(token, `/sites/${siteId}/lists?$select=id,displayName`);
  const ids = Object.fromEntries(listes.map((l) => [l.displayName, l.id]));
  const colonnes = {};

  for (const def of definitions) {
    if (ids[def.nom]) {
      const c = await dse.chargerColonnesListe(token, siteId, ids[def.nom]);
      colonnes[def.nom] = c.map((x) => ({ name: x.name, displayName: x.displayName, lookup: x.lookup?.listId || null }));
    }
  }
  return { listes, ids, colonnes };
}

function colonneExiste(etat, liste, c) {
  const noms = [c.name, ...(EQUIVALENTS[c.name] || [])].map(cle);
  return (etat.colonnes[liste] || []).some((x) => noms.includes(cle(x.displayName)) || noms.includes(cle(x.name)));
}

function planifierListes(etat, definitions) {
  const actions = [];
  const aCreer = new Set(definitions.filter((d) => d.creer && !etat.ids[d.nom]).map((d) => d.nom));

  for (const def of definitions) {
    const existe = Boolean(etat.ids[def.nom]);
    if (!existe && def.creer) actions.push({ type: "liste", liste: def.nom });
    if (!existe && !def.creer) actions.push({ type: "erreur", liste: def.nom, message: "liste requise absente" });
  }
  for (const def of definitions) {
    for (const c of def.colonnes) {
      if (colonneExiste(etat, def.nom, c)) continue;
      const cibleOk = c.type !== "lookup" || etat.ids[c.liste] || aCreer.has(c.liste);
      if (!cibleOk) actions.push({ type: "erreur", liste: def.nom, message: `liste cible absente : ${c.liste}` });
      else actions.push({ type: "colonne", liste: def.nom, colonne: c });
    }
  }
  return actions;
}

function afficherPlan(actions) {
  for (const a of actions) {
    if (a.type === "liste") console.log(`PLAN creer liste ${a.liste}`);
    else if (a.type === "colonne") console.log(`PLAN ${a.liste} + ${a.colonne.name} (${a.colonne.type}${a.colonne.liste ? "->" + a.colonne.liste : ""}${a.colonne.multiple ? ", multiple" : ""})`);
    else console.log(`ERREUR ${a.liste} : ${a.message}`);
  }
  console.log(`PLAN total : ${actions.length} action(s)`);
}

function rolesDuJeton(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).roles || []; } catch (_) { return []; }
}

/* ---------- Application ---------- */

async function appliquerPlan(token, siteId, etat, definitions) {
  const ids = { ...etat.ids };
  const actions = planifierListes(etat, definitions);
  const erreurs = actions.filter((x) => x.type === "erreur");
  if (erreurs.length) throw new Error(`Plan invalide : ${erreurs.map((e) => `${e.liste} ${e.message}`).join("; ")}`);
  let creees = 0, colonnes = 0;

  for (const a of actions.filter((x) => x.type === "liste")) {
    console.log(`ACTION creer liste ${a.liste}`);
    const l = await appel(token, "POST", `/sites/${siteId}/lists`, { displayName: a.liste, list: { template: "genericList" } });
    ids[a.liste] = l.id;
    creees++;
  }

  // Toutes les listes existent : les lookups croises sont possibles.
  for (const a of actions.filter((x) => x.type === "colonne")) {
    console.log(`ACTION ${a.liste} + ${a.colonne.name}`);
    try {
      await appel(token, "POST", `/sites/${siteId}/lists/${ids[a.liste]}/columns`, colonneGraph(a.colonne, ids));
      colonnes++;
    } catch (e) {
      console.log(`ERREUR ${a.liste}.${a.colonne.name} : ${e.message}`);
      throw e;
    }
  }
  return { listes: creees, colonnes };
}

/* ---------- Elements ---------- */

async function elementsDe(token, siteId, listId) {
  return dse.collecter(token, `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=500`);
}

async function creerSiAbsent(token, siteId, listId, titre, champs, existants) {
  const trouve = existants.find((i) => cle(i.fields?.Title) === cle(titre));
  if (trouve) return trouve.id;
  console.log(`ACTION creer element « ${titre} »`);
  const r = await appel(token, "POST", `/sites/${siteId}/lists/${listId}/items`, { fields: { Title: titre, ...champs } });
  existants.push({ id: r.id, fields: { Title: titre } });
  return r.id;
}

function champLookup(etat, liste, nom) {
  const c = (etat.colonnes[liste] || []).find((x) => cle(x.displayName) === cle(nom));
  return c?.name;
}

// Nom interne reel d'une colonne (SharePoint encode "-" en "_x002d_"), cherche par libelle.
function nomInterne(etat, liste, nom) {
  const c = (etat.colonnes[liste] || []).find((x) => cle(x.displayName) === cle(nom) || cle(x.name) === cle(nom));
  return c?.name;
}

function sauvegarder(etat, prefixe = "schema") {
  fs.mkdirSync(SAUVEGARDES, { recursive: true });
  const fichier = path.join(SAUVEGARDES, `${prefixe}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(fichier, JSON.stringify({ ids: etat.ids, colonnes: etat.colonnes }, null, 2));
  return path.relative(path.join(__dirname, ".."), fichier);
}

async function contexteProvisionnement(mode) {
  const token = await dse.obtenirJetonGraph();
  const site = await dse.obtenirSiteGraph(token);
  const roles = rolesDuJeton(token);
  const large = roles.includes("Sites.Manage.All") || roles.includes("Sites.FullControl.All");
  console.log(`Droit large (Sites.Manage.All) : ${large ? "present" : "ABSENT"}`);
  return { token, site, large };
}

function lancer(principal, modes) {
  const mode = modes.find((m) => process.argv.includes(`--${m}`));
  if (!mode) { console.log(`Usage : ${modes.map((m) => "--" + m).join(" | ")}`); process.exit(1); }

  principal(mode)
    .then((code) => { console.log("FIN\nTERMINÉ"); process.exit(code); })
    .catch((e) => { console.log(`ERREUR ${e.message}\nFIN\nTERMINÉ (ECHEC)`); process.exit(1); });
}

module.exports = {
  cle, T, TL, N, B, U, D, L, ETAT, ETAT_VEROUILLE, EQUIVALENTS,
  appel, colonneGraph, lireEtat, colonneExiste, planifierListes, afficherPlan, rolesDuJeton,
  appliquerPlan, elementsDe, creerSiAbsent, champLookup, nomInterne, sauvegarder, contexteProvisionnement, lancer
};
