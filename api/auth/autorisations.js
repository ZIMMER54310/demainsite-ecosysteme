"use strict";

const dse = require("../shared/dse");

const LISTES = [
  "OBJ-UTILISATEUR", "OBJ-UTILISATEUR-SITE", "OBJ-ROLE", "OBJ-ROLE-CAPACITE",
  "OBJ-CAPACITE", "OBJ-CAPACITE-ACTION", "OBJ-ACTION", "OBJ-UTILISATEUR-PERMISSION",
  "OBJ-PERIMETRE-TYPE", "OBJ-ORIGINE-DROIT", "OBJ-SITE-PUBLIC", "OBJ-CLIENT",
  "OBJ-GROUPEMENT-SITE", "OBJ-GROUPEMENT-BOUTIQUE", "OBJ-APPARTENANCE-PERIMETRE",
  "OBJ-DROIT-OPERATION", "OBJ-DROIT-PERIMETRE", "OBJ-TYPE-CIBLE", "OBJ-ACCES-TYPE", "OBJ-ACTIF", "OBJ-VALIDE", "OBJ-VEROUILLE"
];
const normaliser = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]/g, "");

function colonne(liste, nom, cible = null) {
  const cs = liste.cols.filter((c) => normaliser(c.displayName) === normaliser(nom) &&
    (!cible || c.lookup && !c.lookup.allowMultipleValues &&
      c.lookup.listId.toLowerCase() === cible.id.toLowerCase()));
  if (cs.length !== 1) throw new Error(`${liste.nom} : colonne ${nom} unique exploitable requise.`);
  return cs[0];
}

function valeur(liste, item, nom, cible = null) {
  const c = colonne(liste, nom, cible);
  return item.fields[c.lookup ? `${c.name}LookupId` : c.name];
}

async function lireListe(token, siteId, liste, idsListes) {
  const cols = await dse.chargerColonnesListe(token, siteId, liste.id);
  const noms = cols.filter((c) => !c.hidden && (!c.lookup ||
    !c.lookup.allowMultipleValues && idsListes.has(c.lookup.listId.toLowerCase())))
    .map((c) => c.lookup ? `${c.name}LookupId` : c.name);
  const groupes = [];
  for (let i = 0; i < noms.length; i += 8) groupes.push(noms.slice(i, i + 8));
  const lots = await Promise.all(groupes.map((champs) => dse.collecter(token,
    `/sites/${siteId}/lists/${liste.id}/items?$expand=fields($select=${[...new Set(["Title", "Modified", ...champs])].join(",")})&$top=200`)));
  const parId = new Map();
  const idsAttendus = new Set(lots[0].map((i) => String(i.id)));
  for (const lot of lots) {
    if (lots[0].length !== lot.length || lot.some((i) => !idsAttendus.has(String(i.id)))) {
      throw new Error(`${liste.nom} : éléments modifiés pendant la lecture.`);
    }
    for (const item of lot) {
      const connu = parId.get(String(item.id));
      if (connu && connu.fields["@odata.etag"] !== item.fields["@odata.etag"]) {
        throw new Error(`${liste.nom} : version modifiée pendant la lecture des Lookups.`);
      }
      parId.set(String(item.id), { ...item, id: String(item.id), fields: { ...connu?.fields, ...item.fields } });
    }
  }
  const lookups = noms.filter((n) => n.endsWith("LookupId"));
  await Promise.all([...parId.values()].map(async (item) => {
    const manquants = lookups.filter((n) => !Object.hasOwn(item.fields, n));
    for (let i = 0; i < manquants.length; i += 4) {
      const relu = await dse.graphSansCache(token,
        `/sites/${siteId}/lists/${liste.id}/items/${item.id}?$expand=fields($select=${manquants.slice(i, i + 4).join(",")})`);
      if (item.fields["@odata.etag"] !== relu.fields["@odata.etag"]) {
        throw new Error(`${liste.nom} : version modifiée pendant la relecture ciblée.`);
      }
      Object.assign(item.fields, relu.fields);
    }
  }));
  return { ...liste, cols, items: [...parId.values()] };
}

