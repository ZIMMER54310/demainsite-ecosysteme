"use strict";

const crypto = require("node:crypto");
const droits = require("../auth/droits");
const A = require("../auth/autorisations");
const ecriture = require("./ecriture");
const { FONCTIONS_COCKPIT } = require("./cockpit");
const sel = crypto.randomBytes(32);
const ref = (type, id) => `${type}.${crypto.createHmac("sha256", sel).update(`${type}:${id}`).digest("hex").slice(0, 24)}`;
const autorise = (d) => d?.reconnu && d.niveau === "administration" && d.fonctions?.includes("administration");
const superAdmin = (d) => autorise(d) && d.superAdministrateur === true;
const trouver = (xs, type, reference) => xs.find((x) => ref(type, x.id) === reference);
const erreur = (message) => { throw Object.assign(new Error(message), { status: 403 }); };

async function contexte(d) {
  if (!autorise(d)) erreur("Administration des droits réservée aux administrateurs.");
  const donnees = await droits.donneesDroits();
  if (!donnees.dynamique) erreur("Les droits individuels ne sont pas configurés.");
  return { donnees, data: donnees.dynamique };
}

function sitesPour(data, donnees, a) {
  if (a.typeId) return A.ciblesPour(data, a);
  const lien = donnees.liens.find((l) => String(l.id) === a.id && l.actif && l.valide);
  if (!lien) return { cibles: [], refus: "Affectation inactive." };
  const site = donnees.sites.find((s) => s.id === String(lien.siteId) && s.actif && s.valide && s.clientId === String(lien.clientId));
  return site ? { cibles: [{ id: site.id, clientId: site.clientId }] } : { cibles: [], refus: "Site ou client invalide." };
}

function affectations(data, donnees, d) {
  return data.affectations.filter((a) => {
    if (!a.actif) return false;
    const resolution = sitesPour(data, donnees, a);
    return !resolution.refus && resolution.cibles.length && (superAdmin(d) || resolution.cibles.every((s) => d.siteIds.includes(s.id)));
  });
}

function peut(d, op) {
  if (d.contraintesOperations?.includes(op.operation)) return false;
  if (d.autorisations) return A.autoriser(d.autorisations, op.operation).autorise;
  return d.fonctions?.includes(op.fonction) && (op.mode === "read" || ["ecriture", "administration"].includes(d.niveau));
}

function contexteCible(donnees, utilisateurId, siteId) {
  return droits.contexteSite({ reconnu: true, utilisateurId, global: false, siteIds: [siteId] }, donnees, siteId);
}

function editable(data, donnees, d, affectation, op) {
  if (affectation.verrouille || affectation.utilisateurId === String(d.utilisateurId)) return false;
  const cible = donnees.utilisateurs.find((u) => u.id === affectation.utilisateurId);
  if (!cible || !cible.actif || !cible.valide) return false;
  if (superAdmin(d)) return true;
  if (!droits.peutAttribuer(d, affectation.roleId, donnees.politique) ||
      !droits.peutAttribuer(d, cible.roleId, donnees.politique) ||
      droits.regleRole(donnees.politique, cible.roleId)?.niveau === "administration") return false;
  return sitesPour(data, donnees, affectation).cibles.every((s) => {
    const acteur = droits.contexteSite(d, donnees, s.id);
    return peut(acteur, op);
  });
}

function profilDisponible(data, donnees, a, op) {
  const bases = data.bases.filter((b) => b.roleId === a.roleId && b.operationId === op.id);
  if (bases.some((b) => b.autorisation === false)) return false;
  if (a.typeId) return bases.length ? bases.every((b) => b.autorisation === true) :
    !op.individuelRequis && data.bases.some((b) => b.roleId === a.roleId && b.capaciteId === op.capaciteId && !b.operationId);
  const regle = droits.regleRole(donnees.politique, a.roleId);
  const lien = donnees.liens.find((l) => String(l.id) === a.id);
  const acces = donnees.accesTypes.find((t) => t.id === String(lien?.accesTypeId));
  if (!regle || !acces || !acces.actif || !acces.valide || !regle.fonctions.includes(op.fonction)) return false;
  const restriction = String(acces.fonctions || "").split(/[;,\n]+/).map((f) => f.trim().toLowerCase()).filter(Boolean);
  if (restriction.length && !restriction.includes(op.fonction)) return false;
  return op.mode === "read" || ["ecriture", "administration"].includes(regle.niveau) &&
    (!acces.niveau || ["ecriture", "administration"].includes(String(acces.niveau).toLowerCase()));
}

