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

async function journal(g, identite, ctx, action, resultat, motif, utilisateurId = null) {
  return ecriture.journaliser(g, {
    cle: ecriture.hash([action, identite.sujet, utilisateurId, ctx?.clientId, ctx?.siteId, resultat, motif]),
    action, nom: action, ancien: {}, nouveau: { resultat },
    notes: `Acteur : ${identite.sujet} | ${motif}`, succes: resultat === "SUCCÈS", refus: resultat === "REFUS",
    contexte: { acteur: identite.sujet, utilisateurId, clientId: ctx?.clientId || null, siteId: ctx?.siteId || null, resultat, motif }
  });
}

// Migration unique d'un compte preexistant, sans attribution de role/client/site.
async function identifier(identite) {
  if (identite.fournisseur !== "entra") return;
  dse.viderCacheGraph();
  droits.viderCache();
  const x = await droits.donneesDroits();
  const parObjet = x.utilisateurs.filter((u) => u.entraObjectId?.toLowerCase() === identite.sujet.toLowerCase());
  if (parObjet.length) return;
  const candidats = x.utilisateurs.filter((u) => u.actif && u.valide && !u.entraObjectId &&
    u.titre.toLowerCase() === String(identite.email || "").toLowerCase());
  if (candidats.length !== 1 || !x.structure?.colonnes.utilisateurEntra) return;
  const u = candidats[0];
  const verrou = `identite:${u.id}`;
  if (verrous.has(verrou)) throw new Error("Identification déjà en cours.");
  verrous.add(verrou);
  try {
    const g = await ecriture.contexteGraph();
    const chemin = `/sites/${g.siteGraphId}/lists/${x.structure.listes.utilisateur}/items/${u.id}`;
    const r = await dse.graphSansCache(g.token, `${chemin}?$expand=fields`);
    if (r.fields?.ENTRAOBJECTID) return;
    if (String(r.fields?.Title || "").toLowerCase() !== String(identite.email || "").toLowerCase()) {
      throw new Error("Le compte a changé avant son identification.");
    }
    if (!r.eTag) throw new Error("Version utilisateur indisponible.");
    await dse.graphEcriture(g.token, "PATCH", `${chemin}/fields`, { ENTRAOBJECTID: identite.sujet }, r.eTag);
    const relu = await ecriture.lireItemFrais(g, x.structure.listes.utilisateur, u.id);
    if (relu.ENTRAOBJECTID !== identite.sujet) throw new Error("Identification non conforme à la relecture.");
    const j = await journal(g, identite, { clientId: u.clientId }, "Entra : identification permanente", "SUCCÈS", "Compte existant identifié sans changement de droits.", u.id);
    if (!j.ok) throw new Error("Identification enregistrée, journalisation indisponible.");
  } finally { ecriture.invaliderCaches(); verrous.delete(verrou); }
}