async function charger(token, siteId, listes) {
  const definitions = LISTES.map((nom) => {
    const xs = listes.filter((l) => l.displayName === nom);
    if (xs.length !== 1) throw new Error(`Droits dynamiques : liste ${nom} unique requise.`);
    return { ...xs[0], nom };
  });
  const options = listes.filter((l) => l.displayName === "OBJ-CLIENT-CAPACITE");
  if (options.length > 1) throw new Error("Configuration client/capacite dupliquee.");
  definitions.push(...options.map((l) => ({ ...l, nom: l.displayName })));
  const ids = new Set(definitions.map((l) => l.id.toLowerCase()));
  const lectures = await Promise.all(definitions.map((l) => lireListe(token, siteId, l, ids)));
  const source = Object.fromEntries(lectures.map((l) => [l.nom, l]));
  return construire(source);
}

function construire(source) {
  const L = (n) => source[n];
  const id = (n, i, champ, cible) => {
    const v = valeur(L(n), i, champ, L(cible));
    return v == null || v === "" ? null : String(v);
  };
  const texte = (n, i, champ) => String(valeur(L(n), i, champ) || "").trim();
  const option = (n, i, champ, type) => {
    const cs = L(n).cols.filter((c) => normaliser(c.displayName) === normaliser(champ));
    if (!cs.length) return type === "boolean" ? false : "";
    if (cs.length !== 1 || !cs[0][type]) throw new Error(`${n} : configuration ${champ} incoherente.`);
    const v = i.fields[cs[0].name];
    if (type === "boolean" && v != null && typeof v !== "boolean") throw new Error(`${n} : ${champ} doit etre booleen.`);
    return type === "boolean" ? v === true : String(v || "").trim();
  };
  const oui = new Map(["OBJ-ACTIF", "OBJ-VALIDE", "OBJ-VEROUILLE"].map((n) => {
    const xs = L(n).items.filter((i) => /^oui\b/i.test(i.fields.Title || ""));
    if (xs.length !== 1) throw new Error(`${n} : valeur Oui unique requise.`);
    return [L(n).id.toLowerCase(), xs[0].id];
  }));
  const etat = (n, i, nom, reference, obligatoire) => {
    const cs = L(n).cols.filter((c) => normaliser(c.displayName) === normaliser(nom) ||
      normaliser(c.displayName) === normaliser(reference));
    const c = cs.find((c) => c.boolean) || cs.find((c) => c.lookup?.listId.toLowerCase() === L(reference).id.toLowerCase());
    if (!c) {
      if (obligatoire) throw new Error(`${n} : état ${nom} absent.`);
      return true;
    }
    return c.boolean ? i.fields[c.name] === true : String(i.fields[`${c.name}LookupId`]) === oui.get(L(reference).id.toLowerCase());
  };
  const actif = (n, i) => etat(n, i, "ACTIF", "OBJ-ACTIF", n !== "OBJ-APPARTENANCE-PERIMETRE") &&
    etat(n, i, "VALIDE", "OBJ-VALIDE", false);
  const verrou = (n, i) => {
    const existe = L(n).cols.some((c) => /VER[R]?OUILLE/i.test(normaliser(c.displayName)));
    return existe ? etat(n, i, "VERROUILLE", "OBJ-VEROUILLE", false) : false;
  };
  const catalogue = (n, code) => L(n).items.filter((i) => actif(n, i)).map((i) => ({
    id: i.id, code: code ? texte(n, i, code) : "", titre: i.fields.Title || "", verrouille: verrou(n, i)
  }));
  const roles = catalogue("OBJ-ROLE");
  const operationId = (n, i) => {
    const cs = L(n).cols.filter((c) => normaliser(c.displayName) === "OBJDROITOPERATION");
    if (!cs.length) return null;
    if (cs.length !== 1 || !cs[0].lookup || cs[0].lookup.allowMultipleValues || cs[0].lookup.listId.toLowerCase() !== L("OBJ-DROIT-OPERATION").id.toLowerCase()) throw new Error(`${n} : relation au droit invalide.`);
    return String(i.fields[`${cs[0].name}LookupId`] || "") || null;
  };
  const capacites = catalogue("OBJ-CAPACITE", "CODE-CAPACITÉ");
  const actions = catalogue("OBJ-ACTION", "CODE-ACTION");
  const types = catalogue("OBJ-PERIMETRE-TYPE", "CODE-PÉRIMÈTRE");
  const origines = catalogue("OBJ-ORIGINE-DROIT", "CODE-ORIGINE-DROIT");
  const bases = L("OBJ-ROLE-CAPACITE").items.filter((i) => actif("OBJ-ROLE-CAPACITE", i)).map((i) => ({
    id: i.id, operationId: operationId("OBJ-ROLE-CAPACITE", i),
    verrouille: verrou("OBJ-ROLE-CAPACITE", i),
    autorisation: option("OBJ-ROLE-CAPACITE", i, "AUTORISATION", "boolean"),
    roleId: id("OBJ-ROLE-CAPACITE", i, "OBJ-ROLE", "OBJ-ROLE"),
    capaciteId: id("OBJ-ROLE-CAPACITE", i, "OBJ-CAPACITE", "OBJ-CAPACITE")
  }));
  const possibles = L("OBJ-CAPACITE-ACTION").items.filter((i) => actif("OBJ-CAPACITE-ACTION", i)).map((i) => ({
    capaciteId: id("OBJ-CAPACITE-ACTION", i, "OBJ-CAPACITE", "OBJ-CAPACITE"),
    actionId: id("OBJ-CAPACITE-ACTION", i, "OBJ-ACTION", "OBJ-ACTION")
  }));
  const permissions = L("OBJ-UTILISATEUR-PERMISSION").items.filter((i) => actif("OBJ-UTILISATEUR-PERMISSION", i)).map((i) => ({
    operationId: operationId("OBJ-UTILISATEUR-PERMISSION", i),
    id: i.id, utilisateurId: id("OBJ-UTILISATEUR-PERMISSION", i, "OBJ-UTILISATEUR", "OBJ-UTILISATEUR"),
    affectationId: id("OBJ-UTILISATEUR-PERMISSION", i, "OBJ-UTILISATEUR-SITE", "OBJ-UTILISATEUR-SITE"),
    capaciteId: id("OBJ-UTILISATEUR-PERMISSION", i, "OBJ-CAPACITE", "OBJ-CAPACITE"),
    actionId: id("OBJ-UTILISATEUR-PERMISSION", i, "OBJ-ACTION", "OBJ-ACTION"),
    autorisation: valeur(L("OBJ-UTILISATEUR-PERMISSION"), i, "AUTORISATION"),
    verrouille: verrou("OBJ-UTILISATEUR-PERMISSION", i)
  }));
  const operations = L("OBJ-DROIT-OPERATION").items.filter((i) => actif("OBJ-DROIT-OPERATION", i)).map((i) => ({
    id: i.id, operation: texte("OBJ-DROIT-OPERATION", i, "OPERATION-TECHNIQUE"),
    fonction: texte("OBJ-DROIT-OPERATION", i, "FONCTION-COCKPIT"),
    mode: texte("OBJ-DROIT-OPERATION", i, "MODE-TECHNIQUE"),
    libelle: texte("OBJ-DROIT-OPERATION", i, "LIBELLE-INTERFACE"),
    route: texte("OBJ-DROIT-OPERATION", i, "ROUTE-COCKPIT"),
    demandable: option("OBJ-DROIT-OPERATION", i, "DEMANDABLE", "boolean"),
    individuelRequis: option("OBJ-DROIT-OPERATION", i, "INDIVIDUEL-REQUIS", "boolean"),
    interdite: option("OBJ-DROIT-OPERATION", i, "INTERDITE", "boolean"),
    optionRequise: option("OBJ-DROIT-OPERATION", i, "OPTION-REQUISE", "boolean"),
    messageRefus: option("OBJ-DROIT-OPERATION", i, "MESSAGE-REFUS", "text"),
    capaciteId: id("OBJ-DROIT-OPERATION", i, "OBJ-CAPACITE", "OBJ-CAPACITE"),
    actionId: id("OBJ-DROIT-OPERATION", i, "OBJ-ACTION", "OBJ-ACTION")
  }));
  if (new Set(operations.map((o) => o.operation)).size !== operations.length) {
    throw new Error("Correspondance d'opérations techniques dupliquée.");
  }
  const referencesOperations = new Map(L("OBJ-DROIT-OPERATION").items.map((i) => [i.id, {
    capaciteId: id("OBJ-DROIT-OPERATION", i, "OBJ-CAPACITE", "OBJ-CAPACITE"),
    actionId: id("OBJ-DROIT-OPERATION", i, "OBJ-ACTION", "OBJ-ACTION")
  }]));
  for (const relation of [...bases, ...permissions]) {
    if (!relation.operationId) continue;
    const op = referencesOperations.get(relation.operationId);
    if (!op || op.capaciteId !== relation.capaciteId ||
      Object.hasOwn(relation, "actionId") && op.actionId !== relation.actionId) {
      throw new Error("Droit individuel : opération et capacité/action incohérentes.");
    }
  }
  const configurations = L("OBJ-DROIT-PERIMETRE").items.filter((i) => actif("OBJ-DROIT-PERIMETRE", i)).map((i) => ({
    id: i.id, typeId: id("OBJ-DROIT-PERIMETRE", i, "OBJ-PERIMETRE-TYPE", "OBJ-PERIMETRE-TYPE"),
    origineId: id("OBJ-DROIT-PERIMETRE", i, "OBJ-ORIGINE-DROIT", "OBJ-ORIGINE-DROIT"),
    champCible: texte("OBJ-DROIT-PERIMETRE", i, "CHAMP-CIBLE-AFFECTATION"),
    listeCible: texte("OBJ-DROIT-PERIMETRE", i, "GUID-LISTE-CIBLE"),
    mode: texte("OBJ-DROIT-PERIMETRE", i, "MODE-RESOLUTION"),
    champMembre: texte("OBJ-DROIT-PERIMETRE", i, "CHAMP-MEMBRE"),
    champGroupement: texte("OBJ-DROIT-PERIMETRE", i, "CHAMP-GROUPEMENT"),
    typeCible: texte("OBJ-DROIT-PERIMETRE", i, "TYPE-CIBLE-SITE")
  }));
  const affectations = L("OBJ-UTILISATEUR-SITE").items.map((i) => ({
    id: i.id, utilisateurId: id("OBJ-UTILISATEUR-SITE", i, "OBJ-UTILISATEUR", "OBJ-UTILISATEUR"),
    roleId: id("OBJ-UTILISATEUR-SITE", i, "OBJ-ROLE", "OBJ-ROLE"),
    typeId: id("OBJ-UTILISATEUR-SITE", i, "TYPE-PÉRIMÈTRE", "OBJ-PERIMETRE-TYPE"),
    origineId: id("OBJ-UTILISATEUR-SITE", i, "ORIGINE-DROIT", "OBJ-ORIGINE-DROIT"),
    actif: actif("OBJ-UTILISATEUR-SITE", i), verrouille: verrou("OBJ-UTILISATEUR-SITE", i),
    fields: i.fields
  }));
  const clientCapacites = L("OBJ-CLIENT-CAPACITE") ? L("OBJ-CLIENT-CAPACITE").items
    .filter((i) => actif("OBJ-CLIENT-CAPACITE", i)).map((i) => ({
      clientId: id("OBJ-CLIENT-CAPACITE", i, "OBJ-CLIENT", "OBJ-CLIENT"),
      siteId: id("OBJ-CLIENT-CAPACITE", i, "OBJ-SITE-PUBLIC", "OBJ-SITE-PUBLIC"),
      capaciteId: id("OBJ-CLIENT-CAPACITE", i, "OBJ-CAPACITE", "OBJ-CAPACITE")
    })) : null;
  return { source, roles, capacites, actions, types, origines, bases, possibles, permissions, operations, configurations, affectations, actif, clientCapacites };
}

