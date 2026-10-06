"use strict";

const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const autorisations = require("../auth/autorisations");

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

if (require.main === module) (process.argv.includes("--article-site")
  ? siteArticle(process.argv.includes("--apply")) : process.argv.includes("--configure")
    ? configurer(process.argv.includes("--apply")) : provisionner(process.argv.includes("--apply"))).catch((err) => {
  console.error("[DSE droits structure]", err.message);
  process.exitCode = 1;
});

module.exports = { provisionner, configurer, siteArticle, DEFINITIONS };
