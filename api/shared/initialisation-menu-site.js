"use strict";

const crypto = require("node:crypto");
const dse = require("./dse");
const ecriture = require("./ecriture");
const journal = require("./journal-comptes");
const menus = require("./multi-menus");

const normaliser = (v) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]/g, "");
const items = async (g, liste, champs) => ecriture.collecterFrais(g,
  `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields($select=${[...new Set(["Title", ...champs])].join(",")})&$top=500`);
const colonne = (colonnes, nom, type) => {
  const xs = colonnes.filter((c) => !c.hidden && !c.readOnly && c.name === nom && (!type || c[type]));
  if (xs.length !== 1) throw new Error(`Structure SharePoint absente ou ambiguë : ${nom}.`);
  return xs[0];
};
const liste = (g, nom) => {
  const xs = g.listes.filter((x) => x.displayName === nom);
  if (xs.length !== 1) throw new Error(`Liste SharePoint unique requise : ${nom}.`);
  return xs[0];
};
const idEtat = async (g, nom, titre) => {
  const l = liste(g, nom);
  const xs = (await items(g, l, [])).filter((x) => normaliser(x.fields.Title) === normaliser(titre));
  if (xs.length !== 1) throw new Error(`Référentiel ${nom} : état ${titre} absent ou ambigu.`);
  return String(xs[0].id);
};

async function enregistrerCreation(g, { list, itemId, fields, action, nom, siteId }) {
  const avant = { elementAbsent: true };
  const cle = `INITIALISATION-MENU:${ecriture.hash([list.id, siteId, itemId || fields.EMPREINTEMENU || fields.EMPREINTEENTREE || fields.EMPREINTEAFFECTATION])}:${crypto.randomUUID()}`;
  const contexte = { siteId: String(siteId), listeId: String(list.id), ...(itemId ? { itemId: String(itemId) } : {}) };
  const entree = await journal.commencer(g, { cle, action, nom, avant, apres: fields, contexte });
  let id;
  try {
    try {
      const cree = await dse.graphEcriture(g.token, "POST",
        `/sites/${g.siteGraphId}/lists/${list.id}/items`, { fields });
      id = String(cree?.id || "");
      if (!id) throw new Error("SharePoint n’a pas retourné l’identifiant natif de l’élément.");
    } catch (writeError) {
      const empreinteField = Object.keys(fields).find((key) => key.startsWith("EMPREINTE"));
      const correspondances = empreinteField
        ? (await items(g, list, [empreinteField])).filter((x) => x.fields[empreinteField] === fields[empreinteField])
        : [];
      if (correspondances.length !== 1) throw writeError;
      id = String(correspondances[0].id);
    }
    const relu = await ecriture.lireItemFrais(g, list.id, id, Object.keys(fields));
    const differences = Object.entries(fields).filter(([key, value]) => String(relu[key] ?? "") !== String(value ?? "")).map(([key]) => key);
    if (differences.length) throw new Error(`La relecture SharePoint de l’élément créé diffère : ${differences.join(", ")}.`);
  } catch (err) {
    try {
      await journal.terminer(g, entree, { statut: "ÉCHEC", anomalie: true, erreur: err.message, avant, apres: null, contexte });
    } catch (journalErreur) {
      console.error("[DSE initialisation menu] journal échec", journalErreur.message);
      throw new Error("L’initialisation a échoué et la fin de son journal OBJ-JRN doit être vérifiée avant reprise.");
    }
    throw err;
  }
  await journal.terminer(g, entree, { statut: "SUCCÈS", avant,
    apres: { idNatif: id, empreinte: fields.EMPREINTEMENU || fields.EMPREINTEENTREE || fields.EMPREINTEAFFECTATION },
    contexte });
  return id;
}