function ciblesPour(data, affectation) {
  const L = data.source["OBJ-UTILISATEUR-SITE"];
  const candidates = data.configurations.filter((c) => c.typeId === affectation.typeId && c.origineId === affectation.origineId);
  if (candidates.length !== 1 || !data.types.some((t) => t.id === affectation.typeId) ||
    !data.origines.some((o) => o.id === affectation.origineId)) return { refus: "Périmètre/origine sans configuration unique.", cibles: [] };
  const c = candidates[0];
  const champ = L.cols.find((x) => x.name === c.champCible && x.lookup && !x.lookup.allowMultipleValues &&
    x.lookup.listId.toLowerCase() === c.listeCible.toLowerCase());
  if (!champ) return { refus: "Type de périmètre et colonne cible incohérents.", cibles: [] };
  const colonnesCibles = L.cols.filter((c) => c.name.startsWith("Cible") &&
    c.lookup && !c.lookup.allowMultipleValues).map((c) => c.name);
  const remplies = colonnesCibles.filter((nom) => affectation.fields[`${nom}LookupId`]);
  if (remplies.length !== 1 || remplies[0] !== c.champCible) return { refus: "Cible absente ou plusieurs cibles renseignées.", cibles: [] };
  const cibleId = String(affectation.fields[`${champ.name}LookupId`]);
  const cibleListe = Object.values(data.source).find((l) => l.id.toLowerCase() === c.listeCible.toLowerCase());
  const cible = cibleListe?.items.find((i) => i.id === cibleId);
  if (!cible || !data.actif(cibleListe.nom, cible)) return { refus: "Cible inactive, invalide ou inexistante.", cibles: [] };
  const sites = data.source["OBJ-SITE-PUBLIC"];
  const colClient = colonne(sites, "OBJ-CLIENT", data.source["OBJ-CLIENT"]);
  const typeCol = sites.cols.find((x) => normaliser(x.displayName) === normaliser("TYPE-CIBLE"));
  if (!typeCol || !c.typeCible) return { refus: "Configuration des types de cibles incomplète.", cibles: [] };
  const typesValides = new Set(data.source["OBJ-TYPE-CIBLE"].items.filter((i) =>
    data.actif("OBJ-TYPE-CIBLE", i)).map((i) => i.id));
  const verifier = (site) => {
    if (!data.actif(sites.nom, site) || !c.typeCible ||
      !c.typeCible.split(",").includes(String(site.fields[`${typeCol.name}LookupId`])) ||
      !typesValides.has(String(site.fields[`${typeCol.name}LookupId`]))) return false;
    const clientId = site.fields[`${colClient.name}LookupId`];
    const clientAffectation = colonne(L, "OBJ-CLIENT", data.source["OBJ-CLIENT"]);
    const declare = affectation.fields[`${clientAffectation.name}LookupId`];
    if (declare && String(declare) !== String(clientId)) return false;
    return data.source["OBJ-CLIENT"].items.some((i) => i.id === String(clientId) && data.actif("OBJ-CLIENT", i));
  };
  let resultat;
  if (c.mode === "direct") {
    if (cibleListe.id !== sites.id) return { refus: "Résolution directe incompatible avec la liste cible.", cibles: [] };
    if (!cible.fields[`${typeCol.name}LookupId`]) return { refus: "TYPE-CIBLE absent sur le site.", cibles: [] };
    resultat = [cible];
  } else if (c.mode === "client") {
    if (cibleListe.id !== data.source["OBJ-CLIENT"].id) return { refus: "Résolution client incohérente.", cibles: [] };
    resultat = sites.items.filter((s) => String(s.fields[`${colClient.name}LookupId`]) === cibleId);
  } else if (c.mode === "group") {
    const membres = data.source["OBJ-APPARTENANCE-PERIMETRE"];
    const g = membres.cols.find((x) => x.name === c.champGroupement && x.lookup?.listId.toLowerCase() === c.listeCible.toLowerCase());
    const m = membres.cols.find((x) => x.name === c.champMembre && x.lookup?.listId.toLowerCase() === sites.id.toLowerCase());
    if (!g || !m || g.lookup.allowMultipleValues || m.lookup.allowMultipleValues) return { refus: "Appartenance de périmètre incohérente.", cibles: [] };
    const groupeClient = colonne(cibleListe, "OBJ-CLIENT", data.source["OBJ-CLIENT"]);
    const clientId = String(cible.fields[`${groupeClient.name}LookupId`]);
    const ids = new Set(membres.items.filter((i) => data.actif(membres.nom, i) &&
      String(i.fields[`${g.name}LookupId`]) === cibleId).map((i) => String(i.fields[`${m.name}LookupId`])));
    resultat = sites.items.filter((s) => ids.has(s.id) && String(s.fields[`${colClient.name}LookupId`]) === clientId);
  } else return { refus: "Mode technique de résolution inconnu.", cibles: [] };
  return { cibles: resultat.filter(verifier).map((s) => ({ id: s.id, clientId: String(s.fields[`${colClient.name}LookupId`]) })),
    configuration: c };
}

