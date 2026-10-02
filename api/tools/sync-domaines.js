"use strict";

// Synchronisation DSE : SharePoint (domaines actifs/valides) -> DNS OVH -> Nginx -> certificat HTTPS.
// LECTURE SEULE cote SharePoint. Par defaut : PLAN uniquement (rien n'est modifie).
//
//   node tools/sync-domaines.js                    plan complet
//   sudo node tools/sync-domaines.js --nginx       ecrit /etc/nginx/conf.d/dse-<domaine>.conf + reload
//   sudo node tools/sync-domaines.js --https       obtient les certificats (si DNS OK) via certbot
//   node tools/sync-domaines.js --dns              applique le DNS OVH (necessite OVH_APP_KEY/OVH_APP_SECRET/OVH_CONSUMER_KEY)
//   --domaine=exemple.fr                           limite a un domaine
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const dns = require("dns").promises;
const { execFileSync } = require("child_process");
const { lireDomainesSharePoint, lireNginx } = require("../shared/domaines");
const ovh = require("../shared/ovh");

const VPS_IP = process.env.DSE_VPS_IP || "57.129.164.243";
const WEBROOT = process.env.DSE_WEBROOT || "/var/www/html";
const arg = (n) => process.argv.includes(n);
const filtre = (process.argv.find((a) => a.startsWith("--domaine=")) || "").split("=")[1];
const DOMAINE_VALIDE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const fichierConf = (d) => `/etc/nginx/conf.d/dse-${d}.conf`;

function confHttp(d) {
  return `# Genere par DSE (tools/sync-domaines.js). Ne pas modifier a la main.
server {
    listen 80;
    listen [::]:80;
    server_name ${d} www.${d};

    location /api/v1/ {
        limit_req zone=dse_api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header x-ms-client-principal "";
        proxy_set_header x-ms-client-principal-id "";
        proxy_set_header x-ms-client-principal-name "";
        proxy_set_header x-ms-client-principal-idp "";
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }

    if ($host = www.${d}) {
        return 301 http://${d}$request_uri;
    }

    location / {
        root ${WEBROOT};
        index index.html;
        try_files $uri $uri/ =404;
    }
}
`;
}

async function dnsPointeVersVps(d) {
  try {
    const a = await dns.resolve4(d);
    if (!a.includes(VPS_IP)) return false;
    const w = await dns.resolve4("www." + d).catch(() => []);
    return w.includes(VPS_IP);
  } catch (_) { return false; }
}

const certificatExiste = (d, nginx) =>
  fs.existsSync(`/etc/letsencrypt/live/${d}/fullchain.pem`) ||
  [...(nginx.fichiers[d] || [])].some((f) => { try { return /ssl_certificate\s/.test(fs.readFileSync(f, "utf8")); } catch (_) { return false; } });

(async () => {
  const sp = (await lireDomainesSharePoint()).filter((d) => d.actif && d.valide && (!filtre || d.domaine === filtre));
  const nginx = lireNginx();
  const rapport = [];
  let rechargerNginx = false;

  for (const { domaine: d } of sp) {
    const r = { domaine: d, dns: "?", nginx: "?", https: "?", actions: [] };
    if (!DOMAINE_VALIDE.test(d)) { r.dns = r.nginx = r.https = "IGNORE (nom invalide)"; rapport.push(r); continue; }

    // DNS
    let dnsOk = await dnsPointeVersVps(d);
    r.dns = dnsOk ? "OK" : "A CONFIGURER";
    if (!dnsOk) {
      if (!ovh.configure()) r.actions.push(`DNS: configurer A ${d} -> ${VPS_IP} et CNAME www -> ${d}. (API OVH non configuree)`);
      else {
        try {
          if (!(await ovh.zoneExiste(d))) r.actions.push("DNS: zone absente du compte OVH (domaine gere ailleurs)");
          else {
            const plan = await ovh.planDns(d, VPS_IP);
            plan.forEach((a) => r.actions.push(`DNS OVH: ${a.op} ${a.type} ${a.sousDomaine || "@"} -> ${a.cible}`));
            if (arg("--dns") && plan.length) { await ovh.appliquerDns(d, plan); r.actions.push("DNS OVH: applique"); }
          }
        } catch (e) { r.actions.push(`DNS OVH: ${e.message}`); }
      }
    }

    // Nginx
    const dejaConf = nginx.noms.has(d);
    const gere = fs.existsSync(fichierConf(d));
    if (dejaConf) r.nginx = "OK";
    else {
      r.nginx = "A CREER";
      r.actions.push(`Nginx: creer ${fichierConf(d)}`);
      if (arg("--nginx")) {
        fs.writeFileSync(fichierConf(d), confHttp(d), { mode: 0o644 });
        rechargerNginx = true;
        r.nginx = "CREE";
      }
    }

    // HTTPS
    if (certificatExiste(d, nginx)) r.https = "OK";
    else if (!dnsOk) r.https = "EN ATTENTE DNS";
    else if (!(dejaConf || gere || arg("--nginx"))) r.https = "EN ATTENTE NGINX";
    else {
      r.https = "A OBTENIR";
      r.actions.push(`HTTPS: certbot --nginx -d ${d} -d www.${d}`);
    }
    rapport.push(r);
  }

  if (rechargerNginx) {
    execFileSync("nginx", ["-t"], { stdio: "inherit" });
    execFileSync("systemctl", ["reload", "nginx"], { stdio: "inherit" });
  }

  if (arg("--https")) {
    for (const r of rapport) {
      if (r.https !== "A OBTENIR" && !(r.https === "EN ATTENTE NGINX" && rechargerNginx)) continue;
      const args = ["--nginx", "-d", r.domaine, "-d", "www." + r.domaine, "--non-interactive", "--agree-tos", "--redirect"];
      if (process.env.DSE_CERTBOT_EMAIL) args.push("-m", process.env.DSE_CERTBOT_EMAIL);
      try { execFileSync("certbot", args, { stdio: "inherit" }); r.https = "OBTENU"; }
      catch (_) { r.https = "ECHEC certbot"; }
    }
  }

  const c = (v, n) => String(v).padEnd(n);
  console.log(`${c("DOMAINE", 24)}| ${c("DNS", 14)}| ${c("NGINX", 9)}| HTTPS`);
  for (const r of rapport) console.log(`${c(r.domaine, 24)}| ${c(r.dns, 14)}| ${c(r.nginx, 9)}| ${r.https}`);
  console.log("");
  for (const r of rapport) r.actions.forEach((a) => console.log(`[${r.domaine}] ${a}`));
  if (!arg("--dns") && !arg("--nginx") && !arg("--https")) console.log("\nMode PLAN : rien n'a ete modifie.");
})().catch((e) => { console.error("ECHEC sync :", e.message); process.exit(2); });
