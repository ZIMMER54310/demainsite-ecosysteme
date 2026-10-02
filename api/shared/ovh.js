"use strict";

// Client minimal de l'API OVH (signature officielle). AUCUN secret n'est ecrit ni journalise.
// Variables attendues (non fournies dans le depot) :
//   OVH_ENDPOINT (defaut ovh-eu), OVH_APP_KEY, OVH_APP_SECRET, OVH_CONSUMER_KEY
// Droits OVH requis pour la cle : GET/POST/PUT sur /domain/zone/* et /domain/zone/*/refresh.
const crypto = require("crypto");

const ENDPOINTS = { "ovh-eu": "https://eu.api.ovh.com/1.0" };

function configure() {
  return Boolean(process.env.OVH_APP_KEY && process.env.OVH_APP_SECRET && process.env.OVH_CONSUMER_KEY);
}

async function appel(methode, chemin, corps) {
  if (!configure()) throw new Error("API OVH non configuree (OVH_APP_KEY / OVH_APP_SECRET / OVH_CONSUMER_KEY)");
  const base = ENDPOINTS[process.env.OVH_ENDPOINT || "ovh-eu"];
  if (!base) throw new Error("OVH_ENDPOINT inconnu");
  const url = base + chemin;
  const body = corps === undefined ? "" : JSON.stringify(corps);
  const ts = Math.round(Date.now() / 1000) + (await decalage(base));
  const signature = "$1$" + crypto.createHash("sha1")
    .update([process.env.OVH_APP_SECRET, process.env.OVH_CONSUMER_KEY, methode, url, body, ts].join("+"))
    .digest("hex");
  const r = await fetch(url, {
    method: methode,
    headers: {
      "Content-Type": "application/json",
      "X-Ovh-Application": process.env.OVH_APP_KEY,
      "X-Ovh-Consumer": process.env.OVH_CONSUMER_KEY,
      "X-Ovh-Timestamp": String(ts),
      "X-Ovh-Signature": signature
    },
    body: body || undefined,
    signal: AbortSignal.timeout(20000)
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`OVH ${methode} ${chemin} -> ${r.status}`);
  return texte ? JSON.parse(texte) : null;
}

let delta = null;
async function decalage(base) {
  if (delta === null) {
    const r = await fetch(base + "/auth/time", { signal: AbortSignal.timeout(10000) });
    delta = Math.round(Number(await r.text()) - Date.now() / 1000);
  }
  return delta;
}

// Zone DNS geree par OVH pour ce domaine, ou null.
async function zoneExiste(zone) {
  try { await appel("GET", `/domain/zone/${zone}`); return true; } catch (_) { return false; }
}

async function enregistrements(zone, type, sousDomaine) {
  const ids = await appel("GET", `/domain/zone/${zone}/record?fieldType=${type}&subDomain=${encodeURIComponent(sousDomaine)}`);
  const recs = [];
  for (const id of ids) recs.push(await appel("GET", `/domain/zone/${zone}/record/${id}`));
  return recs;
}

// Plan DNS : A apex -> ip ; www CNAME -> apex. Ne modifie rien.
async function planDns(zone, ip) {
  const actions = [];
  const apexA = await enregistrements(zone, "A", "");
  if (!apexA.length) actions.push({ op: "creer", type: "A", sousDomaine: "", cible: ip });
  else if (!(apexA.length === 1 && apexA[0].target === ip)) actions.push({ op: "remplacer", type: "A", sousDomaine: "", cible: ip, ids: apexA.map((r) => r.id) });
  const www = [...(await enregistrements(zone, "CNAME", "www")), ...(await enregistrements(zone, "A", "www"))];
  const cibleWww = `${zone}.`;
  if (!www.length) actions.push({ op: "creer", type: "CNAME", sousDomaine: "www", cible: cibleWww });
  else if (!(www.length === 1 && www[0].fieldType === "CNAME" && www[0].target === cibleWww)) actions.push({ op: "remplacer", type: "CNAME", sousDomaine: "www", cible: cibleWww, ids: www.map((r) => r.id) });
  return actions;
}

// Applique le plan. "remplacer" supprime UNIQUEMENT les anciens enregistrements A/CNAME de ce sous-domaine.
async function appliquerDns(zone, actions) {
  for (const a of actions) {
    for (const id of a.ids || []) await appel("DELETE", `/domain/zone/${zone}/record/${id}`);
    await appel("POST", `/domain/zone/${zone}/record`, { fieldType: a.type, subDomain: a.sousDomaine, target: a.cible, ttl: 300 });
  }
  if (actions.length) await appel("POST", `/domain/zone/${zone}/refresh`);
}

module.exports = { configure, zoneExiste, planDns, appliquerDns };
