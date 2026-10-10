"use strict";

const crypto = require("node:crypto");
const dse = require("./dse");
const ecriture = require("./ecriture");
const catalogue = require("./catalogue");

const cle = catalogue.cleChamp;
const normaliserNomSite = (valeur) => String(valeur || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
const referencesSite = new Map();
const referenceSecrete = crypto.randomBytes(32);

function trouverListe(listes, nom) {
  const resultat = listes.filter((liste) => liste.displayName === nom);
  if (resultat.length !== 1) throw new Error(`Liste SharePoint unique requise : ${nom}.`);
  return resultat[0];
}

function trouverColonne(colonnes, noms, type) {
  const attendus = new Set(noms.map(cle));
  const resultat = colonnes.filter((colonne) => !colonne.hidden &&
    (attendus.has(cle(colonne.displayName)) || attendus.has(cle(colonne.name))) &&
    (!type || colonne[type]));
  if (resultat.length !== 1) throw new Error(`Colonne SharePoint unique requise : ${noms[0]}.`);
  return resultat[0];
}

function operationGlobaleAutorisee(droits, donnees, operation) {
  if (!droits?.reconnu || droits.global !== true || !droits.roleId || !droits.utilisateurId ||
    !donnees?.dynamique) return false;
  const dynamique = donnees.dynamique;
  const definition = dynamique.operations.find((item) => item.operation === operation);
  const modeAttendu = { "site.creer": "create", "site.valider": "validate" }[operation];
  if (!definition || !modeAttendu || definition.mode !== modeAttendu) return false;
  if (!dynamique.roles.some((role) => String(role.id) === String(droits.roleId))) return false;
  const autorisations = require("../auth/autorisations");
  const roleCapacite = autorisations.basePour(dynamique, droits.roleId, definition) &&
    dynamique.possibles.some((item) => String(item.capaciteId) === String(definition.capaciteId) &&
      String(item.actionId) === String(definition.actionId));
  if (!roleCapacite) return false;
  const permissionsGlobales = autorisations.permissionsPour(dynamique, droits.utilisateurId, null, definition);
  return !permissionsGlobales.some((permission) => permission.autorisation === false) &&
    (permissionsGlobales.some((permission) => permission.autorisation === true) ||
      !permissionsGlobales.length && dynamique.bases.some((base) => String(base.roleId) === String(droits.roleId) &&
        base.operationId && base.operationId === definition.id && base.autorisation === true));
}

function referenceDomaine(listeId, itemId) {
  return crypto.createHmac("sha256", referenceSecrete)
    .update(`${listeId}:${itemId}`).digest("base64url").slice(0, 32);
}

function referenceBrouillon(identite, itemId, clientId) {
  const reference = crypto.randomBytes(24).toString("base64url");
  for (const [key, entree] of referencesSite) if (entree.expire < Date.now()) referencesSite.delete(key);
  referencesSite.set(reference, {
    fournisseur: identite.fournisseur, sujet: identite.sujet, itemId: String(itemId),
    clientId: String(clientId), expire: Date.now() + 15 * 60 * 1000
  });
  return reference;
}

function lireReferenceBrouillon(identite, reference) {
  const entree = referencesSite.get(String(reference || ""));
  if (!entree || entree.expire < Date.now() || entree.fournisseur !== identite.fournisseur ||
    entree.sujet !== identite.sujet) return null;
  return entree;
}

function lireIds(fields, colonne) {
  return dse.idsLookupColonne(fields || {}, colonne).map(String);
}

function valeurRenseignée(champs, colonne) {
  const valeur = colonne.lookup
    ? champs[`${colonne.name}LookupId`] ?? champs[colonne.name]
    : champs[colonne.name];
  return Array.isArray(valeur) ? valeur.length > 0 : valeur !== undefined && valeur !== null && valeur !== "";
}

function validerObligatoires(colonnes, champs) {
  const manquants = colonnes.filter((colonne) => colonne.required && !colonne.readOnly && !colonne.hidden &&
    !valeurRenseignée(champs, colonne));
  return manquants.length
    ? `Configuration SharePoint incomplète : champ obligatoire ${manquants[0].displayName || manquants[0].name}.`
    : null;
}

function nomValide(nom, maximum = 255) {
  if (typeof nom !== "string") return null;
  const valeur = nom.trim();
  if (!valeur || valeur.length > maximum || /[\u0000-\u001f\u007f]/.test(valeur)) return null;
  return valeur;
}

async function chargerModele(g = null) {
  const graph = g || await ecriture.contexteGraph();
  const siteListe = trouverListe(graph.listes, "OBJ-SITE-PUBLIC");
  const domainesListe = trouverListe(graph.listes, "OBJ-NOM DE DOMAINE");
  const clientsListe = trouverListe(graph.listes, "OBJ-CLIENT");
  const actifListe = trouverListe(graph.listes, "OBJ-ACTIF");
  const valideListe = trouverListe(graph.listes, "OBJ-VALIDE");
  const [siteColonnes, domaineColonnes, domaines, sites, actifs, valides] = await Promise.all([
    dse.chargerColonnesListe(graph.token, graph.siteGraphId, siteListe.id, { contraintes: true }),
    dse.chargerColonnesListe(graph.token, graph.siteGraphId, domainesListe.id, { contraintes: true }),
    ecriture.collecterFrais(graph, `/sites/${graph.siteGraphId}/lists/${domainesListe.id}/items?$expand=fields&$top=200`),
    ecriture.collecterFrais(graph, `/sites/${graph.siteGraphId}/lists/${siteListe.id}/items?$expand=fields&$top=200`),
    ecriture.collecterFrais(graph, `/sites/${graph.siteGraphId}/lists/${actifListe.id}/items?$expand=fields&$top=200`),
    ecriture.collecterFrais(graph, `/sites/${graph.siteGraphId}/lists/${valideListe.id}/items?$expand=fields&$top=200`)
  ]);
  const siteClient = trouverColonne(siteColonnes, ["OBJ-CLIENT"], "lookup");
  const siteDomaines = trouverColonne(siteColonnes, ["OBJ-NOM DE DOMAINE"], "lookup");
  const sitePrincipal = trouverColonne(siteColonnes, ["DOMAINE-PRINCIPAL"], "lookup");
  const siteActif = trouverColonne(siteColonnes, ["OBJ-ACTIF"], "lookup");
  const siteValide = trouverColonne(siteColonnes, ["OBJ-VALIDE"], "lookup");
  const domaineClient = trouverColonne(domaineColonnes, ["OBJ-CLIENT"], "lookup");
  const domaineActif = trouverColonne(domaineColonnes, ["OBJ-ACTIF"], "lookup");
  const domaineValide = trouverColonne(domaineColonnes, ["OBJ-VALIDE"], "lookup");
  for (const [colonne, liste, multiple] of [
    [siteClient, clientsListe, false], [siteDomaines, domainesListe, true],
    [sitePrincipal, domainesListe, false], [siteActif, actifListe, false],
    [siteValide, valideListe, false], [domaineClient, clientsListe, false],
    [domaineActif, actifListe, false], [domaineValide, valideListe, false]
  ]) {
    if (colonne.lookup.allowMultipleValues !== multiple ||
      colonne.lookup.listId.toLowerCase() !== liste.id.toLowerCase()) {
      throw new Error(`Lookup SharePoint incohérent : ${colonne.displayName || colonne.name}.`);
    }
  }
  const etatId = (items, titre) => {
    const resultats = items.filter((item) => cle(item.fields?.Title) === cle(titre));
    return resultats.length === 1 ? String(resultats[0].id) : null;
  };
  const actifOui = etatId(actifs, "Oui");
  const actifNon = etatId(actifs, "Non");
  const valideOui = etatId(valides, "Oui");
  const valideNon = etatId(valides, "Non");
  if (!actifOui || !actifNon || !valideOui || !valideNon) {
    throw new Error("Les choix Oui/Non des référentiels OBJ-ACTIF et OBJ-VALIDE ne sont pas uniques.");
  }
  const domainesParId = new Map(domaines.map((item) => [String(item.id), item]));
  const sitesParId = new Map(sites.map((item) => [String(item.id), item]));
  const referencesUtilisees = new Set(sites.flatMap((item) =>
    [...lireIds(item.fields, siteDomaines), ...lireIds(item.fields, sitePrincipal)]));
  return {
    graph, siteListe, domainesListe, clientsListe, siteColonnes, domaineColonnes,
    siteClient, siteDomaines, sitePrincipal, siteActif, siteValide,
    domaineClient, domaineActif, domaineValide, domaines, sites, domainesParId, sitesParId,
    actifOui, actifNon, valideOui, valideNon, referencesUtilisees
  };
}

function droitsGlobauxPourClient(droits, donnees, operation, clientId) {
  if (operationGlobaleAutorisee(droits, donnees, operation)) return true;
  if (!droits?.reconnu || !donnees?.dynamique) return false;
  return Boolean(siteAutorisationPourClient(droits, donnees, operation, clientId));
}

function siteAutorisationPourClient(droits, donnees, operation, clientId) {
  if (operationGlobaleAutorisee(droits, donnees, operation)) {
    return (droits.siteIds || []).find((id) =>
      donnees.sites.some((site) => String(site.id) === String(id) &&
        site.actif && site.valide && String(site.clientId) === String(clientId))) || null;
  }
  const dynamique = donnees.dynamique;
  const listeClients = dynamique.source["OBJ-CLIENT"];
  const candidats = donnees.sites.filter((site) => String(site.clientId) === String(clientId) &&
    droits.siteIds?.includes(String(site.id)));
  for (const site of candidats) {
    const contexte = require("../auth/droits").contexteSite(droits, donnees, site.id);
    const definition = contexte.autorisations?.operations?.find((item) => item.operation === operation);
    if (!definition || !autorisations.autoriser(contexte.autorisations, operation).autorise) continue;
    const granted = new Set(definition.affectations || []);
    const affectations = contexte.autorisations.affectations || [];
    const clientScoped = affectations.some((affectation) => {
      if (!granted.has(String(affectation.id))) return false;
      const source = dynamique.affectations.find((item) => String(item.id) === String(affectation.id));
      const configuration = dynamique.configurations.filter((item) =>
        item.typeId === source?.typeId && item.origineId === source?.origineId);
      return configuration.length === 1 && configuration[0].mode === "client" &&
        configuration[0].listeCible.toLowerCase() === listeClients.id.toLowerCase() &&
        String(affectation.clientId) === String(clientId);
    });
    if (clientScoped) return String(site.id);
  }
  return null;
}

async function domainesDisponibles({ droits, donnees }) {
  if (!operationGlobaleAutorisee(droits, donnees, "site.creer")) {
    return { status: 403, erreur: "La création globale de site n'est pas autorisée pour votre compte." };
  }
  const modele = await chargerModele();
  const clients = new Map((donnees.clients || []).filter((client) => client.actif && client.valide)
    .map((client) => [String(client.id), client]));
  const doublons = new Set();
  const domainesParNom = new Map();
  for (const domaine of modele.domaines) {
    const valeur = require("./domain-sync").normaliserEtValiderDomaine(domaine.fields?.Title);
    if (!valeur) continue;
    if (domainesParNom.has(valeur)) doublons.add(valeur);
    else domainesParNom.set(valeur, domaine);
  }
  const choix = [];
  for (const item of modele.domaines) {
    const fields = item.fields || {};
    const id = String(item.id);
    const clientId = lireIds(fields, modele.domaineClient)[0];
    const client = clients.get(clientId);
    const nom = String(fields.Title || "").trim();
    const domaine = require("./domain-sync").normaliserEtValiderDomaine(nom);
    if (!client || !nom || !domaine || doublons.has(domaine) ||
      modele.referencesUtilisees.has(id) ||
      lireIds(fields, modele.domaineActif)[0] !== modele.actifOui ||
      lireIds(fields, modele.domaineValide)[0] !== modele.valideOui) continue;
    const incomplet = domaineColonnesManquantes(modele.domaineColonnes, fields, modele);
    if (incomplet) continue;
    if (!droitsGlobauxPourClient(droits, donnees, "site.creer", clientId)) continue;
    choix.push({ reference: referenceDomaine(modele.domainesListe.id, id), domaine: nom, client: client.titre });
  }
  return { donnees: choix };
}

function domaineColonnesManquantes(colonnes, fields, modele) {
  const obligatoire = colonnes.filter((colonne) => colonne.required && !colonne.readOnly && !colonne.hidden);
  const lookupsManquants = obligatoire.filter((colonne) => colonne.lookup &&
    !Object.hasOwn(fields, `${colonne.name}LookupId`) && !Object.hasOwn(fields, colonne.name));
  const valeurInvalide = obligatoire.some((colonne) => {
    const valeur = fields[`${colonne.name}LookupId`] ?? fields[colonne.name];
    return valeur == null || valeur === "" || (Array.isArray(valeur) && !valeur.length);
  });
  return lookupsManquants.length || valeurInvalide || !modele ? "incomplet" : null;
}

async function construireCreation({ droits, donnees, nom, reference }) {
  if (!operationGlobaleAutorisee(droits, donnees, "site.creer")) {
    return { status: 403, erreur: "La création globale de site n'est pas autorisée pour votre compte." };
  }
  const titre = nomValide(nom);
  if (!titre) return { status: 400, erreur: "Un nom de site valide est requis (255 caractères maximum)." };
  const modele = await chargerModele();
  const domaines = await domainesDisponibles({ droits, donnees });
  if (domaines.erreur) return domaines;
  const candidat = domaines.donnees.find((item) => item.reference === reference);
  if (!candidat) return { status: 409, erreur: "Le domaine n'est plus disponible. Actualisez puis recommencez." };
  const domaine = modele.domaines.find((item) =>
    referenceDomaine(modele.domainesListe.id, item.id) === reference);
  if (!domaine) return { status: 409, erreur: "Le domaine n'est plus disponible." };
  const domaineNativeId = String(domaine.id);
  const clientId = lireIds(domaine.fields, modele.domaineClient)[0];
  const champNom = trouverColonne(modele.siteColonnes, ["Title"], "text");
  const champs = {
    [champNom.name]: titre,
    [`${modele.siteClient.name}LookupId`]: clientId,
    [`${modele.siteDomaines.name}LookupId`]: [domaineNativeId],
    [`${modele.sitePrincipal.name}LookupId`]: domaineNativeId,
    [`${modele.siteActif.name}LookupId`]: modele.actifNon,
    [`${modele.siteValide.name}LookupId`]: modele.valideNon
  };
  const requis = validerObligatoires(modele.siteColonnes, champs);
  if (requis) return { status: 409, erreur: requis };
  const doublon = async (graph) => {
    const items = await ecriture.collecterFrais(graph,
      `/sites/${graph.siteGraphId}/lists/${modele.siteListe.id}/items?$expand=fields($select=Title,${modele.siteClient.name}LookupId,${modele.siteDomaines.name}LookupId,${modele.sitePrincipal.name}LookupId)&$top=200`);
    return items.some((item) =>
      (String(lireIds(item.fields, modele.siteClient)[0] || "") === clientId &&
        normaliserNomSite(item.fields?.Title) === normaliserNomSite(titre)) ||
      [...lireIds(item.fields, modele.siteDomaines), ...lireIds(item.fields, modele.sitePrincipal)].includes(domaineNativeId));
  };
  if (await doublon(modele.graph)) return { status: 409, erreur: "Un site porte déjà ce nom ou utilise déjà ce domaine." };
  const operation = {
    type: "ajouter", portee: "global-site-creer", fonction: "sites", operation: "site.creer",
    listId: modele.siteListe.id, champs, selectionChamps: Object.keys(champs),
    action: "site.creer", nom: "Création d'un site en brouillon", avant: ecriture.hash({}),
    journalComptes: true, cleDoublon: `site:${modele.siteListe.id}:${domaineNativeId}`,
    domaineReference: reference, titre, domaineNativeId, clientId,
    contexteJournal: { utilisateurId: droits.utilisateurId, clientId, domaineId: domaineNativeId },
    doublon
  };
  return { operation, apercu: {
    contexte: { site: titre, domaine: candidat.domaine, client: candidat.client },
    changements: [
      { libelle: "Nom du site", avant: "—", apres: titre },
      { libelle: "Domaine existant", avant: "Non rattaché", apres: candidat.domaine },
      { libelle: "Statut initial", avant: "—", apres: "Brouillon · inactif · non validé" }
    ],
    impact: "Une seule fiche OBJ-SITE-PUBLIC sera créée. Le domaine existant ne sera pas modifié, et le site ne sera ni activé ni publié."
  } };
}

async function preparerCreation({ identite, droits, donnees, nom, reference }) {
  const plan = await construireCreation({ droits, donnees, nom, reference });
  if (plan.erreur) return plan;
  const { jeton } = ecriture.emettreJeton(identite, plan.operation);
  return { jeton, apercu: plan.apercu };
}

async function revaliderCreation({ op, droits, donnees }) {
  if (op?.operation !== "site.creer" || op.type !== "ajouter" || op.portee !== "global-site-creer") {
    return "Type d'opération site.creer non pris en charge.";
  }
  const plan = await construireCreation({ droits, donnees, nom: op.titre, reference: op.domaineReference });
  if (plan.erreur) return plan.erreur;
  if (plan.operation.listId !== op.listId || ecriture.hash(plan.operation.champs) !== ecriture.hash(op.champs)) {
    return "Le domaine, le client ou la configuration a changé depuis l'aperçu.";
  }
  return null;
}

async function listeBrouillons({ identite, droits, donnees }) {
  const peutLister = operationGlobaleAutorisee(droits, donnees, "site.valider") ||
    donnees.sites.some((site) => droits.siteIds?.includes(String(site.id)) &&
      siteAutorisationPourClient(droits, donnees, "site.valider", site.clientId));
  if (!peutLister) return { status: 403, erreur: "La liste des brouillons n'est pas disponible pour votre profil." };
  const modele = await chargerModele();
  const clients = new Map((donnees.clients || []).map((client) => [String(client.id), client]));
  const resultat = [];
  for (const item of modele.sites) {
    const fields = item.fields || {};
    const clientId = lireIds(fields, modele.siteClient)[0];
    const domaineIds = lireIds(fields, modele.siteDomaines);
    const principalId = lireIds(fields, modele.sitePrincipal)[0];
    const client = clients.get(clientId);
    if (!client || !domainesAccordees(droits, donnees, clientId) ||
      lireIds(fields, modele.siteActif)[0] !== modele.actifNon ||
      ![modele.valideNon, modele.valideOui].includes(lireIds(fields, modele.siteValide)[0])) continue;
    const domaine = modele.domainesParId.get(principalId || domaineIds[0]);
    const valide = lireIds(fields, modele.siteValide)[0] === modele.valideOui;
    resultat.push({
      reference: referenceBrouillon(identite, item.id, clientId),
      nom: String(fields.Title || ""),
      domaine: String(domaine?.fields?.Title || ""),
      client: String(client.titre || ""),
      statut: valide ? "Validé · inactif" : "Brouillon · à valider",
      peutValider: !valide && droitsGlobauxPourClient(droits, donnees, "site.valider", clientId)
    });
  }
  return { donnees: resultat };
}

function domainesAccordees(droits, donnees, clientId) {
  return operationGlobaleAutorisee(droits, donnees, "site.valider") ||
    droitsGlobauxPourClient(droits, donnees, "site.valider", clientId);
}

async function construireValidation({ identite, droits, donnees, reference }) {
  const entree = lireReferenceBrouillon(identite, reference);
  if (!entree) return { status: 409, erreur: "La référence du brouillon a expiré. Actualisez la liste." };
  if (!droitsGlobauxPourClient(droits, donnees, "site.valider", entree.clientId)) {
    return { status: 403, erreur: "La validation de site n'est pas autorisée pour ce client." };
  }
  const client = donnees.clients.find((item) => String(item.id) === entree.clientId);
  if (!client?.actif || !client.valide) {
    return { status: 409, erreur: "Le client du brouillon n'est plus actif et validé." };
  }
  const modele = await chargerModele();
  const item = modele.sitesParId.get(entree.itemId);
  if (!item) return { status: 404, erreur: "Le brouillon n'existe plus." };
  const fields = item.fields || {};
  const domaineIds = lireIds(fields, modele.siteDomaines);
  const domaineId = lireIds(fields, modele.sitePrincipal)[0];
  const domaine = modele.domainesParId.get(domaineId);
  const domaineUtiliseAilleurs = modele.sites.some((site) => String(site.id) !== entree.itemId &&
    [...lireIds(site.fields, modele.siteDomaines), ...lireIds(site.fields, modele.sitePrincipal)].includes(domaineId));
  if (lireIds(fields, modele.siteClient)[0] !== entree.clientId ||
    lireIds(fields, modele.siteActif)[0] !== modele.actifNon ||
    lireIds(fields, modele.siteValide)[0] !== modele.valideNon ||
    !domaineId || !domaineIds.includes(domaineId) || !domaine ||
    lireIds(domaine.fields, modele.domaineClient)[0] !== entree.clientId ||
    lireIds(domaine.fields, modele.domaineActif)[0] !== modele.actifOui ||
    lireIds(domaine.fields, modele.domaineValide)[0] !== modele.valideOui ||
    domaineUtiliseAilleurs) {
    return { status: 409, erreur: "Le brouillon a changé depuis sa lecture. Actualisez la liste." };
  }
  const siteIdAutorisation = siteAutorisationPourClient(droits, donnees, "site.valider", entree.clientId);
  const global = operationGlobaleAutorisee(droits, donnees, "site.valider");
  if (!global && !siteIdAutorisation) {
    return { status: 403, erreur: "Aucun périmètre autorisé pour ce client." };
  }
  const siteId = siteIdAutorisation;
  const champs = { [`${modele.siteValide.name}LookupId`]: modele.valideOui };
  const operation = {
    type: "modifier", portee: global ? "global-site-valider" : "site",
    ...(global ? {} : { siteId: String(siteId) }), itemId: entree.itemId,
    fonction: "sites", operation: "site.valider", listId: modele.siteListe.id, champs,
    selectionChamps: [`${modele.siteValide.name}LookupId`], avant: ecriture.hash({
      [`${modele.siteValide.name}LookupId`]: modele.valideNon
    }), action: "site.valider", nom: "Validation humaine d'un site",
    journalComptes: true, contexteJournal: { utilisateurId: droits.utilisateurId,
      clientId: entree.clientId, siteCibleId: entree.itemId, domaineId, nomSite: String(fields.Title || "") }
  };
  return { operation, apercu: {
    contexte: { site: String(fields.Title || ""), client: clientsTitre(donnees, entree.clientId) },
    changements: [{ libelle: "Validation", avant: "Non validé", apres: "Validé" }],
    impact: "Seul l'état de validation sera modifié. Le site restera inactif ; aucune activation ni publication n'est déclenchée."
  } };
}

function clientsTitre(donnees, clientId) {
  return String(donnees.clients.find((client) => String(client.id) === String(clientId))?.titre || "");
}

async function preparerValidation({ identite, droits, donnees, reference }) {
  const plan = await construireValidation({ identite, droits, donnees, reference });
  if (plan.erreur) return plan;
  const { jeton } = ecriture.emettreJeton(identite, plan.operation);
  return { jeton, apercu: plan.apercu };
}

async function revaliderValidation({ identite, op, droits, donnees }) {
  if (op?.operation !== "site.valider" || op.type !== "modifier" || !op.itemId) {
    return "Type d'opération site.valider non pris en charge.";
  }
  const modele = await chargerModele();
  const item = modele.sitesParId.get(String(op.itemId));
  const clientId = String(op.contexteJournal?.clientId || "");
  const domaineId = item ? lireIds(item.fields, modele.sitePrincipal)[0] : null;
  const domaine = domaineId ? modele.domainesParId.get(domaineId) : null;
  const domaineUtiliseAilleurs = domaineId && modele.sites.some((site) => String(site.id) !== String(op.itemId) &&
    [...lireIds(site.fields, modele.siteDomaines), ...lireIds(site.fields, modele.sitePrincipal)].includes(domaineId));
  const client = donnees.clients.find((entree) => String(entree.id) === clientId);
  if (!item || lireIds(item.fields, modele.siteClient)[0] !== String(op.contexteJournal?.clientId) ||
    lireIds(item.fields, modele.siteActif)[0] !== modele.actifNon ||
    lireIds(item.fields, modele.siteValide)[0] !== modele.valideNon ||
    String(item.fields?.Title || "") !== String(op.contexteJournal?.nomSite || "") ||
    domaineId !== String(op.contexteJournal?.domaineId || "") ||
    !lireIds(item.fields, modele.siteDomaines).includes(domaineId) ||
    !client?.actif || !client.valide || !domaine || domaineUtiliseAilleurs ||
    lireIds(domaine.fields, modele.domaineClient)[0] !== clientId ||
    lireIds(domaine.fields, modele.domaineActif)[0] !== modele.actifOui ||
    lireIds(domaine.fields, modele.domaineValide)[0] !== modele.valideOui) {
    return "Le brouillon a changé depuis l'aperçu.";
  }
  if (!operationGlobaleAutorisee(droits, donnees, "site.valider") &&
    !siteAutorisationPourClient(droits, donnees, "site.valider", op.contexteJournal?.clientId)) {
    return "L'opération site.valider n'est plus autorisée pour ce client.";
  }
  const attendu = { [`${modele.siteValide.name}LookupId`]: modele.valideOui };
  if (op.listId !== modele.siteListe.id || ecriture.hash(op.champs) !== ecriture.hash(attendu)) {
    return "La configuration de validation du site a changé.";
  }
  return null;
}

async function construireModification({ droits, siteId, nom }) {
  const titre = nomValide(nom);
  if (!titre) return { status: 400, erreur: "Un nom de site valide est requis (255 caractères maximum)." };
  const operationPermise = droits?.autorisations
    ? autorisations.autoriser(droits.autorisations, "site.modifier").autorise
    : droits?.global === true && !droits.contraintesOperations?.includes("site.modifier") &&
      droits.fonctions?.includes("sites") && ["ecriture", "administration"].includes(droits.niveau);
  if (!droits?.reconnu || !droits.siteIds?.includes(String(siteId)) || !operationPermise) {
    return { status: 403, erreur: "La modification du nom n'est pas autorisée pour ce site." };
  }
  const modele = await chargerModele();
  const item = modele.sitesParId.get(String(siteId));
  if (!item) return { status: 404, erreur: "Le site n'existe plus." };
  if (String(item.fields?.Title || "").trim() === titre) return { status: 409, erreur: "Le nom est inchangé." };
  const clientId = lireIds(item.fields, modele.siteClient)[0];
  if (modele.sites.some((site) => String(site.id) !== String(siteId) &&
    lireIds(site.fields, modele.siteClient)[0] === clientId &&
    normaliserNomSite(site.fields?.Title) === normaliserNomSite(titre))) {
    return { status: 409, erreur: "Un autre site de ce client utilise déjà ce nom." };
  }
  const operation = {
    type: "modifier", portee: "site", siteId: String(siteId), itemId: String(siteId),
    fonction: "sites", operation: "site.modifier", listId: modele.siteListe.id,
    champs: { Title: titre }, selectionChamps: ["Title"],
    avant: ecriture.hash({ Title: String(item.fields?.Title || "") }),
    action: "site.modifier", nom: "Modification du nom d'un site", journalComptes: true,
    contexteJournal: { utilisateurId: droits.utilisateurId, clientId, siteId: String(siteId) }
  };
  return { operation, apercu: {
    contexte: { site: String(item.fields?.Title || "") },
    changements: [{ libelle: "Nom du site", avant: String(item.fields?.Title || ""), apres: titre }],
    impact: "Seul le nom du site sera modifié."
  } };
}

async function preparerModification({ identite, droits, siteId, nom }) {
  const plan = await construireModification({ droits, siteId, nom });
  if (plan.erreur) return plan;
  const { jeton } = ecriture.emettreJeton(identite, plan.operation);
  return { jeton, apercu: plan.apercu };
}

async function revaliderModification({ op, droits }) {
  if (op?.operation !== "site.modifier") return "Type d'opération site.modifier non pris en charge.";
  const plan = await construireModification({ droits, siteId: op.siteId, nom: op.champs?.Title });
  if (plan.erreur) return plan.erreur;
  if (plan.operation.itemId !== op.itemId || plan.operation.listId !== op.listId ||
    ecriture.hash(plan.operation.champs) !== ecriture.hash(op.champs)) {
    return "Le site ou le nom a changé depuis l'aperçu.";
  }
  return null;
}

module.exports = {
  domainesDisponibles, listeBrouillons, preparerCreation, preparerValidation, preparerModification,
  revaliderCreation, revaliderValidation, revaliderModification, operationGlobaleAutorisee,
  _test: { trouverListe, trouverColonne, nomValide, validerObligatoires, operationGlobaleAutorisee,
    referenceDomaine, lireReferenceBrouillon, referencesSite }
};
