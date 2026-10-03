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

const DUREE_CACHE_MS = 120000;
let cache = { valeur: null, expiration: 0, promesse: null };

const minuscule = (v) => String(v || "").trim().toLowerCase();

function calculerDroits({ identite, utilisateurs = [], clients = [], liens = [], sites = [], politique = politiqueParDefaut }) {
  const aucun = { reconnu: false, role: null, fonctions: [], siteIds: [] };
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

  const regle = utilisateur.roleId ? politique.roles?.[String(utilisateur.roleId)] : null;
  const fonctions = regle ? (regle.fonctions || []).filter((f) => FONCTIONS_COCKPIT.includes(f)) : [];
  const attribues = new Set(liens
    .filter((l) => l.actif && l.valide && String(l.utilisateurId) === String(utilisateur.id) && l.siteId)
    .map((l) => String(l.siteId)));

  let siteIds = [];
  if (regle?.portee === "tous") siteIds = sites.map((s) => String(s.id));
  else if (regle?.portee === "client") {
    siteIds = sites.filter((s) => attribues.has(String(s.id)) ||
      (utilisateur.clientId && String(s.clientId) === String(utilisateur.clientId))).map((s) => String(s.id));
  } else if (regle) siteIds = sites.filter((s) => attribues.has(String(s.id))).map((s) => String(s.id));

  return {
    reconnu: true,
    role: utilisateur.roleId ? { titre: utilisateur.roleTitre || null } : null,
    fonctions,
    siteIds
  };
}

function colonnes(cols) {
  const parListe = (listeId) => cols.find((c) => c.lookup && minuscule(c.lookup.listId) === minuscule(listeId));
  const parNom = (nom) => cols.find((c) => minuscule(c.displayName) === minuscule(nom));
  return { parListe, parNom };
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
    return { utilisateurs: [], clients: [], liens: [], sites: [] };
  }
  const lire = async (l) => l ? {
    cols: colonnes(await dse.chargerColonnesListe(token, site.id, l.id)),
    items: await dse.chargerItemsListe(token, site.id, l.id)
  } : { cols: colonnes([]), items: [] };
  const [u, k, r, s, li] = await Promise.all([lire(L.utilisateur), lire(L.client), lire(L.role), lire(L.site), lire(L.lien)]);
  const oui = (f, cols, l) => l ? lookupId(f, cols.parListe(l.id)) === "1" : false;
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
  const clients = k.items.filter((i) => oui(i.fields || {}, k.cols, L.actif)).map((i) => ({
    id: String(i.id),
    entraObjectId: colOid ? i.fields?.[colOid.name] || null : null,
    entraEmail: colMail ? i.fields?.[colMail.name] || null : null
  }));
  const liens = li.items.map((i) => {
    const f = i.fields || {};
    return {
      utilisateurId: lookupId(f, li.cols.parListe(L.utilisateur.id)),
      siteId: lookupId(f, li.cols.parListe(L.site.id)),
      actif: oui(f, li.cols, L.actif), valide: oui(f, li.cols, L.valide)
    };
  });
  const sites = s.items.map((i) => ({ id: String(i.id), clientId: lookupId(i.fields || {}, s.cols.parListe(L.client.id)) }));
  return { utilisateurs, clients, liens, sites };
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

module.exports = { calculerDroits, droitsPour, sitesIndex };
