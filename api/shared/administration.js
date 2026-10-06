"use strict";

/*
 * Administration du cockpit : tableau de bord, utilisateurs/roles/acces, menu dynamique.
 * Tous les controles sont faits ici, cote serveur. Le navigateur ne manipule que des
 * references opaques (jamais d'ID SharePoint ni de nom de liste/colonne).
 */

const crypto = require("crypto");
const dse = require("./dse");
const ecriture = require("./ecriture");
const edition = require("./edition");
const cockpit = require("./cockpit");
const perimetre = require("./perimetre");
const resumeSites = require("./resume-sites");
const droits = require("../auth/droits");
const { politiqueDepuisRoles } = require("../auth/politique-sharepoint");
const { paginer } = require("./pagination");

// References opaques : stables pour la duree du processus, impossibles a deviner depuis le navigateur.
const SEL = crypto.randomBytes(32);
const ref = (type, id) => `${type}${crypto.createHmac("sha256", SEL).update(`${type}:${id}`).digest("hex").slice(0, 12)}`;
const minuscule = (v) => String(v || "").trim().toLowerCase();
const EMAIL = /^[^\s@<>"']{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/* ---------------- Perimetre ---------------- */

async function contexteSites(d) {
  const { sites: index, statuts } = await droits.sitesIndex();
  const groupes = perimetre.regrouperSites([...index.values()]);
  const autorises = new Set(d.siteIds);
  const parFiche = new Map();
  for (const g of groupes) for (const f of g.fiches) parFiche.set(String(f), g);
  return { groupes: groupes.filter((g) => autorises.has(String(g.id))), tous: groupes, parFiche, statuts };
}

async function sitesAffectables(d) {
  const ctx = await contexteSites(d);
  if (d.portee === "tous") return ctx.tous;
  if (d.portee !== "client") return ctx.groupes;
  return ctx.tous.filter((s) => s.clientId && d.clientIds.includes(String(s.clientId)));
}

/*
 * Utilisateurs visibles : tous pour la portee "tous" ; sinon uniquement ceux dont
 * tous les acces sont dans le perimetre de l'acteur (jamais un utilisateur d'un autre client).
 */
function utilisateursVisibles(d, donnees) {
  if (!d.fonctions.includes("utilisateurs")) return [];
  const mesSites = new Set(d.siteIds);
  return donnees.utilisateurs.filter((u) => {
    if (d.portee === "tous") return true;
    if (String(u.id) === String(d.utilisateurId)) return true;
    return donnees.liens.some((l) => String(l.utilisateurId) === String(u.id) && l.siteId &&
      mesSites.has(String(l.siteId)) && d.clientIds.includes(String(l.clientId)));
  });
}

const rolesAttribuables = (d, donnees) => donnees.roles.filter((r) => droits.peutAttribuer(d, r.id, donnees.politique));

function vueUtilisateur(u, d, donnees, ctxSites) {
  const moi = String(u.id) === String(d.utilisateurId);
  const sites = donnees.liens
    .filter((l) => String(l.utilisateurId) === String(u.id))
    .filter((l) => d.global || d.siteIds.includes(String(l.siteId)) && d.clientIds.includes(String(l.clientId)))
    .map((l) => {
      const g = ctxSites.parFiche.get(String(l.siteId));
      const role = donnees.roles.find((r) => String(r.id) === String(l.roleId));
      const acces = (donnees.accesTypes || []).find((a) => String(a.id) === String(l.accesTypeId));
      const client = donnees.clients.find((c) => String(c.id) === String(l.clientId));
      const contexte = droits.contexteRelation({ utilisateurId: String(u.id) }, donnees, l);
      const autorisation = droits.contexteSite({ reconnu: u.actif && u.valide, utilisateurId: String(u.id) }, donnees, l.siteId);
      return { ref: ref("l", l.id), nom: g?.titre || "Site", domaine: g ? perimetre.domaineAcces(g) : null,
        actif: l.actif, valide: l.valide, verrouille: l.verrouille, modifieLe: l.modifieLe,
        client: client?.titre || null, clientRef: client ? ref("k", client.id) : "",
        siteRef: l.siteId ? ref("s", l.siteId) : "", role: role?.titre || null, accesType: acces?.titre || null,
        autorise: autorisation.contexte.etat === "COMPLET",
        roleRef: role ? ref("r", role.id) : "", accesTypeRef: acces ? ref("a", acces.id) : "",
        modifiable: d.niveau === "administration" && !l.verrouille && !moi &&
          (d.global || !role || droits.peutAttribuer(d, role.id, donnees.politique)),
        deverrouillable: d.global && d.niveau === "administration" && l.verrouille && !moi,
        incomplet: contexte.contexte.etat !== "COMPLET",
        motif: contexte.contexte.message || null };
    });
  const modifiable = d.niveau === "administration" && !moi;
  return {
    ref: ref("u", u.id),
    email: u.titre,
    role: d.global || moi ? u.roleTitre || null : null,
    roleGlobalRef: d.global && u.roleId ? ref("r", u.roleId) : "",
    actif: u.actif && u.valide,
    moi,
    identiteLiee: !!u.entraObjectId, peutLierIdentite: d.global && !moi && !u.entraObjectId && u.actif && u.valide,
    sites,
    portee: droits.regleRole(donnees.politique || {}, u.roleId)?.portee || null,
    modifiable,
    roleGlobalModifiable: d.global && !moi && (!u.roleId || droits.peutAttribuer(d, u.roleId, donnees.politique))
  };
}

async function utilisateurs(d, query = {}) {
  if (!d.fonctions.includes("utilisateurs")) return null;
  const donnees = await droits.donneesDroits();
  const ctxSites = await contexteSites(d);
  const vues = utilisateursVisibles(d, donnees).map((u) => vueUtilisateur(u, d, donnees, ctxSites));
  const utilisateur = query.utilisateur ? vues.find((u) => u.ref === query.utilisateur) : null;
  if (query.utilisateur && !utilisateur) return null;
  const tris = { site: (s) => s.nom, domaine: (s) => s.domaine, client: (s) => s.client,
    role: (s) => s.role, accesType: (s) => s.accesType, etat: (s) => Number(s.actif) + Number(s.valide),
    modifieLe: (s) => s.modifieLe };
  const filtre = { site: (s) => s.siteRef, client: (s) => s.clientRef, role: (s) => s.roleRef,
    accesType: (s) => s.accesTypeRef, actif: (s) => String(s.actif), valide: (s) => String(s.valide),
    verrouille: (s) => String(s.verrouille), incomplet: (s) => String(s.incomplet) };
  const page = utilisateur
    ? paginer(utilisateur.sites, query, { tris, filtres: filtre,
      recherche: (s) => [s.nom, s.domaine, s.client, s.role, s.accesType].join(" ") })
    : paginer(vues, query, { tris: { identite: (u) => u.email, role: (u) => u.role,
      etat: (u) => Number(u.actif), affectations: (u) => u.sites.length },
      recherche: (u) => [u.email, u.role].join(" ") });
  const repartition = (cle) => {
    const groupes = new Map();
    for (const s of utilisateur.sites) {
      const id = s[`${cle}Ref`] || "";
      const groupe = groupes.get(id) || { ref: id, titre: s[cle] || "Non renseigné", nombre: 0 };
      groupe.nombre++;
      groupes.set(id, groupe);
    }
    return [...groupes.values()];
  };
  const synthese = utilisateur ? { total: utilisateur.sites.length,
    autorises: new Set(utilisateur.sites.filter((s) => s.autorise).map((s) => s.siteRef)).size,
    actives: utilisateur.sites.filter((s) => s.actif).length,
    incompletes: utilisateur.sites.filter((s) => s.incomplet).length,
    verrouillees: utilisateur.sites.filter((s) => s.verrouille).length,
    roles: repartition("role"), accesTypes: repartition("accesType") } : null;
  const sites = (await sitesAffectables(d)).map((g) => ({ nom: g.titre, domaine: perimetre.domaineAcces(g),
    clientRef: ref("k", g.clientId), client: donnees.clients.find((c) => c.id === String(g.clientId))?.titre || "" }))
    .filter((s) => s.domaine);
  const sitesAjout = paginer(sites, { q: query.qSite, page: query.pageSite, parPage: 25 }, {
    tris: { site: (s) => s.nom }, recherche: (s) => [s.nom, s.domaine, s.client].join(" ") });
  const optionsFiltre = utilisateur ? Object.fromEntries(["site", "client", "role", "accesType"].map((cle) => [
    cle, [...new Map(utilisateur.sites.filter((s) => s[`${cle}Ref`]).map((s) =>
      [s[`${cle}Ref`], { ref: s[`${cle}Ref`], titre: cle === "site" ? s.nom : s[cle] }])).values()]
  ])) : {};
  return {
    utilisateurs: utilisateur ? [] : page.elements.map(({ sites, ...u }) => ({ ...u, affectations: sites.length })),
    utilisateur: utilisateur ? { ...utilisateur, sites: page.elements } : null,
    pagination: { ...page, elements: undefined }, synthese, optionsFiltre,
    roles: rolesAttribuables(d, donnees).map((r) => ({ ref: ref("r", r.id), titre: r.titre })),
    accesTypes: (donnees.accesTypes || []).filter((a) => a.actif && a.valide &&
      (!a.clientId || d.clientIds.includes(String(a.clientId)))).map((a) => ({ ref: ref("a", a.id), titre: a.titre })),
    sites: sitesAjout.elements, paginationSites: { ...sitesAjout, elements: undefined },
    peutCreer: d.portee === "tous",
    clients: donnees.clients.filter((c) => d.clientIds.includes(String(c.id))).map((c) => ({ ref: ref("k", c.id), titre: c.titre })),
    politiques: d.portee === "tous" && d.fonctions.includes("plateforme")
      ? donnees.roles.map((r) => ({ ref: ref("r", r.id), titre: r.titre, portee: r.portee, niveau: r.niveau, fonctions: r.fonctions,
        modifiable: String(r.id) !== String(d.roleId) })) : []
  };
}

/* ---------------- Valeurs Oui (actif / valide) resolues dynamiquement ---------------- */

async function idOui(g, nomListe, idListe) {
  if (!idListe) return null;
  const items = await dse.chargerItemsListe(g.token, g.siteGraphId, idListe);
  const oui = items.filter((i) => /^oui\b/i.test(String(i.fields?.Title || "").trim()));
  return oui.length === 1 ? String(oui[0].id) : null;
}

/* ---------------- Actions d'administration ---------------- */

const ACTIONS = ["changer-role", "lier-identite-utilisateur", "ajouter-acces-site", "modifier-acces-site", "deverrouiller-acces-site", "creer-utilisateur", "modifier-politique-role", "changer-statut-site"];

/*
 * Verifie une action et construit l'operation d'ecriture. Appelee a l'apercu ET a la
 * confirmation (avec des droits relus) : les memes regles s'appliquent aux deux moments.
 */
async function construireAction(d, action, params, g) {
  if (!ACTIONS.includes(action)) return { refus: "Action non autorisée." };
  if (action === "changer-statut-site") return require("./statut-sites").construire(d, params, g);
  if (!d.reconnu || !d.fonctions.includes("utilisateurs") || d.niveau !== "administration") return { refus: "Accès non autorisé." };
  const donnees = await droits.donneesDroits();
  const politique = donnees.politique || { roles: {} };
  const S = donnees.structure;
  if (!S) return { refus: "La gestion des utilisateurs est momentanément indisponible." };
  const visibles = utilisateursVisibles(d, donnees);
  const cible = params.utilisateur ? visibles.find((u) => ref("u", u.id) === params.utilisateur) : null;
  const role = params.role ? donnees.roles.find((r) => ref("r", r.id) === params.role) : null;

  if (action === "lier-identite-utilisateur") {
    if (!d.global || !cible || cible.id === d.utilisateurId || !cible.actif || !cible.valide || cible.entraObjectId) {
      return { refus: "Liaison réservée à l'administration globale pour un compte existant valide non lié, hors de ses propres droits." };
    }
    const preuve = require("../auth/liaison-identite").lire(params.codeLiaison);
    if (!preuve || donnees.utilisateurs.some((u) => minuscule(u.entraObjectId) === minuscule(preuve.sujet))) {
      return { refus: "Code OAuth personnel expiré, inconnu ou identité déjà liée. Demandez le code depuis la session réelle du titulaire." };
    }
    const colonne = S.colonnes.utilisateurEntra;
    if (!colonne) return { refus: "Colonne d'identité utilisateur indisponible." };
    return { op: { type: "modifier", listId: S.listes.utilisateur, itemId: cible.id,
      champs: { [colonne]: preuve.sujet }, avantValeurs: { [colonne]: "" }, selectionChamps: [colonne],
      action: "Comptes : liaison identité OAuth vérifiée", journalComptes: true,
      contexteJournal: { utilisateurCibleId: cible.id }, verifierCible: async (g) => {
        const users = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${S.listes.utilisateur}/items?$expand=fields($select=${colonne})`);
        return users.some((u) => minuscule(u.fields?.[colonne]) === minuscule(preuve.sujet))
          ? "Cette identité est déjà liée à un compte." : null;
      } }, changements: [{ libelle: "Compte natif choisi explicitement", avant: cible.titre, apres: cible.titre },
      { libelle: "Identité issue d'une session Microsoft authentifiée", avant: "Non liée",
        apres: `${preuve.nom || "Nom non fourni"} · ${preuve.email || "E-mail non fourni"}` },
      { libelle: "Droits", avant: "Rôles et affectations existants", apres: "Inchangés ; aucun droit ajouté" }] };
  }

  if (action === "modifier-politique-role") {
    if (d.portee !== "tous" || !d.fonctions.includes("plateforme") || !role ||
      String(role.id) === String(d.roleId)) return { refus: "Modification de cette politique non autorisée." };
    if (!["portee", "niveau", "fonctions"].every((k) => typeof params[k] === "string") || params.fonctions.length > 2000) {
      return { refus: "Saisie de politique invalide." };
    }
    const candidat = { ...role, portee: params.portee, niveau: params.niveau, fonctions: params.fonctions };
    const p = politiqueDepuisRoles([candidat]);
    if (!droits.peutAttribuer(d, role.id, p)) return { refus: "Politique incomplète, inconnue ou supérieure à vos droits." };
    if (!S.listes.role) return { refus: "Gestion des politiques indisponible." };
    const champs = { PORTEE: candidat.portee, NIVEAUACCES: candidat.niveau, FONCTIONS: candidat.fonctions };
    const avantValeurs = { PORTEE: role.portee || "", NIVEAUACCES: role.niveau || "", FONCTIONS: role.fonctions || "" };
    if (ecriture.hash(champs) === ecriture.hash(avantValeurs)) return { aucunChangement: true };
    return { op: { type: "modifier", listId: S.listes.role, itemId: String(role.id), champs, avantValeurs,
      action: "Cockpit : politique de rôle", nom: role.titre, notes: `Politique du rôle ${role.id}` },
    changements: Object.keys(champs).filter((k) => champs[k] !== avantValeurs[k]).map((k) => ({
      libelle: { PORTEE: "Périmètre", NIVEAUACCES: "Niveau", FONCTIONS: "Fonctions" }[k], avant: avantValeurs[k], apres: champs[k]
    })) };
  }

  if (action === "changer-role") {
    if (!d.global) return { refus: "Le rôle global est réservé à l'administration globale." };
    if (!cible) return { refus: "Utilisateur introuvable dans votre périmètre." };
    if (String(cible.id) === String(d.utilisateurId)) return { refus: "Vous ne pouvez pas modifier votre propre rôle." };
    if (cible.roleId && !droits.peutAttribuer(d, cible.roleId, politique)) return { refus: "Cet utilisateur dispose de droits supérieurs aux vôtres." };
    if (!role || !droits.peutAttribuer(d, role.id, politique)) return { refus: "Vous ne pouvez pas attribuer ce rôle." };
    if (droits.regleRole(politique, role.id)?.portee === "client" &&
      !donnees.clients.some((c) => String(c.id) === String(cible.clientId))) return { refus: "Ce rôle exige un client valide sur l'utilisateur." };
    if (!S.colonnes.utilisateurRole) return { refus: "La gestion des rôles est momentanément indisponible." };
    if (String(cible.roleId) === String(role.id)) return { aucunChangement: true };
    return {
      op: {
        type: "modifier", listId: S.listes.utilisateur, itemId: String(cible.id),
        champs: { [`${S.colonnes.utilisateurRole}LookupId`]: String(role.id) },
        avantValeurs: { [`${S.colonnes.utilisateurRole}LookupId`]: String(cible.roleId || "") },
        verifierVersion: (fields) => d.portee === "tous" ||
          (S.colonnes.utilisateurClient && d.clientIds.includes(String(fields[`${S.colonnes.utilisateurClient}LookupId`] || "")))
          ? null : "L'utilisateur n'appartient plus à votre client.",
        action: "Cockpit : changement de rôle", nom: `Rôle — ${cible.titre}`,
        notes: `Utilisateur ${cible.id} (${cible.titre}) | Rôle ${cible.roleId || "-"} -> ${role.id} (${role.titre})`
      },
      changements: [{ libelle: `Rôle de ${cible.titre}`, avant: cible.roleTitre || "Aucun", apres: role.titre }]
    };
  }

  if (action === "deverrouiller-acces-site") {
    const lien = donnees.liens.find((l) => ref("l", l.id) === params.relation && l.utilisateurId === cible?.id);
    if (!d.global || !cible || String(cible.id) === String(d.utilisateurId) || !lien?.verrouille) {
      return { refus: "Déverrouillage réservé à l'administration globale, hors de ses propres accès." };
    }
    const C = S.colonnes;
    if (!C.lienVerrou || !S.etats.verrouNon || !S.etats.verrouOui) return { refus: "Valeurs de verrouillage indisponibles." };
    const champ = `${C.lienVerrou}LookupId`;
    return { op: { type: "modifier", listId: S.listes.lien, itemId: lien.id,
      champs: { [champ]: S.etats.verrouNon }, avantValeurs: { [champ]: S.etats.verrouOui },
      selectionChamps: [champ], action: "Comptes : déverrouillage accès",
      journalComptes: true, contexteJournal: { utilisateurCibleId: cible.id, siteId: lien.siteId, clientId: lien.clientId } },
      changements: [{ libelle: `Protection de l'accès de ${cible.titre}`, avant: "Verrouillé", apres: "Déverrouillé" }] };
  }

  if (["ajouter-acces-site", "modifier-acces-site"].includes(action)) {
    if (!cible) return { refus: "Utilisateur introuvable dans votre périmètre." };
    if (!cible.actif || !cible.valide) return { refus: "Utilisateur non actif ou non validé." };
    if (String(cible.id) === String(d.utilisateurId)) return { refus: "Vous ne pouvez pas modifier vos propres accès." };
    if (!role || !role.actif || !role.valide || !droits.peutAttribuer(d, role.id, politique)) return { refus: "Rôle contextuel absent ou non attribuable." };
    const acces = (donnees.accesTypes || []).find((a) => ref("a", a.id) === params.accesType && a.actif && a.valide);
    if (!acces) return { refus: "Profil d'accès valide obligatoire." };
    const groupe = perimetre.groupeParDomaine(await sitesAffectables(d), minuscule(params.domaine));
    if (!groupe) return { refus: "Ce site n'est pas dans votre périmètre." };
    const site = donnees.sites.find((s) => String(s.id) === String(groupe.id));
    if (!site?.valide || !site.clientId || !donnees.clients.some((c) => String(c.id) === String(site.clientId)) ||
      !d.global && !d.clientIds.includes(String(site.clientId)) ||
      acces.clientId && String(acces.clientId) !== String(site.clientId)) return { refus: "Client/site/profil hors du périmètre autorisé." };
    const C = S.colonnes;
    if (params.client && ref("k", site.clientId) !== params.client) return { refus: "Le client sélectionné ne correspond pas au site." };
    if (!S.listes.lien || !C.lienUtilisateur || !C.lienSite || !C.lienClient || !C.lienRole || !C.lienAccesType) return { refus: "La gestion des accès est momentanément indisponible." };
    const existants = donnees.liens.filter((l) => l.actif && String(l.utilisateurId) === String(cible.id) && String(l.siteId) === String(groupe.id));
    if (existants.length > 1) return { refus: "Plusieurs relations existent déjà : résolution administrateur requise." };
    if (action === "ajouter-acces-site" && params.actif === "true" && existants.length) return { refus: "Une relation active Utilisateur + Site existe déjà." };
    const existante = action === "modifier-acces-site" ? donnees.liens.find((l) =>
      l.utilisateurId === cible.id && l.siteId === String(groupe.id) && ref("l", l.id) === params.relation) : null;
    if (action === "modifier-acces-site" && (!existante || existante.verrouille ||
      String(existante.clientId) !== String(site.clientId) ||
      !d.global && existante.roleId && !droits.peutAttribuer(d, existante.roleId, politique))) return { refus: "Relation non valide, verrouillée ou non modifiable." };
    const champs = { [`${C.lienUtilisateur}LookupId`]: String(cible.id), [`${C.lienSite}LookupId`]: String(groupe.id),
      [`${C.lienClient}LookupId`]: String(site.clientId), [`${C.lienRole}LookupId`]: String(role.id),
      [`${C.lienAccesType}LookupId`]: String(acces.id) };
    const etats = [["actif", C.lienActif, "actif"], ["valide", C.lienValide, "valide"], ["verrouille", C.lienVerrou, "verrou"]];
    for (const [param, colonne, etat] of etats) {
      if (!colonne || !["true", "false"].includes(params[param]) || !S.etats[`${etat}${params[param] === "true" ? "Oui" : "Non"}`]) {
        return { refus: `État ${param} explicite et valeur SharePoint correspondante obligatoires.` };
      }
      champs[`${colonne}LookupId`] = S.etats[`${etat}${params[param] === "true" ? "Oui" : "Non"}`];
    }
    if (params.actif === "true" && existants.some((l) => l.id !== existante?.id)) {
      return { refus: "Une relation active Utilisateur + Site existe déjà." };
    }
    if (existante) {
      const avantValeurs = { [`${C.lienUtilisateur}LookupId`]: String(existante.utilisateurId),
        [`${C.lienSite}LookupId`]: String(existante.siteId), [`${C.lienClient}LookupId`]: String(existante.clientId),
        [`${C.lienRole}LookupId`]: String(existante.roleId || ""), [`${C.lienAccesType}LookupId`]: String(existante.accesTypeId || "") };
      for (const [param, colonne] of etats) {
        avantValeurs[`${colonne}LookupId`] = existante.etatsIds?.[param] || "";
      }
      if (ecriture.hash(champs) === ecriture.hash(avantValeurs)) return { aucunChangement: true };
      if (!S.etats?.actifOui || !S.etats.valideOui) return { refus: "États de validation de la relation indisponibles." };
      return { op: { type: "modifier", listId: S.listes.lien, itemId: String(existante.id), champs, avantValeurs,
        selectionChamps: [...Object.keys(champs), ...[C.lienActif, C.lienValide, C.lienVerrou].filter(Boolean).map((c) => `${c}LookupId`)],
        verifierVersion: (f) => String(f[`${C.lienVerrou}LookupId`]) === S.etats.verrouOui
          ? "La relation a été verrouillée." : null,
        journalComptes: true, cleDoublon: `lien:${cible.id}:${groupe.id}`,
        verifierCible: params.actif === "true" ? controleDoublonInverse({ listId: S.listes.lien,
          itemId: existante.id, cleDoublon: `lien:${cible.id}:${groupe.id}`,
          doublonChamps: { utilisateur: `${C.lienUtilisateur}LookupId`, site: `${C.lienSite}LookupId`,
            actif: `${C.lienActif}LookupId`, actifId: S.etats.actifOui } }) : null,
        contexteJournal: { utilisateurCibleId: cible.id, siteId: groupe.id, clientId: site.clientId },
        action: "Cockpit : droits contextuels", nom: groupe.titre },
        changements: [{ libelle: `Droits de ${cible.titre} sur ${groupe.titre}`, avant: "Contexte actuel",
          apres: `${role.titre} / ${acces.titre} · Actif ${params.actif} · Valide ${params.valide} · Verrouillé ${params.verrouille}` }] };
    }
    return {
      op: {
        type: "ajouter", journalComptes: true, listId: S.listes.lien, champs: { Title: `Accès — ${cible.titre} — ${groupe.titre}`.slice(0, 255), ...champs },
        selectionChamps: ["Title", ...Object.keys(champs)],
        action: "Cockpit : ajout d'accès site", nom: `Accès — ${cible.titre} — ${groupe.titre}`,
        notes: `Utilisateur ${cible.id} (${cible.titre}) | Site ${groupe.id} (${groupe.titre})`,
        cleDoublon: `lien:${cible.id}:${groupe.id}`,
        doublonChamps: { utilisateur: `${C.lienUtilisateur}LookupId`, site: `${C.lienSite}LookupId`,
          actif: `${C.lienActif}LookupId`, actifId: S.etats.actifOui },
        contexteJournal: { utilisateurId: String(cible.id), clientId: String(site.clientId), siteId: String(groupe.id) }
      },
      changements: [{ libelle: `Accès de ${cible.titre}`, avant: "Aucun accès", apres: `${groupe.titre} / ${role.titre} / ${acces.titre} · Actif ${params.actif} · Valide ${params.valide} · Verrouillé ${params.verrouille}` }]
    };
  }

  // creer-utilisateur : reserve a la portee "tous" (un utilisateur cree sans site serait hors de tout perimetre client).
  if (d.portee !== "tous") return { refus: "La création d'utilisateur n'est pas disponible dans votre périmètre." };
  const email = minuscule(params.email);
  if (!EMAIL.test(email) || email.length > 255) return { refus: "Adresse e-mail invalide." };
  if (donnees.utilisateurs.some((u) => minuscule(u.titre) === email)) return { refus: "Cet utilisateur existe déjà." };
  if (!role || !droits.peutAttribuer(d, role.id, politique)) return { refus: "Vous ne pouvez pas attribuer ce rôle." };
  const C = S.colonnes;
  if (!C.utilisateurRole || !S.listes.utilisateur) return { refus: "La structure des utilisateurs est indisponible." };
  const champs = { Title: email, [`${C.utilisateurRole}LookupId`]: String(role.id) };
  const client = params.client ? donnees.clients.find((c) => ref("k", c.id) === params.client && d.clientIds.includes(String(c.id))) : null;
  if (params.client && !client) return { refus: "Client introuvable dans votre périmètre." };
  if (droits.regleRole(politique, role.id)?.portee === "client" && !client) return { refus: "Un client valide est obligatoire pour ce rôle." };
  if (client) {
    if (!C.utilisateurClient) return { refus: "La relation client n'est pas disponible." };
    champs[`${C.utilisateurClient}LookupId`] = String(client.id);
  }
  if (g) {
    const [oa, ov] = await Promise.all([idOui(g, "OBJ-ACTIF", S.listes.actif), idOui(g, "OBJ-VALIDE", S.listes.valide)]);
    if (!oa || !ov || !C.utilisateurActif || !C.utilisateurValide) return { refus: "Les valeurs d'activation ne sont pas disponibles." };
    champs[`${C.utilisateurActif}LookupId`] = oa;
    champs[`${C.utilisateurValide}LookupId`] = ov;
  }
  return {
    op: {
      type: "ajouter", listId: S.listes.utilisateur, champs,
      action: "Cockpit : création d'utilisateur", nom: `Utilisateur — ${email}`,
      notes: `Utilisateur ${email} | Rôle ${role.id} (${role.titre})`, cleDoublon: `utilisateur:${email}`
    },
    changements: [{ libelle: "Nouvel utilisateur", avant: "—", apres: `${email} (${role.titre})${client ? ` — ${client.titre}` : ""}` }]
  };
}

/* Anti-doublon relu dans SharePoint au moment de l'ecriture (et non depuis le cache). */
function controleDoublon(op) {
  return async (g) => {
    const [type, a, b] = String(op.cleDoublon || "").split(":");
    const c = op.doublonChamps;
    if (type === "lien" && (!c?.actifId || !c.utilisateur || !c.site || !c.actif)) throw new Error("Contrôle anti-doublon incomplet.");
    const champs = type === "lien" ? [c.utilisateur, c.site, c.actif] : ["Title"];
    const items = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${op.listId}/items?$expand=fields($select=${champs.join(",")})`);
    if (type === "utilisateur") return items.some((i) => minuscule(i.fields?.Title) === a);
    if (type === "lien") {
      if (op.type === "ajouter" && String(op.champs?.[c.actif]) !== String(c.actifId)) return false;
      return items.some((i) => String(i.id) !== String(op.itemId || "") && String(i.fields?.[c.utilisateur]) === a && String(i.fields?.[c.site]) === b &&
        String(i.fields?.[c.actif]) === String(c.actifId));
    }
    return false;
  };
}

function controleDoublonInverse(op) {
  return async (g) => await controleDoublon(op)(g) ? "Une autre relation active Utilisateur + Site existe déjà." : null;
}

async function espaces(d, query = {}) {
  if (!d.reconnu) return null;
  const donnees = await droits.donneesDroits();
  const ctx = await contexteSites(d);
  const elements = ctx.groupes.map((g) => {
    const client = donnees.clients.find((c) => c.id === String(g.clientId));
    return { ref: ref("s", g.id), nom: g.titre, domaine: perimetre.domaineAcces(g),
      domainePrincipal: perimetre.domainesDuSite(g).principal,
      client: client?.titre || "", clientRef: client ? ref("k", client.id) : "",
      statut: ctx.statuts.get(String(g.statutId))?.titre || "",
      couleur: ctx.statuts.get(String(g.statutId))?.couleur || null };
  });
  const page = paginer(elements, query, { tris: { site: (s) => s.nom, domaine: (s) => s.domaine,
    client: (s) => s.client, statut: (s) => s.statut },
    filtres: { client: (s) => s.clientRef, statut: (s) => s.statut },
    recherche: (s) => [s.nom, s.domaine, s.client, s.statut].join(" ") });
  return { espaces: page.elements, pagination: { ...page, elements: undefined },
    clients: [...new Map(elements.filter((s) => s.clientRef).map((s) => [s.clientRef, { ref: s.clientRef, titre: s.client }])).values()],
    statuts: [...new Set(elements.map((s) => s.statut).filter(Boolean))].map((s) => ({ ref: s, titre: s })) };
}

async function preparerAction({ identite, d, action, params }) {
  const g = await ecriture.contexteGraph();
  const r = await construireAction(d, action, params || {}, g);
  if (r.refus) {
    console.warn("[DSE administration] écriture refusée", action);
    return { status: 403, erreur: r.refus };
  }
  if (r.aucunChangement) return { status: 200, aucunChangement: true, changements: [] };
  const op = { ...r.op, portee: "admin", adminAction: action, adminParams: params };
  if (["changer-role", "creer-utilisateur", "modifier-politique-role"].includes(action)) op.journalComptes = true;
  op.contexteJournal = { acteur: identite.sujet, utilisateurId: d.utilisateurId || null,
    clientId: d.clientIds?.length === 1 ? d.clientIds[0] : null, siteId: null, ...op.contexteJournal };
  if (op.type === "modifier") op.avant = ecriture.hash(op.avantValeurs);
  delete op.avantValeurs;
  const { jeton } = ecriture.emettreJeton(identite, op);
  return { status: 200, jeton, changements: r.changements };
}


/* ---------------- Menu dynamique ---------------- */

const ENTREES_MOTEUR = [
  { cle: "accueil", libelle: "Cockpit", icone: "🏠", url: "/cockpit", ordre: 10, niveau: "lecture", fonction: null },
  { cle: "sites", libelle: "Mes sites", icone: "🌐", url: "/cockpit/sites", ordre: 20, niveau: "lecture", fonction: null },
  { cle: "creer", libelle: "Créer un site", icone: "➕", url: "/cockpit/creer", ordre: 30, niveau: "ecriture", fonction: "creer" },
  { cle: "administration", libelle: "Administration", icone: "🛡️", url: "/cockpit/administration", ordre: 80, niveau: "administration", fonction: "administration" },
  { cle: "compte", libelle: "Mon compte", icone: "👤", url: "/cockpit/compte", ordre: 85, niveau: "lecture", fonction: null },
  { cle: "utilisateurs", libelle: "Comptes", icone: "👥", url: "/cockpit/utilisateurs", ordre: 90, niveau: "administration", fonction: "utilisateurs" },
  { cle: "synchronisations", libelle: "Synchronisations", icone: "🔄", url: "/cockpit/synchronisations", ordre: 95, niveau: "administration", fonction: "administration", global: true }
];

/*
 * Applications declarees dans SharePoint (OBJ-COCKPIT), actives et validees, rattachees
 * au perimetre via OBJ-SITE-COCKPIT. Une application n'entre au menu que si SharePoint
 * fournit une adresse interne ; aucune adresse n'est inventee.
 */
async function applications(d) {
  const g = await ecriture.contexteGraph();
  const L = (n) => dse.trouverListe(g.listes, [n]);
  const lc = L("OBJ-COCKPIT");
  if (!lc) return { disponible: false, liste: [], colonnesManquantes: [] };
  const [cols, items] = await Promise.all([
    dse.chargerColonnesListe(g.token, g.siteGraphId, lc.id),
    dse.chargerItemsListe(g.token, g.siteGraphId, lc.id)
  ]);
  const lsc = L("OBJ-SITE-COCKPIT");
  const liensSC = lsc ? await Promise.all([
    dse.chargerColonnesListe(g.token, g.siteGraphId, lsc.id),
    dse.chargerItemsListe(g.token, g.siteGraphId, lsc.id)
  ]) : [[], []];
  const parNom = (re) => cols.find((c) => re.test(String(c.displayName || c.name)));
  const colUrl = parNom(/(^|[-_ ])(URL|LIEN|ROUTE)([-_ ]|$)/i);
  const colIcone = parNom(/ICONE|ICON/i);
  const colOrdre = parNom(/ORDRE/i);
  const colFonction = cols.find((c) => c.name === "FONCTIONS");
  const colNiveau = cols.find((c) => c.name === "NIVEAUACCES");
  const lookupVers = (colonnes, nomListe) => {
    const l = L(nomListe);
    return l ? colonnes.find((c) => c.lookup?.listId && minuscule(c.lookup.listId) === minuscule(l.id)) : null;
  };
  const cActif = lookupVers(cols, "OBJ-ACTIF");
  const cValide = lookupVers(cols, "OBJ-VALIDE");
  const [oa, ov] = await Promise.all([idOui(g, "OBJ-ACTIF", L("OBJ-ACTIF")?.id), idOui(g, "OBJ-VALIDE", L("OBJ-VALIDE")?.id)]);
  const lid = (f, c) => (c ? String(f?.[`${c.name}LookupId`] ?? "") : "");
  const cSite = lookupVers(liensSC[0], "OBJ-SITE-PUBLIC");
  const cCockpit = lookupVers(liensSC[0], "OBJ-COCKPIT");
  const mesSites = new Set(d.siteIds);
  const liste = items.map((i) => {
    const f = i.fields || {};
    const rattachements = liensSC[1].filter((l) => lid(l.fields, cCockpit) === String(i.id)).map((l) => lid(l.fields, cSite)).filter(Boolean);
    const dansPerimetre = rattachements.length ? rattachements.some((s) => mesSites.has(s)) : d.portee === "tous";
    const fonctions = String(colFonction ? f[colFonction.name] || "" : "").split(/[;,\n]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const niveau = String(colNiveau ? f[colNiveau.name] || "" : "").trim().toLowerCase();
    const autorisee = fonctions.length > 0 && fonctions.every((x) => d.fonctions.includes(x)) &&
      Object.hasOwn(droits.RANG_NIVEAU, niveau) && droits.RANG_NIVEAU[niveau] <= droits.RANG_NIVEAU[d.niveau];
    return {
      titre: f.Title || null,
      description: f.NoteCourte || f.NOTE_x002d_COURTE || null,
      actif: !!(cActif && oa && lid(f, cActif) === oa),
      valide: !!(cValide && ov && lid(f, cValide) === ov),
      url: colUrl ? String(f[colUrl.name] || "").trim() || null : null,
      icone: colIcone ? String(f[colIcone.name] || "").trim() || null : null,
      ordre: colOrdre ? Number(f[colOrdre.name]) || null : null,
      dansPerimetre, autorisee, niveau
    };
  }).filter((a) => a.dansPerimetre);
  const manquantes = [!colUrl && "adresse interne", !colIcone && "icône", !colOrdre && "ordre", !colFonction && "fonctions autorisées", !colNiveau && "niveau d'accès"].filter(Boolean);
  return { disponible: true, liste, colonnesManquantes: manquantes };
}

async function menu(d, domaine = null) {
  if (!d.reconnu) return [ENTREES_MOTEUR[0]].map(({ fonction, ...e }) => e);
  const R = droits.RANG_NIVEAU;
  const base = ENTREES_MOTEUR.filter((e) => (!e.fonction || d.fonctions.includes(e.fonction)) && R[e.niveau] <= R[d.niveau || "lecture"]
    && (d.global || d.contexte?.etat === "COMPLET" || !["administration", "utilisateurs", "creer"].includes(e.cle))
    && (!e.global || require("./statut-sites").autorise(d)));
  let apps = [];
  try {
    if (!d.global && d.contexte?.etat !== "COMPLET") return base.map(({ fonction, global, ...e }) => e);
    apps = (await applications(d)).liste
      .filter((a) => a.autorisee && a.actif && a.valide && a.url && /^\/cockpit(\/[a-z0-9-]+)*$/i.test(a.url) &&
        (!ENTREES_MOTEUR.find((e) => e.url === a.url)?.global || d.global))
      .map((a, i) => ({ cle: `app-${i}`, libelle: a.titre, icone: a.icone || "🧩",
        url: domaine ? `${a.url}?domaine=${encodeURIComponent(domaine)}` : a.url, ordre: a.ordre ?? 50 + i, niveau: "lecture" }));
  } catch (e) {
    console.warn("[DSE cockpit] applications", e.message);
  }
  return [...base.map(({ fonction, global, ...e }) => ({ ...e,
    url: domaine && ["administration", "utilisateurs"].includes(e.cle) ? `${e.url}?domaine=${encodeURIComponent(domaine)}` : e.url })), ...apps]
    .sort((a, b) => a.ordre - b.ordre);
}

/* ---------------- Tableau de bord ---------------- */

async function ecrituresRecentes(g, d) {
  return { disponible: false, desactive: true, liste: [] };
}

/* Composants modifiables dont le rattachement au site n'est pas exploitable dans SharePoint. */
async function rattachementsCasses(g) {
  const ls = dse.trouverListe(g.listes, ["OBJ-SITE-PUBLIC"]);
  const res = [];
  for (const def of Object.values(edition.COMPOSANTS_EDITABLES)) {
    const l = dse.trouverListe(g.listes, def.listes);
    if (!l || !ls) continue;
    const cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, l.id);
    const ok = cols.some((c) => c.lookup?.listId && minuscule(c.lookup.listId) === minuscule(ls.id));
    if (!ok) res.push(def.libelle);
  }
  return res;
}

async function tableau(d) {
  const ctxSites = await contexteSites(d);
  const resumes = await resumeSites.obtenirResumes();
  const sites = ctxSites.groupes.map((g) => cockpit.resumeSite(g, ctxSites.statuts.get(String(g.statutId)) || null, resumes.get(String(g.id))))
    .filter((s) => s.acces);
  const parStatut = new Map();
  for (const s of sites) {
    const t = s.statut?.titre || "Non renseigné";
    parStatut.set(t, (parStatut.get(t) || 0) + 1);
  }
  const problemes = [];
  const aCompleter = [];
  for (const s of sites) {
    if (!s.domaine) problemes.push({ niveau: "attention", titre: `${s.nom} : domaine principal non renseigné`, lien: `/cockpit/site/${s.acces}` });
    if (!s.statut) problemes.push({ niveau: "attention", titre: `${s.nom} : statut non renseigné`, lien: `/cockpit/site/${s.acces}` });
    const manque = (s.aCompleter || []).filter((e) => e.etat !== "termine");
    if (manque.length) aCompleter.push({ site: s.nom, domaine: s.acces, progression: s.progression ?? null, elements: manque.map((e) => e.libelle), lien: `/cockpit/site/${s.acces}` });
  }
  const g = await ecriture.contexteGraph();
  const plateforme = d.global && d.fonctions.includes("plateforme");
  if (plateforme) {
    for (const c of await rattachementsCasses(g)) {
      problemes.unshift({ niveau: "critique", titre: `${c} : le rattachement au site est inutilisable dans SharePoint (modification impossible)`, lien: "/cockpit/administration" });
    }
  }
  let utilisateursParRole = null;
  let sansAcces = [];
  if (d.fonctions.includes("utilisateurs")) {
    const donnees = await droits.donneesDroits();
    const visibles = utilisateursVisibles(d, donnees);
    const m = new Map();
    for (const u of visibles) m.set(u.roleTitre || "Sans rôle", (m.get(u.roleTitre || "Sans rôle") || 0) + 1);
    utilisateursParRole = [...m.entries()].map(([role, nombre]) => ({ role, nombre }));
    sansAcces = visibles.filter((u) => {
      const p = droits.regleRole(donnees.politique || {}, u.roleId)?.portee;
      return p && p !== "tous" && !donnees.liens.some((l) => String(l.utilisateurId) === String(u.id));
    }).map((u) => u.titre);
    for (const e of sansAcces) problemes.push({ niveau: "attention", titre: `${e} : aucun site attribué`, lien: "/cockpit/utilisateurs" });
  }
  let apps = null;
  try { apps = await applications(d); } catch (e) { console.warn("[DSE cockpit] applications", e.message); apps = { disponible: false, liste: [], colonnesManquantes: [] }; }
  let ecritures = { disponible: false, liste: [] };
  try { ecritures = await ecrituresRecentes(g, d); } catch (e) { console.warn("[DSE cockpit] journal", e.message); }

  const prochaines = [];
  if (problemes.some((p) => p.niveau === "critique")) prochaines.push({ titre: "Traiter les problèmes critiques", lien: "/cockpit/administration" });
  if (aCompleter.length) prochaines.push({ titre: `Compléter ${aCompleter.length} site(s)`, lien: "/cockpit/sites?aCompleter=oui" });
  if (sansAcces.length) prochaines.push({ titre: "Attribuer des sites aux utilisateurs", lien: "/cockpit/utilisateurs" });

  return {
    sitesParStatut: [...parStatut.entries()].map(([statut, nombre]) => ({ statut, nombre, lien: `/cockpit/sites?statut=${encodeURIComponent(statut)}` })),
    nombreSites: sites.length,
    problemes,
    aCompleter: aCompleter.slice(0, 20),
    prochaines,
    utilisateursParRole,
    applications: plateforme ? apps : { disponible: apps.disponible, liste: apps.liste, colonnesManquantes: [] },
    ecrituresRecentes: ecritures,
    journal: { disponible: false, desactive: true, derniere: null }
  };
}

module.exports = {
  tableau, utilisateurs, espaces, menu, applications, preparerAction, construireAction, controleDoublon, ACTIONS,
  _test: { utilisateursVisibles, ref, ENTREES_MOTEUR, ecrituresRecentes }
};
