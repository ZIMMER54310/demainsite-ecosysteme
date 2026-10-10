"use strict";

require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env"), quiet: true });
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");

async function provisionner(appliquer) {
  const g = await ecriture.contexteGraph();
  const operation = dse.trouverListe(g.listes, "OBJ-DROIT-OPERATION");
  if (!operation) throw new Error("Catalogue des droits absent.");
  const definitions = [
    ...["OBJ-ROLE-CAPACITE", "OBJ-UTILISATEUR-PERMISSION"].map((nom) => ({ nom,
      colonne: { name: "DroitOperation", displayName: "OBJ-DROIT-OPERATION", required: false,
        lookup: { listId: operation.id, columnName: "Title", allowMultipleValues: false } } })),
    { nom: "OBJ-ROLE-CAPACITE", colonne: { name: "Autorisation", displayName: "AUTORISATION", required: false, boolean: {} } },
    { nom: "OBJ-DROIT-OPERATION", colonne: { name: "IndividuelRequis", displayName: "INDIVIDUEL-REQUIS", required: false, boolean: {} } }
  ];
  for (const { nom, colonne } of definitions) {
    const liste = dse.trouverListe(g.listes, nom);
    if (!liste) throw new Error(`Liste absente : ${nom}.`);
    const verifier = (cols) => {
      const cs = cols.filter((c) => c.displayName === colonne.displayName);
      if (cs.length > 1) throw new Error(`${nom} : colonne dupliquée.`);
      const c = cs[0];
      if (c && (c.required || c.readOnly || c.hidden || (colonne.boolean ? !c.boolean :
        !c.lookup || c.lookup.allowMultipleValues || c.lookup.listId.toLowerCase() !== operation.id.toLowerCase()))) {
        throw new Error(`${nom}/${colonne.displayName} : colonne existante incompatible.`);
      }
      return c;
    };
    if (verifier(await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id))) {
      console.log(`Conforme : ${nom}/${colonne.displayName}`);
      continue;
    }
    if (!appliquer) { console.log(`À créer : ${nom}/${colonne.displayName}`); continue; }
    await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${liste.id}/columns`, colonne);
    dse.viderCacheGraph();
    if (!verifier(await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id))) throw new Error("Relecture de colonne incomplète.");
    console.log(`Créée et relue : ${nom}/${colonne.displayName}`);
  }
  console.log("Aucun élément, rôle, permission existante ou affectation modifié.");
}

if (require.main === module) provisionner(process.argv.includes("--apply")).catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
module.exports = { provisionner };
