"use strict";

/*
 * Resolution des droits du cockpit, cote serveur.
 * Identite (tout fournisseur) -> OBJ-UTILISATEUR (directement ou via OBJ-CLIENT)
 * -> OBJ-ROLE (politique SharePoint) -> perimetre de sites (OBJ-UTILISATEUR-SITE,
 * client du site ou tous). Relations resolues par ID SharePoint natifs.
 */

const dse = require("../shared/dse");
const catalogueSource = require("../shared/catalogue-source");
const { FONCTIONS_COCKPIT } = require("../shared/cockpit");
const perimetre = require("../shared/perimetre");
const { politiqueDepuisRoles } = require("./politique-sharepoint");
const autorisations = require("./autorisations");

const DUREE_CACHE_MS = 120000;
let cache = { valeur: null, expiration: 0, promesse: null };

const minuscule = (v) => String(v || "").trim().toLowerCase();

const RANG_PORTEE = { attribues: 0, client: 1, tous: 2 };
const RANG_NIVEAU = { lecture: 0, ecriture: 1, administration: 2 };

function regleRole(politique, roleId) {
  const regle = roleId ? politique.roles?.[String(roleId)] : null;
  if (!regle) return null;
  return {
    portee: regle.portee,
    niveau: regle.niveau,
    fonctions: (regle.fonctions || []).filter((f) => FONCTIONS_COCKPIT.includes(f))
  };
}

/*
 * Un role ne peut attribuer qu'un role dont la portee, le niveau ET les fonctions
 * sont inclus dans les siens : jamais d'elevation de privilege.
 */
function peutAttribuer(droitsActeur, roleIdCible, politique = { roles: {} }) {
  const cible = regleRole(politique, roleIdCible);
  if (!cible || !droitsActeur?.reconnu || !droitsActeur.portee) return false;
  if (droitsActeur.contexte?.etat === "COMPLET") {
    if (cible.portee === "tous") return false;
  } else if (RANG_PORTEE[cible.portee] > RANG_PORTEE[droitsActeur.portee]) return false;
  if (RANG_NIVEAU[cible.niveau] > RANG_NIVEAU[droitsActeur.niveau]) return false;
  const miennes = new Set(droitsActeur.fonctions || []);
  return cible.fonctions.every((f) => miennes.has(f));
}

