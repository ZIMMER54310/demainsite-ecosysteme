"use strict";

const dse = require("./dse");
const ecriture = require("./ecriture");

async function enregistrer(g, { cle, action, avant, apres, contexte }) {
  const liste = dse.trouverListe(g.listes, "OBJ-JRN");
  if (!liste) throw new Error("OBJ-JRN indisponible : journalisation refusée.");
  const cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id);
  const champ = (nom, type) => {
    const c = cols.find((c) => c.displayName === nom && !c.hidden && !c.readOnly && c[type]);
    if (!c) throw new Error(`OBJ-JRN : colonne ${nom} exploitable manquante.`);
    return c.name;
  };
  const C = { title: champ("ID-JRN", "text"), cle: champ("CLÉ-IDEMPOTENCE", "text"),
    action: champ("ACTION", "text"), avant: champ("ANCIENNE-VALEUR", "text"),
    apres: champ("NOUVELLE-VALEUR", "text"), notes: champ("NOTES", "text"),
    date: champ("DATE-EVENEMENT", "dateTime") };
  const items = await ecriture.collecterFrais(g,
    `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields($select=${C.cle},${C.apres})&$top=200`);
  const existants = items.filter((i) => i.fields?.[C.cle] === cle);
  if (existants.length > 1) throw new Error("OBJ-JRN : clé d'idempotence dupliquée.");
  const nouveau = JSON.stringify({ apres, contexte });
  if (existants.length === 1) {
    if (existants[0].fields[C.apres] !== nouveau) throw new Error("OBJ-JRN : opération différente pour la même clé.");
    return { id: String(existants[0].id), relecture: "conforme", deja: true };
  }
  const champs = { [C.title]: action.slice(0, 255), [C.cle]: cle, [C.action]: action.slice(0, 255),
    [C.avant]: JSON.stringify(avant), [C.apres]: nouveau, [C.date]: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    [C.notes]: "Opération DSE réussie et relue. Relations par ID SharePoint natifs ; aucune suppression." };
  const item = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${liste.id}/items`, { fields: champs });
  const relu = await ecriture.lireItemFrais(g, liste.id, item.id, Object.keys(champs));
  if (!Object.entries(champs).every(([c, v]) => c === C.date
    ? Date.parse(relu[c]) === Date.parse(v) : String(relu[c]) === String(v))) {
    throw new Error("OBJ-JRN : relecture de l'opération différente.");
  }
  return { id: String(item.id), relecture: "conforme" };
}

module.exports = { enregistrer };
