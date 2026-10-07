"use strict";

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const autorisations = require("../auth/autorisations");
const journal = require("../shared/journal-comptes");
const normaliser = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]/g, "");

async function reprendreJournalDebut(g, cle, action, avant, apres, contexte) {
  const liste = dse.trouverListe(g.listes, "OBJ-JRN");
  if (!liste) throw new Error("OBJ-JRN indisponible : reprise refusée.");
  const colonnes = await dse.collecter(g.token, `/sites/${g.siteGraphId}/lists/${liste.id}/columns`);
  const nom = (label, type) => journal._test.champ(colonnes, label, type).name;
  const champs = {
    id: nom("Title", "text"), code: nom("CODE", "text"), nom: nom("NOM", "text"),
    action: nom("ACTION", "text"), date: nom("DATEEVENEMENT", "dateTime"),
    cle: nom("CLEIDEMPOTENCE", "text"), statut: nom("STATUTJRN", "choice"),
    nouvelle: nom("NOUVELLEVALEUR", "text"), anomalie: nom("ANOMALIE", "boolean")
  };
  const ancienne = colonnes.find((c) => !c.hidden && !c.readOnly &&
    normaliser(c.name) === "ANCIENNEVALEUR" && c.text);
  const anomalieDetectee = colonnes.find((c) => !c.hidden && !c.readOnly &&
    normaliser(c.name) === "ANOMALIEDETECTEE" && c.boolean);
  if (ancienne) champs.ancienne = ancienne.name;
  if (anomalieDetectee) champs.anomalieDetectee = anomalieDetectee.name;
  const filtre = `fields/${champs.cle} eq '${cle.replace(/'/g, "''")}'`;
  const items = await ecriture.collecterFrais(g,
    `/sites/${g.siteGraphId}/lists/${liste.id}/items?$filter=${encodeURIComponent(filtre)}&$expand=fields($select=${champs.cle},${champs.statut},${champs.action},${champs.nouvelle})&$top=2`);
  if (!items.length) return null;
  if (items.length !== 1) throw new Error("OBJ-JRN : clé d'idempotence dupliquée ; reprise refusée.");
  const item = items[0];
  let demande;
  try { demande = JSON.parse(item.fields?.[champs.nouvelle] || ""); }
  catch { throw new Error("OBJ-JRN : entrée incomplète illisible ; reprise refusée."); }
  const attendu = { etat: "DÉBUT", avant: avant ?? null, demande: apres ?? null, contexte: contexte ?? null };
  if (item.fields?.[champs.action] !== action) {
    throw new Error("OBJ-JRN : entrée existante différente de la demande ; reprise refusée.");
  }
  if (item.fields?.[champs.statut] === "FIN" && demande?.etat === "SUCCÈS" &&
    JSON.stringify(demande.avant) === JSON.stringify(avant ?? null) &&
    JSON.stringify(demande.contexte) === JSON.stringify(contexte ?? null) &&
    Object.entries(apres || {}).filter(([cleApres]) => cleApres !== "perimetreDirect")
      .every(([cleApres, valeur]) => demande.apres?.[cleApres] === valeur) &&
    /^\d+$/.test(String(demande.apres?.idNatif || ""))) return null;
  if (item.fields?.[champs.statut] !== "DÉBUT" || JSON.stringify(demande) !== JSON.stringify(attendu)) {
    throw new Error("OBJ-JRN : entrée existante différente de la demande ; reprise refusée.");
  }
  return { listeId: liste.id, itemId: String(item.id), champs, idempotence: cle, action, avant, apres, contexte };
}

const DEFINITIONS = {
  "OBJ-DROIT-OPERATION": [
    { name: "Operation", displayName: "OPERATION-TECHNIQUE", text: {} },
    { name: "Fonction", displayName: "FONCTION-COCKPIT", text: {} },
    { name: "Mode", displayName: "MODE-TECHNIQUE", text: {} },
    { name: "Libelle", displayName: "LIBELLE-INTERFACE", text: {} },
    { name: "Route", displayName: "ROUTE-COCKPIT", text: {} },
    { name: "Actif", displayName: "ACTIF", boolean: {} }
  ],
  "OBJ-DROIT-PERIMETRE": [
    { name: "ChampCible", displayName: "CHAMP-CIBLE-AFFECTATION", text: {} },
    { name: "Mode", displayName: "MODE-RESOLUTION", text: {} },
    { name: "ListeCible", displayName: "GUID-LISTE-CIBLE", text: {} },
    { name: "ChampMembre", displayName: "CHAMP-MEMBRE", text: {} },
    { name: "ChampGroupement", displayName: "CHAMP-GROUPEMENT", text: {} },
    { name: "TypeCible", displayName: "TYPE-CIBLE-SITE", text: {} },
    { name: "Actif", displayName: "ACTIF", boolean: {} }
  ]
};