async function assurerMenu(g, s, siteId, states) {
  const l = liste(g, "OBJ-MENU");
  const c = {
    titre: colonne(s.colonnes["OBJ-MENU"], "Title", "text"),
    site: colonne(s.colonnes["OBJ-MENU"], "OBJSITEPUBLIC", "lookup"),
    description: colonne(s.colonnes["OBJ-MENU"], "DESCRIPTION", "text"),
    actif: colonne(s.colonnes["OBJ-MENU"], "OBJACTIF", "lookup"),
    valide: colonne(s.colonnes["OBJ-MENU"], "OBJVALIDE", "lookup"),
    empreinte: colonne(s.colonnes["OBJ-MENU"], "EMPREINTEMENU", "text"),
    modifie: colonne(s.colonnes["OBJ-MENU"], "DATEMODIFICATION", "dateTime")
  };
  const empreinte = menus.empreinte([siteId, "Menu principal"]);
  const raw = await items(g, l, [`${c.site.name}LookupId`, c.empreinte.name]);
  const candidats = raw.filter((x) => String(x.fields[`${c.site.name}LookupId`] || "") === String(siteId) &&
    (x.fields[c.empreinte.name] === empreinte || normaliser(x.fields.Title) === "MENUPRINCIPAL"));
  if (candidats.length > 1) throw new Error("Plusieurs menus principaux existent déjà : réparation manuelle requise.");
  if (candidats.length === 1) return { id: String(candidats[0].id), cree: false };
  const fields = {
    [c.titre.name]: "Menu principal",
    [`${c.site.name}LookupId`]: String(siteId),
    [c.description.name]: "",
    [`${c.actif.name}LookupId`]: states.actif,
    [`${c.valide.name}LookupId`]: states.valide,
    [c.empreinte.name]: empreinte,
    [c.modifie.name]: new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
  };
  const id = await enregistrerCreation(g, { list: l, fields, action: "MENU-PRINCIPAL-CREER",
    nom: "Création du Menu principal", siteId });
  return { id, cree: true };
}

async function assurerAccueil(g, s, siteId, menuId, states) {
  const pages = liste(g, "OBJ-PAGES-SITE");
  const pageSite = await dse.chargerColonnesListe(g.token, g.siteGraphId, pages.id);
  const relationSite = pageSite.filter((c) => c.lookup && !c.lookup.allowMultipleValues &&
    c.lookup.listId.toLowerCase() === liste(g, "OBJ-SITE-PUBLIC").id.toLowerCase());
  if (relationSite.length !== 1) throw new Error("Relation page/site absente ou ambiguë.");
  const relationEntete = pageSite.filter((c) => c.lookup && !c.lookup.allowMultipleValues &&
    c.lookup.listId.toLowerCase() === liste(g, "OBJ-ENTETE-SITE").id.toLowerCase());
  if (relationEntete.length > 1) throw new Error("Relation page/en-tête ambiguë.");
  const urls = pageSite.filter((c) => !c.hidden && (normaliser(c.name) === "URL" || normaliser(c.displayName) === "URL") && c.text);
  if (urls.length !== 1) return { trouvee: false, raison: "Colonne URL de page absente ou ambiguë." };
  const pageActif = (await dse.chargerColonnesListe(g.token, g.siteGraphId, pages.id))
    .filter((c) => c.lookup && liste(g, "OBJ-ACTIF") && c.lookup.listId.toLowerCase() === liste(g, "OBJ-ACTIF").id.toLowerCase());
  const pageValide = (await dse.chargerColonnesListe(g.token, g.siteGraphId, pages.id))
    .filter((c) => c.lookup && liste(g, "OBJ-VALIDE") && c.lookup.listId.toLowerCase() === liste(g, "OBJ-VALIDE").id.toLowerCase());
  if (pageActif.length !== 1 || pageValide.length !== 1) return { trouvee: false, raison: "État de publication de page absent ou ambigu." };
  const pageRows = await items(g, pages, [`${relationSite[0].name}LookupId`, ...(relationEntete.length ? [`${relationEntete[0].name}LookupId`] : []), urls[0].name,
    `${pageActif[0].name}LookupId`, `${pageValide[0].name}LookupId`]);
  const racines = pageRows.filter((p) => String(p.fields[`${relationSite[0].name}LookupId`] || "") === String(siteId) &&
    String(p.fields[urls[0].name] || "").trim() === "/");
  if (racines.length > 1) throw new Error("Plusieurs pages réelles utilisent l’URL d’accueil ; aucune entrée n’a été créée.");
  if (!racines.length) return { trouvee: false, raison: "Aucune page réelle n’utilise l’URL d’accueil /." };

  const l = liste(g, "OBJ-MENU-ENTREE");
  const c = {
    title: colonne(s.colonnes["OBJ-MENU-ENTREE"], "Title", "text"),
    menu: colonne(s.colonnes["OBJ-MENU-ENTREE"], "OBJMENU", "lookup"),
    page: colonne(s.colonnes["OBJ-MENU-ENTREE"], "OBJPAGESSITE", "lookup"),
    url: colonne(s.colonnes["OBJ-MENU-ENTREE"], "URLPERSONNALISEE", "text"),
    parent: colonne(s.colonnes["OBJ-MENU-ENTREE"], "ENTREEPARENTE", "lookup"),
    ordre: colonne(s.colonnes["OBJ-MENU-ENTREE"], "ORDRE", "number"),
    nouvelleFenetre: colonne(s.colonnes["OBJ-MENU-ENTREE"], "OUVERTURENOUVELLEFENETRE", "boolean"),
    actif: colonne(s.colonnes["OBJ-MENU-ENTREE"], "OBJACTIF", "lookup"),
    valide: colonne(s.colonnes["OBJ-MENU-ENTREE"], "OBJVALIDE", "lookup"),
    empreinte: colonne(s.colonnes["OBJ-MENU-ENTREE"], "EMPREINTEENTREE", "text")
  };
  const page = racines[0];
  const empreinte = menus.empreinte([menuId, "Accueil", "page", page.id, ""]);
  const existing = await items(g, l, [`${c.menu.name}LookupId`, `${c.page.name}LookupId`, c.empreinte.name]);
  const matches = existing.filter((x) => String(x.fields[`${c.menu.name}LookupId`] || "") === menuId &&
    (x.fields[c.empreinte.name] === empreinte ||
      String(x.fields[`${c.page.name}LookupId`] || "") === String(page.id)));
  if (matches.length > 1) throw new Error("Plusieurs entrées Accueil existent déjà dans le Menu principal.");
  const pageHeaderId = relationEntete.length ? String(page.fields[`${relationEntete[0].name}LookupId`] || "") : "";
  if (matches.length === 1) return { trouvee: true, creee: false, pageId: String(page.id), headerId: pageHeaderId || null };
  const publiee = String(page.fields[`${pageActif[0].name}LookupId`] || "") === states.actif &&
    String(page.fields[`${pageValide[0].name}LookupId`] || "") === states.valide;
  const fields = {
    [c.title.name]: "Accueil",
    [`${c.menu.name}LookupId`]: String(menuId),
    [`${c.page.name}LookupId`]: String(page.id),
    [c.url.name]: "",
    [`${c.parent.name}LookupId`]: null,
    [c.ordre.name]: 10,
    [c.nouvelleFenetre.name]: false,
    [`${c.actif.name}LookupId`]: states.actif,
    [`${c.valide.name}LookupId`]: publiee ? states.valide : states.invalide,
    [c.empreinte.name]: empreinte
  };
  await enregistrerCreation(g, { list: l, fields, action: "MENU-ACCUEIL-AJOUTER",
    nom: "Ajout de la page d’accueil au Menu principal", siteId });
  return { trouvee: true, creee: true, pageId: String(page.id), headerId: pageHeaderId || null };
}