function calculerDroits({ identite, utilisateurs = [], clients = [], liens = [], liensCommuns = [], sites = [], politique = { roles: {} } }) {
  const aucun = { reconnu: false, role: null, fonctions: [], siteIds: [], sitePrincipalId: null, clientIds: [], portee: null, niveau: null, utilisateurId: null };
  if (!identite || !identite.sujet) return aucun;
  const email = minuscule(identite.email);
  const valides = utilisateurs.filter((u) => u.actif && u.valide);

  const parObjet = identite.fournisseur === "entra"
    ? utilisateurs.filter((u) => u.entraObjectId && minuscule(u.entraObjectId) === minuscule(identite.sujet)) : [];
  if (parObjet.length > 1 || (parObjet.length === 1 && (!parObjet[0].actif || !parObjet[0].valide))) return aucun;
  let candidats = parObjet;
  if (identite.fournisseur !== "entra" && candidats.length === 0) {
    const clientsLies = clients.filter((c) =>
      (identite.fournisseur === "entra" && c.entraObjectId && minuscule(c.entraObjectId) === minuscule(identite.sujet)) ||
      (email && minuscule(c.entraEmail) === email));
    const ids = new Set(clientsLies.map((c) => String(c.id)));
    candidats = valides.filter((u) => !u.entraObjectId && u.clientId && ids.has(String(u.clientId)));
  }
  // Un rapprochement ambigu n'accorde rien : jamais de droit par supposition.
  if (candidats.length !== 1) return aucun;
  const utilisateur = candidats[0];
  const communs = [...new Set(liensCommuns.filter((l) => l.actif && l.valide &&
    String(l.utilisateurId) === String(utilisateur.id) && sites.some((s) => String(s.id) === String(l.siteId)))
    .map((l) => String(l.siteId)))];
  const attribues = new Set(liens
    .filter((l) => l.actif && l.valide && String(l.utilisateurId) === String(utilisateur.id) && l.siteId &&
      l.clientId && clients.some((c) => String(c.id) === String(l.clientId)) &&
      sites.some((s) => String(s.id) === String(l.siteId) && String(s.clientId) === String(l.clientId)))
    .map((l) => String(l.siteId)));

  const regle = regleRole(politique, utilisateur.roleId);
  if (!regle || !Object.hasOwn(RANG_PORTEE, regle.portee) || !Object.hasOwn(RANG_NIVEAU, regle.niveau) || !regle.fonctions.length) {
    return { ...aucun, reconnu: true, utilisateurId: String(utilisateur.id),
      siteIds: [...attribues], sitesAttribues: [...attribues], sitesCommuns: communs,
      sitePrincipalId: perimetre.sitePrincipal({ siteIds: [...attribues] }),
      global: false };
  }
  const fonctions = regle ? regle.fonctions : [];
  // Clients du perimetre : client de l'utilisateur, sinon clients des sites qui lui sont attribues.
  const client = utilisateur.clientId ? clients.find((c) => String(c.id) === String(utilisateur.clientId)) : null;
  const clientIds = client ? [String(client.id)] : [];

  let siteIds = [];
  if (regle?.portee === "tous") siteIds = sites.map((s) => String(s.id));
  else if (regle?.portee === "client") {
    siteIds = sites.filter((s) => attribues.has(String(s.id))).map((s) => String(s.id));
  } else if (regle) siteIds = sites.filter((s) => attribues.has(String(s.id))).map((s) => String(s.id));

  return {
    reconnu: true,
    global: regle.portee === "tous" && regle.niveau === "administration",
    sitesAttribues: [...attribues],
    utilisateurId: String(utilisateur.id),
    sitePrincipalId: perimetre.sitePrincipal({ siteIds, explicite: client?.sitePrincipalId ?? null }),
    role: utilisateur.roleId ? { titre: utilisateur.roleTitre || null } : null,
    roleId: utilisateur.roleId ? String(utilisateur.roleId) : null,
    portee: regle.portee === "tous" && regle.niveau === "administration" ? regle.portee : "attribues",
    niveau: regle.portee === "tous" && regle.niveau === "administration" ? regle.niveau : "lecture",
    fonctions: regle.portee === "tous" && regle.niveau === "administration" ? fonctions : [],
    siteIds,
    sitesCommuns: communs,
    clientIds: regle?.portee === "tous" ? clients.map((c) => String(c.id)) : clientIds
  };
}

function contraintesOperations(d, donnees, siteId) {
  return { ...d, contraintesOperations: (donnees.dynamique?.operations || [])
    .filter((o) => !autorisations.decisionPolitique(donnees.dynamique, o, d.clientIds || [], siteId).autorise)
    .map((o) => o.operation) };
}

function contexteSite(base, donnees, siteId) {
  const id = String(siteId);
  const refus = (message) => ({ ...base, siteIds: [], clientIds: [], fonctions: [], niveau: null, portee: null, role: null, roleId: null, accesType: null,
    global: false, contexte: { etat: "CONTEXTE INCOMPLET", message, siteId: id } });
  if (!base.reconnu) return refus("Utilisateur non reconnu.");
  if (donnees.dynamique) {
    const resolution = autorisations.resoudre(donnees.dynamique, base.utilisateurId, id);
    if (resolution.actif) {
      const fonctions = [...new Set(["sites", ...resolution.operations.map((o) => o.fonction)])];
      const relations = resolution.affectations;
      const clientIds = [...new Set(relations.map((a) => a.clientId))];
      const client = donnees.clients.find((c) => c.id === clientIds[0]);
      return { ...base, global: false, siteIds: [id], clientIds, fonctions,
        niveau: resolution.operations.some((o) => o.mode !== "read") ? "ecriture" : "lecture",
        portee: "attribues", autorisations: resolution, roleId: relations.length === 1 ? relations[0].roleId : null,
        role: { titre: [...new Set(relations.map((a) => a.role))].join(", ") }, accesType: null,
        contexte: { etat: "COMPLET", siteId: id, affectations: relations, client: { titre: client?.titre },
          role: { titre: [...new Set(relations.map((a) => a.role))].join(", ") },
          verrouille: relations.every((a) => a.verrouille) } };
    }
    const listeSites = donnees.dynamique.source["OBJ-SITE-PUBLIC"];
    const champsDirects = donnees.dynamique.source["OBJ-UTILISATEUR-SITE"].cols.filter((c) =>
      c.name.startsWith("Cible") && c.lookup?.listId.toLowerCase() === listeSites.id.toLowerCase()).map((c) => c.name);
    if (donnees.dynamique.affectations.some((a) => a.utilisateurId === base.utilisateurId &&
      a.typeId && (champsDirects.some((c) => String(a.fields[`${c}LookupId`]) === id) ||
        a.actif && autorisations.ciblesPour(donnees.dynamique, a).cibles.some((c) => c.id === id)))) {
      return refus("Affectation dynamique incomplète : contrôler rôle, états, périmètre et cible dans SharePoint.");
    }
  }
  if (!Array.isArray(donnees.liens) || !Array.isArray(donnees.clients) || !Array.isArray(donnees.sites)) {
    return refus("Données de contexte indisponibles.");
  }
  const relations = donnees.liens.filter((l) => l.actif && l.valide &&
    String(l.utilisateurId) === base.utilisateurId && String(l.siteId) === id &&
    !donnees.dynamique?.affectations.some((a) => a.id === String(l.id) && a.typeId));
  if (!relations.length && base.global && base.siteIds.includes(id)) {
    const site = donnees.sites.find((s) => s.id === id && s.actif && s.valide);
    const client = site && donnees.clients.find((c) => c.id === site.clientId);
    if (!site || !client) return refus("Site ou client invalide.");
    return contraintesOperations({ ...base, siteIds: [id], clientIds: [client.id], autorisations: null, accesType: null,
      contexte: { etat: "COMPLET", siteId: id, source: "POLITIQUE-GLOBALE-SHAREPOINT",
        client: { titre: client.titre }, role: base.role, verrouille: false } }, donnees, id);
  }
  if (relations.length !== 1) return refus(relations.length ? "Plusieurs relations actives pour ce site." : "Site non autorisé.");
  return contexteRelation(base, donnees, relations[0]);
}

