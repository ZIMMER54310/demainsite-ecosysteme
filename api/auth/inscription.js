"use strict";

const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const droits = require("./droits");
const { normaliser } = require("../shared/perimetre");
const verrous = new Set();

const lireId = (fields, col) => col ? String(fields?.[`${col.name}LookupId`] || "") : "";
const vers = (cols, liste) => liste ? cols.find((c) => c.lookup?.listId === liste.id && !c.lookup.allowMultipleValues) : null;

async function domaineContexte(g, domaine) {
  const nom = normaliser(domaine);
  if (!nom) return null;
  const l = dse.trouverListe(g.listes, ["OBJ-NOM DE DOMAINE"]);
  const sites = dse.trouverListe(g.listes, ["OBJ-SITE-PUBLIC"]);
  const clients = dse.trouverListe(g.listes, ["OBJ-CLIENT"]);
  if (!l || !sites || !clients) return null;
  const cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, l.id);
  const colSite = cols.find((c) => c.name === "OBJSITE" && c.lookup?.listId === sites.id);
  const colClient = vers(cols, clients);
  const items = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${l.id}/items?$expand=fields&$top=500`);
  const matches = items.filter((i) => normaliser(i.fields?.Title) === nom);
  if (matches.length !== 1) return null;
  const actifs = dse.trouverListe(g.listes, ["OBJ-ACTIF"]);
  const valides = dse.trouverListe(g.listes, ["OBJ-VALIDE"]);
  const oui = async (liste) => {
    if (!liste) return null;
    const xs = await dse.chargerItemsListe(g.token, g.siteGraphId, liste.id);
    const candidats = xs.filter((i) => /^oui\b/i.test(String(i.fields?.Title || "").trim()));
    return candidats.length === 1 ? String(candidats[0].id) : null;
  };
  const [oa, ov] = await Promise.all([oui(actifs), oui(valides)]);
  if (!oa || !ov || lireId(matches[0].fields, vers(cols, actifs)) !== oa ||
    lireId(matches[0].fields, vers(cols, valides)) !== ov) return null;
  const siteId = lireId(matches[0].fields, colSite);
  const clientId = lireId(matches[0].fields, colClient);
  if (!siteId || !clientId) return null;
  const siteCols = await dse.chargerColonnesListe(g.token, g.siteGraphId, sites.id);
  const f = await ecriture.lireItemFrais(g, sites.id, siteId);
  if (lireId(f, vers(siteCols, clients)) !== clientId) return null;
  return { domaine: nom, domaineId: String(matches[0].id), siteId, clientId };
}

async function reglagesSite(g, ctx) {
  if (!ctx) return null;
  const liste = dse.trouverListe(g.listes, ["OBJ-SITE-PUBLIC"]);
  if (!liste) throw new Error("Liste OBJ-SITE-PUBLIC indisponible.");
  const colonnes = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id);
  const trouverBooleen = (nom) => {
    const resultat = colonnes.filter((c) => !c.hidden && c.name === nom && c.boolean);
    if (resultat.length !== 1) throw new Error(`Réglage SharePoint absent ou ambigu : ${nom}.`);
    return resultat[0];
  };
  const champs = {
    cockpit: trouverBooleen("OBJACCESCOCKPIT"),
    comptes: trouverBooleen("OBJCREATIONCOMPTE"),
    approbation: trouverBooleen("OBJAPPROBATIONPROPRIETAIRE")
  };
  const item = await ecriture.lireItemFrais(g, liste.id, ctx.siteId, Object.values(champs).map((c) => c.name));
  return {
    afficherAccesCockpit: item[champs.cockpit.name] !== false,
    creationCompteAutorisee: item[champs.comptes.name] === true,
    approbationProprietaire: item[champs.approbation.name] !== false
  };
}

async function soumettreDemandeCompte(identite, domaine) {
  if (identite?.fournisseur !== "entra" || !identite.sujet) return { status: 401, erreur: "Connexion Microsoft requise." };
  dse.viderCacheGraph();
  droits.viderCache();
  const g = await ecriture.contexteGraph();
  const ctx = await domaineContexte(g, domaine);
  if (!ctx) return { status: 404, erreur: "Le site demandé n’est pas disponible." };
  const reglages = await reglagesSite(g, ctx);
  if (!reglages.creationCompteAutorisee) return { status: 403, erreur: "La création de comptes n’est pas autorisée pour ce site." };
  if (!reglages.approbationProprietaire) {
    return { status: 403, erreur: "Les demandes de compte sont suspendues tant que l’approbation du propriétaire n’est pas activée." };
  }
  const donneesDroits = await droits.donneesDroits();
  if (donneesDroits.utilisateurs.some((u) => String(u.entraObjectId || "").toLowerCase() === identite.sujet.toLowerCase())) {
    return { status: 409, erreur: "Un compte existe déjà pour cette identité. Aucun doublon n’a été créé." };
  }

  const nomsListes = ["OBJ-DEMANDE-COMPTE", "OBJ-DEMANDE-COMPTE-ETAT", "OBJ-CLIENT", "OBJ-SITE-PUBLIC", "OBJ-ACTIF", "OBJ-VALIDE"];
  const listes = Object.fromEntries(nomsListes.map((nom) => [nom, dse.trouverListe(g.listes, [nom])]));
  if (Object.values(listes).some((l) => !l)) throw new Error("Structure OBJ-DEMANDE-COMPTE incomplète.");
  const [colonnes, etatColonnes, actifs, valides, etats, demandes] = await Promise.all([
    dse.chargerColonnesListe(g.token, g.siteGraphId, listes["OBJ-DEMANDE-COMPTE"].id, { contraintes: true }),
    dse.chargerColonnesListe(g.token, g.siteGraphId, listes["OBJ-DEMANDE-COMPTE-ETAT"].id),
    dse.chargerItemsListe(g.token, g.siteGraphId, listes["OBJ-ACTIF"].id),
    dse.chargerItemsListe(g.token, g.siteGraphId, listes["OBJ-VALIDE"].id),
    ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${listes["OBJ-DEMANDE-COMPTE-ETAT"].id}/items?$expand=fields&$top=500`),
    ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${listes["OBJ-DEMANDE-COMPTE"].id}/items?$expand=fields&$top=500`)
  ]);
  const champ = (nom, type) => {
    const trouve = colonnes.filter((c) => !c.hidden && c.name === nom && (!type || c[type]));
    if (trouve.length !== 1) throw new Error(`Colonne de demande absente ou ambiguë : ${nom}.`);
    return trouve[0];
  };
  const lookup = (nom, target) => {
    const c = champ(nom, "lookup");
    if (c.lookup.listId.toLowerCase() !== target.toLowerCase() || c.lookup.allowMultipleValues) {
      throw new Error(`Lookup de demande incohérent : ${nom}.`);
    }
    return c;
  };
  const [utilisateurs, jrn] = [dse.trouverListe(g.listes, ["OBJ-UTILISATEUR"]), dse.trouverListe(g.listes, ["OBJ-JRN"])];
  const F = {
    titre: champ("Title", "text"), entra: champ("ENTRAOBJECTID", "text"),
    client: lookup("OBJCLIENT", listes["OBJ-CLIENT"].id),
    site: lookup("OBJSITEPUBLIC", listes["OBJ-SITE-PUBLIC"].id),
    etat: lookup("OBJETATDEMANDECOMPTE", listes["OBJ-DEMANDE-COMPTE-ETAT"].id),
    date: champ("DATEDEMANDE", "dateTime"), decision: champ("DECISION", "text"),
    dateDecision: champ("DATEDECISION", "dateTime"),
    responsable: utilisateurs && lookup("RESPONSABLETRAITEMENT", utilisateurs.id),
    cle: champ("CLEIDEMPOTENCE", "text"),
    actif: lookup("OBJACTIF", listes["OBJ-ACTIF"].id),
    valide: lookup("OBJVALIDE", listes["OBJ-VALIDE"].id)
  };
  if (!jrn || !F.responsable || !F.entra.required || !F.client.required || !F.etat.required ||
      !F.date.required || !F.cle.required || !F.cle.indexed || !F.cle.enforceUniqueValues ||
      !F.actif.required || !F.valide.required) throw new Error("Schéma OBJ-DEMANDE-COMPTE non conforme.");
  const valeurOui = (items) => {
    const xs = items.filter((x) => /^oui\b/i.test(String(x.fields?.Title || "").trim()));
    if (xs.length !== 1) throw new Error("Référentiel Oui/Non absent ou ambigu.");
    return String(xs[0].id);
  };
  const actifId = valeurOui(actifs);
  const valideId = valeurOui(valides);
  const etatCol = etatColonnes.find((c) => !c.hidden && c.name === "CODEETATDEMANDECOMPTE" && c.text);
  const actifCol = etatColonnes.find((c) => !c.hidden && c.name === "OBJACTIF" && c.lookup?.listId === listes["OBJ-ACTIF"].id);
  const valideCol = etatColonnes.find((c) => !c.hidden && c.name === "OBJVALIDE" && c.lookup?.listId === listes["OBJ-VALIDE"].id);
  if (!etatCol || !actifCol || !valideCol) throw new Error("Référentiel d’états de demande non conforme.");
  const enAttente = etats.filter((x) => x.fields?.[etatCol.name] === "EN-ATTENTE" &&
    String(x.fields?.[`${actifCol.name}LookupId`]) === actifId &&
    String(x.fields?.[`${valideCol.name}LookupId`]) === valideId);
  if (enAttente.length !== 1) throw new Error("État EN ATTENTE absent ou ambigu.");
  const cleIdempotence = ecriture.hash(["demande-compte", ctx.siteId, identite.sujet.toLowerCase()]);
  const deja = demandes.filter((x) => x.fields?.[F.cle.name] === cleIdempotence);
  if (deja.length > 1) throw new Error("Demandes de compte dupliquées : intervention requise.");
  if (deja.length === 1) return { status: 200, donnees: { etat: "EN ATTENTE", dejaSoumise: true } };

  const journal = require("../shared/journal-comptes");
  const empreinteIdentite = ecriture.hash(["entra", identite.sujet.toLowerCase()]);
  const entree = await journal.commencer(g, {
    cle: `DEMANDE-COMPTE:${cleIdempotence}`, action: "DEMANDE-COMPTE-CREATION",
    nom: "Demande de création de compte", domaine: ctx.domaine,
    apres: { siteId: ctx.siteId, clientId: ctx.clientId, identite: empreinteIdentite },
    contexte: { approbationProprietaire: reglages.approbationProprietaire }
  });
  let cree;
  try {
    const fields = {
      [F.titre.name]: String(identite.email || identite.nom || "Demande de compte").slice(0, 255),
      [F.entra.name]: identite.sujet,
      [`${F.client.name}LookupId`]: ctx.clientId,
      [`${F.site.name}LookupId`]: ctx.siteId,
      [`${F.etat.name}LookupId`]: String(enAttente[0].id),
      [F.date.name]: new Date().toISOString(),
      [F.cle.name]: cleIdempotence,
      [`${F.actif.name}LookupId`]: actifId,
      [`${F.valide.name}LookupId`]: valideId
    };
    cree = await dse.graphEcriture(g.token, "POST",
      `/sites/${g.siteGraphId}/lists/${listes["OBJ-DEMANDE-COMPTE"].id}/items`, { fields });
    const relu = await ecriture.lireItemFrais(g, listes["OBJ-DEMANDE-COMPTE"].id, cree.id, Object.keys(fields));
    if (!Object.entries(fields).every(([k, v]) => k === F.date.name
      ? Number.isFinite(Date.parse(relu[k])) && Math.abs(Date.parse(relu[k]) - Date.parse(v)) < 1000
      : String(relu[k] ?? "") === String(v))) throw new Error("Relecture de la demande différente.");
    await journal.terminer(g, entree, {
      statut: "SUCCÈS", apres: { demandeId: String(cree.id), siteId: ctx.siteId, identite: empreinteIdentite }
    });
    return { status: 201, donnees: { etat: "EN ATTENTE", dejaSoumise: false } };
  } catch (err) {
    await journal.terminer(g, entree, {
      statut: "ÉCHEC", anomalie: true, erreur: err.message,
      apres: { demandeCreee: !!cree, siteId: ctx.siteId, identite: empreinteIdentite }
    });
    throw err;
  }
}

async function journal(g, identite, ctx, action, resultat, motif, utilisateurId = null) {
  if (resultat !== "SUCCÈS") console.warn("[DSE inscription]", action, resultat);
  return { ok: false, desactive: true };
}

async function structureCommun(g) {
  const liste = dse.trouverListe(g.listes, ["OBJ-ACCES-COMMUN"]);
  const ctx = await domaineContexte(g, "dseco.fr");
  if (!liste || !ctx) throw new Error("Accès commun indisponible : liste ou domaine DSECO non résolu.");
  const cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id);
  const C = Object.fromEntries([
    ["utilisateur", "OBJ-UTILISATEUR"], ["site", "OBJ-SITE-PUBLIC"],
    ["actif", "OBJ-ACTIF"], ["valide", "OBJ-VALIDE"]
  ].map(([cle, nom]) => [cle, vers(cols, dse.trouverListe(g.listes, [nom]))]));
  if (Object.values(C).some((c) => !c)) throw new Error("Structure d'accès commun incomplète.");
  return { liste, ctx, C };
}

async function ajouterCommun(g, identite, commun, utilisateurId, oa, ov) {
  const { liste, ctx, C } = commun;
  const items = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields&$top=500`);
  const liens = items.filter((i) => lireId(i.fields, C.utilisateur) === utilisateurId && lireId(i.fields, C.site) === ctx.siteId);
  if (liens.length > 1) throw new Error("Accès commun dupliqué.");
  if (liens.length && (lireId(liens[0].fields, C.actif) !== oa || lireId(liens[0].fields, C.valide) !== ov)) {
    throw new Error("Accès commun désactivé : validation administrateur requise.");
  }
  if (!liens.length) {
    const fields = { [`${C.utilisateur.name}LookupId`]: utilisateurId, [`${C.site.name}LookupId`]: ctx.siteId,
      [`${C.actif.name}LookupId`]: oa, [`${C.valide.name}LookupId`]: ov };
    const item = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${liste.id}/items`, { fields });
    const relu = await ecriture.lireItemFrais(g, liste.id, item.id);
    if (!Object.entries(fields).every(([k, v]) => String(relu[k]) === v)) throw new Error("Relecture accès commun non conforme.");
  }
  const j = await journal(g, identite, ctx, "AJOUT-ACCES-COMMUN", "SUCCÈS", "Accès commun distinct du périmètre métier.", utilisateurId);
  if (liens.length) {
    const doublon = await journal(g, identite, ctx, "DOUBLON-IGNORE", "SUCCÈS", "Accès commun déjà actif et validé.", utilisateurId);
  }
}

// Une identite Entra doit etre explicitement liee dans la source officielle.
async function identifier(identite) {
  if (identite.fournisseur !== "entra") return;
  dse.viderCacheGraph();
  droits.viderCache();
  const x = await droits.donneesDroits();
  const parObjet = x.utilisateurs.filter((u) => u.entraObjectId?.toLowerCase() === identite.sujet.toLowerCase());
  const empreinte = ecriture.hash(["entra", identite.sujet.toLowerCase()]).slice(0, 20);
  const condition = parObjet.length !== 1 ? (parObjet.length ? "IDENTITE_AMBIGUE" : "IDENTITE_NON_LIEE")
    : !parObjet[0].actif || !parObjet[0].valide ? "COMPTE_INACTIF_OU_NON_VALIDE" : "COMPTE_RECONNU";
  console.info("[DSE OAuth identification]", JSON.stringify({ empreinte, condition,
    utilisateurId: parObjet.length === 1 ? parObjet[0].id : null,
    relations: parObjet.length === 1 ? x.liens.filter((l) => l.utilisateurId === parObjet[0].id)
      .map((l) => ({ id: l.id, siteId: l.siteId, clientId: l.clientId, roleId: l.roleId,
        accesTypeId: l.accesTypeId, actif: l.actif, valide: l.valide, verrouille: l.verrouille })) : [] }));
}

async function inscrire(identite, domaine, confirmer = false, connexionExistante = false) {
  dse.viderCacheGraph();
  droits.viderCache();
  const g = await ecriture.contexteGraph();
  const ctx = await domaineContexte(g, domaine);
  const x = await droits.donneesDroits();
  const utilisateurActeur = droits.calculerDroits({ identite, ...x }).utilisateurId || null;
  const refuser = async (motif, status = 403) => {
    const j = await journal(g, identite, ctx, "INSCRIPTION-REFUSEE", "REFUS", motif, utilisateurActeur);
    return { status, erreur: motif, journal: { enregistre: j.ok } };
  };
  if (identite.fournisseur !== "entra" || !identite.sujet) return refuser("Identité Entra requise.");
  if (!ctx) return refuser("Le domaine, le site et son client ne sont pas résolus sans ambiguïté.");
  // L'identite et le domaine seuls ne constituent jamais une autorisation d'inscription.
  const invitation = dse.trouverListe(g.listes, ["OBJ-INSCRIPTION"]);
  if (!invitation) return connexionExistante ? { status: 204 } :
    refuser("Inscription bloquée : une autorisation préalable doit être configurée par votre administrateur.", 409);
  const S = x.structure;
  const utilisateurListe = dse.trouverListe(g.listes, ["OBJ-UTILISATEUR"]);
  const clientListe = dse.trouverListe(g.listes, ["OBJ-CLIENT"]);
  const siteListe = dse.trouverListe(g.listes, ["OBJ-SITE-PUBLIC"]);
  const roleListe = dse.trouverListe(g.listes, ["OBJ-ROLE"]);
  const actifListe = dse.trouverListe(g.listes, ["OBJ-ACTIF"]);
  const valideListe = dse.trouverListe(g.listes, ["OBJ-VALIDE"]);
  const cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, invitation.id);
  const C = { client: vers(cols, clientListe), site: vers(cols, siteListe), role: vers(cols, roleListe),
    utilisateur: vers(cols, utilisateurListe), actif: vers(cols, actifListe), valide: vers(cols, valideListe),
    acces: vers(cols, dse.trouverListe(g.listes, ["OBJ-ACCES-TYPE"])) };
  const oid = cols.find((c) => c.text && (c.displayName === "ENTRA-OBJECT-ID" || c.name === "ENTRAOBJECTID"));
  if (!S || !oid || ["client", "site", "role", "utilisateur", "actif", "valide"].some((cle) => !C[cle])) {
    return refuser("L'autorisation d'inscription est incomplète : identité, utilisateur, client, site, rôle, actif et validé sont nécessaires.", 409);
  }
  const oui = async (liste) => {
    if (!liste) return null;
    const items = await dse.chargerItemsListe(g.token, g.siteGraphId, liste.id);
    const candidats = items.filter((i) => /^oui\b/i.test(String(i.fields?.Title || "").trim()));
    return candidats.length === 1 ? String(candidats[0].id) : null;
  };
  const [oa, ov] = await Promise.all([oui(actifListe), oui(valideListe)]);
  if (!oa || !ov) return refuser("Valeurs d'activation indisponibles.", 409);
  const autorisations = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${invitation.id}/items?$expand=fields&$top=500`);
  const invitations = autorisations.filter((i) => String(i.fields?.[oid.name] || "").toLowerCase() === identite.sujet.toLowerCase() &&
    lireId(i.fields, C.client) === ctx.clientId && lireId(i.fields, C.site) === ctx.siteId &&
    lireId(i.fields, C.actif) === oa && lireId(i.fields, C.valide) === ov);
  if (!invitations.length && connexionExistante) return { status: 204 };
  if (invitations.length !== 1) return refuser("Aucune autorisation d'inscription unique, active et validée pour ce compte et ce site.");
  const f = invitations[0].fields;
  const roleId = lireId(f, C.role);
  const accesTypeId = lireId(f, C.acces);
  const accesType = (x.accesTypes || []).find((a) => a.id === accesTypeId && a.actif && a.valide &&
    (!a.clientId || a.clientId === ctx.clientId));
  const regle = droits.regleRole(x.politique, roleId);
  if (!regle || regle.portee === "tous" || !x.clients.some((c) => c.id === ctx.clientId)) {
    return refuser("Le rôle d'inscription ou le client n'est pas autorisé.");
  }
  if (!accesType || !S.colonnes.lienRole || !S.colonnes.lienAccesType) return refuser("Profil d'accès contextuel absent de l'autorisation d'inscription.", 409);
  if (!x.sites?.some((s) => s.id === ctx.siteId && s.valide && s.clientId === ctx.clientId)) {
    return refuser("Le site d'inscription n'est pas validé dans le client autorisé.");
  }
  const candidats = x.utilisateurs.filter((u) => u.entraObjectId?.toLowerCase() === identite.sujet.toLowerCase());
  if (candidats.length > 1) return refuser("Identité utilisateur dupliquée.");
  let u = candidats[0];
  if (!u && x.utilisateurs.some((item) => String(item.titre || "").toLowerCase() === String(identite.email || "").toLowerCase())) {
    return refuser("Un compte existant doit être identifié avant inscription. Aucune création en doublon.");
  }
  const utilisateurInvite = lireId(f, C.utilisateur);
  if (u && (!u.actif || !u.valide || (utilisateurInvite && utilisateurInvite !== u.id))) {
    return refuser("L'utilisateur autorisé est invalide ou ne correspond pas à l'identité connectée.");
  }
  if (!u && utilisateurInvite) return refuser("L'utilisateur autorisé n'est pas identifié par son objet Entra.");
  if (!["utilisateurEntra", "utilisateurRole", "utilisateurClient", "utilisateurActif", "utilisateurValide",
    "lienUtilisateur", "lienClient", "lienSite", "lienActif", "lienValide"].every((nom) => S.colonnes[nom]) || !S.listes.lien) {
    return refuser("Structure d'inscription indisponible.", 409);
  }
  if (!confirmer) return { status: 200, donnees: { confirmationRequise: true, domaine: ctx.domaine,
    client: x.clients.find((c) => c.id === ctx.clientId)?.titre, role: x.roles.find((r) => r.id === roleId)?.titre,
    accesType: accesType.titre } };
  const verrou = `inscription:${identite.sujet.toLowerCase()}`;
  if (verrous.has(verrou)) return refuser("Une inscription est déjà en cours.", 409);
  verrous.add(verrou);
  try {
    const commun = await structureCommun(g);
    const verifierAutorisation = async () => {
      const items = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${invitation.id}/items?$expand=fields&$top=500`);
      const exactes = items.filter((i) => String(i.fields?.[oid.name] || "").toLowerCase() === identite.sujet.toLowerCase() &&
        lireId(i.fields, C.client) === ctx.clientId && lireId(i.fields, C.site) === ctx.siteId &&
        lireId(i.fields, C.actif) === oa && lireId(i.fields, C.valide) === ov);
      return exactes.length === 1 && String(exactes[0].id) === String(invitations[0].id) &&
        lireId(exactes[0].fields, C.role) === roleId && lireId(exactes[0].fields, C.acces) === accesTypeId &&
        lireId(exactes[0].fields, C.utilisateur) === utilisateurInvite;
    };
    if (!await verifierAutorisation()) return refuser("L'autorisation a changé avant écriture.");
    // Relecture sous verrou pour reprendre une inscription interrompue sans dupliquer.
    const champsUtilisateur = ["Title", S.colonnes.utilisateurEntra,
      ...["utilisateurClient", "utilisateurRole", "utilisateurActif", "utilisateurValide"].map((c) => `${S.colonnes[c]}LookupId`)];
    const us = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${S.listes.utilisateur}/items?$expand=fields($select=${champsUtilisateur.join(",")})&$top=500`);
    const existants = us.filter((i) => String(i.fields?.ENTRAOBJECTID || "").toLowerCase() === identite.sujet.toLowerCase());
    if (existants.length > 1) return refuser("Identité utilisateur dupliquée.");
    if (existants.length === 1) {
      const item = existants[0];
      if ((utilisateurInvite && String(item.id) !== utilisateurInvite) ||
        String(item.fields?.[`${S.colonnes.utilisateurActif}LookupId`]) !== oa ||
        String(item.fields?.[`${S.colonnes.utilisateurValide}LookupId`]) !== ov) return refuser("Utilisateur désactivé ou identité non conforme.");
      u = { id: String(item.id), clientId: item.fields?.[`${S.colonnes.utilisateurClient}LookupId`] || null };
    } else {
      const userCols = await dse.chargerColonnesListe(g.token, g.siteGraphId, S.listes.utilisateur);
      const champs = { Title: identite.email || identite.nom || identite.sujet, ENTRAOBJECTID: identite.sujet,
        [`${S.colonnes.utilisateurClient}LookupId`]: ctx.clientId, [`${S.colonnes.utilisateurRole}LookupId`]: roleId,
        [`${S.colonnes.utilisateurActif}LookupId`]: oa, [`${S.colonnes.utilisateurValide}LookupId`]: ov };
      if (userCols.some((c) => c.required && !c.readOnly && !c.hidden &&
        !Object.hasOwn(champs, c.name) && !Object.hasOwn(champs, `${c.name}LookupId`))) {
        return refuser("La création utilisateur exige des informations supplémentaires.", 409);
      }
      const cree = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${S.listes.utilisateur}/items`, { fields: champs });
      u = { id: String(cree.id), clientId: ctx.clientId };
      const relu = await ecriture.lireItemFrais(g, S.listes.utilisateur, u.id);
      if (relu.ENTRAOBJECTID !== identite.sujet || !Object.entries(champs).every(([k, v]) => String(relu[k]) === v)) {
        throw new Error("Relecture utilisateur non conforme.");
      }
      const j = await journal(g, identite, ctx, "CREATION-UTILISATEUR", "SUCCÈS", "Création autorisée par invitation SharePoint.", u.id);
    }
    const actuel = await domaineContexte(g, ctx.domaine);
    const utilisateurActuel = await ecriture.lireItemFrais(g, S.listes.utilisateur, u.id, champsUtilisateur);
    if (!await verifierAutorisation() || !actuel || actuel.siteId !== ctx.siteId || actuel.clientId !== ctx.clientId ||
      String(utilisateurActuel[S.colonnes.utilisateurEntra] || "").toLowerCase() !== identite.sujet.toLowerCase() ||
      String(utilisateurActuel[`${S.colonnes.utilisateurActif}LookupId`]) !== oa ||
      String(utilisateurActuel[`${S.colonnes.utilisateurValide}LookupId`]) !== ov) {
      return refuser("L'autorisation, le propriétaire ou l'utilisateur a changé.", 403);
    }
    const champsLien = ["lienUtilisateur", "lienClient", "lienSite", "lienActif", "lienValide", "lienRole", "lienAccesType"]
      .map((c) => `${S.colonnes[c]}LookupId`);
    const liens = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${S.listes.lien}/items?$expand=fields($select=${champsLien.join(",")})&$top=500`);
    const triples = liens.filter((i) => String(i.fields?.[`${S.colonnes.lienUtilisateur}LookupId`]) === u.id &&
      String(i.fields?.[`${S.colonnes.lienSite}LookupId`]) === ctx.siteId);
    if (triples.length > 1) return refuser("Relations Utilisateur + Site dupliquées.", 409);
    if (triples.length === 1) {
      if (String(triples[0].fields?.[`${S.colonnes.lienActif}LookupId`]) !== oa ||
        String(triples[0].fields?.[`${S.colonnes.lienValide}LookupId`]) !== ov ||
        String(triples[0].fields?.[`${S.colonnes.lienClient}LookupId`]) !== ctx.clientId ||
        String(triples[0].fields?.[`${S.colonnes.lienRole}LookupId`]) !== roleId ||
        String(triples[0].fields?.[`${S.colonnes.lienAccesType}LookupId`]) !== accesTypeId) return refuser("Relation existante incomplète ou différente : validation administrateur requise.");
    } else {
      const champs = { Title: `Accès — ${utilisateurActuel.Title || u.id} — ${ctx.domaine}`.slice(0, 255),
        [`${S.colonnes.lienUtilisateur}LookupId`]: u.id, [`${S.colonnes.lienClient}LookupId`]: ctx.clientId,
        [`${S.colonnes.lienSite}LookupId`]: ctx.siteId, [`${S.colonnes.lienActif}LookupId`]: oa, [`${S.colonnes.lienValide}LookupId`]: ov,
        [`${S.colonnes.lienRole}LookupId`]: roleId, [`${S.colonnes.lienAccesType}LookupId`]: accesTypeId };
      const cree = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${S.listes.lien}/items`, { fields: champs });
      const relu = await ecriture.lireItemFrais(g, S.listes.lien, cree.id, Object.keys(champs));
      if (!Object.entries(champs).every(([k, v]) => String(relu[k]) === v)) throw new Error("Relecture du périmètre non conforme.");
    }
    const j = await journal(g, identite, ctx, "AJOUT-SITE", "SUCCÈS", "Relation autorisée par invitation SharePoint.", u.id);
    if (triples.length) {
      const doublon = await journal(g, identite, ctx, "DOUBLON-IGNORE", "SUCCÈS", "Relation métier déjà active et validée.", u.id);
    }
    if (!await verifierAutorisation()) return refuser("L'autorisation a changé avant l'accès commun.");
    const communActuel = await structureCommun(g);
    if (communActuel.ctx.siteId !== commun.ctx.siteId || communActuel.ctx.clientId !== commun.ctx.clientId) {
      return refuser("Le site commun a changé avant écriture.");
    }
    await ajouterCommun(g, identite, communActuel, u.id, oa, ov);
    const fin = await journal(g, identite, ctx, "INSCRIPTION-AUTORISEE", "SUCCÈS", "Inscription et accès commun relus.", u.id);
    return { status: 200, donnees: { succes: true, deja: triples.length === 1, accesCommun: true } };
  } catch (err) {
    console.error("[DSE inscription]", err.message);
    const j = await journal(g, identite, ctx, "ERREUR", "ÉCHEC", err.message, u?.id);
    return { status: 502, erreur: "Inscription incomplète. Relisez les données avant de recommencer.", journal: { enregistre: j.ok } };
  } finally { ecriture.invaliderCaches(); verrous.delete(verrou); }
}

async function apresAuthentification(identite, domaine) {
  await identifier(identite);
  const d = await droits.droitsPour(identite);
  if (d.reconnu && d.portee === "tous") return true;
  const resultat = await inscrire(identite, domaine, true, d.reconnu);
  if (resultat.status >= 500) throw new Error("Inscription momentanément indisponible.");
  if (resultat.status === 403) await require("./incidents").refuser(identite, domaine, "Autorisation d'inscription absente ou invalide");
  return resultat.status === 200 || (d.reconnu && resultat.status === 204);
}

module.exports = { domaineContexte, reglagesSite, soumettreDemandeCompte, identifier, inscrire, journal, apresAuthentification };
