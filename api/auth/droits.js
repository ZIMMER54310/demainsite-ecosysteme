"use strict";

/*
 * Resolution des droits du cockpit, cote serveur.
 * Identite (tout fournisseur) -> OBJ-UTILISATEUR (directement ou via OBJ-CLIENT)
 * -> OBJ-ROLE -> politique serveur -> perimetre de sites (OBJ-UTILISATEUR-SITE,
 * client du site ou tous). Relations resolues par ID SharePoint natifs.
 */

const dse = require("../shared/dse");
const catalogueSource = require("../shared/catalogue-source");
const politiqueParDefaut = require("../config/politique-roles.json");
const { FONCTIONS_COCKPIT } = require("../shared/cockpit");
const perimetre = require("../shared/perimetre");

const DUREE_CACHE_MS = 120000;
let cache = { valeur: null, expiration: 0, promesse: null };

const minuscule = (v) => String(v || "").trim().toLowerCase();

const RANG_PORTEE = { attribues: 0, client: 1, tous: 2 };
const RANG_NIVEAU = { lecture: 0, ecriture: 1, administration: 2 };

function regleRole(politique, roleId) {
  const regle = roleId ? politique.roles?.[String(roleId)] : null;
  if (!regle) return null;
  return {
    portee: Object.hasOwn(RANG_PORTEE, regle.portee) ? regle.portee : "attribues",
    niveau: Object.hasOwn(RANG_NIVEAU, regle.niveau) ? regle.niveau : "lecture",
    fonctions: (regle.fonctions || []).filter((f) => FONCTIONS_COCKPIT.includes(f))
  };
}

/*
 * Un role ne peut attribuer qu'un role dont la portee, le niveau ET les fonctions
 * sont inclus dans les siens : jamais d'elevation de privilege.
 */
function peutAttribuer(droitsActeur, roleIdCible, politique = politiqueParDefaut) {
  const cible = regleRole(politique, roleIdCible);
  if (!cible || !droitsActeur?.reconnu || !droitsActeur.portee) return false;
  if (RANG_PORTEE[cible.portee] > RANG_PORTEE[droitsActeur.portee]) return false;
  if (RANG_NIVEAU[cible.niveau] > RANG_NIVEAU[droitsActeur.niveau]) return false;
  const miennes = new Set(droitsActeur.fonctions || []);
  return cible.fonctions.every((f) => miennes.has(f));
}

function calculerDroits({ identite, utilisateurs = [], clients = [], liens = [], sites = [], politique = politiqueParDefaut }) {
  const aucun = { reconnu: false, role: null, fonctions: [], siteIds: [], sitePrincipalId: null, clientIds: [], portee: null, niveau: null, utilisateurId: null };
  if (!identite || !identite.sujet) return aucun;
  const email = minuscule(identite.email);
  const valides = utilisateurs.filter((u) => u.actif && u.valide);

  let candidats = email ? valides.filter((u) => minuscule(u.titre) === email) : [];
  if (candidats.length === 0) {
    const clientsLies = clients.filter((c) =>
      (identite.fournisseur === "entra" && c.entraObjectId && minuscule(c.entraObjectId) === minuscule(identite.sujet)) ||
      (email && minuscule(c.entraEmail) === email));
    const ids = new Set(clientsLies.map((c) => String(c.id)));
    candidats = valides.filter((u) => u.clientId && ids.has(String(u.clientId)));
  }
  // Un rapprochement ambigu n'accorde rien : jamais de droit par supposition.
  if (candidats.length !== 1) return aucun;
  const utilisateur = candidats[0];

  const regle = regleRole(politique, utilisateur.roleId);
  const fonctions = regle ? regle.fonctions : [];
  const attribues = new Set(liens
    .filter((l) => l.actif && l.valide && String(l.utilisateurId) === String(utilisateur.id) && l.siteId)
    .map((l) => String(l.siteId)));
  // Clients du perimetre : client de l'utilisateur, sinon clients des sites qui lui sont attribues.
  const clientIds = [...new Set([
    utilisateur.clientId,
    ...sites.filter((s) => attribues.has(String(s.id))).map((s) => s.clientId)
  ].filter(Boolean).map(String))];

  let siteIds = [];
  if (regle?.portee === "tous") siteIds = sites.map((s) => String(s.id));
  else if (regle?.portee === "client") {
    siteIds = sites.filter((s) => attribues.has(String(s.id)) ||
      (s.clientId && clientIds.includes(String(s.clientId)))).map((s) => String(s.id));
  } else if (regle) siteIds = sites.filter((s) => attribues.has(String(s.id))).map((s) => String(s.id));

  const client = utilisateur.clientId ? clients.find((c) => String(c.id) === String(utilisateur.clientId)) : null;
  return {
    reconnu: true,
    utilisateurId: String(utilisateur.id),
    sitePrincipalId: perimetre.sitePrincipal({ siteIds, explicite: client?.sitePrincipalId ?? null }),
    role: utilisateur.roleId ? { titre: utilisateur.roleTitre || null } : null,
    roleId: utilisateur.roleId ? String(utilisateur.roleId) : null,
    portee: regle?.portee || null,
    niveau: regle?.niveau || null,
    fonctions,
    siteIds,
    clientIds: regle?.portee === "tous" ? clients.map((c) => String(c.id)) : clientIds
  };
}

