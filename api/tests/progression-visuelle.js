"use strict";

const assert = require("node:assert/strict");
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const progression = require("../shared/progression-visuelle");
const cockpit = require("../shared/cockpit");

const colonnes = [
  { name: "_ColorHex", displayName: "Couleur", text: {} },
  { name: "Title", displayName: "LIBELLE", text: {} },
  { name: "PMIN", displayName: "POURCENTAGE-MIN", number: {} },
  { name: "PMAX", displayName: "POURCENTAGE-MAX", number: {} },
  { name: "COULEUR", displayName: "COULEUR", text: {} },
  { name: "ORDRE", displayName: "ORDRE", number: {} },
  { name: "ACTIF", displayName: "ACTIF", boolean: {} },
  { name: "DESCRIPTION", displayName: "DESCRIPTION", text: {} }
];
const item = (id, min, max, ordre, couleur, extra = {}) => ({
  id, eTag: `"${id},1"`, fields: {
    Title: `Libellé ${id}`, PMIN: min, PMAX: max, ORDRE: ordre, COULEUR: couleur, ACTIF: true, ...extra
  }
});

(async () => {
  assert.equal(progression.structureExacte(colonnes), true);
  assert.equal(progression.structureExacte(colonnes.filter((c) => c.name !== "COULEUR")), false,
    "la métadonnée Couleur SharePoint n'est pas une configuration métier");
  const items = [item("20", 0, 63.5, 2, "#345678"), item("10", 63.5, 100, 1, "#AbCdEf"),
    item("30", -1, 101, 0, "invalide", { ACTIF: false })];
  const regles = progression.reglesDepuis(items, colonnes);
  assert.deepEqual(regles.map((r) => r.id), ["10", "20"]);
  const configuration = { etat: "configuree", regles };
  assert.equal(progression.pourcentage(configuration, 0).couleur, "#345678");
  assert.equal(progression.pourcentage(configuration, 63.5).libelle, "Libellé 10",
    "bornes inclusives, priorité ORDRE croissante");
  assert.equal(progression.pourcentage(configuration, 100).couleur, "#AbCdEf");
  assert.equal(progression.pourcentage(configuration, 63.4).couleur, "#345678");
  assert.equal(progression.pourcentage(configuration, null).couleur, null);
  assert.ok(progression.pourcentage({ regles: [] }, 12).message);
  assert.equal(progression.pourcentage({ regles: [regles[0]] }, 12).couleur, null, "aucune couleur inventée pour une plage absente");
  for (const fields of [{ PMIN: null }, { PMAX: "100" }, { ORDRE: null }, { PMIN: 101 }, { PMAX: -1 },
    { COULEUR: "red; background:url(externe)" }, { Title: "" }, { ACTIF: "true" }]) {
    assert.throws(() => progression.reglesDepuis([item("40", 0, 100, 1, "#123456", fields)], colonnes));
  }
  const filtrage = cockpit.filtrerSites([{ nom: "A", progression: 77 }, { nom: "B", progression: 21 }],
    { progression: "10" }, progression.tranches(configuration));
  assert.equal(filtrage.total, 1);
  assert.equal(filtrage.elements[0].nom, "A");
  assert.deepEqual(filtrage.options.progressions.map((r) => r.libelle), ["Libellé 10", "Libellé 20"]);
  assert.equal(cockpit.filtrerSites([{ progression: 63.5 }], { progression: "20" },
    progression.tranches(configuration)).total, 0, "les filtres respectent la priorité des couleurs");

  const ui = await import("../../modules/cockpit/cockpit.js");
  const vue = { nom: "Site", acces: "site.example.test", progression: 77,
    progressionVisuelle: progression.pourcentage(configuration, 77),
    fonctions: ["sites", "pages", "entete", "menu", "footer", "seo", "domaine", "apercu"],
    etapes: Array.from({ length: 10 }, (_, i) => ({ cle: `etape-${i}`, libelle: `Etape ${i}`, etat: "afaire" })) };
  const html = ui.rendreVueSite({ niveau: "lecture" }, vue);
  assert.ok(html.includes('<details class="cockpit-pliant cockpit-progression" style="--progression-couleur:#AbCdEf">'));
  assert.ok(html.includes("Progression du site - 77 %"));
  assert.ok(html.includes("Libellé 10"));
  assert.equal((html.match(/class="cockpit-etape /g) || []).length, 10);
  assert.ok(html.includes('<details class="cockpit-pliant cockpit-raccourcis">'));
  for (const carte of ui.cartesVisibles(vue.fonctions)) assert.ok(html.includes(carte.titre), carte.titre);
  assert.ok(ui.rendreProgression(vue, "etape-3").includes(' open>'), "une section ciblée reste accessible");
  assert.ok(!ui.rendreProgression({ ...vue, progressionVisuelle: { couleur: '#123456"; onclick="injection' } }).includes("injection"));
  assert.ok(ui.rendreProgression({ ...vue, progressionVisuelle: { message: "Configuration absente" } }).includes("Configuration absente"));

  const originaux = { contexteGraph: ecriture.contexteGraph, collecterFrais: ecriture.collecterFrais,
    journaliser: ecriture.journaliser, colonnes: dse.chargerColonnesListe };
  const g = { token: "offline", siteGraphId: "site", listes: [
    { id: "config", displayName: progression.NOM_LISTE }, { id: "journal", displayName: "OBJ-JRN" }] };
  let courant = [items[0]], journaux = [], lectures = 0, echecJournal = false, versionsIntermediaires = [];
  ecriture.contexteGraph = async () => g;
  dse.chargerColonnesListe = async () => colonnes;
  ecriture.collecterFrais = async (_g, chemin) => {
    if (chemin.includes("/lists/journal/")) return journaux;
    if (chemin.includes("/versions?")) {
      const courantItem = courant.find((i) => chemin.includes(`/items/${i.id}/`));
      return [...versionsIntermediaires, { id: courantItem.eTag, fields: courantItem.fields }];
    }
    lectures++;
    return courant;
  };
  ecriture.journaliser = async (_g, entree) => {
    if (echecJournal) return { ok: false, erreur: "Indisponible (test)" };
    assert.ok([progression.ACTION, progression.ACTION_VERSION].includes(entree.action));
    assert.ok(entree.cle);
    if (!journaux.some((j) => j.fields.CLEIDEMPOTENCE === entree.cle)) {
      journaux.push({ id: String(journaux.length + 1), fields: {
        ACTION: entree.action, CLEIDEMPOTENCE: entree.cle, NOUVELLEVALEUR: JSON.stringify(entree.nouveau)
      } });
    }
    return { ok: true };
  };
  const snapshots = () => journaux.filter((j) => j.fields.ACTION === progression.ACTION).length;
  try {
    const a = await progression.lire();
    assert.equal(a.etat, "configuree");
    assert.equal(progression.pourcentage(a, 21).couleur, "#345678");
    await Promise.all([progression.lire(), progression.lire()]);
    assert.equal(snapshots(), 1, "un seul snapshot pour la même configuration");
    assert.equal(journaux.filter((j) => j.fields.ACTION === progression.ACTION_VERSION).length, 1, "une seule entrée par version native");
    assert.equal(lectures, 3, "les réglages sont relus sans cache");
    versionsIntermediaires = [{ id: '"20,1.5"', fields: { ...items[0].fields, Title: "Version intermédiaire" } }];
    courant = [{ ...items[0], eTag: '"20,2"', fields: { ...items[0].fields, COULEUR: "#987654", Title: "Nouveau libellé" } }];
    const b = await progression.lire();
    assert.equal(progression.pourcentage(b, 21).couleur, "#987654", "modification sans changement de code");
    assert.equal(progression.pourcentage(b, 21).libelle, "Nouveau libellé");
    assert.equal(snapshots(), 2);
    assert.equal(journaux.filter((j) => j.fields.ACTION === progression.ACTION_VERSION).length, 3,
      "les modifications intermédiaires conservées par SharePoint sont toutes journalisées");
    const modulePath = require.resolve("../shared/progression-visuelle");
    const moduleCourant = require.cache[modulePath];
    delete require.cache[modulePath];
    try {
      await require("../shared/progression-visuelle").lire();
      assert.equal(snapshots(), 2, "un redémarrage ne duplique pas les snapshots");
      assert.equal(journaux.filter((j) => j.fields.ACTION === progression.ACTION_VERSION).length, 3);
    } finally { require.cache[modulePath] = moduleCourant; }
    versionsIntermediaires = [];
    courant = [];
    assert.equal((await progression.lire()).etat, "vide");
    assert.equal(snapshots(), 3);
    courant = [{ ...items[0], eTag: '"20,3"' }];
    echecJournal = true;
    assert.ok((await progression.lire()).avertissement, "échec journal visible");
    echecJournal = false;
    await progression.lire();
    assert.equal(snapshots(), 4, "reprise de la journalisation après échec");
    courant = [item("50", 0, 100, 1, "invalide")];
    assert.equal((await progression.lire()).etat, "erreur", "configuration invalide signalée sans palette inventée");
    ecriture.contexteGraph = async () => { throw new Error("Panne Graph simulée"); };
    assert.equal((await progression.lire()).etat, "erreur");
  } finally {
    ecriture.contexteGraph = originaux.contexteGraph;
    ecriture.collecterFrais = originaux.collecterFrais;
    ecriture.journaliser = originaux.journaliser;
    dse.chargerColonnesListe = originaux.colonnes;
  }
  console.log("Progression SharePoint : plages, couleurs, filtres, blocs déroulants, détails conservés, relecture et journal dédupliqué OK");
})().catch((e) => { console.error(e); process.exitCode = 1; });
