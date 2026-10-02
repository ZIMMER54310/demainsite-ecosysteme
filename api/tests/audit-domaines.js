"use strict";

// Audit LECTURE SEULE de tous les domaines DSE (SharePoint -> OVH/DNS -> Nginx -> HTTPS -> site).
// Usage : npm run audit:domaines [-- --json]
// Variables : DSE_API_BASE (defaut http://127.0.0.1:3000), DSE_VPS_IP (defaut 57.129.164.243),
//             DSE_NGINX_DIRS (defaut /etc/nginx/conf.d,/etc/nginx/sites-enabled)
// Resultats : OK | CONSTRUCTION | ERREUR DNS | ERREUR NGINX | ERREUR HTTPS | ERREUR SHAREPOINT | DOMAINE INCONNU
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const dns = require("dns").promises;
const dse = require("../shared/dse");
const { lireDomainesSharePoint, lireNginx } = require("../shared/domaines");

const API = process.env.DSE_API_BASE || "http://127.0.0.1:3000";
const VPS_IP = process.env.DSE_VPS_IP || "57.129.164.243";

async function apiGet(chemin) {
  try {
    const r = await fetch(API + chemin, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    return { code: r.status, corps: await r.json().catch(() => null) };
  } catch (e) { return { code: null }; }
}

async function sonde(url) {
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
    const loc = r.headers.get("location") || "";
    return { code: r.status, azure: /azure/i.test(loc) };
  } catch (e) { return { code: null, erreur: (e.cause && e.cause.code) || "ERR", azure: false }; }
}

async function verifier(d) {
  const l = { domaine: d.domaine, dns: "-", http: "-", https: "-", sharepoint: "-", site: "-", page: "-", resultat: "", detail: "" };
  const sp = await apiGet(`/api/v1/sites/par-domaine?domaine=${encodeURIComponent(d.domaine)}`);
  l.sharepoint = sp.code === 200 ? "oui" : "non";
  const donnees = sp.corps && sp.corps.donnees;
  if (sp.code === 200 && donnees) { l.site = donnees.id || "-"; l.page = donnees.etat === "normal" ? "oui" : "non"; }

  let dnsVps = false;
  try { dnsVps = (await dns.resolve4(d.domaine)).includes(VPS_IP); } catch (_) {}
  l.dns = dnsVps ? "oui" : "non";
  const h = await sonde(`http://${d.domaine}/`);
  const hs = await sonde(`https://${d.domaine}/`);
  l.http = h.code === null ? "-" : h.code;
  l.https = hs.code === null ? hs.erreur : hs.code;
  const azure = h.azure || hs.azure;

  if (sp.code !== 200) { l.resultat = "ERREUR SHAREPOINT"; l.detail = "domaine non resolu par l'API"; }
  else if (!dnsVps) { l.resultat = "ERREUR DNS"; l.detail = `ne pointe pas vers ${VPS_IP}`; }
  else if (!d.nginx) { l.resultat = "ERREUR NGINX"; l.detail = "server_name absent"; }
  else if (hs.code === null || hs.code >= 400 || azure) { l.resultat = "ERREUR HTTPS"; l.detail = azure ? "redirection Azure" : "HTTPS indisponible"; }
  else if (donnees.etat !== "normal") l.resultat = "CONSTRUCTION";
  else l.resultat = "OK";
  return l;
}

(async () => {
  const domaines = await lireDomainesSharePoint();
  const nginx = lireNginx();
  const actifs = domaines.filter((d) => d.actif && d.valide).map((d) => ({ ...d, nginx: nginx.noms.has(d.domaine) }));
  const lignes = [];
  for (const d of actifs) lignes.push(await verifier(d));

  const connus = new Set(domaines.map((d) => d.domaine));
  const inconnusNginx = [...nginx.noms].filter((n) => !connus.has(n));
  for (const n of inconnusNginx) lignes.push({ domaine: n, dns: "-", http: "-", https: "-", sharepoint: "non", site: "-", page: "-", resultat: "DOMAINE INCONNU", detail: "present dans Nginx, absent de SharePoint" });

  const inconnu = await apiGet("/api/v1/sites/par-domaine?domaine=domaine-inconnu-dse-audit.fr");
  const inconnuOk = inconnu.code === 404;

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ lignes, inconnuOk }, null, 2));
  } else {
    const c = (v, n) => String(v).padEnd(n);
    const W = [24, 5, 5, 6, 11, 5, 5];
    console.log(["DOMAINE", "DNS", "HTTP", "HTTPS", "SHAREPOINT", "SITE", "PAGE", "RESULTAT"].map((x, i) => c(x, W[i] || 0)).join("| "));
    for (const l of lignes) console.log([l.domaine, l.dns, l.http, l.https, l.sharepoint, l.site, l.page, l.resultat].map((x, i) => c(x, W[i] || 0)).join("| "));
    console.log("");
    for (const l of lignes) if (l.detail) console.log(`${l.resultat} ${l.domaine} : ${l.detail}`);
    console.log(`Hostname inconnu -> ${inconnuOk ? "404, aucun site affiche (OK)" : "ERREUR statut " + inconnu.code}`);
    const n = (r) => lignes.filter((l) => l.resultat === r).length;
    console.log(`\nSynthese : OK=${n("OK")} CONSTRUCTION=${n("CONSTRUCTION")} ERREUR DNS=${n("ERREUR DNS")} ERREUR NGINX=${n("ERREUR NGINX")} ERREUR HTTPS=${n("ERREUR HTTPS")} ERREUR SHAREPOINT=${n("ERREUR SHAREPOINT")} DOMAINE INCONNU=${n("DOMAINE INCONNU")}`);
  }
  const bloquant = lignes.some((l) => l.resultat.startsWith("ERREUR") || l.resultat === "DOMAINE INCONNU") || !inconnuOk;
  process.exit(bloquant ? 1 : 0);
})().catch((e) => { console.error("ECHEC audit :", e.message); process.exit(2); });