function resoudre(data, utilisateurId, cibleId) {
  const utilisateur = data.source["OBJ-UTILISATEUR"].items.find((i) => i.id === String(utilisateurId));
  if (!utilisateur || !data.actif("OBJ-UTILISATEUR", utilisateur)) return { actif: false, refus: "Utilisateur invalide.", operations: [], affectations: [] };
  const relations = data.affectations.filter((a) => a.utilisateurId === String(utilisateurId) && a.typeId);
  const resolutions = relations.map((a) => ({ a, r: ciblesPour(data, a) }));
  const toutes = [...new Set(resolutions.filter(({ a }) => a.actif).flatMap(({ r }) => r.cibles.map((s) => s.id)))];
  const applicables = resolutions.filter(({ a, r }) => a.actif && r.cibles.some((s) => s.id === String(cibleId)));
  const erreurs = resolutions.filter(({ r }) => r.refus).map(({ a, r }) => ({ affectationId: a.id, message: r.refus }));
  const reconnues = applicables.filter(({ a }) => data.roles.some((role) => role.id === a.roleId));
  const permis = [], refuses = [], decisions = [];
  for (const op of data.operations) {
    const capacite = data.capacites.find((c) => c.id === op.capaciteId);
    const action = data.actions.find((a) => a.id === op.actionId);
    if (!capacite || !action || !data.possibles.some((p) => p.capaciteId === capacite.id && p.actionId === action.id)) continue;
    const permissions = reconnues.flatMap(({ a }) => permissionsPour(data, utilisateurId, a.id, op).map((p) => ({ p, a })));
    const profilPour = (a) => data.bases.some((b) => b.roleId === a.roleId && b.operationId === op.id && b.autorisation === true);
    const politique = decisionPolitique(data, op, reconnues.flatMap(({ r }) =>
      r.cibles.filter((s) => s.id === String(cibleId)).map((s) => s.clientId)), cibleId);
    const restriction = permissions.some(({ p }) => p.autorisation === false);
    if (restriction || !politique.autorise) {
      refuses.push(op.operation);
      decisions.push({ operation: op.operation, fonction: op.fonction, libelle: op.libelle,
        autorise: false, categorie: restriction ? "interdit" : politique.categorie,
        demandable: !restriction && reconnues.length > 0 && politique.demandable,
        message: op.messageRefus || (restriction ? "Cette action est interdite dans votre espace." : politique.message) });
      continue;
    }
    const grants = permissions.filter(({ p, a }) => p.autorisation === true && basePour(data, a.roleId, op));
    for (const { a } of reconnues) if (basePour(data, a.roleId, op) && profilPour(a) && !permissions.some(({ a: pa }) => pa.id === a.id)) grants.push({ a });
    decisions.push({ operation: op.operation, fonction: op.fonction, libelle: op.libelle,
      autorise: grants.length > 0, categorie: grants.length ? "autorise" : "droit",
      demandable: !grants.length && reconnues.length > 0 && op.demandable === true,
      message: grants.length ? null : op.messageRefus || "Votre compte ne dispose pas encore de l'autorisation pour cette action." });
    if (grants.length) permis.push({ ...op, capacite: capacite.titre, action: action.titre,
      affectations: [...new Set(grants.map(({ a }) => a.id))] });
  }
  return { actif: reconnues.length > 0, cibleId: String(cibleId), siteIds: toutes, operations: permis,
    refuses, decisions, erreurs, affectations: reconnues.map(({ a, r }) => ({
      id: a.id, roleId: a.roleId, role: data.roles.find((role) => role.id === a.roleId)?.titre,
      origine: data.origines.find((o) => o.id === a.origineId)?.titre, verrouille: a.verrouille,
      clientId: r.cibles.find((s) => s.id === String(cibleId))?.clientId
    })) };
}