async function provisionner(appliquer) {
  const g = await ecriture.contexteGraph();
  const reference = (nom) => {
    const l = dse.trouverListe(g.listes, nom);
    if (!l) throw new Error(`Référentiel officiel absent : ${nom}.`);
    return l;
  };
  for (const [nom, defs] of Object.entries(DEFINITIONS)) {
    const lookups = nom === "OBJ-DROIT-OPERATION"
      ? [["Capacite", "OBJ-CAPACITE"], ["Action", "OBJ-ACTION"]]
      : [["PerimetreType", "OBJ-PERIMETRE-TYPE"], ["Origine", "OBJ-ORIGINE-DROIT"]];
    let liste = dse.trouverListe(g.listes, nom);
    if (!liste && appliquer) {
      liste = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists`, {
        displayName: nom, list: { template: "genericList" },
        description: "Correspondance technique du moteur DSE ; aucune attribution de droits ni donnée de test."
      });
      g.listes.push(liste);
      console.log(`Liste créée : ${nom}`);
    }
    const cols = liste ? await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id) : [];
    const definitions = [...defs, ...lookups.map(([name, cible]) => ({
      name, displayName: cible, lookup: { listId: reference(cible).id, columnName: "Title", allowMultipleValues: false }
    }))];
    for (const def of definitions) {
      const col = cols.find((c) => c.displayName === def.displayName);
      if (col) {
        if (def.lookup && (col.lookup?.allowMultipleValues ||
          col.lookup?.listId?.toLowerCase() !== def.lookup.listId.toLowerCase())) {
          throw new Error(`${nom}/${def.name} : Lookup existant incompatible.`);
        }
        continue;
      }
      if (!appliquer) { console.log(`Structure manquante : ${nom}/${def.name}`); continue; }
      await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${liste.id}/columns`, def);
      console.log(`Colonne créée : ${nom}/${def.name}`);
    }
    if (appliquer) {
      dse.viderCacheGraph();
      const relues = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id);
      if (!definitions.every((def) => relues.some((c) => c.displayName === def.displayName))) {
        throw new Error(`Relecture de structure incomplète : ${nom}.`);
      }
    }
  }
  console.log("Aucune permission, affectation ou donnée métier créée ou modifiée.");
}