function contexteRelation(base, donnees, l) {
  if (donnees.dynamique?.affectations.some((a) => a.id === String(l.id) && a.typeId)) {
    const utilisateur = donnees.utilisateurs.find((u) => u.id === String(l.utilisateurId));
    return contexteSite({ ...base, reconnu: !!utilisateur?.actif && !!utilisateur?.valide,
      utilisateurId: String(l.utilisateurId) }, donnees, l.siteId);
  }
  const id = String(l.siteId);
  const refus = (message) => ({ ...base, siteIds: [], clientIds: [], fonctions: [], niveau: null, portee: null, role: null, roleId: null, accesType: null,
    global: false, contexte: { etat: "CONTEXTE INCOMPLET", message, siteId: id } });
  const site = donnees.sites.find((s) => String(s.id) === id);
  const client = donnees.clients.find((c) => String(c.id) === String(l.clientId));
  const role = (donnees.roles || []).find((r) => String(r.id) === String(l.roleId) && r.actif && r.valide);
  const acces = (donnees.accesTypes || []).find((a) => String(a.id) === String(l.accesTypeId) && a.actif && a.valide);
  const regle = role && regleRole(donnees.politique, role.id);
  if (!site || !site.valide || !client || String(site.clientId) !== String(client.id)) return refus("Site non validé ou rattachement client/site invalide.");
  if (!role || !regle || !Object.hasOwn(RANG_PORTEE, regle.portee) || !Object.hasOwn(RANG_NIVEAU, regle.niveau) || !regle.fonctions.length) {
    return refus("Rôle contextuel absent ou politique de rôle incomplète.");
  }
  if (!acces || acces.clientId && String(acces.clientId) !== String(client.id)) return refus("Profil d'accès absent, invalide ou hors client.");
  let fonctions = regle.fonctions, niveau = regle.niveau;
  // Un profil peut restreindre la politique, jamais ajouter de capacité au rôle.
  if (acces.fonctions) {
    const restriction = String(acces.fonctions).split(/[;,\n]+/).map((f) => f.trim().toLowerCase()).filter(Boolean);
    if (restriction.some((f) => !FONCTIONS_COCKPIT.includes(f))) return refus("Politique du profil d'accès inconnue.");
    fonctions = fonctions.filter((f) => restriction.includes(f));
  }
  if (acces.niveau) {
    const n = String(acces.niveau).toLowerCase();
    if (!Object.hasOwn(RANG_NIVEAU, n)) return refus("Niveau du profil d'accès invalide.");
    if (RANG_NIVEAU[n] < RANG_NIVEAU[niveau]) niveau = n;
  }
  return contraintesOperations({ ...base, global: false, roleId: String(role.id), role: { titre: role.titre }, niveau,
    portee: "attribues", fonctions, siteIds: [id], clientIds: [String(client.id)],
    accesType: { id: String(acces.id), titre: acces.titre },
    contexte: { etat: "COMPLET", siteId: id, relationId: l.id, clientId: String(client.id),
      client: client.titre, role: role.titre, accesType: acces.titre, verrouille: !!l.verrouille } }, donnees, id);
}