function propreProfil(data, donnees, d, roleId) {
  return donnees.utilisateurs.find((u) => u.id === String(d.utilisateurId))?.roleId === roleId ||
    !superAdmin(d) && data.affectations.some((a) => a.utilisateurId === String(d.utilisateurId) && a.roleId === roleId);
}

async function lire(d) {
  const { data, donnees } = await contexte(d);
  const operations = data.operations.filter((o) => o.mode !== "compatibility");
  const ops = operations.map((o) => ({
    ref: ref("operation", o.id), titre: o.libelle || o.operation, code: o.operation,
    groupe: data.capacites.find((c) => c.id === o.capaciteId)?.titre || o.fonction,
    action: data.actions.find((a) => a.id === o.actionId)?.titre || ""
  }));
  const utilisateurs = affectations(data, donnees, d).map((a) => {
    const cible = sitesPour(data, donnees, a).cibles;
    const user = data.source["OBJ-UTILISATEUR"].items.find((u) => u.id === a.utilisateurId);
    const role = data.roles.find((r) => r.id === a.roleId);
    const decisions = cible.map((s) => contexteCible(donnees, a.utilisateurId, s.id));
    return { ref: ref("affectation", a.id), titre: user?.fields.Title || "Utilisateur",
      profil: role?.titre || "", sites: cible.map((s) => data.source["OBJ-SITE-PUBLIC"].items.find((x) => x.id === s.id)?.fields.Title || "Site"),
      droits: operations.map((op) => {
        const exactes = data.permissions.filter((p) => p.affectationId === a.id && p.utilisateurId === a.utilisateurId && p.operationId === op.id);
        const verrouille = data.permissions.some((p) => p.affectationId === a.id && p.utilisateurId === a.utilisateurId &&
          p.capaciteId === op.capaciteId && p.actionId === op.actionId && (!p.operationId || p.operationId === op.id) && p.verrouille);
        return { ref: ref("operation", op.id), valeur: exactes.length ? exactes.every((p) => p.autorisation === true) : null,
          effectif: decisions.every((r) => peut(r, op)),
          modifiable: ["read", "write"].includes(op.mode) && editable(data, donnees, d, a, op) && !verrouille && profilDisponible(data, donnees, a, op),
          motif: ["read", "write"].includes(op.mode) ? "Limite du profil, du site, du périmètre ou droit verrouillé." : "Droit global : choisissez les droits globaux du compte." };
      }) };
  });
  if (superAdmin(d)) for (const u of donnees.utilisateurs.filter((u) => u.actif && u.valide)) {
    const regle = droits.regleRole(donnees.politique, u.roleId);
    if (regle?.portee !== "tous" || regle.niveau !== "administration") continue;
    utilisateurs.push({ ref: ref("global", u.id), global: true, titre: `${u.titre || u.id} · Droits globaux`,
      profil: data.roles.find((r) => r.id === u.roleId)?.titre || "", sites: ["Tous les sites"],
      droits: operations.map((op) => {
        const ps = data.permissions.filter((p) => p.utilisateurId === u.id && p.affectationId == null && p.operationId === op.id);
        return { ref: ref("operation", op.id), valeur: ps.length ? ps.every((p) => p.autorisation === true) : null,
          effectif: require("./site-ecriture").operationGlobaleAutorisee({ reconnu: true, global: true, roleId: u.roleId, utilisateurId: u.id }, donnees, op.operation),
          modifiable: ["create", "validate"].includes(op.mode) && u.id !== String(d.utilisateurId) &&
            A.basePour(data, u.roleId, op) && !A.permissionsPour(data, u.id, null, op).some((p) => p.verrouille),
          motif: "Droit non global, profil insuffisant, accès personnel ou droit verrouillé." };
      }) });
  }
  const profils = superAdmin(d) ? data.roles.map((role) => ({
    ref: ref("role", role.id), titre: role.titre, verrouille: role.verrouille,
    peutDeverrouiller: role.verrouille && !propreProfil(data, donnees, d, role.id),
    droits: operations.map((op) => {
      const exactes = data.bases.filter((b) => b.roleId === role.id && b.operationId === op.id);
      return { ref: ref("operation", op.id), valeur: exactes.length ? exactes.every((b) => b.autorisation === true) : null,
        effectif: exactes.length ? exactes.every((b) => b.autorisation === true) : !op.individuelRequis && data.bases.some((b) => b.roleId === role.id && b.capaciteId === op.capaciteId && !b.operationId),
        modifiable: !role.verrouille && !exactes.some((b) => b.verrouille) &&
          !propreProfil(data, donnees, d, role.id),
        motif: "Profil verrouillé ou utilisé par votre propre compte." };
    })
  })) : [];
  return { operations: ops, utilisateurs, profils, peutCreer: superAdmin(d),
    capacites: superAdmin(d) ? data.capacites.map((c) => ({ ref: ref("capacite", c.id), titre: c.titre })) : [],
    actions: superAdmin(d) ? data.actions.map((a) => ({ ref: ref("action", a.id), titre: a.titre })) : [] };
}

