"use strict";

const fs = require("fs");
const path = require("path");

function numeroPublication(nombre) {
  if (!Number.isSafeInteger(nombre) || nombre < 0) throw new Error("Compteur de publication invalide.");
  const total = 20 * 100 + nombre;
  return `${10 + Math.floor(total / 10000)}.${String(Math.floor(total / 100) % 100).padStart(2, "0")}.${String(total % 100).padStart(2, "0")}`;
}

function versionner(racine, sha, numero = "10.20.00") {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("SHA de publication invalide.");
  if (!/^\d+\.\d{2}\.\d{2}$/.test(numero)) throw new Error("Numero de version invalide.");
  fs.writeFileSync(path.join(racine, "js/version.js"), `export const NUMERO_VERSION = "${numero}";\n`);
  const imports = {};
  function parcourir(dossier) {
    for (const entree of fs.readdirSync(path.join(racine, dossier), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relatif = `${dossier}/${entree.name}`;
      if (entree.isDirectory()) parcourir(relatif);
      else if (entree.isFile() && entree.name.endsWith(".js")) {
        imports[`/${relatif}`] = `/${relatif}?v=${sha}`;
      }
    }
  }
  for (const dossier of ["components", "js", "modules", "pages", "services"]) parcourir(dossier);
  const carte = `<script type="importmap" id="dse-version-imports">${JSON.stringify({ imports })}</script>`;
  for (const fichier of ["index.html"]) {
    const chemin = path.join(racine, fichier);
    let html = fs.readFileSync(chemin, "utf8");
    const meta = `<meta name="dse-version" content="${numero}">`;
    if (/<meta name="dse-version"[^>]*>/.test(html)) html = html.replace(/<meta name="dse-version"[^>]*>/, meta);
    else html = html.replace("</head>", `  ${meta}\n</head>`);
    const marqueur = /<script type="importmap" id="dse-version-imports">.*?<\/script>/s;
    if (marqueur.test(html)) html = html.replace(marqueur, carte);
    else html = html.replace(/(?=<script type="module")/, `${carte}\n  `);
    html = html.replace(/(<script type="module" src="[^"?]+)(?:\?[^"]*)?(")/g, `$1?v=${sha}$2`);
    html = html.replace(/(<link rel="stylesheet" href="[^"?]+)(?:\?[^"]*)?(")/g, `$1?v=${sha}$2`);
    if (!html.includes(carte) || !html.includes(`/js/app.js?v=${sha}`)) {
      throw new Error(`Bootstrap versionné manquant dans ${fichier}.`);
    }
    fs.writeFileSync(chemin, html);
  }
  return Object.keys(imports).length;
}

if (require.main === module) {
  try {
    const numero = process.argv[4] === undefined ? "10.20.00" : numeroPublication(Number(process.argv[4]));
    console.log(`${versionner(process.argv[2], process.argv[3], numero)} modules front versionnés (${numero}).`);
  } catch (err) {
    console.error("[DSE publication]", err.message);
    process.exitCode = 1;
  }
}

module.exports = { versionner, numeroPublication };
