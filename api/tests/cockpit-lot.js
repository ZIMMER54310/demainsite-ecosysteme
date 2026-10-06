"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
process.env.DSE_SESSION_SECRET = require("node:crypto").randomBytes(32).toString("hex");
const A = require("../auth/autorisations");
const E = require("../shared/experience-cockpit");
const C = require("../shared/constructeur");
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");

async function tester() {
  assert.equal(A.decisionPolitique({}, { interdite: true, demandable: true }, [], "2").demandable, false);
  assert.equal(A.decisionPolitique({}, { optionRequise: true }, [], "2").categorie, "configuration");
  const config = { clientCapacites: [{ clientId: "2", capaciteId: "4", siteId: "2" }] };
  assert.equal(A.decisionPolitique(config, { optionRequise: true, capaciteId: "4", demandable: true }, ["2"], "3").categorie, "option");
  assert.equal(A.decisionPolitique(config, { optionRequise: true, capaciteId: "4" }, ["2"], "2").autorise, true);
  assert.equal(E.etatsDepuis(null), null);
  assert.equal(E.etatsDepuis({ nom: "referentiel", cols: [], items: [] }).size, 0);
  const schemaEtat = { nom: "referentiel", cols: [
    { name: "enabled", displayName: "ACTIF", boolean: {} }, { name: "percent", displayName: "PROGRESSION", number: {} },
    ...["COULEUR", "LIBELLE-ACTION", "OPERATION-TECHNIQUE"].map((n) => ({ name: n, displayName: n, text: {} }))
  ], items: [{ id: "etat-technique", fields: { Title: "Libellé technique du référentiel", enabled: true, percent: 25 } }] };
  assert.equal(E.etatsDepuis(schemaEtat).get("etat-technique").progression, 25);
  assert.throws(() => E.etatsDepuis({ ...schemaEtat, items: [{ ...schemaEtat.items[0],
    fields: { ...schemaEtat.items[0].fields, percent: 101 } }] }), /0-100/);
  const progression = { etapes: [{ cle: "entete", etat: "termine" }, { cle: "publication", etat: "termine" }] };
  E.appliquerProgression(progression, { etat: "configuree", elements: { entetes: {
    "element-technique": E.etatsDepuis(schemaEtat).get("etat-technique")
  } } }, { entetes: [{ id: "element-technique", _fields: { Title: "Titre technique" },
    relations: { "OBJ-SITE-PUBLIC": { id: "site-technique" } } }] }, "site-technique", null);
  assert.equal(progression.progression, 63, "La progression exploite le pourcentage du référentiel, pas le nombre de statuts validés.");
  assert.equal(require("../shared/construction-confirmation").SENSIBLES.has("conteneur.publier"), true);

  const original = { graph: dse.graphSansCache, ecriture: dse.graphEcriture };
  let writes = 0, version = '"version-1"', fields = { Title: "Titre technique de test", Champ: "avant" };
  try {
    dse.graphSansCache = async () => ({ eTag: version, fields: { ...fields } });
    dse.graphEcriture = async (_t, methode, _url, valeurs, etag) => {
      assert.equal(methode, "PATCH"); assert.equal(etag, version);
      writes++; fields = { ...fields, ...valeurs }; version = '"version-2"';
    };
    const g = { token: "offline", siteGraphId: "offline", listes: [{ displayName: "liste-technique", id: "liste" }] };
    const apercu = new C.Ecrivain(g, { apercu: true });
    await apercu.maj("liste-technique", "2", { Champ: "apres" });
    assert.equal(writes, 0, "Un aperçu ne doit jamais écrire.");
    assert.equal(apercu.modifications[0].avant.Champ, "avant");
    const confirme = new C.Ecrivain(g, { attendus: apercu.modifications });
    await confirme.maj("liste-technique", "2", { Champ: "apres" });
    assert.equal(writes, 1);
    const obsolete = new C.Ecrivain(g, { attendus: apercu.modifications });
    await assert.rejects(obsolete.maj("liste-technique", "2", { Champ: "autre" }), /changé depuis/);
    await assert.rejects(confirme.maj("liste-technique", "3", { Champ: "autre" }), /nouvel élément/);
    assert.equal(writes, 1, "Confirmation obsolète ou hors aperçu : aucune écriture.");
  } finally {
    dse.graphSansCache = original.graph; dse.graphEcriture = original.ecriture;
  }
  const identite = { fournisseur: "offline", sujet: "technique" };
  const t = ecriture.emettreJeton(identite, { type: "construction" }).jeton;
  assert.equal(ecriture.consommerJeton({ ...identite, sujet: "autre" }, t), false);
  assert.equal(ecriture.consommerJeton(identite, t), true);
  assert.equal(ecriture.consommerJeton(identite, t), false);

  const ui = await import(pathToFileURL(path.join(__dirname, "../../modules/cockpit/constructeur.js")).href);
  const d = { operations: ["constructeur.entete.conteneur.modifier"],
    droits: { entete: { ecriture: true }, pages: { ecriture: true } }, site: {},
    entetes: [{ ref: "native", titre: "Titre source", pages: [], sections: 0, etat: { brouillon: true } }], footers: [], pages: [] };
  const html = ui.rendreConstructeur({}, d, { onglet: "entetes" });
  assert.ok(html.includes('data-c-action="proprietes"'));
  assert.ok(!html.includes('data-c-action="publier"'));
  assert.ok(!html.includes('data-c-creer="entete"'));
  assert.ok(!html.includes('data-c-action="dupliquer"'));
  assert.equal(ui.peutAction(d, "page", "conteneur.modifier"), false);
  assert.equal(ui.peutAction({ droits: d.droits, operationsInterdites: ["constructeur.entete.conteneur.modifier"] },
    "entete", "conteneur.modifier"), false, "Une interdiction source reste prioritaire en compatibilité.");
  const cockpitUI = await import(pathToFileURL(path.join(__dirname, "../../modules/cockpit/cockpit.js")).href);
  const accompagnement = cockpitUI.rendreAccompagnement({ texte: E.TEXTE_ACCOMPAGNEMENT, identites: [
    { type: "humain", libelle: "Identité source humaine", avatar: "/api/v1/media/1" },
    { type: "ia", libelle: "Identité source IA", avatar: "/api/v1/media/2" }
  ] });
  assert.ok(accompagnement.includes("L’IA vous aide, l’humain reste présent."));
  assert.ok(accompagnement.includes("/api/v1/media/1") && accompagnement.includes("/api/v1/media/2"));
  console.log("Cockpit lot : politiques, boutons atomiques, aperçu sans écriture, ETag, relecture et confirmation unique OK.");
  console.log("Tests unitaires hors réseau : aucune session OAuth simulée, aucune donnée SharePoint écrite.");
}

if (require.main === module) tester().catch((e) => { console.error(e.stack); process.exitCode = 1; });
module.exports = { tester };
