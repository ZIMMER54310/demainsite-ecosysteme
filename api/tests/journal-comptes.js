"use strict";

const assert = require("node:assert/strict");
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const journal = require("../shared/journal-comptes");

const colonnes = [
  { name: "Title", displayName: "ID-JRN", required: true, indexed: true, enforceUniqueValues: true, text: {} },
  { name: "CODE", required: true, indexed: true, enforceUniqueValues: true, text: {} },
  { name: "NOM", required: true, text: {} },
  { name: "ACTION", text: {} },
  { name: "DATEEVENEMENT", required: true, dateTime: {} },
  { name: "CLEIDEMPOTENCE", indexed: true, enforceUniqueValues: true, text: {} },
  { name: "STATUTJRN", required: true, choice: { choices: ["DÉBUT", "SUCCÈS", "ÉCHEC", "REFUS", "FIN"] } },
  { name: "NOUVELLEVALEUR", text: {} },
  { name: "ANCIENNEVALEUR", text: {} },
  { name: "ANOMALIE", required: true, boolean: {} },
  { name: "ANOMALIEDETECTEE", boolean: {} }
];

const liste = { id: "journal-id", displayName: "OBJ-JRN" };
const g = { token: "test", siteGraphId: "site-id", listes: [liste] };
const lignes = new Map();
let prochainId = 1;
const originaux = new Map();
const remplacer = (objet, nom, valeur) => {
  originaux.set(`${objet === dse ? "dse" : "ecriture"}:${nom}`, objet[nom]);
  objet[nom] = valeur;
};

(async () => {
  remplacer(dse, "collecter", async () => colonnes);
  remplacer(dse, "graphEcriture", async (_token, methode, chemin, corps) => {
    if (methode === "POST") {
      const id = String(prochainId++);
      lignes.set(id, { id, fields: { ...corps.fields }, eTag: `"etag-${id}-1"` });
      return { id };
    }
    const match = chemin.match(/\/items\/(\d+)\/fields$/);
    assert.ok(match, "mise à jour d'un élément OBJ-JRN");
    const ligne = lignes.get(match[1]);
    Object.assign(ligne.fields, corps);
    const version = Number(ligne.eTag.match(/-(\d+)"/)[1]) + 1;
    ligne.eTag = `"etag-${ligne.id}-${version}"`;
    return {};
  });
  remplacer(dse, "graphSansCache", async (_token, chemin) => {
    const match = chemin.match(/\/items\/(\d+)\?/);
    assert.ok(match, "relecture d'un élément OBJ-JRN");
    const ligne = lignes.get(match[1]);
    return { id: ligne.id, eTag: ligne.eTag, fields: { ...ligne.fields } };
  });
  remplacer(ecriture, "collecterFrais", async (_g, chemin) => {
    const cle = decodeURIComponent(chemin).match(/fields\/CLEIDEMPOTENCE eq '([^']+)'/)?.[1];
    return [...lignes.values()].filter((ligne) => !cle || ligne.fields.CLEIDEMPOTENCE === cle);
  });

  try {
    const entree = await journal.commencer(g, {
      cle: "operation-success-1", action: "site.creer", domaine: "SITE",
      nom: "Création de site", avant: null, apres: { Title: "DemainSite" },
      contexte: { siteId: "1" }
    });
    const debut = lignes.get(entree.itemId);
    assert.match(debut.fields.Title, /^JRN-OVH-\d{14}-[A-F0-9]{16}$/);
    assert.match(debut.fields.CODE, /^OVH\.SITE\.SITE-CREER\.[A-F0-9]{16}$/);
    assert.equal(debut.fields.STATUTJRN, "DÉBUT");
    assert.equal(debut.fields.ANOMALIE, false);
    const resultat = await journal.terminer(g, entree, {
      statut: "SUCCÈS", avant: null, apres: { id: "native-1" }, contexte: { siteId: "1" }
    });
    assert.equal(resultat.statut, "FIN");
    assert.equal(debut.fields.STATUTJRN, "FIN");
    assert.equal(JSON.parse(debut.fields.NOUVELLEVALEUR).etat, "SUCCÈS");
    assert.equal(debut.fields.ANOMALIE, false);

    const echec = await journal.commencer(g, { cle: "operation-failure-1", action: "produits.creer" });
    const ligneEchec = lignes.get(echec.itemId);
    await journal.terminer(g, echec, { statut: "ÉCHEC", anomalie: true, erreur: "Échec simulé" });
    assert.equal(ligneEchec.fields.STATUTJRN, "FIN");
    assert.equal(ligneEchec.fields.ANOMALIE, true);
    assert.equal(JSON.parse(ligneEchec.fields.NOUVELLEVALEUR).etat, "ÉCHEC");

    const refus = await journal.commencer(g, { cle: "operation-refusal-1", action: "decision-client.valider" });
    const ligneRefus = lignes.get(refus.itemId);
    await journal.terminer(g, refus, { statut: "REFUS", contexte: { refusHumain: true } });
    assert.equal(ligneRefus.fields.STATUTJRN, "FIN");
    assert.equal(JSON.parse(ligneRefus.fields.NOUVELLEVALEUR).etat, "REFUS");

    const nombreAvantDoublon = lignes.size;
    await assert.rejects(() => journal.commencer(g, { cle: "operation-success-1", action: "site.creer" }),
      /clé d'idempotence existe déjà/);
    assert.equal(lignes.size, nombreAvantDoublon, "une clé déjà journalisée bloque toute nouvelle entrée");
  } finally {
    for (const [cle, valeur] of originaux) {
      const [module, nom] = cle.split(":");
      (module === "dse" ? dse : ecriture)[nom] = valeur;
    }
  }
  console.log("OBJ-JRN : DÉBUT → SUCCÈS/ÉCHEC/REFUS → FIN, relecture et idempotence OK");
})().catch((erreur) => {
  console.error(erreur);
  process.exitCode = 1;
});