function colonnes(cols) {
  const parListe = (listeId) => cols.find((c) => c.lookup && !c.lookup.allowMultipleValues && minuscule(c.lookup.listId) === minuscule(listeId));
  const parNom = (nom) => cols.find((c) => minuscule(c.displayName) === minuscule(nom));
  return { parListe, parNom, toutes: cols };
}

function lookupId(fields, colonne) {
  if (!colonne) return null;
  const v = fields[`${colonne.name}LookupId`];
  return v === undefined || v === null || v === "" ? null : String(v);
}

async function chargerDonnees() {
  const token = await dse.obtenirJetonGraph();
  const site = await dse.obtenirSiteGraph(token);
  const listes = await dse.collecter(token, `/sites/${site.id}/lists?$select=id,displayName,name`);
  const liste = (nom) => dse.trouverListe(listes, nom);
  const L = {
    utilisateur: liste("OBJ-UTILISATEUR"),
    lien: liste("OBJ-UTILISATEUR-SITE"),
    commun: liste("OBJ-ACCES-COMMUN"),
    client: liste("OBJ-CLIENT"),
    role: liste("OBJ-ROLE"),
    site: liste("OBJ-SITE-PUBLIC"),
    actif: liste("OBJ-ACTIF"),
    valide: liste("OBJ-VALIDE"), verrou: liste("OBJ-VEROUILLE"), acces: liste("OBJ-ACCES-TYPE")
  };
  if (!L.utilisateur || !L.client || !L.role || !L.site) {
    return { utilisateurs: [], clients: [], liens: [], sites: [], roles: [], politique: { roles: {} }, structure: null };
  }
  const lire = async (l) => {
    if (!l) return { cols: colonnes([]), items: [] };
    const cols = colonnes(await dse.chargerColonnesListe(token, site.id, l.id));
    const cibles = new Set(Object.values(L).filter(Boolean).map((v) => minuscule(v.id)));
    const champs = cols.toutes.filter((c) => !c.lookup || !c.lookup.allowMultipleValues && cibles.has(minuscule(c.lookup.listId)))
      .map((c) => c.lookup ? `${c.name}LookupId` : c.name);
    const items = await dse.collecter(token,
      `/sites/${site.id}/lists/${l.id}/items?$expand=fields($select=${[...new Set(["Title", ...champs])].join(",")})&$top=200`);
    return { cols, items };
  };
  const [u, k, r, s, li, co] = await Promise.all([lire(L.utilisateur), lire(L.client), lire(L.role), lire(L.site), lire(L.lien), lire(L.commun)]);
  const [actifs, validesOui, verrous, at] = await Promise.all([lire(L.actif), lire(L.valide), lire(L.verrou), lire(L.acces)]);
  const dynamique = await autorisations.charger(token, site.id, listes);
  if (dynamique) li.items = dynamique.source["OBJ-UTILISATEUR-SITE"].items;
  const valeurOui = (items) => {
    const candidats = items.filter((i) => /^oui\b/i.test(String(i.fields?.Title || "").trim()));
    return candidats.length === 1 ? String(candidats[0].id) : null;
  };
  const idsOui = new Map([[L.actif?.id, valeurOui(actifs.items)], [L.valide?.id, valeurOui(validesOui.items)], [L.verrou?.id, valeurOui(verrous.items)]]);
  const oui = (f, cols, l) => !!(l && idsOui.get(l.id) && lookupId(f, cols.parListe(l.id)) === idsOui.get(l.id));
  const actifValide = (f, cols) => ({ actif: oui(f, cols, L.actif), valide: oui(f, cols, L.valide) });
  const titresRoles = new Map(r.items.map((i) => [String(i.id), i.fields?.Title || null]));

  const utilisateurs = u.items.map((i) => {
    const f = i.fields || {};
    const roleId = lookupId(f, u.cols.parListe(L.role.id));
    return {
      id: String(i.id), titre: f.Title || "",
      entraObjectId: f.ENTRAOBJECTID ? String(f.ENTRAOBJECTID).trim() : null,
      clientId: lookupId(f, u.cols.toutes.find((c) => c.name === "_x002d_CLIENT" && !c.lookup?.allowMultipleValues &&
        minuscule(c.lookup?.listId) === minuscule(L.client.id))),
      roleId, roleTitre: roleId ? titresRoles.get(roleId) || null : null,
      actif: oui(f, u.cols, L.actif), valide: oui(f, u.cols, L.valide)
    };
  });
  const colOid = k.cols.parNom("ENTRA-OBJECT-ID");
  const colMail = k.cols.parNom("ENTRA-EMAIL");
  const colSitePrincipal = k.cols.toutes.find((c) => c.lookup && minuscule(c.lookup.listId) === minuscule(L.site.id) &&
    /principal/i.test(String(c.displayName || c.name)));
  const clients = k.items.filter((i) => oui(i.fields || {}, k.cols, L.actif) && oui(i.fields || {}, k.cols, L.valide)).map((i) => ({
    id: String(i.id),
    titre: String(i.fields?.Title || "").trim() || null,
    entraObjectId: colOid ? i.fields?.[colOid.name] || null : null,
    entraEmail: colMail ? i.fields?.[colMail.name] || null : null,
    // Evolution prevue : Lookup client -> site principal (colonne dont le nom contient PRINCIPAL).
    sitePrincipalId: colSitePrincipal ? lookupId(i.fields || {}, colSitePrincipal) : null
  }));
  const liens = li.items.map((i) => {
    const f = i.fields || {};
    return {
      id: String(i.id), modifieLe: i.lastModifiedDateTime || f.Modified || null,
      utilisateurId: lookupId(f, li.cols.parListe(L.utilisateur.id)),
      clientId: lookupId(f, li.cols.parListe(L.client.id)),
      siteId: lookupId(f, li.cols.parListe(L.site.id)),
      roleId: lookupId(f, li.cols.parListe(L.role.id)),
      accesTypeId: L.acces ? lookupId(f, li.cols.parListe(L.acces.id)) : null,
      verrouille: oui(f, li.cols, L.verrou),
      etatsIds: { actif: L.actif ? lookupId(f, li.cols.parListe(L.actif.id)) : null,
        valide: L.valide ? lookupId(f, li.cols.parListe(L.valide.id)) : null,
        verrouille: L.verrou ? lookupId(f, li.cols.parListe(L.verrou.id)) : null },
      actif: oui(f, li.cols, L.actif), valide: oui(f, li.cols, L.valide)
    };
  });
  const sites = s.items.map((i) => ({ id: String(i.id), clientId: lookupId(i.fields || {}, s.cols.parListe(L.client.id)),
    ...actifValide(i.fields || {}, s.cols) }));
  const liensCommuns = co.items.map((i) => ({
    utilisateurId: lookupId(i.fields || {}, co.cols.parListe(L.utilisateur.id)),
    siteId: lookupId(i.fields || {}, co.cols.parListe(L.site.id)),
    ...actifValide(i.fields || {}, co.cols)
  }));
  const roles = r.items.map((i) => ({
    id: String(i.id), titre: i.fields?.Title || null, ...actifValide(i.fields || {}, r.cols),
    portee: String(i.fields?.PORTEE || "").trim().toUpperCase(),
    niveau: String(i.fields?.NIVEAUACCES || "").trim().toUpperCase(),
    fonctions: i.fields?.FONCTIONS || ""
  }));
  const bool = (f, cols, noms) => {
    const c = noms.map((n) => cols.parNom(n)).find((c) => c?.boolean);
    return c ? f[c.name] === true : false;
  };
  const accesTypes = at.items.map((i) => ({
    id: String(i.id), titre: i.fields?.Title || null,
    actif: bool(i.fields || {}, at.cols, ["ACTIF"]) || oui(i.fields || {}, at.cols, L.actif),
    valide: bool(i.fields || {}, at.cols, ["VALIDATION-DSE", "VALIDER"]) || oui(i.fields || {}, at.cols, L.valide),
    clientId: lookupId(i.fields || {}, at.cols.parListe(L.client.id)),
    fonctions: at.cols.parNom("FONCTIONS") ? i.fields?.[at.cols.parNom("FONCTIONS").name] || "" : "",
    niveau: at.cols.parNom("NIVEAU-ACCES") ? i.fields?.[at.cols.parNom("NIVEAU-ACCES").name] || "" : ""
  }));
  // Structure utile a la couche d'ecriture (noms internes resolus, jamais exposes au navigateur).
  const structure = {
    etats: { actifOui: idsOui.get(L.actif?.id) || null, valideOui: idsOui.get(L.valide?.id) || null,
      actifNon: actifs.items.filter((i) => /^non\b/i.test(i.fields?.Title || "")).length === 1
        ? String(actifs.items.find((i) => /^non\b/i.test(i.fields?.Title || "")).id) : null,
      valideNon: validesOui.items.filter((i) => /^non\b/i.test(i.fields?.Title || "")).length === 1
        ? String(validesOui.items.find((i) => /^non\b/i.test(i.fields?.Title || "")).id) : null,
      verrouNon: verrous.items.filter((i) => /^non\b/i.test(i.fields?.Title || "")).length === 1
        ? String(verrous.items.find((i) => /^non\b/i.test(i.fields?.Title || "")).id) : null,
      verrouOui: idsOui.get(L.verrou?.id) || null },
    listes: { utilisateur: L.utilisateur.id, role: L.role.id, acces: L.acces?.id || null, lien: L.lien?.id || null, actif: L.actif?.id || null, valide: L.valide?.id || null },
    colonnes: {
      utilisateurRole: u.cols.parListe(L.role.id)?.name || null,
      utilisateurClient: u.cols.toutes.find((c) => c.name === "_x002d_CLIENT")?.name || null,
      utilisateurEntra: u.cols.toutes.find((c) => c.name === "ENTRAOBJECTID" && c.text)?.name || null,
      utilisateurActif: L.actif ? u.cols.parListe(L.actif.id)?.name || null : null,
      utilisateurValide: L.valide ? u.cols.parListe(L.valide.id)?.name || null : null,
      lienUtilisateur: li.cols.parListe(L.utilisateur.id)?.name || null,
      lienClient: li.cols.parListe(L.client.id)?.name || null,
      lienSite: li.cols.parListe(L.site.id)?.name || null,
      lienRole: li.cols.parListe(L.role.id)?.name || null,
      lienAccesType: L.acces ? li.cols.parListe(L.acces.id)?.name || null : null,
      lienVerrou: L.verrou ? li.cols.parListe(L.verrou.id)?.name || null : null,
      lienActif: L.actif ? li.cols.parListe(L.actif.id)?.name || null : null,
      lienValide: L.valide ? li.cols.parListe(L.valide.id)?.name || null : null
    }
  };
  return { utilisateurs, clients, liens, liensCommuns, sites, roles, accesTypes, dynamique, correspondances: dynamique?.operations || [],
    politique: politiqueDepuisRoles(roles, dynamique?.operations || []), structure };
}

