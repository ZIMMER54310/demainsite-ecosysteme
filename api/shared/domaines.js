"use strict";

// Lecture SharePoint (LECTURE SEULE) des domaines DSE et inspection de la configuration Nginx locale.
const fs = require("fs");
const path = require("path");
const dse = require("./dse");

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

module.exports = { lireDomainesSharePoint, lireNginx, NGINX_DIRS };
