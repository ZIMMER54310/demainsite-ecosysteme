"use strict";

const fs = require("node:fs");
const path = require("node:path");
const ecriture = require("./ecriture");
const dse = require("./dse");

const SENSIBLES = new Set(["conteneur.publier", "conteneur.desactiver", "page.affecter", "element.etat"]);

async function apercuPublic(g, modifications) {
  const sortie = [];
  for (const m of modifications) {
    const cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, m.listeId);
    for (const [nom, nouvelle] of Object.entries(m.apres)) {
      const col = cols.find((c) => (c.lookup ? `${c.name}LookupId` : c.name) === nom);
      if (!col) throw new Error("Champ de confirmation introuvable.");
      let actuel = m.avant[nom] ?? "", apres = nouvelle ?? "";
      if (col.lookup) {
        const items = await dse.chargerItemsListe(g.token, g.siteGraphId, col.lookup.listId);
        const texte = (id) => id === "" ? "Non renseigné" : items.find((i) => String(i.id) === String(id))?.fields?.Title;
        actuel = texte(actuel); apres = texte(apres);
        if (!actuel || !apres) throw new Error("Valeur de confirmation native introuvable.");
      }
      sortie.push({ element: m.titre, champ: col.displayName.replace(/^OBJ-/, "").replaceAll("-", " "),
        actuelle: String(actuel), nouvelle: String(apres) });
    }
  }
  return sortie;
}

function sauvegarder(cle, plan) {
  const dossier = path.join(__dirname, "..", ".sauvegardes", "construction");
  fs.mkdirSync(dossier, { recursive: true, mode: 0o700 });
  const fichier = path.join(dossier, `${ecriture.hash(cle)}.json`);
  const contenu = JSON.stringify(plan);
  if (fs.existsSync(fichier)) {
    if (fs.readFileSync(fichier, "utf8") !== contenu) throw new Error("Sauvegarde différente pour la même confirmation.");
  } else fs.writeFileSync(fichier, contenu, { mode: 0o600, flag: "wx" });
  return path.basename(fichier);
}

module.exports = { SENSIBLES, apercuPublic, sauvegarder };