async function configurer(appliquer) {
  const g = await ecriture.contexteGraph();
  const liste = (nom) => {
    const l = dse.trouverListe(g.listes, nom);
    if (!l) throw new Error(`Liste requise absente : ${nom}`);
    return l;
  };
  const referentiel = async (nom, champ) => {
    const l = liste(nom);
    const items = await dse.chargerItemsListe(g.token, g.siteGraphId, l.id);
    return (code) => {
      const xs = items.filter((i) => i.fields[champ] === code);
      if (xs.length !== 1) throw new Error(`${nom} : code officiel non unique ${code}`);
      return String(xs[0].id);
    };
  };
  const [cap, action, type, origine, cible] = await Promise.all([
    referentiel("OBJ-CAPACITE", "CodeCapacite"), referentiel("OBJ-ACTION", "CodeAction"),
    referentiel("OBJ-PERIMETRE-TYPE", "CodePerimetre"), referentiel("OBJ-ORIGINE-DROIT", "CodeOrigineDroit"),
    referentiel("OBJ-TYPE-CIBLE", "CodeTypeCible")
  ]);
  const operations = [];
  for (const [code, fonctions, contrainte] of [
    ["ADMINISTRATION-GLOBALE", require("../shared/cockpit").FONCTIONS_COCKPIT.join(","), "tous/administration"],
    ["GESTION-CLIENT", "administration,suivi", ""],
    ["GESTION-UTILISATEURS-CLIENT", "utilisateurs", ""],
    ["GESTION-SITES-ATTRIBUES", "sites,pages,entete,logo-medias,menu,footer,seo,domaine,apercu,suivi", ""]
  ]) operations.push({ operation: `compatibilite.${code}`, fonction: fonctions, mode: "compatibility",
    libelle: code, route: contrainte, capacite: null, action: null });
  const composants = [["entete", "EN-TÊTE", "En-tête"], ["footer", "FOOTER", "Footer"],
    ["pages", "PAGES", "Pages"], ["articles", "ARTICLES", "Articles"]];
  for (const [fonction, code, libelle] of composants) {
    for (const [suffixe, codeAction, mode] of [["voir", "VOIR", "read"], ["creer", "CRÉER", "create"],
      ["modifier", "MODIFIER", "write"], ["valider", "VALIDER", "validate"], ["publier", "PUBLIER", "publish"]]) {
      operations.push({ operation: `${fonction}.${suffixe}`, fonction, mode, libelle, route: fonction,
        capacite: cap(code), action: action(codeAction) });
    }
    if (fonction === "articles") continue;
    const racine = fonction === "pages" ? "page" : fonction;
    for (const [a, suffixe] of [
      ["conteneur.modifier", "MODIFIER"], ["contenu.formulaire", "MODIFIER"], ["contenu.enregistrer", "MODIFIER"],
      ["element.deplacer", "MODIFIER"], ["logo.choisir", "MODIFIER"], ["design.lire", "MODIFIER"],
      ["design.preset", "MODIFIER"], ["design.enregistrer", "MODIFIER"],
      ["builder.enregistrer", "MODIFIER"], ["builder.deplacer", "MODIFIER"],
      ["conteneur.creer", "CRÉER"], ["conteneur.dupliquer", "CRÉER"], ["section.ajouter", "CRÉER"],
      ["ligne.ajouter", "CRÉER"], ["module.ajouter", "CRÉER"], ["element.dupliquer", "CRÉER"],
      ["conteneur.publier", "PUBLIER"], ["conteneur.desactiver", "ADMINISTRER"],
      ["element.etat", "ADMINISTRER"], ["page.affecter", "MODIFIER"]
    ]) operations.push({ operation: `constructeur.${racine}.${a}`, fonction, mode: "write", libelle,
      route: fonction, capacite: cap(code), action: action(suffixe) });
  }
  const siteTypes = [cible("SITE"), cible("SOUS-SITE")].join(",");
  const boutiqueType = cible("BOUTIQUE");
  const configs = [
    ["CLIENT", "DIRECT", "CibleClient", "OBJ-CLIENT", "client", "", "", siteTypes],
    ["SITE", "DIRECT", "CibleSite", "OBJ-SITE-PUBLIC", "direct", "", "", siteTypes],
    ["BOUTIQUE", "DIRECT", "CibleBoutique", "OBJ-SITE-PUBLIC", "direct", "", "", boutiqueType],
    ["GROUPEMENT-SITES", "VIA-GROUPEMENT", "CibleGroupementSite", "OBJ-GROUPEMENT-SITE", "group", "Site", "GroupementSite", siteTypes],
    ["GROUPEMENT-BOUTIQUES", "VIA-GROUPEMENT", "CibleGroupementBoutique", "OBJ-GROUPEMENT-BOUTIQUE", "group", "Boutique", "GroupementBoutique", boutiqueType]
  ];
  const enregistrer = async (nom, lignes) => {
    const l = liste(nom);
    const cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, l.id);
    const existants = await dse.chargerItemsListe(g.token, g.siteGraphId, l.id);
    const structure = { ...l, nom, cols };
    for (const values of lignes) {
      const fields = { Title: values.Title };
      for (const [label, v] of Object.entries(values).filter(([k]) => k !== "Title")) {
        const c = autorisations.colonne(structure, label);
        fields[c.lookup ? `${c.name}LookupId` : c.name] = v;
      }
      const presents = existants.filter((i) => nom === "OBJ-DROIT-OPERATION"
        ? i.fields[autorisations.colonne(structure, "OPERATION-TECHNIQUE").name] === values["OPERATION-TECHNIQUE"]
        : ["OBJ-PERIMETRE-TYPE", "OBJ-ORIGINE-DROIT"].every((label) => {
          const c = autorisations.colonne(structure, label);
          return String(i.fields[`${c.name}LookupId`]) === String(values[label]);
        }));
      if (presents.length > 1) throw new Error(`${nom} : configuration technique dupliquée.`);
      if (presents.length === 1) {
        if (!Object.entries(fields).every(([k, v]) => String(presents[0].fields[k] ?? "") === String(v))) {
          throw new Error(`${nom}/${fields.Title} : configuration existante différente ; aucune écriture automatique.`);
        }
        continue;
      }
      if (!appliquer) { console.log(`Correspondance à ajouter : ${nom}/${fields.Title}`); continue; }
      const cree = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${l.id}/items`, { fields });
      const relu = await dse.graphSansCache(g.token,
        `/sites/${g.siteGraphId}/lists/${l.id}/items/${cree.id}?$expand=fields($select=${Object.keys(fields).join(",")})`);
      if (!Object.entries(fields).every(([k, v]) => String(relu.fields[k] ?? "") === String(v))) {
        throw new Error(`Relecture de configuration non conforme : ${nom}/${fields.Title}.`);
      }
      existants.push(relu);
      console.log(`Correspondance vérifiée : ${nom}/${fields.Title}`);
    }
  };
  await enregistrer("OBJ-DROIT-PERIMETRE", configs.map(([t, o, champ, l, mode, membre, groupe, typeSite]) => ({
    Title: `${t}/${o}`, "OBJ-PERIMETRE-TYPE": type(t), "OBJ-ORIGINE-DROIT": origine(o),
    "CHAMP-CIBLE-AFFECTATION": champ, "GUID-LISTE-CIBLE": liste(l).id, "MODE-RESOLUTION": mode,
    "CHAMP-MEMBRE": membre, "CHAMP-GROUPEMENT": groupe, "TYPE-CIBLE-SITE": typeSite, ACTIF: true
  })));
  await enregistrer("OBJ-DROIT-OPERATION", operations.map((o) => ({
    Title: o.operation, "OPERATION-TECHNIQUE": o.operation, "FONCTION-COCKPIT": o.fonction,
    "MODE-TECHNIQUE": o.mode, "LIBELLE-INTERFACE": o.libelle, "ROUTE-COCKPIT": o.route,
    ...(o.capacite ? { "OBJ-CAPACITE": o.capacite } : {}), ...(o.action ? { "OBJ-ACTION": o.action } : {}), ACTIF: true
  })));
  if (appliquer) {
    const source = await autorisations.charger(g.token, g.siteGraphId, g.listes);
    const journal = await require("../shared/journal-comptes").enregistrer(g, {
      cle: `DSE-DROITS-CONFIG-${ecriture.hash([source.operations, source.configurations])}`,
      action: "CONFIGURATION-TECHNIQUE-DROITS",
      avant: { attributionModifiee: false },
      apres: { operations: source.operations, perimetres: source.configurations },
      contexte: { autorisation: "Ajout configuration SharePoint approuvé par Pascal Zimmer" }
    });
    console.log(`Configuration relue et journalisée : OBJ-JRN ${journal.id}`);
  }
  console.log("Configuration technique uniquement ; attributions utilisateur et rôle inchangées.");
}

async function siteArticle(appliquer) {
  const g = await ecriture.contexteGraph();
  const article = dse.trouverListe(g.listes, "OBJ-ARTICLE");
  const sites = dse.trouverListe(g.listes, "OBJ-SITE-PUBLIC");
  if (!article || !sites) throw new Error("Listes article/site officielles indisponibles.");
  let cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, article.id, { contraintes: true });
  let col = cols.find((c) => c.displayName === "SITE-CIBLE");
  if (!col && !appliquer) { console.log("Lookup simple SITE-CIBLE à ajouter à OBJ-ARTICLE."); return; }
  if (!col) {
    col = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${article.id}/columns`, {
      name: "SiteCible", displayName: "SITE-CIBLE", required: false,
      lookup: { listId: sites.id, columnName: "Title", allowMultipleValues: false }
    });
    dse.viderCacheGraph();
    cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, article.id, { contraintes: true });
    col = cols.find((c) => c.id === col.id);
  }
  if (!col?.lookup || col.lookup.allowMultipleValues || col.lookup.listId.toLowerCase() !== sites.id.toLowerCase()) {
    throw new Error("SITE-CIBLE : Lookup simple vers la liste native de sites requis.");
  }
  console.log(`OBJ-ARTICLE/${col.name} : Lookup simple relu. Aucun article ni lien historique modifié.`);
  if (appliquer) console.log("Journal", await require("../shared/journal-comptes").enregistrer(g, {
    cle: `DSE-ARTICLE-SITE-CIBLE-${article.id}-${col.id}`, action: "STRUCTURE-ARTICLE-SITE-CIBLE",
    avant: { historiqueModifie: false },
    apres: { listeId: article.id, colonneId: col.id, nomInterne: col.name, cibleListeId: sites.id, multiple: false },
    contexte: { autorisation: "Ajout explicite du Lookup simple article approuvé par Pascal Zimmer" }
  }));
}