function colonnes(cols) {
  const parListe = (listeId) => cols.find((c) => c.lookup && minuscule(c.lookup.listId) === minuscule(listeId));
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
    client: liste("OBJ-CLIENT"),
    role: liste("OBJ-ROLE"),
    site: liste("OBJ-SITE-PUBLIC"),
    actif: liste("OBJ-ACTIF"),
    valide: liste("OBJ-VALIDE")
  };
  if (!L.utilisateur || !L.client || !L.role || !L.site) {
    return { utilisateurs: [], clients: [], liens: [], sites: [], roles: [], structure: null };
  }
  const lire = async (l) => l ? {
    cols: colonnes(await dse.chargerColonnesListe(token, site.id, l.id)),
    items: await dse.chargerItemsListe(token, site.id, l.id)
  } : { cols: colonnes([]), items: [] };
  const [u, k, r, s, li] = await Promise.all([lire(L.utilisateur), lire(L.client), lire(L.role), lire(L.site), lire(L.lien)]);
  const oui = (f, cols, l) => l ? lookupId(f, cols.parListe(l.id)) === "1" : false;
  const actifValide = (f, cols) => ({ actif: oui(f, cols, L.actif), valide: oui(f, cols, L.valide) });
  const titresRoles = new Map(r.items.map((i) => [String(i.id), i.fields?.Title || null]));

  const utilisateurs = u.items.map((i) => {
    const f = i.fields || {};
    const roleId = lookupId(f, u.cols.parListe(L.role.id));
    return {
      id: String(i.id), titre: f.Title || "",
      clientId: lookupId(f, u.cols.parListe(L.client.id)),
      roleId, roleTitre: roleId ? titresRoles.get(roleId) || null : null,
      actif: oui(f, u.cols, L.actif), valide: oui(f, u.cols, L.valide)
    };
  });
  const colOid = k.cols.parNom("ENTRA-OBJECT-ID");
  const colMail = k.cols.parNom("ENTRA-EMAIL");
  const colSitePrincipal = k.cols.toutes.find((c) => c.lookup && minuscule(c.lookup.listId) === minuscule(L.site.id) &&
    /principal/i.test(String(c.displayName || c.name)));
  const clients = k.items.filter((i) => oui(i.fields || {}, k.cols, L.actif)).map((i) => ({
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
      id: String(i.id),
      utilisateurId: lookupId(f, li.cols.parListe(L.utilisateur.id)),
      siteId: lookupId(f, li.cols.parListe(L.site.id)),
      actif: oui(f, li.cols, L.actif), valide: oui(f, li.cols, L.valide)
    };
  });
  const sites = s.items.map((i) => ({ id: String(i.id), clientId: lookupId(i.fields || {}, s.cols.parListe(L.client.id)) }));
  const roles = r.items.map((i) => ({ id: String(i.id), titre: i.fields?.Title || null, ...actifValide(i.fields || {}, r.cols) }));
  // Structure utile a la couche d'ecriture (noms internes resolus, jamais exposes au navigateur).
  const structure = {
    listes: { utilisateur: L.utilisateur.id, lien: L.lien?.id || null, actif: L.actif?.id || null, valide: L.valide?.id || null },
    colonnes: {
      utilisateurRole: u.cols.parListe(L.role.id)?.name || null,
      utilisateurActif: L.actif ? u.cols.parListe(L.actif.id)?.name || null : null,
      utilisateurValide: L.valide ? u.cols.parListe(L.valide.id)?.name || null : null,
      lienUtilisateur: li.cols.parListe(L.utilisateur.id)?.name || null,
      lienSite: li.cols.parListe(L.site.id)?.name || null,
      lienActif: L.actif ? li.cols.parListe(L.actif.id)?.name || null : null,
      lienValide: L.valide ? li.cols.parListe(L.valide.id)?.name || null : null
    }
  };
  return { utilisateurs, clients, liens, sites, roles, structure };
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
  return calculerDroits({ identite, ...donnees });
}

async function sitesIndex() {
  const index = await catalogueSource.obtenirIndex();
  return { sites: index.sites, statuts: index.statuts };
}

function viderCache() {
  cache = { valeur: null, expiration: 0, promesse: null };
}

module.exports = { calculerDroits, droitsPour, sitesIndex, donneesDroits, viderCache, peutAttribuer, regleRole, RANG_PORTEE, RANG_NIVEAU };