function champ(data, nom, label, type, cible) {
  const liste = data.source[nom];
  const c = A.colonne(liste, label, cible ? data.source[cible] : null);
  if (!c[type] || c.readOnly || c.hidden) throw new Error(`${label} : colonne modifiable requise.`);
  return type === "lookup" ? `${c.name}LookupId` : c.name;
}

function etats(data, nom) {
  const l = data.source[nom], fields = {};
  for (const [label, cible] of [["ACTIF", "OBJ-ACTIF"], ["VALIDE", "OBJ-VALIDE"]]) {
    const c = l.cols.find((c) => A.LISTES.includes(cible) && (c.displayName === label || c.displayName === cible));
    if (!c) continue;
    if (c.boolean) fields[c.name] = true;
    else if (c.lookup) {
      const oui = data.source[cible].items.find((x) => /^oui\b/i.test(x.fields.Title));
      if (!oui) throw new Error(`${label} : référence Oui absente.`);
      fields[`${c.name}LookupId`] = oui.id;
    }
  }
  if (!Object.keys(fields).length) throw new Error("État du droit indisponible.");
  return fields;
}

function champsCatalogue(data, nom, valeurs) {
  return Object.fromEntries(valeurs.filter(([label]) => data.source[nom].cols.some((c) => c.displayName === label))
    .map(([label, type, valeur]) => [champ(data, nom, label, type), valeur]));
}

