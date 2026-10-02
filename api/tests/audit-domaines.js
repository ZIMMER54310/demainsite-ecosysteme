"use strict";

// Audit LECTURE SEULE de tous les domaines DSE.
// Usage : node tests/audit-domaines.js [--json]
// Variables : DSE_API_BASE (defaut http://127.0.0.1:3000), DSE_VPS_IP (defaut 57.129.164.243),
//             DSE_NGINX_DIR (defaut /etc/nginx/sites-enabled), DSE_AUDIT_RESEAU=0 pour ignorer HTTP/HTTPS.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;
const dse = require("../shared/dse");

const API = process.env.DSE_API_BASE || "http://127.0.0.1:3000";
const VPS_IP = process.env.DSE_VPS_IP || "57.129.164.243";
const NGINX_DIR = process.env.DSE_NGINX_DIR || "/etc/nginx/sites-enabled";
const RESEAU = process.env.DSE_AUDIT_RESEAU !== "0";
const norm = (d) => dse.normaliserDomaine(d);

function domainesNginx() {
  const noms = new Set();
  try {
    for (const f of fs.readdirSync(NGINX_DIR)) {
      const txt = fs.readFileSync(path.join(NGINX_DIR, f), "utf8");
      for (const m of txt.matchAll(/^\s*server_name\s+([^;]+);/gm)) {
        m[1].split(/\s+/).filter((n) => n && n !== "_" && !n.includes("$")).forEach((n) => noms.add(norm(n)));
      }
    }
  } catch (e) {
    return { noms: null, erreur: e.code || e.message };
  }
  return { noms };
}

const cle = (fields, re) => Object.keys(fields).find((k) => re.test(k));
const lookupId = (fields, re) => {
  const k = Object.keys(fields).find((x) => re.test(x) && x.endsWith("LookupId"));
  return k ? String(fields[k]) : null;
};
const lookupIds = (fields, re) => {
  const k = Object.keys(fields).find((x) => re.test(x) && Array.isArray(fields[x]));
  return k ? fields[k].map((v) => String(v.LookupId)) : [];
};
const estOui = (fields, reActif) => lookupId(fields, reActif) === "1";

async function sonde(url) {
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    const loc = r.headers.get("location") || "";
    return { code: r.status, azure: /azure/i.test(loc) || /azure/i.test(r.headers.get("server") || ""), loc };
  } catch (e) {
    return { code: null, erreur: (e.cause && e.cause.code) || e.code || "ERR", azure: false };
  }
}

