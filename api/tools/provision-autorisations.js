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

async function configurerOperationDemandesComptes(appliquer = false) {
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
    return { liste: l, id: String(trouves[0].id), nom: String(trouves[0].fields?.Title || titre) };
  };
  const [capacite, action] = await Promise.all([
    identifiant("OBJ-CAPACITE", "UTILISATEURS"),
    identifiant("OBJ-ACTION", "ADMINISTRER")
  ]);
  const droits = await autorisations.charger(g.token, g.siteGraphId, g.listes);
  const sites = liste("OBJ-SITE-PUBLIC");
  if (!droits.configurations.some((c) => c.mode === "direct" && c.listeCible.toLowerCase() === sites.id.toLowerCase())) {
    throw new Error("Aucun périmètre direct existant vers OBJ-SITE-PUBLIC ; opération non créée.");
  }
  if (droits.possibles.filter((x) => x.capaciteId === capacite.id && x.actionId === action.id).length !== 1) {
    throw new Error("La relation active UTILISATEURS / ADMINISTRER est absente ou ambiguë.");
  }
  const def = { operation: "utilisateurs.demande-compte", fonction: "utilisateurs",
    mode: "write", libelle: "Demandes de compte", route: "demandes-comptes",
    capaciteId: capacite.id, actionId: action.id };
  const existantes = droits.operations.filter((o) => o.operation === def.operation);
  if (existantes.length > 1) throw new Error(`${def.operation} : opération dupliquée.`);
  if (existantes.length === 1) {
    const o = existantes[0];
    if (o.fonction !== def.fonction || o.mode !== def.mode ||
        o.capaciteId !== def.capaciteId || o.actionId !== def.actionId) {
      throw new Error(`${def.operation} existe avec une configuration différente ; aucune modification automatique.`);
    }
    console.log(`Déjà configurée : ${def.operation}. Aucun droit utilisateur n’est attribué.`);
    return;
  }
  const operations = liste("OBJ-DROIT-OPERATION");
  const colonnes = await dse.chargerColonnesListe(g.token, g.siteGraphId, operations.id, { contraintes: true });
  const champ = (nom, type) => {
    const xs = colonnes.filter((c) => normaliser(c.displayName) === normaliser(nom) &&
      (!type || c[type]) && !c.readOnly && !c.hidden);
    if (xs.length !== 1) throw new Error(`OBJ-DROIT-OPERATION : colonne ${nom} absente ou ambiguë.`);
    return xs[0];
  };
  const champs = {
    Title: def.operation,
    [champ("OPERATION-TECHNIQUE", "text").name]: def.operation,
    [champ("FONCTION-COCKPIT", "text").name]: def.fonction,
    [champ("MODE-TECHNIQUE", "text").name]: def.mode,
    [champ("LIBELLE-INTERFACE", "text").name]: def.libelle,
    [champ("ROUTE-COCKPIT", "text").name]: def.route,
    [`${champ("OBJ-CAPACITE", "lookup").name}LookupId`]: def.capaciteId,
    [`${champ("OBJ-ACTION", "lookup").name}LookupId`]: def.actionId,
    [champ("ACTIF", "boolean").name]: true
  };
  if (champ("OBJ-CAPACITE", "lookup").lookup.listId.toLowerCase() !== capacite.liste.id.toLowerCase() ||
      champ("OBJ-ACTION", "lookup").lookup.listId.toLowerCase() !== action.liste.id.toLowerCase()) {
    throw new Error("OBJ-DROIT-OPERATION : les Lookups de capacité/action ne ciblent pas les listes natives attendues.");
  }
  const cle = `DSE-DROIT-OPERATION-${ecriture.hash([operations.id, def.operation, champs])}`;
  const avant = { operationAbsente: true };
  const apres = { operation: def.operation, fonction: def.fonction,
    capaciteId: def.capaciteId, actionId: def.actionId, droitsUtilisateurModifies: false };
  const contexte = { siteListeId: sites.id, configuration: "OBJ-DROIT-OPERATION",
    relationExistante: "UTILISATEURS/ADMINISTRER" };
  if (!appliquer) {
    console.log(`À créer : ${def.operation} | capacité UTILISATEURS | action ADMINISTRER | aucun droit utilisateur attribué`);
    return;
  }
  const entree = await reprendreJournalDebut(g, cle, "DROIT-OPERATION-CREER", avant, apres, contexte) ||
    await journal.commencer(g, { cle, action: "DROIT-OPERATION-CREER",
      nom: `Opération ${def.operation}`, avant, apres, contexte });
  try {
    const cree = await dse.graphEcriture(g.token, "POST",
      `/sites/${g.siteGraphId}/lists/${operations.id}/items`, { fields: champs });
    if (!cree?.id) throw new Error(`${def.operation} : ID natif absent après création.`);
    const relu = await dse.graphSansCache(g.token,
      `/sites/${g.siteGraphId}/lists/${operations.id}/items/${encodeURIComponent(cree.id)}?$expand=fields($select=${Object.keys(champs).join(",")})`);
    if (!Object.entries(champs).every(([k, v]) => String(relu.fields?.[k] ?? "") === String(v))) {
      throw new Error(`${def.operation} : relecture SharePoint différente.`);
    }
    await journal.terminer(g, entree, { statut: "SUCCÈS", avant,
      apres: { ...apres, idNatif: String(cree.id) }, contexte });
    ecriture.invaliderCaches();
    console.log(`Créée, relue et journalisée : ${def.operation} (ID natif ${cree.id}). Aucun droit utilisateur n’est attribué.`);
  } catch (erreur) {
    try {
      await journal.terminer(g, entree, { statut: "ÉCHEC", avant, apres: null,
        anomalie: true, erreur: erreur.message, contexte });
    } catch (journalErreur) {
      console.error("[DSE demandes de compte journal]", journalErreur.message);
    }
    throw erreur;
  }
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
    return { liste: l, id: String(trouves[0].id), nom: String(trouves[0].fields?.Title || titre) };
  };
  const [capEntete, capMedias, actionVoir, actionCreer, actionModifier, actionPublier, actionAdministrer] = await Promise.all([
    identifiant("OBJ-CAPACITE", "EN-TÊTE"), identifiant("OBJ-CAPACITE", "MÉDIAS"),
    identifiant("OBJ-ACTION", "VOIR"), identifiant("OBJ-ACTION", "CRÉER"),
    identifiant("OBJ-ACTION", "MODIFIER"), identifiant("OBJ-ACTION", "PUBLIER"),
    identifiant("OBJ-ACTION", "ADMINISTRER")
  ]);
  let droits = await autorisations.charger(g.token, g.siteGraphId, g.listes);
  const capacites = [
    { operation: "menu.voir", fonction: "menu", capacite: capEntete.id, action: actionVoir.id, libelle: "Menus", route: "menu", mode: "read" },
    { operation: "menu.creer", fonction: "menu", capacite: capEntete.id, action: actionCreer.id, libelle: "Créer un menu", route: "menu" },
    { operation: "menu.modifier", fonction: "menu", capacite: capEntete.id, action: actionModifier.id, libelle: "Modifier un menu", route: "menu" },
    { operation: "menu.entree.supprimer", fonction: "menu", capacite: capEntete.id, action: actionAdministrer.id, libelle: "Supprimer une entrée de menu", route: "menu" },
    { operation: "menu.publier", fonction: "menu", capacite: capEntete.id, action: actionPublier.id, libelle: "Publier un menu", route: "menu" },
    { operation: "menu.affecter", fonction: "menu", capacite: capEntete.id, action: actionAdministrer.id, libelle: "Affecter un menu", route: "menu" },
    { operation: "logo-medias.modifier", fonction: "logo-medias", capacite: capMedias.id, action: actionModifier.id, libelle: "Logo et médias", route: "logo-medias" }
  ];
  const cibleSite = liste("OBJ-SITE-PUBLIC");
  const portees = droits.configurations.filter((c) => c.mode === "direct" &&
    c.listeCible.toLowerCase() === cibleSite.id.toLowerCase());
  if (!portees.length) throw new Error("Aucun périmètre direct existant vers OBJ-SITE-PUBLIC ; opération non créée.");

  async function assurerRelationCapaciteAction(capacite, action, cleNom) {
    const relation = liste("OBJ-CAPACITE-ACTION");
    const colonnesRelation = await dse.chargerColonnesListe(g.token, g.siteGraphId, relation.id);
    const colCapacite = colonnesRelation.find((c) => c.lookup?.listId.toLowerCase() === capEntete.liste.id.toLowerCase());
    const actionsListe = liste("OBJ-ACTION");
    const colAction = colonnesRelation.find((c) => c.lookup?.listId.toLowerCase() === actionsListe.id.toLowerCase());
    const cEmpreinte = colonnesRelation.find((c) => normaliser(c.displayName) === "EMPREINTECAPACITEACTION" && c.text);
    const colTitre = colonnesRelation.find((c) => c.name === "Title" && c.text);
    const cActif = colonnesRelation.find((c) => normaliser(c.displayName) === "ACTIF" && c.boolean);
    const cCapaciteCode = colonnesRelation.find((c) => normaliser(c.displayName) === "CODECAPACITE" && c.text);
    const cActionCode = colonnesRelation.find((c) => normaliser(c.displayName) === "CODEACTION" && c.text);
    if (!colCapacite || !colAction || !cEmpreinte || !colTitre || !cActif || !cCapaciteCode || !cActionCode) {
      throw new Error("OBJ-CAPACITE-ACTION : structure existante insuffisante pour les capacités Menu.");
    }
    const rows = await dse.chargerItemsListe(g.token, g.siteGraphId, relation.id);
    const exactes = rows.filter((x) =>
      String(x.fields?.[`${colCapacite.name}LookupId`] || "") === capacite.id &&
      String(x.fields?.[`${colAction.name}LookupId`] || "") === action.id);
    if (exactes.length > 1) throw new Error(`${cleNom} : relation capacité/action dupliquée.`);
    if (exactes.length === 1) {
      const row = exactes[0];
      if (row.fields?.[cActif.name] !== true || !row.fields?.[cEmpreinte.name]) {
        throw new Error(`${cleNom} : relation existante inactive ou incomplète.`);
      }
      console.log(`Relation déjà configurée : ${cleNom}`);
      return;
    }
    if (!appliquer) {
      console.log(`Relation à créer sans attribution de droit : ${cleNom}`);
      return;
    }
    const empreinte = `CAP-${capacite.id}-ACT-${action.id}`;
    if (rows.some((x) => x.fields?.[cEmpreinte.name] === empreinte)) {
      throw new Error(`${cleNom} : empreinte déjà utilisée par une autre relation.`);
    }
    const champsRelation = {
      [colTitre.name]: `${cleNom} — ${action.nom}`,
      [cCapaciteCode.name]: "EN-TÊTE",
      [cActionCode.name]: action.nom,
      [cActif.name]: true,
      [cEmpreinte.name]: empreinte,
      [`${colCapacite.name}LookupId`]: capacite.id,
      [`${colAction.name}LookupId`]: action.id
    };
    const cle = `DSE-CAPACITE-ACTION-${ecriture.hash([relation.id, empreinte])}`;
    const avant = { relationAbsente: true };
    const contexte = { listeId: relation.id, empreinte, operation: cleNom };
    const entree = await journal.commencer(g, {
      cle, action: "CAPACITE-ACTION-MENU-CREER", nom: cleNom, avant, apres: champsRelation, contexte
    });
    try {
      const cree = await dse.graphEcriture(g.token, "POST",
        `/sites/${g.siteGraphId}/lists/${relation.id}/items`, { fields: champsRelation });
      if (!cree?.id) throw new Error(`${cleNom} : ID natif absent après création.`);
      const relu = await dse.graphSansCache(g.token,
        `/sites/${g.siteGraphId}/lists/${relation.id}/items/${encodeURIComponent(cree.id)}?$expand=fields($select=${Object.keys(champsRelation).join(",")})`);
      if (!Object.entries(champsRelation).every(([k, v]) => String(relu.fields?.[k] ?? "") === String(v))) {
        throw new Error(`${cleNom} : relecture SharePoint différente.`);
      }
      await journal.terminer(g, entree, { statut: "SUCCÈS", avant,
        apres: { idNatif: String(cree.id), capaciteId: capacite.id, actionId: action.id, droitsAttribues: false }, contexte });
      console.log(`Relation créée, relue et journalisée sans droits : ${cleNom} (ID natif ${cree.id})`);
    } catch (erreur) {
      try {
        await journal.terminer(g, entree, { statut: "ÉCHEC", avant, apres: null,
          anomalie: true, erreur: erreur.message, contexte });
      } catch (journalErreur) {
        console.error("[DSE capacité/action journal]", journalErreur.message);
      }
      throw erreur;
    }
  }

  await assurerRelationCapaciteAction(capEntete, actionCreer, "EN-TÊTE / CRÉER");
  await assurerRelationCapaciteAction(capEntete, actionAdministrer, "EN-TÊTE / ADMINISTRER");
  if (appliquer) {
    dse.viderCacheGraph();
    droits = await autorisations.charger(g.token, g.siteGraphId, g.listes);
  }

  for (const def of capacites) {
    const capaciteAction = droits.possibles.filter((x) => x.capaciteId === def.capacite && x.actionId === def.action);
    if (capaciteAction.length !== 1) {
      if (!appliquer && ["menu.creer", "menu.affecter"].includes(def.operation)) {
        console.log(`Opération à configurer après la relation capacité/action : ${def.operation}`);
        continue;
      }
      throw new Error(`${def.operation} : relation capacité/action existante absente ou ambiguë.`);
    }
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
      ["MODE-TECHNIQUE", def.mode || "write"], ["LIBELLE-INTERFACE", def.libelle], ["ROUTE-COCKPIT", def.route]
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
      if (courant.fonction !== def.fonction || courant.mode !== (def.mode || "write") ||
        courant.capaciteId !== def.capacite) {
        throw new Error(`${def.operation} existe avec une configuration différente ; aucune modification automatique.`);
      }
      if (courant.actionId !== def.action) {
        const changementAttendu = ["menu.creer", "menu.affecter"].includes(def.operation) &&
          courant.actionId === actionModifier.id;
        if (!changementAttendu) {
          throw new Error(`${def.operation} existe avec une action différente ; aucune modification automatique.`);
        }
        if (!appliquer) {
          console.log(`À reconfigurer sans attribution de droit : ${def.operation} (action native ${def.action})`);
          continue;
        }
        const chemin = `/sites/${g.siteGraphId}/lists/${l.id}/items/${encodeURIComponent(courant.id)}`;
        const courantGraph = await dse.graphSansCache(g.token, `${chemin}?$expand=fields($select=${Object.keys(champs).join(",")})`);
        const etag = courantGraph?.eTag || courantGraph?.["@odata.etag"];
        if (!etag || String(courantGraph.fields?.[`${champ("OBJ-ACTION", "lookup").name}LookupId`]) !== actionModifier.id) {
          throw new Error(`${def.operation} : la configuration a changé, reconfiguration refusée.`);
        }
        const cleReconfig = `DSE-DROIT-OPERATION-RECONFIG-${ecriture.hash([l.id, def.operation, actionModifier.id, def.action])}`;
        const avantReconfig = { operation: def.operation, actionId: actionModifier.id };
        const apresReconfig = { operation: def.operation, actionId: def.action };
        const contexteReconfig = { siteListeId: cibleSite.id, configuration: "OBJ-DROIT-OPERATION",
          perimetreDirect: true, droitsUtilisateurModifies: false };
        const entreeReconfig = await reprendreJournalDebut(g, cleReconfig, "DROIT-OPERATION-RECONFIGURER",
          avantReconfig, apresReconfig, contexteReconfig) || await journal.commencer(g, {
          cle: cleReconfig, action: "DROIT-OPERATION-RECONFIGURER", nom: `Opération ${def.operation}`,
          avant: avantReconfig, apres: apresReconfig, contexte: contexteReconfig
        });
        try {
          await dse.graphEcriture(g.token, "PATCH", `${chemin}/fields`,
            { [`${champ("OBJ-ACTION", "lookup").name}LookupId`]: def.action }, etag);
          const relu = await dse.graphSansCache(g.token, `${chemin}?$expand=fields($select=${Object.keys(champs).join(",")})`);
          if (String(relu.fields?.[`${champ("OBJ-ACTION", "lookup").name}LookupId`]) !== def.action) {
            throw new Error(`${def.operation} : nouvelle action non relue.`);
          }
          await journal.terminer(g, entreeReconfig, { statut: "SUCCÈS", avant: avantReconfig,
            apres: { ...apresReconfig, idNatif: String(courant.id) }, contexte: contexteReconfig });
          console.log(`Opération reconfigurée, relue et journalisée sans attribution : ${def.operation}`);
        } catch (erreur) {
          try {
            await journal.terminer(g, entreeReconfig, { statut: "ÉCHEC", avant: avantReconfig, apres: null,
              anomalie: true, erreur: erreur.message, contexte: contexteReconfig });
          } catch (journalErreur) {
            console.error("[DSE droits opération journal]", journalErreur.message);
          }
          throw erreur;
        }
        continue;
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
  ? siteArticle(process.argv.includes("--apply")) : process.argv.includes("--demandes-comptes")
    ? configurerOperationDemandesComptes(process.argv.includes("--apply")) : process.argv.includes("--menu-logo")
      ? configurerOperationsMenuLogo(process.argv.includes("--apply")) : process.argv.includes("--configure")
        ? configurer(process.argv.includes("--apply")) : provisionner(process.argv.includes("--apply"))).catch((err) => {
  console.error("[DSE droits structure]", err.message);
  process.exitCode = 1;
});

module.exports = { provisionner, configurer, siteArticle, configurerOperationsMenuLogo,
  configurerOperationDemandesComptes, DEFINITIONS };