async function inscrire(identite, domaine, confirmer = false) {
  dse.viderCacheGraph();
  droits.viderCache();
  const g = await ecriture.contexteGraph();
  const ctx = await domaineContexte(g, domaine);
  const x = await droits.donneesDroits();
  const utilisateurActeur = droits.calculerDroits({ identite, ...x }).utilisateurId || null;
  const refuser = async (motif, status = 403) => {
    const j = await journal(g, identite, ctx, "Entra : inscription", "REFUS", motif, utilisateurActeur);
    return { status, erreur: motif, journal: { enregistre: j.ok } };
  };
  if (!ctx) return refuser("Le domaine, le site et son client ne sont pas résolus sans ambiguïté.");
  // L'identite et le domaine seuls ne constituent jamais une autorisation d'inscription.
  const invitation = dse.trouverListe(g.listes, ["OBJ-INSCRIPTION"]);
  if (!invitation) return refuser("Inscription bloquée : une autorisation préalable doit être configurée par votre administrateur.", 409);
  const S = x.structure;
  const utilisateurListe = dse.trouverListe(g.listes, ["OBJ-UTILISATEUR"]);
  const clientListe = dse.trouverListe(g.listes, ["OBJ-CLIENT"]);
  const siteListe = dse.trouverListe(g.listes, ["OBJ-SITE-PUBLIC"]);
  const roleListe = dse.trouverListe(g.listes, ["OBJ-ROLE"]);
  const actifListe = dse.trouverListe(g.listes, ["OBJ-ACTIF"]);
  const valideListe = dse.trouverListe(g.listes, ["OBJ-VALIDE"]);
  const cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, invitation.id);
  const C = { client: vers(cols, clientListe), site: vers(cols, siteListe), role: vers(cols, roleListe),
    utilisateur: vers(cols, utilisateurListe), actif: vers(cols, actifListe), valide: vers(cols, valideListe) };
  if (!S || !cols.some((c) => c.name === "ENTRAOBJECTID" && c.text) || Object.values(C).some((c) => !c)) {
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
  const invitations = autorisations.filter((i) => String(i.fields?.ENTRAOBJECTID || "").toLowerCase() === identite.sujet.toLowerCase() &&
    lireId(i.fields, C.client) === ctx.clientId && lireId(i.fields, C.site) === ctx.siteId &&
    lireId(i.fields, C.actif) === oa && lireId(i.fields, C.valide) === ov);
  if (invitations.length !== 1) return refuser("Aucune autorisation d'inscription unique, active et validée pour ce compte et ce site.");
  const f = invitations[0].fields;
  const roleId = lireId(f, C.role);
  const regle = droits.regleRole(x.politique, roleId);
  if (!regle || regle.portee === "tous" || !x.clients.some((c) => c.id === ctx.clientId)) {
    return refuser("Le rôle d'inscription ou le client n'est pas autorisé.");
  }
  const candidats = x.utilisateurs.filter((u) => u.entraObjectId?.toLowerCase() === identite.sujet.toLowerCase());
  if (candidats.length > 1) return refuser("Identité utilisateur dupliquée.");
  let u = candidats[0];
  if (!u && x.utilisateurs.some((item) => String(item.titre || "").toLowerCase() === String(identite.email || "").toLowerCase())) {
    return refuser("Un compte existant doit être identifié avant inscription. Aucune création en doublon.");
  }
  const utilisateurInvite = lireId(f, C.utilisateur);
  if (u && (u.clientId !== ctx.clientId || !u.actif || !u.valide || (utilisateurInvite && utilisateurInvite !== u.id))) {
    return refuser("Utilisateur, site et autorisation ne désignent pas le même client.");
  }
  if (!u && utilisateurInvite) return refuser("L'utilisateur autorisé n'est pas identifié par son objet Entra.");
  if (!["utilisateurEntra", "utilisateurRole", "utilisateurClient", "utilisateurActif", "utilisateurValide",
    "lienUtilisateur", "lienClient", "lienSite", "lienActif", "lienValide"].every((nom) => S.colonnes[nom]) || !S.listes.lien) {
    return refuser("Structure d'inscription indisponible.", 409);
  }
  if (!confirmer) return { status: 200, donnees: { confirmationRequise: true, domaine: ctx.domaine,
    client: x.clients.find((c) => c.id === ctx.clientId)?.titre, role: x.roles.find((r) => r.id === roleId)?.titre } };
  const verrou = `inscription:${identite.sujet}`;
  if (verrous.has(verrou)) return refuser("Une inscription est déjà en cours.", 409);
  verrous.add(verrou);
  try {
    if (!(await ecriture.etatStructureJournal(g)).disponible) return refuser("Journalisation indisponible : inscription refusée avant écriture.", 409);
    // Relecture sous verrou pour reprendre une inscription interrompue sans dupliquer.
    const us = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${S.listes.utilisateur}/items?$expand=fields&$top=500`);
    const existants = us.filter((i) => String(i.fields?.ENTRAOBJECTID || "").toLowerCase() === identite.sujet.toLowerCase());
    if (existants.length > 1) return refuser("Identité utilisateur dupliquée.");
    if (existants.length === 1) {
      const item = existants[0];
      if (String(item.fields?.[`${S.colonnes.utilisateurClient}LookupId`] || "") !== ctx.clientId ||
        String(item.fields?.[`${S.colonnes.utilisateurActif}LookupId`]) !== oa ||
        String(item.fields?.[`${S.colonnes.utilisateurValide}LookupId`]) !== ov) return refuser("Utilisateur désactivé ou client différent du client du site.");
      u = { id: String(item.id), clientId: ctx.clientId };
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
      if (relu.ENTRAOBJECTID !== identite.sujet || String(relu[`${S.colonnes.utilisateurClient}LookupId`]) !== ctx.clientId) throw new Error("Relecture utilisateur non conforme.");
      const j = await journal(g, identite, ctx, "Entra : création utilisateur", "SUCCÈS", "Création autorisée par invitation SharePoint.", u.id);
      if (!j.ok) throw new Error("Utilisateur créé, journalisation indisponible.");
    }
    const actuel = await domaineContexte(g, ctx.domaine);
    const utilisateurActuel = await ecriture.lireItemFrais(g, S.listes.utilisateur, u.id);
    if (!actuel || actuel.siteId !== ctx.siteId || actuel.clientId !== ctx.clientId ||
      String(utilisateurActuel[`${S.colonnes.utilisateurClient}LookupId`]) !== ctx.clientId) {
      return refuser("Le propriétaire du site ou le client utilisateur a changé.", 403);
    }
    const liens = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${S.listes.lien}/items?$expand=fields&$top=500`);
    const triples = liens.filter((i) => String(i.fields?.[`${S.colonnes.lienUtilisateur}LookupId`]) === u.id &&
      String(i.fields?.[`${S.colonnes.lienClient}LookupId`]) === ctx.clientId &&
      String(i.fields?.[`${S.colonnes.lienSite}LookupId`]) === ctx.siteId);
    if (triples.length > 1) return refuser("Relations utilisateur/client/site dupliquées.", 409);
    if (triples.length === 1) {
      if (String(triples[0].fields?.[`${S.colonnes.lienActif}LookupId`]) !== oa ||
        String(triples[0].fields?.[`${S.colonnes.lienValide}LookupId`]) !== ov) return refuser("Relation existante désactivée : validation administrateur requise.");
      const j = await journal(g, identite, ctx, "Entra : attribution autorisée", "SUCCÈS", "Relation autorisée par invitation SharePoint.", u.id);
      return { status: j.ok ? 200 : 502, donnees: { succes: true, deja: true, journal: { enregistre: j.ok } } };
    }
    const champs = { [`${S.colonnes.lienUtilisateur}LookupId`]: u.id, [`${S.colonnes.lienClient}LookupId`]: ctx.clientId,
      [`${S.colonnes.lienSite}LookupId`]: ctx.siteId, [`${S.colonnes.lienActif}LookupId`]: oa, [`${S.colonnes.lienValide}LookupId`]: ov };
    const cree = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${S.listes.lien}/items`, { fields: champs });
    const relu = await ecriture.lireItemFrais(g, S.listes.lien, cree.id);
    if (!Object.entries(champs).every(([k, v]) => String(relu[k]) === v)) throw new Error("Relecture du périmètre non conforme.");
    const j = await journal(g, identite, ctx, "Entra : attribution autorisée", "SUCCÈS", "Relation autorisée par invitation SharePoint.", u.id);
    return { status: j.ok ? 200 : 502, donnees: { succes: true, journal: { enregistre: j.ok } } };
  } catch (err) {
    console.error("[DSE inscription]", err.message);
    const j = await journal(g, identite, ctx, "Entra : inscription", "ÉCHEC", "Écriture ou relecture incomplète.", u?.id);
    return { status: 502, erreur: "Inscription incomplète. Relisez les données avant de recommencer.", journal: { enregistre: j.ok } };
  } finally { ecriture.invaliderCaches(); verrous.delete(verrou); }
}

module.exports = { domaineContexte, identifier, inscrire, journal };