function permissionsPour(data, utilisateurId, affectationId, op) {
  const candidates = data.permissions.filter((p) => p.utilisateurId === String(utilisateurId) &&
    String(p.affectationId ?? "") === String(affectationId ?? "") && p.capaciteId === op.capaciteId && p.actionId === op.actionId &&
    (p.operationId === op.id || !p.operationId && !op.individuelRequis));
  const exactes = candidates.filter((p) => p.operationId && p.operationId === op.id);
  return exactes.length ? [...exactes, ...candidates.filter((p) => !p.operationId && p.verrouille && p.autorisation === false)] : candidates;
}

function basePour(data, roleId, op) {
  const exactes = data.bases.filter((b) => b.roleId === String(roleId) && b.operationId && b.operationId === op.id);
  return exactes.length ? exactes.every((b) => b.autorisation === true) :
    !op.individuelRequis && data.bases.some((b) => b.roleId === String(roleId) && b.capaciteId === op.capaciteId && !b.operationId);
}

function decisionPolitique(data, op, clients, cibleId) {
  if (op.interdite) return { autorise: false, categorie: "interdit", demandable: false,
    message: "Cette fonction n'est pas disponible dans cet espace." };
  if (op.optionRequise && !Array.isArray(data.clientCapacites)) return {
    autorise: false, categorie: "configuration", demandable: false,
    message: "La disponibilité de cette fonction doit être vérifiée par votre administrateur."
  };
  if (op.optionRequise && !data.clientCapacites.some((c) => clients.includes(c.clientId) &&
    (!c.siteId || c.siteId === String(cibleId)) && c.capaciteId === op.capaciteId)) return {
    autorise: false, categorie: "option", demandable: op.demandable === true,
    message: "Cette fonction n'est pas activée pour votre espace client. Une demande peut être adressée à votre interlocuteur."
  };
  return { autorise: true };
}

function autoriser(resolution, operation) {
  if (!resolution?.actif || !resolution.operations?.some((o) => o.operation === operation)) {
    return { autorise: false, motif: resolution?.refuses?.includes(operation)
      ? "Restriction explicite SharePoint." : "Affectation, capacité ou action non autorisée." };
  }
  return { autorise: true };
}

module.exports = { charger, construire, ciblesPour, resoudre, autoriser, decisionPolitique, lireListe, colonne, valeur, LISTES, permissionsPour, basePour };