async function assurerAffectation(g, s, siteId, menuId, states, pageHeaderId = null) {
  const l = liste(g, "OBJ-ENTETE-SITE");
  const siteRel = await dse.chargerColonnesListe(g.token, g.siteGraphId, l.id);
  const colsSite = siteRel.filter((c) => c.lookup && !c.lookup.allowMultipleValues &&
    c.lookup.listId.toLowerCase() === liste(g, "OBJ-SITE-PUBLIC").id.toLowerCase());
  const colsActif = siteRel.filter((c) => c.lookup && !c.lookup.allowMultipleValues &&
    c.lookup.listId.toLowerCase() === liste(g, "OBJ-ACTIF").id.toLowerCase());
  const colsValide = siteRel.filter((c) => c.lookup && !c.lookup.allowMultipleValues &&
    c.lookup.listId.toLowerCase() === liste(g, "OBJ-VALIDE").id.toLowerCase());
  if (colsSite.length !== 1 || colsActif.length !== 1 || colsValide.length !== 1) {
    return { affectee: false, raison: "Relation ou état de l’en-tête absent ou ambigu." };
  }
  const tous = await items(g, l, [`${colsSite[0].name}LookupId`, `${colsActif[0].name}LookupId`,
    `${colsValide[0].name}LookupId`]);
  const headers = tous.filter((x) => String(x.fields[`${colsSite[0].name}LookupId`] || "") === String(siteId));
  if (!headers.length) return { affectee: false, raison: "Aucun en-tête réel n’est lié au site." };
  const candidats = pageHeaderId
    ? headers.filter((x) => String(x.id) === String(pageHeaderId))
    : headers.filter((x) => String(x.fields[`${colsActif[0].name}LookupId`] || "") === states.actif &&
      String(x.fields[`${colsValide[0].name}LookupId`] || "") === states.valide);
  if (candidats.length !== 1) return { affectee: false, raison: pageHeaderId
    ? "L’en-tête lié à la vraie page d’accueil est absent ou ambigu."
    : "Un en-tête unique actif et validé n’a pas pu être identifié." };
  if (String(candidats[0].fields[`${colsActif[0].name}LookupId`] || "") !== states.actif ||
      String(candidats[0].fields[`${colsValide[0].name}LookupId`] || "") !== states.valide) {
    return { affectee: false, raison: "L’en-tête associé à l’accueil n’est pas actif et validé." };
  }

  const assignmentList = liste(g, "OBJ-MENU-AFFECTATION");
  const assignmentCols = s.colonnes["OBJ-MENU-AFFECTATION"];
  const c = {
    title: colonne(assignmentCols, "Title", "text"),
    menu: colonne(assignmentCols, "OBJMENU", "lookup"),
    header: colonne(assignmentCols, "OBJENTETESITE", "lookup"),
    footer: colonne(assignmentCols, "OBJFOOTERSITE", "lookup"),
    type: colonne(assignmentCols, "TYPEEMPLACEMENT", "text"),
    ordre: colonne(assignmentCols, "ORDRE", "number"),
    actif: colonne(assignmentCols, "OBJACTIF", "lookup"),
    valide: colonne(assignmentCols, "OBJVALIDE", "lookup"),
    empreinte: colonne(assignmentCols, "EMPREINTEAFFECTATION", "text")
  };
  const headerId = String(candidats[0].id);
  const empreinte = menus.empreinte([siteId, "OBJ-ENTETE-SITE", headerId]);
  const raw = await items(g, assignmentList, [`${c.menu.name}LookupId`, `${c.header.name}LookupId`, c.empreinte.name]);
  const matches = raw.filter((x) => String(x.fields[`${c.header.name}LookupId`] || "") === headerId);
  if (matches.length > 1) throw new Error("Plusieurs menus sont déjà affectés à cet en-tête.");
  if (matches.length === 1) {
    return String(matches[0].fields[`${c.menu.name}LookupId`] || "") === String(menuId)
      ? { affectee: true, creee: false }
      : { affectee: false, raison: "Un autre menu est déjà affecté à cet en-tête ; il n’a pas été remplacé." };
  }
  const fields = {
    [c.title.name]: "Menu principal — En-tête",
    [`${c.menu.name}LookupId`]: String(menuId),
    [`${c.header.name}LookupId`]: headerId,
    [`${c.footer.name}LookupId`]: null,
    [c.type.name]: "En-tête",
    [c.ordre.name]: 10,
    [`${c.actif.name}LookupId`]: states.actif,
    [`${c.valide.name}LookupId`]: states.valide,
    [c.empreinte.name]: empreinte
  };
  await enregistrerCreation(g, { list: assignmentList, fields, action: "MENU-PRINCIPAL-AFFECTER",
    nom: "Affectation du Menu principal à l’en-tête", siteId });
  return { affectee: true, creee: true };
}