async function donneesDroits() {
  if (cache.valeur && cache.expiration > Date.now()) return cache.valeur;
  if (!cache.promesse) {
    cache.promesse = chargerDonnees()
      .then((v) => { cache = { valeur: v, expiration: Date.now() + DUREE_CACHE_MS, promesse: null }; return v; })
      .catch((e) => { cache.promesse = null; throw e; });
  }
  return cache.promesse;
}

async function droitsPour(identite) {
  const donnees = await donneesDroits();
  const base = calculerDroits({ identite, ...donnees });
  if (!base.reconnu || base.global || !donnees.dynamique) return base;
  const dyn = autorisations.resoudre(donnees.dynamique, base.utilisateurId, "");
  const candidats = [...new Set([...base.siteIds, ...(dyn.siteIds || [])])];
  const siteIds = candidats.filter((id) => contexteSite(base, donnees, id).contexte?.etat === "COMPLET");
  return { ...base, siteIds, sitesAttribues: siteIds,
    sitePrincipalId: siteIds.includes(base.sitePrincipalId) ? base.sitePrincipalId : siteIds[0] || null };
}

async function sitesIndex() {
  const index = await catalogueSource.obtenirIndex();
  return { sites: index.sites, statuts: index.statuts };
}

function viderCache() {
  cache = { valeur: null, expiration: 0, promesse: null };
}

module.exports = { calculerDroits, contexteSite, contexteRelation, droitsPour, sitesIndex, donneesDroits, viderCache, peutAttribuer, regleRole, RANG_PORTEE, RANG_NIVEAU };