async function configurerOperationsMenuLogo(appliquer = false) {
  const g = await ecriture.contexteGraph();
  const liste = (nom) => {
    const l = dse.trouverListe(g.listes, nom);
    if (!l) throw new Error(`Liste officielle absente : ${nom}.`);
    return l;
  };
  const identifiant = async (nom, titre) => {
    const l = liste(nom);
    const xs = await dse.chargerItemsListe(g.token, g.siteGraphId, l.id);
    const trouves = xs.filter((x) => normaliser(x.fields?.Title) === normaliser(titre));
    if (trouves.length !== 1) throw new Error(`${nom} : référence ${titre} absente ou ambiguë.`);
    return { liste: l, id: String(trouves[0].id) };
  };
  const [capEntete, capMedias, actionModifier] = await Promise.all([
    identifiant("OBJ-CAPACITE", "EN-TÊTE"), identifiant("OBJ-CAPACITE", "MÉDIAS"),
    identifiant("OBJ-ACTION", "MODIFIER")
  ]);
  const droits = await autorisations.charger(g.token, g.siteGraphId, g.listes);
  const capacites = [
    { operation: "menu.modifier", fonction: "menu", capacite: capEntete.id, action: actionModifier.id, libelle: "Menu", route: "menu" },
    { operation: "logo-medias.modifier", fonction: "logo-medias", capacite: capMedias.id, action: actionModifier.id, libelle: "Logo et médias", route: "logo-medias" }
  ];
  const cibleSite = liste("OBJ-SITE-PUBLIC");
  const portees = droits.configurations.filter((c) => c.mode === "direct" &&
    c.listeCible.toLowerCase() === cibleSite.id.toLowerCase());
  if (!portees.length) throw new Error("Aucun périmètre direct existant vers OBJ-SITE-PUBLIC ; opération non créée.");

  for (const def of capacites) {
    const capaciteAction = droits.possibles.filter((x) => x.capaciteId === def.capacite && x.actionId === def.action);
    if (capaciteAction.length !== 1) throw new Error(`${def.operation} : relation capacité/action existante absente ou ambiguë.`);
    const existantes = droits.operations.filter((o) => o.operation === def.operation);
    if (existantes.length > 1) throw new Error(`${def.operation} : opération déjà dupliquée.`);
    const l = liste("OBJ-DROIT-OPERATION");
    const colonnes = await dse.chargerColonnesListe(g.token, g.siteGraphId, l.id, { contraintes: true });
    const champ = (label, type) => {
      const cs = colonnes.filter((c) => normaliser(c.displayName) === normaliser(label) &&
        (!type || c[type]) && !c.readOnly && !c.hidden);
      if (cs.length !== 1) throw new Error(`OBJ-DROIT-OPERATION : colonne ${label} absente ou ambiguë.`);
      return cs[0];
    };
    const champs = {};
    const simples = [
      ["OPERATION-TECHNIQUE", def.operation], ["FONCTION-COCKPIT", def.fonction],
      ["MODE-TECHNIQUE", "write"], ["LIBELLE-INTERFACE", def.libelle], ["ROUTE-COCKPIT", def.route]
    ];
    for (const [label, value] of simples) champs[champ(label, "text").name] = value;
    champs.Title = def.operation;
    champs[`${champ("OBJ-CAPACITE", "lookup").name}LookupId`] = def.capacite;
    champs[`${champ("OBJ-ACTION", "lookup").name}LookupId`] = def.action;
    const actif = colonnes.filter((c) => normaliser(c.displayName) === "ACTIF" && c.boolean && !c.readOnly && !c.hidden);
    if (actif.length !== 1) throw new Error("OBJ-DROIT-OPERATION : état actif unique requis.");
    champs[actif[0].name] = true;
    const cle = `DSE-DROIT-OPERATION-${ecriture.hash([l.id, def.operation, champs])}`;
    const contexte = { siteListeId: cibleSite.id, configuration: "OBJ-DROIT-OPERATION" };
    const avant = { operationAbsente: true };
    const apres = { operation: def.operation, fonction: def.fonction,
      capaciteId: def.capacite, actionId: def.action, perimetreDirect: true };
    if (existantes.length === 1) {
      const courant = existantes[0];
      if (courant.fonction !== def.fonction || courant.mode !== "write" ||
        courant.capaciteId !== def.capacite || courant.actionId !== def.action) {
        throw new Error(`${def.operation} existe avec une configuration différente ; aucune modification automatique.`);
      }
      const entree = await reprendreJournalDebut(g, cle, "DROIT-OPERATION-CREER", avant, apres, contexte);
      if (entree) await journal.terminer(g, entree, { statut: "SUCCÈS", avant,
        apres: { ...apres, idNatif: courant.id }, contexte });
      console.log(`Déjà configurée : ${def.operation}`);
      continue;
    }
    if (!appliquer) {
      console.log(`À créer : ${def.operation} | capacité native ${def.capacite} | action native ${def.action} | périmètre direct OBJ-SITE-PUBLIC existant`);
      continue;
    }
    const entree = await reprendreJournalDebut(g, cle, "DROIT-OPERATION-CREER", avant, apres, contexte) ||
      await journal.commencer(g, {
      cle, action: "DROIT-OPERATION-CREER", nom: `Opération ${def.operation}`,
      avant, apres, contexte
    });
    try {
      const cree = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${l.id}/items`, { fields: champs });
      if (!cree?.id) throw new Error(`${def.operation} : ID natif absent après création.`);
      const relu = await dse.graphSansCache(g.token,
        `/sites/${g.siteGraphId}/lists/${l.id}/items/${encodeURIComponent(cree.id)}?$expand=fields($select=${Object.keys(champs).join(",")})`);
      if (!Object.entries(champs).every(([k, v]) => String(relu.fields?.[k] ?? "") === String(v))) {
        throw new Error(`${def.operation} : relecture SharePoint différente.`);
      }
      await journal.terminer(g, entree, { statut: "SUCCÈS", avant: { operationAbsente: true },
        apres: { idNatif: String(cree.id), operation: def.operation, fonction: def.fonction,
          capaciteId: def.capacite, actionId: def.action, perimetreDirect: true }, contexte: entree.contexte });
      console.log(`Créée, relue et journalisée : ${def.operation} (ID natif ${cree.id})`);
    } catch (erreur) {
      try {
        await journal.terminer(g, entree, { statut: "ÉCHEC", avant: { operationAbsente: true },
          apres: null, anomalie: true, erreur: erreur.message, contexte: entree.contexte });
      } catch (journalErreur) {
        console.error("[DSE droits opération journal]", journalErreur.message);
      }
      throw erreur;
    }
  }
  if (appliquer) {
    ecriture.invaliderCaches();
    console.log("Aucun rôle, permission utilisateur, affectation, périmètre ni site n'a été créé ou modifié.");
  }
}

if (require.main === module) (process.argv.includes("--article-site")
  ? siteArticle(process.argv.includes("--apply")) : process.argv.includes("--menu-logo")
    ? configurerOperationsMenuLogo(process.argv.includes("--apply")) : process.argv.includes("--configure")
      ? configurer(process.argv.includes("--apply")) : provisionner(process.argv.includes("--apply"))).catch((err) => {
  console.error("[DSE droits structure]", err.message);
  process.exitCode = 1;
});

module.exports = { provisionner, configurer, siteArticle, configurerOperationsMenuLogo, DEFINITIONS };
