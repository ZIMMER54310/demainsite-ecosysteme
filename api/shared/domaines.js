"use strict";

// Lecture SharePoint (LECTURE SEULE) des domaines DSE et inspection de la configuration Nginx locale.
const fs = require("fs");
const path = require("path");
const dse = require("./dse");

const WEBROOT = process.env.DSE_WEBROOT || "/var/www/html";
const DOMAINE_VALIDE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const NGINX_DIRS = (process.env.DSE_NGINX_DIRS || "/etc/nginx/conf.d,/etc/nginx/sites-enabled").split(",");

async function lireDomainesSharePoint() {
  const token = await dse.obtenirJetonGraph();
  const site = await dse.obtenirSiteGraph(token);
  const listes = await dse.collecter(token, `/sites/${site.id}/lists?$select=id,displayName`);
  const liste = listes.find((l) => l.displayName === "OBJ-NOM DE DOMAINE");
  if (!liste) throw new Error("Liste OBJ-NOM DE DOMAINE introuvable");
  const items = await dse.collecter(token, `/sites/${site.id}/lists/${liste.id}/items?$expand=fields&$top=200`);
  const oui = (f, re) => {
    const k = Object.keys(f).find((x) => re.test(x) && x.endsWith("LookupId"));
    return k ? String(f[k]) === "1" : false;
  };
  return items
    .map((i) => ({
      id: i.id,
      domaine: dse.normaliserDomaine(i.fields.Title),
      actif: oui(i.fields, /^OBJ_x002d_ACTIF/),
      valide: oui(i.fields, /^OBJ_x002d_VALIDE/)
    }))
    .filter((d) => d.domaine);
}

// Retourne { noms:Set, fichiers:{domaine:[fichiers]} } des server_name Nginx (domaine normalise, sans www).
function lireNginx() {
  const noms = new Set();
  const fichiers = {};
  let lu = false;
  for (const dir of NGINX_DIRS) {
    let entrees;
    try { entrees = fs.readdirSync(dir); } catch (_) { continue; }
    lu = true;
    for (const f of entrees) {
      let txt;
      try { txt = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      for (const m of txt.matchAll(/^\s*server_name\s+([^;]+);/gm)) {
        for (const n of m[1].split(/\s+/)) {
          if (!n || n === "_" || n.includes("$")) continue;
          const d = dse.normaliserDomaine(n);
          noms.add(d);
          (fichiers[d] = fichiers[d] || new Set()).add(path.join(dir, f));
        }
      }
    }
  }
  return { lu, noms, fichiers };
}

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
        return 301 https://${d}$request_uri;
    }

    location / {
        root ${WEBROOT};
        index index.html;
        try_files $uri $uri/ =404;
    }
}
`;
}


// Selection des domaines a traiter. Les modes qui MODIFIENT exigent une cible explicite
// (--domaine=x) ; traiter tout le parc exige --tous ET un --domaine absent.
// Retourne { domaines } ou { erreur }.
function selectionner(domaines, { filtre, ecriture, tous }) {
  if (filtre !== undefined && filtre !== null) {
    const f = String(filtre).trim().toLowerCase();
    if (!DOMAINE_VALIDE.test(f)) return { erreur: `--domaine invalide : "${f}"` };
    const trouves = domaines.filter((d) => d.domaine === f);
    if (!trouves.length) return { erreur: `--domaine=${f} absent des domaines SharePoint actifs/valides` };
    if (tous) return { erreur: "--tous et --domaine sont incompatibles" };
    return { domaines: trouves };
  }
  if (ecriture && !tous) return { erreur: "Mode modification : --domaine=exemple.fr obligatoire (ou --tous explicite)" };
  return { domaines };
}

module.exports = { DOMAINE_VALIDE, confHttp, selectionner, WEBROOT, lireDomainesSharePoint, lireNginx, NGINX_DIRS };
