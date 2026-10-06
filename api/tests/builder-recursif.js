"use strict";

const assert = require("node:assert/strict");
const R = require("../shared/builder-recursif");
const E = require("../shared/builder-recursif-ecriture");
const ecriture = require("../shared/ecriture");
const lien = (id, titre) => ({ id: String(id), titre });
const element = (id, configuration = {}, relations = {}) => ({
  id: String(id), configuration: { ACTIF: true, ...configuration }, relations
});
const ref = (id, sorte) => `${sorte}.${id}`;
const nom = (s) => s.replace(/-/g, "");

async function main() {
  const schema = require("../shared/builder-schema");
  const schemaSimule = [{ name: "APPAREIL", displayName: "APPAREIL" }, { name: "CATEGORIECHAMP" }];
  assert.deepEqual(schema.colonnesAutorisees("OBJ-BUILDER-CHAMP", schemaSimule).map((c) => c.name), ["CATEGORIECHAMP"]);
  assert.equal(schema.colonnesAutorisees("OBJ-BUILDER-VALEUR", schemaSimule), schemaSimule);
  const dse = require("../shared/dse");
  const { lireElements } = require("../shared/catalogue-source");
  const originaux = { colonnes: dse.chargerColonnesListe, collecter: dse.collecter, items: dse.chargerItemsListe,
    graphSansCache: dse.graphSansCache };
  try {
    dse.chargerColonnesListe = async () => [
      { name: "Title", displayName: "Title" },
      { name: "CATEGORIECHAMP", displayName: "CATEGORIE-CHAMP" },
      { name: "APPAREIL", displayName: "APPAREIL" }
    ];
    dse.chargerItemsListe = async () => assert.fail("La lecture globale des champs inclurait APPAREIL");
    dse.collecter = async (_token, chemin) => {
      assert.ok(chemin.includes("$expand=fields($select=Title,CATEGORIECHAMP)"));
      assert.ok(!chemin.includes("APPAREIL"));
      const fields = { Title: "Champ", CATEGORIECHAMP: "DESIGN" };
      Object.defineProperty(fields, "APPAREIL", { enumerable: true, get() { assert.fail("APPAREIL de CHAMP ne doit pas être lu"); } });
      return [{ id: "1", fields }];
    };
    const [lu] = await lireElements("offline", "site", { id: "champs" }, new Map(), { exclureChamps: ["APPAREIL"] });
    assert.equal(lu.configuration["CATEGORIE-CHAMP"], "DESIGN");
    assert.ok(!Object.hasOwn(lu._fields, "APPAREIL"));
    assert.ok(!lu._colonnes.some((c) => c.name === "APPAREIL"));
    const sauvegardes = require("../shared/sauvegarde-listes")._test;
    dse.graphSansCache = async (_token, chemin) => {
      if (chemin.includes("/columns?")) return { value: [
        { name: "Title", displayName: "Title" }, ...schemaSimule
      ] };
      assert.ok(chemin.includes("fields($select=Title,CATEGORIECHAMP)"), chemin);
      assert.ok(!chemin.includes("APPAREIL"));
      return { value: [{ id: "1", fields: { Title: "Actuel", CATEGORIECHAMP: "DESIGN" } }] };
    };
    const g = { token: "offline", siteGraphId: "site", listes: [{ id: "champs", displayName: "OBJ-BUILDER-CHAMP" }] };
    const exporte = await sauvegardes.exporterListe(g, g.listes[0]);
    assert.ok(!exporte.colonnes.some((c) => c.name === "APPAREIL"));
    const anciensChamps = { Title: "Ancien", CATEGORIECHAMP: "DESIGN" };
    Object.defineProperty(anciensChamps, "APPAREIL", { get() { assert.fail("La restauration ne doit pas lire APPAREIL du snapshot CHAMP"); } });
    const plan = await sauvegardes.calculer(g, { liste: { id: "champs", titre: "OBJ-BUILDER-CHAMP" },
      colonnes: [{ name: "Title" }, ...schemaSimule], elements: [{ id: "1", fields: anciensChamps }] });
    assert.equal(plan.modifiees.length, 1);
    assert.ok(!plan.colonnes.some((c) => c.name === "APPAREIL"));
  } finally {
    dse.chargerColonnesListe = originaux.colonnes;
    dse.collecter = originaux.collecter;
    dse.chargerItemsListe = originaux.items;
    dse.graphSansCache = originaux.graphSansCache;
  }
  const d = {
    builderTypes: [
      element(11, { Title: "Page", "EST-CONTENEUR": true, "EST-RACINE": true, "CLE-RENDU": "PAGE" }),
      element(12, { Title: "Section", "EST-CONTENEUR": true, "CLE-RENDU": "SECTION" }),
      element(13, { Title: "Titre", "CLE-RENDU": "TITRE" })
    ],
    builderElements: [
      element(1, { Title: "Racine", VALIDE: true, VISIBLE: true }, {
        "OBJ-SITE-PUBLIC": lien(90), "OBJ-PAGES-SITE": lien(91), "OBJ-BUILDER-TYPE": lien(11), "ELEMENT-RACINE": lien(1)
      }),
      element(2, { Title: "Section", VALIDE: true }, {
        "OBJ-SITE-PUBLIC": lien(90), "OBJ-BUILDER-TYPE": lien(12), "ELEMENT-RACINE": lien(1), "ELEMENT-PARENT": lien(1)
      })
    ],
    builderRegles: [
      element(21, { AUTORISE: true, MAXIMUM: 3 }, { "TYPE-PARENT": lien(11), "TYPE-ENFANT": lien(12) }),
      element(22, { AUTORISE: true, MAXIMUM: 2 }, { "TYPE-PARENT": lien(12), "TYPE-ENFANT": lien(13) })
    ],
    builderChamps: [
      element(31, { Title: "Texte", CATEGORIECHAMP: "CONTENU", "CODE-CHAMP": "TEXTE", "TYPE-DONNEE": "TEXTE", OBLIGATOIRE: true }, { "OBJ-BUILDER-TYPE": lien(13) }),
      element(32, { Title: "Taille", CATEGORIECHAMP: "DESIGN", "CODE-CHAMP": "DESIGN-TAILLE-TEXTE", "TYPE-DONNEE": "NOMBRE" }, { "OBJ-BUILDER-TYPE": lien(13) }),
      element(33, { Titre: "Image", CATEGORIECHAMP: "CONTENU", "CODE-CHAMP": "MEDIA", "TYPE-DONNEE": "OBJMEDIA" }, { "OBJ-BUILDER-TYPE": lien(13) })
    ],
    builderValeurs: [], medias: [element(71)]
  };
  const root = d.builderElements[0], section = d.builderElements[1];
  assert.equal(R.trouverRacine(d, 90, "page", 91), root);
  assert.equal(R.trouverRacine(d, 99, "page", 91), null);
  assert.match(R.verifierInsertion(d, root, "13"), /autorisée/);
  assert.match(R.verifierRetrait(d, root), /racine/);
  assert.equal(R.verifierInsertion(d, section, "13"), null);
  assert.equal(R.titre(d.builderChamps[2]), "Image");
  assert.equal(R.natureDe(d.builderChamps[2]), "MEDIA");
  const stores = new Map();
  let mutations = 0, nextId = 100;
  const appliquer = (liste, id, champs) => {
    assert.notEqual(liste, "OBJ-BUILDER-CHAMP", "les définitions de champs ne sont jamais écrites");
    const cle = liste === "OBJ-BUILDER-ELEMENT" ? "builderElements" : "builderValeurs";
    let el = d[cle].find((x) => x.id === id);
    if (!el) { el = element(id); d[cle].push(el); }
    for (const [k, v] of Object.entries(champs)) {
      if (k.endsWith("LookupId")) el.relations[k.slice(0, -8)] = v === null ? null : lien(v);
      else el.configuration[k] = v;
    }
    const storeKey = `${liste}/${id}`;
    stores.set(storeKey, { ...(stores.get(storeKey) || {}), ...champs });
    mutations++;
  };
  const w = {
    g: {}, liste: (n) => ({ id: n }), simple: async (_liste, champ) => nom(champ),
    lookup: async (_liste, champ) => `${nom(champ)}LookupId`,
    cols: async () => [{ name: "VALEURTEXTE", text: { maxLength: 255 } }],
    creer: async (liste, champs) => { const id = String(++nextId); appliquer(liste, id, champs); return id; },
    maj: async (liste, id, champs) => appliquer(liste, id, champs)
  };
  const lireAvant = ecriture.lireItemFrais;
  ecriture.lireItemFrais = async (_g, liste, id) => stores.get(`${liste}/${id}`) || {};
  const executer = (action, p) => E.executer({
    d, w, p, action, siteId: "90", reference: ref,
    autoriser: (t, id) => t === "page" && id === "91", mediaAutorise: (m) => m.id === "71"
  });
  try {
    const creation = await executer("builder.ajouter", { ref: "element.2", typeRef: "type.13", titre: "Titre simulé" });
    assert.ok(creation.nouveau.ref);
    const nouveau = d.builderElements.find((x) => ref(x.id, "element") === creation.nouveau.ref);
    assert.equal(R.lien(nouveau, "ELEMENT-RACINE"), "1");
    assert.equal(R.lien(nouveau, "ELEMENT-PARENT"), "2");
    assert.equal(R.f(nouveau, "PROFONDEUR"), 2);
    assert.equal(R.arbre(d, root, { public: true }).enfants[0].enfants.length, 0, "brouillon absent du public");
    const cible = { ref: creation.nouveau.ref };
    const avant = mutations;
    assert.ok((await executer("builder.enregistrer", { ...cible, valeurs: { "champ.32": [] } })).refus);
    assert.ok((await executer("builder.enregistrer", { ...cible, valeurs: { "champ.31": "x".repeat(256) } })).refus);
    assert.ok((await executer("builder.enregistrer", { ...cible, valeurs: { "champ.31": "Valide", "champ.33": "media.99" } })).refus);
    assert.equal(mutations, avant, "toutes les valeurs sont validées avant toute écriture");
    await assert.rejects(executer("builder.publier", { ref: "element.1" }), /obligatoire/);
    assert.equal(mutations, avant, "publication invalide sans mutation");
    await executer("builder.enregistrer", { ...cible, valeurs: { "champ.31": "Première valeur", "champ.32": 24 } });
    await executer("builder.enregistrer", { ...cible, valeurs: { "champ.31": "Valeur modifiée" } });
    assert.equal(d.builderValeurs.length, 2, "modification sans doublon");
    Object.defineProperty(d.builderChamps[0].configuration, "APPAREIL", { get() { throw new Error("APPAREIL de CHAMP interdit"); }, enumerable: true });
    const appareilInvalideAvant = mutations;
    assert.ok((await executer("builder.enregistrer", { ...cible, appareil: "PHONE", valeurs: { "champ.32": 10 } })).refus);
    assert.equal(mutations, appareilInvalideAvant);
    assert.ok((await executer("builder.enregistrer", { ...cible, valeurs: { "champ.31": "Ne pas écrire" },
      surcharges: { MOBILE: { "champ.32": "invalide" } } })).refus);
    assert.equal(mutations, appareilInvalideAvant, "un lot responsive invalide ne modifie pas la valeur générale");
    await executer("builder.enregistrer", { ...cible, appareil: "ORDINATEUR", valeurs: { "champ.32": 32 },
      surcharges: { TABLETTE: { "champ.32": 20 }, MOBILE: { "champ.32": 14, "champ.31": "Texte mobile" } } });
    assert.equal(R.valeurDe(d, nouveau.id, d.builderChamps[1]), 24);
    assert.equal(R.valeurDe(d, nouveau.id, d.builderChamps[1], "ORDINATEUR"), 32);
    assert.equal(R.valeurDe(d, nouveau.id, d.builderChamps[1], "TABLETTE"), 20);
    assert.equal(R.valeurDe(d, nouveau.id, d.builderChamps[1], "MOBILE"), 14);
    const nbValeurs = d.builderValeurs.length;
    await executer("builder.enregistrer", { ...cible, appareil: "MOBILE", valeurs: { "champ.32": "" } });
    assert.equal(R.valeurDe(d, nouveau.id, d.builderChamps[1], "MOBILE"), null);
    assert.equal(d.builderValeurs.length, nbValeurs, "effacement de surcharge sans suppression");
    assert.equal(R.arbre(d, root).enfants[0].enfants[0].champs[1].categorie, "DESIGN");
    const doublon = element(200, { "VALEUR-NOMBRE": 9, APPAREIL: "TABLETTE" }, {
      "OBJ-BUILDER-ELEMENT": lien(nouveau.id), "OBJ-BUILDER-CHAMP": lien(32) });
    d.builderValeurs.push(doublon);
    assert.throws(() => R.valeurDe(d, nouveau.id, d.builderChamps[1], "TABLETTE"), /dupliquées/);
    d.builderValeurs.pop();
    assert.equal(R.arbre(d, root).enfants[0].enfants[0].champs[0].valeur, "Valeur modifiée", "relecture après création/modification");
    await executer("builder.publier", { ref: "element.1" });
    assert.equal(R.arbre(d, root, { public: true }).enfants[0].enfants.length, 1);
    assert.match(R.verifierInsertion(d, nouveau, "12", section), /Conteneur/);
    root.relations["ELEMENT-PARENT"] = lien(nouveau.id);
    assert.equal(R.racineDe(d, nouveau), null, "cycle rejeté");
    delete root.relations["ELEMENT-PARENT"];
    nouveau.relations.OBJSITEPUBLIC = lien(99);
    assert.throws(() => R.arbre(d, root), /autre racine|autre site/);
    nouveau.relations.OBJSITEPUBLIC = lien(90);
    nouveau.configuration.VERROUILLE = true;
    assert.ok((await executer("builder.desactiver", cible)).refus);
    nouveau.configuration.VERROUILLE = false;
    await executer("builder.enregistrer", { ...cible, valeurs: { "champ.33": "media.71" } });
    assert.throws(() => R.arbre(d, root), /Média/);
    assert.doesNotThrow(() => R.arbre(d, root, { mediaVisible: () => true }));
    const ui = await import("../../modules/cockpit/constructeur.js");
    const optionsArbre = { reference: ref, mediaVisible: () => true };
    const avantDuplication = R.arbre(d, root, optionsArbre);
    const copie = await executer("builder.dupliquer", { ...cible, apres: cible.ref });
    assert.ok(copie.nouveau?.ref, copie.refus);
    const copieElement = d.builderElements.find((x) => ref(x.id, "element") === copie.nouveau.ref);
    assert.equal(R.f(copieElement, "VALIDE"), false);
    assert.equal(R.valeurDe(d, copieElement.id, d.builderChamps[0]), "Valeur modifiée");
    assert.equal(R.valeurDe(d, copieElement.id, d.builderChamps[1], "TABLETTE"), 20);
    assert.equal(R.valeurDe(d, copieElement.id, d.builderChamps[2]), "71");
    const apresDuplication = R.arbre(d, root, optionsArbre);
    const commande = ui.historiqueStructure(avantDuplication.structure, apresDuplication.structure, "element.1");
    assert.ok(commande);
    let etatMutation = mutations;
    assert.ok((await executer("builder.restaurer", { ...commande.annuler.params, attendu: "empreinte-perimee" })).refus);
    assert.equal(mutations, etatMutation, "aucune mutation lors d'un conflit d'historique");
    await executer("builder.restaurer", { ...commande.annuler.params, attendu: apresDuplication.empreinte });
    assert.equal(R.actif(copieElement), false);
    assert.deepEqual(R.arbre(d, root, optionsArbre).enfants, avantDuplication.enfants, "annulation fidèle du sous-arbre");
    await executer("builder.restaurer", { ...commande.retablir.params, attendu: R.empreinteDe(d, root) });
    assert.equal(R.actif(copieElement), true);
    assert.deepEqual(R.arbre(d, root, optionsArbre).enfants, apresDuplication.enfants, "rétablissement fidèle");
    etatMutation = mutations;
    assert.ok((await executer("builder.dupliquer", cible)).refus, "maximum natif respecté");
    assert.equal(mutations, etatMutation);
    await executer("builder.desactiver", { ref: copie.nouveau.ref });
    const sectionCopie = await executer("builder.dupliquer", { ref: "element.2" });
    assert.ok(sectionCopie.nouveau?.ref, sectionCopie.refus);
    const sectionDupliquee = d.builderElements.find((x) => ref(x.id, "element") === sectionCopie.nouveau.ref);
    const descendantCopie = R.enfantsDe(d, sectionDupliquee).filter(R.actif)[0];
    assert.equal(R.f(descendantCopie, "PROFONDEUR"), 2);
    assert.equal(R.lien(descendantCopie, "ELEMENT-RACINE"), "1");
    const avantDeplacement = R.arbre(d, root, optionsArbre);
    await executer("builder.deplacer", { ...cible, parent: sectionCopie.nouveau.ref, apres: ref(descendantCopie.id, "element") });
    assert.equal(R.lien(nouveau, "ELEMENT-PARENT"), sectionDupliquee.id);
    const apresDeplacement = R.arbre(d, root, optionsArbre);
    const deplacement = ui.historiqueStructure(avantDeplacement.structure, apresDeplacement.structure, "element.1");
    await executer("builder.restaurer", { ...deplacement.annuler.params, attendu: apresDeplacement.empreinte });
    assert.equal(R.lien(nouveau, "ELEMENT-PARENT"), "2");
    assert.deepEqual(R.arbre(d, root, optionsArbre).enfants, avantDeplacement.enfants);
    const avantInvalide = mutations;
    assert.ok((await executer("builder.restaurer", { ref: "element.1", attendu: R.empreinteDe(d, root),
      elements: [{ ref: cible.ref, parent: cible.ref, ordre: 10, profondeur: 2, actif: true }] })).refus ||
      mutations === avantInvalide);
    assert.equal(mutations, avantInvalide);
    await executer("builder.desactiver", { ref: sectionCopie.nouveau.ref });
    await executer("builder.reactiver", { ref: sectionCopie.nouveau.ref });
    assert.equal(R.actif(sectionDupliquee), true, "réactivation d'un conteneur avec descendants");
    d.builderRegles.push(element(23, { AUTORISE: true }, { "TYPE-PARENT": lien(12), "TYPE-ENFANT": lien(12) }));
    const avantProfondeur = R.arbre(d, root, optionsArbre);
    const tentativeIncomplete = { ref: "element.2", parent: sectionCopie.nouveau.ref, ordre: 20, profondeur: 2, actif: true };
    const avantRestauration = mutations;
    assert.ok((await executer("builder.restaurer", { ref: "element.1", attendu: avantProfondeur.empreinte,
      elements: [tentativeIncomplete] })).refus, "restauration refusée si la profondeur des descendants n'est pas recalculée");
    nouveau.configuration.VERROUILLE = true;
    assert.ok((await executer("builder.restaurer", { ref: "element.1", attendu: R.empreinteDe(d, root),
      elements: [{ ...tentativeIncomplete, parent: "element.1", profondeur: 1, actif: false }] })).refus);
    nouveau.configuration.VERROUILLE = false;
    assert.equal(mutations, avantRestauration, "verrou descendant et restauration incohérente : aucune mutation");
    await executer("builder.deplacer", { ref: "element.2", parent: sectionCopie.nouveau.ref });
    assert.equal(R.f(section, "PROFONDEUR"), 2);
    assert.equal(R.f(nouveau, "PROFONDEUR"), 3, "profondeur de tous les descendants recalculée");
    const profondeurHistorique = ui.historiqueStructure(avantProfondeur.structure,
      R.arbre(d, root, optionsArbre).structure, "element.1");
    await executer("builder.restaurer", { ...profondeurHistorique.annuler.params, attendu: R.empreinteDe(d, root) });
    assert.equal(R.f(nouveau, "PROFONDEUR"), 2);
    d.builderRegles.pop();
    await executer("builder.desactiver", { ref: sectionCopie.nouveau.ref });
    const champId = element(34, { Titre: "Identifiant", CATEGORIECHAMP: "AVANCE", "CODE-CHAMP": "ID-CSS", "TYPE-DONNEE": "texte" },
      { "OBJ-BUILDER-TYPE": lien(13) });
    d.builderChamps.push(champId);
    await executer("builder.enregistrer", { ...cible, valeurs: { "champ.34": "identifiant-unique" } });
    const avantId = mutations;
    assert.ok((await executer("builder.dupliquer", cible)).refus);
    assert.ok((await executer("builder.enregistrer", { ...cible, appareil: "MOBILE", valeurs: { "champ.34": "autre-id" } })).refus);
    assert.equal(mutations, avantId, "ID CSS : duplication incohérente et responsive refusés avant mutation");
    await executer("builder.enregistrer", { ...cible, valeurs: { "champ.34": "" } });
    let conteneursCrees = 0;
    const dupliquerRacine = () => E.executer({
      d, w, p: { ref: "element.1", attendu: R.empreinteDe(d, root) }, action: "builder.dupliquer",
      siteId: "90", reference: ref, autoriser: (t, id) => t === "page" && id === "91",
      mediaAutorise: (m) => m.id === "71",
      dupliquerRacine: async () => { conteneursCrees++; return { id: "92", type: "page" }; }
    });
    await executer("builder.enregistrer", { ...cible, valeurs: { "champ.34": "identifiant-unique" } });
    assert.ok((await dupliquerRacine()).refus);
    assert.equal(conteneursCrees, 0, "la validation précède même la création du conteneur");
    await executer("builder.enregistrer", { ...cible, valeurs: { "champ.34": "" } });
    const copieComposition = await dupliquerRacine();
    assert.ok(copieComposition.nouveau?.ref, copieComposition.refus);
    assert.equal(conteneursCrees, 1);
    const racineCopie = R.trouverRacine(d, 90, "page", 92);
    assert.equal(R.lien(racineCopie, "ELEMENT-RACINE"), racineCopie.id);
    assert.equal(R.lien(racineCopie, "ELEMENT-PARENT"), null);
    const originalActif = R.sousArbre(d, root);
    const copieActive = R.sousArbre(d, racineCopie);
    assert.equal(copieActive.length, originalActif.length);
    for (const [i, copie] of copieActive.entries()) {
      assert.notEqual(copie.id, originalActif[i].id);
      assert.equal(R.f(copie, "PROFONDEUR"), R.profondeurDe(d, originalActif[i]));
      assert.equal(R.f(copie, "VALIDE"), false);
      assert.equal(R.lien(copie, "ELEMENT-RACINE"), racineCopie.id);
      for (const champ of R.champsDe(d, R.lien(copie, "OBJ-BUILDER-TYPE"))) {
        for (const appareil of ["", ...R.APPAREILS]) {
          assert.equal(R.valeurDe(d, copie.id, champ, appareil), R.valeurDe(d, originalActif[i].id, champ, appareil));
        }
      }
    }
    const racineFooter = await E.executer({
      d, w, p: { type: "footer", id: "95", typeRef: "type.11", titre: "Footer documentaire" },
      action: "builder.initialiser", siteId: "90", reference: ref,
      autoriser: (t, id) => t === "footer" && id === "95", mediaAutorise: () => false
    });
    assert.ok(racineFooter.nouveau?.ref, racineFooter.refus);
    assert.ok(R.trouverRacine(d, 90, "footer", 95), "EST-RACINE autorise le réemploi documentaire sans règle de nom");
    await executer("builder.desactiver", cible);
    assert.equal(R.arbre(d, root).enfants[0].enfants.length, 0);
    assert.ok(d.builderElements.includes(nouveau), "retrait logique sans suppression");
    d.builderRegles[0].configuration.MINIMUM = 1;
    assert.match(R.verifierRetrait(d, section), /minimal/);
    assert.equal(R.mediaDansSite(element(72, {}, { "OBJ-MEDIA-PORTEE": lien(1, "SITE"), "OBJ-SITE-PUBLIC": lien(90) }), { id: 99 }), false);
    const publicRenderer = await import("../../modules/builder/rendu.js");
    const html = publicRenderer.rendreBuilder({ mode: "builder", noeuds: [{
      ref: "element.test", titre: "Titre", rendu: "TITRE", champs: [
        { cle: "TEXTE", categorie: "CONTENU", nature: "TEXTE", valeur: "<script>alert(1)</script>", surcharges: { MOBILE: "Texte mobile" } },
        { cle: "DESIGN-TAILLE-TEXTE", categorie: "DESIGN", nature: "NOMBRE", valeur: 24, surcharges: { ORDINATEUR: 32, TABLETTE: 20 } }
      ], enfants: []
    }] });
    assert.ok(!html.includes("<script>"));
    assert.match(html, /font-size:24px/);
    assert.match(html, /font-size:32px/);
    assert.match(html, /font-size:20px/);
    assert.match(html, /Texte mobile/);
    const ordinateur = html.split('dse-b-appareil--ordinateur">')[1].split('dse-b-appareil--tablette">')[0];
    const tablette = html.split('dse-b-appareil--tablette">')[1].split('dse-b-appareil--mobile">')[0];
    const mobile = html.split('dse-b-appareil--mobile">')[1];
    assert.ok(ordinateur && tablette && mobile);
    assert.ok(!ordinateur.includes("Texte mobile") && !tablette.includes("Texte mobile"));
    assert.match(publicRenderer.STYLES_BUILDER, /max-width:1024px/);
    assert.match(publicRenderer.STYLES_BUILDER, /max-width:640px/);
    const valeurZero = element(201, { "VALEUR-NOMBRE": 0, APPAREIL: "MOBILE" }, {
      "OBJ-BUILDER-ELEMENT": lien(nouveau.id), "OBJ-BUILDER-CHAMP": lien(32) });
    const surchargeVide = d.builderValeurs.find((v) => R.lien(v, "OBJ-BUILDER-CHAMP") === "32" && R.appareilDe(v) === "MOBILE");
    surchargeVide.configuration.ACTIF = false;
    d.builderValeurs.push(valeurZero);
    assert.equal(R.valeurDe(d, nouveau.id, d.builderChamps[1], "MOBILE"), 0, "zéro est une surcharge, pas un héritage");
    d.builderValeurs.pop();
    surchargeVide.configuration.ACTIF = true;
    const { panneauGenerique } = await import("../../modules/cockpit/constructeur.js");
    const panneau = panneauGenerique({ ref: "x", titre: "Titre", champs: [{
      ref: "c", cle: "DESIGN-TROMPEUR", categorie: "CONTENU", nature: "TEXTE", valeur: "Base", surcharges: { MOBILE: "Mobile" }
    }] }, [], "MOBILE");
    assert.match(panneau, /data-appareil="MOBILE"/);
    assert.match(panneau, /data-builder-volet="CONTENU".*Mobile/);
    assert.throws(() => R.categorieDe(element(999, { CATEGORIECHAMP: "INCONNU" })), /Catégorie/);
    assert.throws(() => R.appareilDe(element(999, { APPAREIL: "PHONE" })), /Appareil/);
    console.log("Builder récursif : création/modification/relecture, publication, règles natives, cycles, périmètre, médias, verrouillage et retrait logique OK (simulation)");
  } finally { ecriture.lireItemFrais = lireAvant; }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