async function planifier(d, params) {
  const { data, donnees } = await contexte(d);
  let nom, fields, existants = [], titre;
  if (params.action === "deverrouiller-profil") {
    const role = trouver(data.roles, "role", params.cible);
    if (!superAdmin(d) || !role || !role.verrouille || propreProfil(data, donnees, d, role.id)) erreur("Déverrouillage de ce profil non autorisé.");
    nom = "OBJ-ROLE";
    titre = `Déverrouiller le profil ${role.titre}`;
    const cols = data.source[nom].cols.filter((c) => !c.hidden && !c.readOnly &&
      ["VERROUILLE", "OBJVEROUILLE", "OBJVERROUILLE"].includes(String(c.displayName).replace(/[^A-Z]/g, "")));
    if (cols.length !== 1) throw new Error("Colonne de verrouillage du profil unique requise.");
    const c = cols[0];
    if (c.boolean) fields = { [c.name]: false };
    else if (c.lookup && !c.lookup.allowMultipleValues && c.lookup.listId.toLowerCase() === data.source["OBJ-VEROUILLE"].id.toLowerCase()) {
      const non = data.source["OBJ-VEROUILLE"].items.filter((i) => /^non\b/i.test(i.fields.Title));
      if (non.length !== 1) throw new Error("Valeur Non de verrouillage unique requise.");
      fields = { [`${c.name}LookupId`]: non[0].id };
    } else throw new Error("Type de verrouillage de profil incompatible.");
    existants = [{ id: role.id }];
  } else if (params.action === "creer-groupe") {
    if (!superAdmin(d)) erreur("Seul un super administrateur peut créer un groupe.");
    titre = String(params.titre || "").trim();
    const code = String(params.code || "").trim();
    if (!titre || titre.length > 255 || !/^[a-z][a-z0-9.-]{2,119}$/.test(code)) erreur("Renseignez un nom et un code de groupe valides.");
    nom = "OBJ-CAPACITE";
    const codeChamp = champ(data, nom, "CODE-CAPACITÉ", "text");
    const normaliser = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    if (data.source[nom].items.some((i) => normaliser(i.fields.Title) === normaliser(titre) ||
      normaliser(i.fields[codeChamp]) === normaliser(code))) erreur("Ce groupe existe déjà, y compris éventuellement désactivé.");
    fields = { Title: titre, [codeChamp]: code, ...etats(data, nom),
      ...champsCatalogue(data, nom, [["LIBELLÉ-CAPACITÉ", "text", titre], ["VERROUILLE", "boolean", false]]) };
  } else if (params.action === "associer-action") {
    if (!superAdmin(d)) erreur("Seul un super administrateur peut définir les actions d’un groupe.");
    const capacite = trouver(data.capacites, "capacite", params.capacite);
    const action = trouver(data.actions, "action", params.typeAction);
    if (!capacite || !action || capacite.verrouille) erreur("Groupe ou type d’action indisponible ou protégé.");
    nom = "OBJ-CAPACITE-ACTION";
    const capaciteChamp = champ(data, nom, "OBJ-CAPACITE", "lookup", "OBJ-CAPACITE");
    const actionChamp = champ(data, nom, "OBJ-ACTION", "lookup", "OBJ-ACTION");
    if (data.source[nom].items.some((i) => String(i.fields[capaciteChamp]) === capacite.id &&
      String(i.fields[actionChamp]) === action.id)) erreur("Cette association existe déjà, y compris éventuellement désactivée.");
    titre = `${capacite.titre} · ${action.titre}`;
    fields = { Title: titre.slice(0, 255), [capaciteChamp]: capacite.id, [actionChamp]: action.id, ...etats(data, nom),
      ...champsCatalogue(data, nom, [["CODE-CAPACITÉ", "text", capacite.code], ["CODE-ACTION", "text", action.code], ["VERROUILLE", "boolean", false]]) };
  } else if (params.action === "creer") {
    if (!superAdmin(d)) erreur("Seul un super administrateur peut ajouter un droit.");
    const capacite = trouver(data.capacites, "capacite", params.capacite);
    const action = trouver(data.actions, "action", params.typeAction);
    if (!capacite || !action || !data.possibles.some((p) => p.capaciteId === capacite.id && p.actionId === action.id)) erreur("Cette action n’est pas configurée pour cette capacité.");
    const code = String(params.code || "").trim();
    titre = String(params.titre || "").trim();
    const fonction = String(params.fonction || "").trim(), route = String(params.route || "").trim();
    if (!/^[a-z][a-z0-9.-]{2,119}$/.test(code) || !titre || titre.length > 255 || !FONCTIONS_COCKPIT.includes(fonction) || !/^[a-z][a-z0-9/-]{0,119}$/.test(route) ||
      !["read", "write"].includes(params.mode)) erreur("Renseignez un libellé, un code, une fonction, une route et un mode valides.");
    if (data.source["OBJ-DROIT-OPERATION"].items.some((i) => String(i.fields[champ(data, "OBJ-DROIT-OPERATION", "OPERATION-TECHNIQUE", "text")]) === code)) erreur("Ce droit existe déjà, y compris éventuellement désactivé.");
    nom = "OBJ-DROIT-OPERATION";
    fields = { Title: titre, ...etats(data, nom),
      [champ(data, nom, "OPERATION-TECHNIQUE", "text")]: code,
      [champ(data, nom, "LIBELLE-INTERFACE", "text")]: titre,
      [champ(data, nom, "FONCTION-COCKPIT", "text")]: fonction,
      [champ(data, nom, "ROUTE-COCKPIT", "text")]: route,
      [champ(data, nom, "MODE-TECHNIQUE", "text")]: params.mode,
      [champ(data, nom, "OBJ-CAPACITE", "lookup", "OBJ-CAPACITE")]: capacite.id,
      [champ(data, nom, "OBJ-ACTION", "lookup", "OBJ-ACTION")]: action.id,
      [champ(data, nom, "INDIVIDUEL-REQUIS", "boolean")]: true };
  } else {
    const op = trouver(data.operations, "operation", params.operation);
    if (!op || op.mode === "compatibility" || !["true", "false"].includes(params.valeur)) erreur("Droit ou valeur invalide.");
    titre = op.libelle || op.operation;
    if (params.action === "utilisateur") {
      if (!["read", "write"].includes(op.mode)) erreur("Ce droit doit être modifié au niveau global.");
      const a = trouver(affectations(data, donnees, d), "affectation", params.cible);
      if (!a || !editable(data, donnees, d, a, op)) erreur("Vous ne pouvez pas modifier ce droit pour cet utilisateur et ce périmètre.");
      if (params.valeur === "true" && !profilDisponible(data, donnees, a, op)) erreur("Ce droit doit d’abord être autorisé dans le profil.");
      nom = "OBJ-UTILISATEUR-PERMISSION";
      existants = data.permissions.filter((p) => p.affectationId === a.id && p.utilisateurId === a.utilisateurId && p.operationId === op.id);
      if (data.permissions.some((p) => p.affectationId === a.id && p.utilisateurId === a.utilisateurId &&
        p.capaciteId === op.capaciteId && p.actionId === op.actionId && (!p.operationId || p.operationId === op.id) && p.verrouille)) erreur("Ce droit est verrouillé.");
      fields = {
        [champ(data, nom, "OBJ-UTILISATEUR", "lookup", "OBJ-UTILISATEUR")]: a.utilisateurId,
        [champ(data, nom, "OBJ-UTILISATEUR-SITE", "lookup", "OBJ-UTILISATEUR-SITE")]: a.id,
        [champ(data, nom, "OBJ-ACTION", "lookup", "OBJ-ACTION")]: op.actionId };
    } else if (params.action === "global") {
      const u = trouver(donnees.utilisateurs, "global", params.cible);
      const regle = u && droits.regleRole(donnees.politique, u.roleId);
      if (!superAdmin(d) || !u || !u.actif || !u.valide || u.id === String(d.utilisateurId) ||
        regle?.portee !== "tous" || regle.niveau !== "administration" || !["create", "validate"].includes(op.mode)) erreur("Droits globaux non modifiables pour ce compte.");
      if (params.valeur === "true" && !A.basePour(data, u.roleId, op)) erreur("Le profil doit d’abord autoriser ce droit.");
      nom = "OBJ-UTILISATEUR-PERMISSION";
      existants = data.permissions.filter((p) => p.utilisateurId === u.id && p.affectationId == null && p.operationId === op.id);
      if (A.permissionsPour(data, u.id, null, op).some((p) => p.verrouille)) erreur("Ce droit global est verrouillé.");
      fields = {
        [champ(data, nom, "OBJ-UTILISATEUR", "lookup", "OBJ-UTILISATEUR")]: u.id,
        [champ(data, nom, "OBJ-UTILISATEUR-SITE", "lookup", "OBJ-UTILISATEUR-SITE")]: null,
        [champ(data, nom, "OBJ-ACTION", "lookup", "OBJ-ACTION")]: op.actionId
      };
    } else if (params.action === "profil") {
      const role = trouver(data.roles, "role", params.cible);
      if (!superAdmin(d) || !role || role.verrouille || propreProfil(data, donnees, d, role.id)) erreur("Ce profil ne peut pas être modifié par votre compte.");
      nom = "OBJ-ROLE-CAPACITE";
      existants = data.bases.filter((b) => b.roleId === role.id && b.operationId === op.id);
      if (existants.some((b) => b.verrouille)) erreur("Ce droit de profil est verrouillé.");
      fields = { [champ(data, nom, "OBJ-ROLE", "lookup", "OBJ-ROLE")]: role.id };
    } else erreur("Action non autorisée.");
    Object.assign(fields, { Title: `Droit individuel : ${titre}`.slice(0, 255), ...etats(data, nom),
      [champ(data, nom, "OBJ-CAPACITE", "lookup", "OBJ-CAPACITE")]: op.capaciteId,
      [champ(data, nom, "OBJ-DROIT-OPERATION", "lookup", "OBJ-DROIT-OPERATION")]: op.id,
      [champ(data, nom, "AUTORISATION", "boolean")]: params.valeur === "true" });
  }
  if (existants.length > 1) erreur("Plusieurs permissions individuelles existent : correction requise avant modification.");
  const itemId = existants[0]?.id;
  const row = itemId ? data.source[nom].items.find((i) => i.id === itemId) : null;
  if (itemId && !row) throw new Error("La permission actuelle est indisponible. Relisez avant de modifier.");
  const avant = Object.fromEntries(Object.keys(fields).map((k) => [k, row?.fields[k] == null ? "" : String(row.fields[k])]));
  return { type: itemId ? "modifier" : "ajouter", listId: data.source[nom].id, itemId, champs: fields,
    ...(params.action === "creer-groupe" ? { verrouRessource: "droits-catalogue-groupes" } : {}),
    avant: ecriture.hash(avant), selectionChamps: Object.keys(fields), nom: titre, action: `Droits : ${params.action}`,
    cleDoublon: ecriture.hash([nom, ["creer", "creer-groupe"].includes(params.action) ? params.code :
      params.action === "associer-action" ? params.capacite : params.cible, params.typeAction || params.operation || ""]),
    portee: "droits-admin", params, journalComptes: true, contexteJournal: { utilisateurId: d.utilisateurId, siteId: d.contexte?.siteId || null } };
}

async function preparer(identite, d, params) {
  const op = await planifier(d, params);
  return { jeton: ecriture.emettreJeton(identite, op).jeton, changements: [{ libelle: op.nom, avant: "Configuration actuelle",
    apres: params.action === "creer" ? "Nouveau droit (aucune autorisation attribuée automatiquement)" :
      params.action === "creer-groupe" ? "Nouveau groupe vide ; aucun droit ni accès existant modifié" :
      params.action === "associer-action" ? "Type d’action disponible pour créer des droits ; aucune autorisation attribuée" :
      params.action === "deverrouiller-profil" ? "Profil déverrouillé ; ses droits restent inchangés jusqu’à leur modification explicite" :
        params.valeur === "true" ? "Autoriser cette action" : "Interdire cette action" }] };
}

async function revalider(d, op) {
  const neuf = await planifier(d, op.params);
  return neuf.type !== op.type || neuf.listId !== op.listId || neuf.itemId !== op.itemId || ecriture.hash(neuf.champs) !== ecriture.hash(op.champs) || neuf.avant !== op.avant
    ? "La configuration ou les droits ont changé. Relisez avant de confirmer." : null;
}

module.exports = { lire, preparer, revalider, planifier, autorise, superAdmin, editable };