async function initialiser({ siteId }) {
  if (!/^\d{1,12}$/.test(String(siteId || ""))) throw new Error("ID natif du site invalide.");
  const g = await ecriture.contexteGraph();
  const s = await menus.schema(g);
  const [actif, inactif, brouillon, valide, invalide] = await Promise.all([
    idEtat(g, "OBJ-ACTIF", "Oui"), idEtat(g, "OBJ-ACTIF", "Non"),
    idEtat(g, "OBJ-ACTIF", "Brouillon"), idEtat(g, "OBJ-VALIDE", "Oui"), idEtat(g, "OBJ-VALIDE", "Non")
  ]);
  const states = { actif, inactif, brouillon, valide, invalide };
  const menu = await assurerMenu(g, s, siteId, states);
  const accueil = await assurerAccueil(g, s, siteId, menu.id, states);
  const affectation = await assurerAffectation(g, s, siteId, menu.id, states, accueil.headerId);
  return {
    menu: { id: menu.id, cree: menu.cree },
    accueil: accueil.trouvee ? { presente: true, creee: accueil.creee, pageId: accueil.pageId } :
      { presente: false, raison: accueil.raison },
    affectation,
    aReparer: !accueil.trouvee || !affectation.affectee
  };
}

module.exports = { initialiser, _test: { normaliser } };
