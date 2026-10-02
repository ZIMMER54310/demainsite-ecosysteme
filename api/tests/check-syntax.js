"use strict";

// Verifie la syntaxe de tous les fichiers JS reellement utilises (API + front).
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const racine = path.resolve(__dirname, "..", "..");
const ignores = new Set(["node_modules", ".git", ".vscode", "deploy"]);

function lister(dossier) {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = path.join(dossier, e.name);
    if (e.isDirectory()) return ignores.has(e.name) ? [] : lister(chemin);
    return e.name.endsWith(".js") ? [chemin] : [];
  });
}

let erreurs = 0;
const fichiers = lister(racine);

for (const fichier of fichiers) {
  try {
    execFileSync(process.execPath, ["--check", fichier], { stdio: "pipe" });
  } catch (e) {
    erreurs++;
    console.error(`ECHEC ${path.relative(racine, fichier)}\n${e.stderr}`);
  }
}

console.log(`${fichiers.length} fichiers JS verifies, ${erreurs} erreur(s).`);
process.exit(erreurs ? 1 : 0);