async function apiGet(chemin, domaine) {
  try {
    const r = await fetch(API + chemin, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    return { code: r.status, corps: await r.json().catch(() => null) };
  } catch (e) {
    return { code: null, erreur: e.code || e.message };
  }
}

(async () => {
  const token = await dse.obtenirJetonGraph();
  const site = await dse.obtenirSiteGraph(token);
  const listes = await dse.collecter(token, `/sites/${site.id}/lists?$select=id,displayName`);
  const lire = async (nom) => {
    const l = listes.find((x) => x.displayName === nom);
    if (!l) throw new Error(`Liste introuvable : ${nom}`);
    return dse.collecter(token, `/sites/${site.id}/lists/${l.id}/items?$expand=fields&$top=200`);
  };
  const [domaines, sites, pages] = await Promise.all([lire("OBJ-NOM DE DOMAINE"), lire("OBJ-SITE-PUBLIC"), lire("OBJ-PAGES-SITE")]);

  const reDomLookup = /^OBJ_x002d_NOM_x0020_DE_x0020_DOM(?!.*LookupId$)/;
  const reActif = /^(OBJ_x002d_)?ACTIF/;
  const reValide = /^OBJ_x002d_VALIDE/;
  const reSiteDansPage = /^OBJ_x002d_SITE/;

  const nginx = domainesNginx();
  const lignes = [];

  for (const d of domaines) {
    const nom = norm(d.fields.Title);
    const actif = estOui(d.fields, /^OBJ_x002d_ACTIF/);
    const valide = estOui(d.fields, reValide);
    const sitesLies = sites.filter((s) => lookupIds(s.fields, reDomLookup).includes(String(d.id)));
    const s = sitesLies[0] || null;
    const pagesSite = s ? pages.filter((p) => lookupId(p.fields, reSiteDansPage) === String(s.id)) : [];
    const pageOk = pagesSite.find((p) => estOui(p.fields, /^OBJ_x002d_ACTIF/) && estOui(p.fields, reValide) && String(p.fields.URL || "/").trim() === "/");
    lignes.push({
      domaine: nom, idDomaine: d.id, actif, valide,
      siteId: s ? s.id : null, siteNom: s ? s.fields.Title : null,
      siteActif: s ? estOui(s.fields, reActif) : null, siteValide: s ? estOui(s.fields, reValide) : null,
      page: pageOk ? pageOk.id : null,
      ovhNginx: nginx.noms ? nginx.noms.has(nom) : null,
      erreurs: []
    });
  }

  const actifs = lignes.filter((l) => l.actif && l.valide);
  for (const l of actifs) {
    if (RESEAU) {
      try { l.dns = (await dns.resolve4(l.domaine)).includes(VPS_IP); } catch (_) { l.dns = false; }
      const h = await sonde(`http://${l.domaine}/`);
      const hs = await sonde(`https://${l.domaine}/`);
      l.http = h.code; l.https = hs.code; l.azure = h.azure || hs.azure;
      l.httpsErreur = hs.erreur || null;
    }
    const r = await apiGet(`/api/v1/sites/par-domaine?domaine=${encodeURIComponent(l.domaine)}`);
    l.sharepoint = r.code === 200 && r.corps?.succes === true;
    l.siteApi = l.sharepoint ? String(r.corps.donnees.id) : null;

    if (l.ovhNginx === false) l.erreurs.push("domaine SharePoint sans configuration OVH (nginx)");
    if (RESEAU && l.dns === false) l.erreurs.push(`DNS ne pointe pas vers ${VPS_IP}`);
    if (!l.siteId) l.erreurs.push("aucun site associe");
    else if (!l.page) l.erreurs.push("site sans page d'accueil active/validee");
    if (l.siteId && l.siteApi !== String(l.siteId)) l.erreurs.push("API ne reconnait pas le domaine");
    if (l.azure) l.erreurs.push("redirection vers Azure");
  }

  const ovhSeul = nginx.noms ? [...nginx.noms].filter((n) => !domaines.some((d) => norm(d.fields.Title) === n)) : [];

  // Domaine inconnu : ne doit jamais renvoyer un site
  const inconnu = await apiGet("/api/v1/sites/par-domaine?domaine=domaine-inconnu-dse-audit.fr");
  const inconnuOk = inconnu.code === 404;

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ lignes, ovhSeul, inconnuOk }, null, 2));
  } else {
    const col = (v, n) => String(v === null || v === undefined ? "-" : v).padEnd(n);
    console.log("DOMAINE".padEnd(24) + "| " + ["OVH", "DNS", "HTTP", "HTTPS", "SHAREPOINT", "SITE", "PAGE", "RESULTAT"].map((x, i) => col(x, [4, 4, 5, 6, 11, 5, 5, 8][i])).join("| "));
    for (const l of lignes) {
      const test = l.actif && l.valide;
      const res = !test ? "IGNORE (inactif)" : l.erreurs.length ? "ERREUR" : "OK";
      console.log(col(l.domaine, 24) + "| " + [l.ovhNginx ? "oui" : "non", test ? (l.dns ? "oui" : "non") : "-", test ? l.http : "-", test ? (l.https ?? l.httpsErreur) : "-",
        test ? (l.sharepoint ? "oui" : "non") : "-", l.siteId, l.page, res].map((x, i) => col(x, [4, 4, 5, 6, 11, 5, 5, 8][i])).join("| "));
    }
    console.log("");
    for (const l of lignes) l.erreurs.forEach((e) => console.log(`ERREUR ${l.domaine} : ${e}`));
    ovhSeul.forEach((n) => console.log(`ERREUR ${n} : domaine OVH absent de SharePoint`));
    console.log(`Domaine inconnu -> ${inconnuOk ? "OK (404, aucun site)" : "ERREUR (statut " + inconnu.code + ")"}`);
    if (nginx.erreur) console.log(`Note : nginx non lisible (${nginx.erreur}), comparaison OVH ignoree.`);
  }
  const nbErreurs = lignes.reduce((n, l) => n + l.erreurs.length, 0) + ovhSeul.length + (inconnuOk ? 0 : 1);
  process.exit(nbErreurs ? 1 : 0);
})().catch((e) => { console.error("ECHEC audit :", e.message); process.exit(2); });
