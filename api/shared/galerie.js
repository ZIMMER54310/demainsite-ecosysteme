"use strict";

/*
 * Galerie des sites : chaque carte provient de SharePoint et n'est construite qu'apres
 * resolution des droits cote serveur (galerie.voir par site, cockpit.ouvrir + relation
 * OBJ-SITE-PUBLIC -> OBJ-SITE-COCKPIT -> OBJ-COCKPIT). Lecture seule.
 */

const dse = require("./dse");
const autorisations = require("../auth/autorisations");
const perimetre = require("./perimetre");

const OPERATION_GALERIE = "galerie.voir";
const OPERATION_COCKPIT = "cockpit.ouvrir";
const TRIS = ["nom", "statut", "domaine"];

const minuscule = (v) => String(v || "").replace(/[{}]/g, "").toLowerCase();
const sansAccent = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/* Operation de lecture : moteur dynamique si le contexte en dispose, sinon politique de role SharePoint. */
function peutLire(d, operation, fonction) {
  if (!d?.reconnu || d.contexte?.etat !== "COMPLET" || d.contraintesOperations?.includes(operation)) return false;
  return d.autorisations ? autorisations.autoriser(d.autorisations, operation).autorise : d.fonctions.includes(fonction);
}

async function idOui(token, siteId, listId) {
  if (!listId) return null;
  const items = await dse.chargerItemsListe(token, siteId, listId);
  const oui = items.filter((i) => /^oui\b/i.test(String(i.fields?.Title || "").trim()));
  return oui.length === 1 ? String(oui[0].id) : null;
}

/*
 * siteId -> cockpits actifs, valides et non verrouilles, relies par une relation elle-meme
 * active, valide et non verrouillee. Etat absent = non actif : rien n'est suppose.
 */
async function cockpitsParSite() {
  const token = await dse.obtenirJetonGraph();
  const site = await dse.obtenirSiteGraph(token);
  const listes = await dse.collecter(token, `/sites/${site.id}/lists?$select=id,displayName,name`);
  const L = (n) => dse.trouverListe(listes, [n]);
  const [lc, lsc, ls] = [L("OBJ-COCKPIT"), L("OBJ-SITE-COCKPIT"), L("OBJ-SITE-PUBLIC")];
  const resultat = new Map();
  if (!lc || !lsc || !ls) return resultat;
  const [colsC, itemsC, colsR, itemsR] = await Promise.all([
    dse.chargerColonnesListe(token, site.id, lc.id), dse.chargerItemsListe(token, site.id, lc.id),
    dse.chargerColonnesListe(token, site.id, lsc.id), dse.chargerItemsListe(token, site.id, lsc.id)
  ]);
  const vers = (cols, l) => (l ? cols.filter((c) => c.lookup?.listId && minuscule(c.lookup.listId) === minuscule(l.id)) : []);
  const unique = (cols, l) => { const x = vers(cols, l); return x.length === 1 ? x[0] : null; };
  const etats = {};
  for (const nom of ["OBJ-ACTIF", "OBJ-VALIDE"]) etats[nom] = { liste: L(nom), oui: await idOui(token, site.id, L(nom)?.id) };
  const colVerrou = (cols) => cols.find((c) => c.lookup?.listId && /VER+OUILLE/i.test(String(c.displayName || c.name)));
  const ouiVerrou = new Map();
  const lid = (f, c) => (c ? String(f?.[`${c.name}LookupId`] ?? "") : "");
  async function exploitable(cols, f) {
    for (const nom of ["OBJ-ACTIF", "OBJ-VALIDE"]) {
      const c = unique(cols, etats[nom].liste);
      if (!c || !etats[nom].oui || lid(f, c) !== etats[nom].oui) return false;
    }
    const v = colVerrou(cols);
    if (v && lid(f, v)) {
      const cle = minuscule(v.lookup.listId);
      if (!ouiVerrou.has(cle)) ouiVerrou.set(cle, await idOui(token, site.id, v.lookup.listId));
      if (!ouiVerrou.get(cle) || lid(f, v) === ouiVerrou.get(cle)) return false;
    }
    return true;
  }
  const cSite = unique(colsR, ls);
  const cCockpit = unique(colsR, lc);
  if (!cSite || !cCockpit) return resultat;
  const cockpits = new Map();
  for (const i of itemsC) if (await exploitable(colsC, i.fields)) cockpits.set(String(i.id), { id: String(i.id), titre: i.fields?.Title || null });
  for (const r of itemsR) {
    if (!await exploitable(colsR, r.fields)) continue;
    const c = cockpits.get(lid(r.fields, cCockpit));
    const s = lid(r.fields, cSite);
    if (!c || !s) continue;
    if (!resultat.has(s)) resultat.set(s, []);
    resultat.get(s).push(c);
  }
  return resultat;
}

/* Domaine principal officiel uniquement : DOMAIN-PRINCIPAL (Lookup vers OBJ-NOM DE DOMAINE). */
function domaineOfficiel(g) {
  const d = perimetre.normaliser(g?.domainePrincipal);
  return d && g.domainePrincipalId ? d : null;
}

function logoDuSite(resume) {
  const el = (resume?.logo?.donnees || []).find((x) => x?.media?.url);
  return el && /^\/api\/v1\/media\/\d{1,9}$/.test(el.media.url) ? el.media.url : null;
}

/*
 * groupes : sites principaux deja limites au perimetre ; contexte(g) : droits du site.
 * Seules les cartes autorisees par galerie.voir sont construites et exposees.
 */
function construireCartes({ groupes, statuts, contexte, cockpits, resumes }) {
  const cartes = [];
  for (const g of groupes) {
    const d = contexte(g);
    if (!peutLire(d, OPERATION_GALERIE, "galerie")) continue;
    const statut = statuts?.get(String(g.statutId)) || null;
    const domaine = domaineOfficiel(g);
    const acces = perimetre.domaineAcces(g);
    const liens = cockpits.get(String(g.id)) || [];
    const cockpit = acces && liens.length && peutLire(d, OPERATION_COCKPIT, "cockpit")
      ? { titre: liens[0].titre, url: `/cockpit/site/${encodeURIComponent(acces)}` } : null;
    cartes.push({
      nom: g.titre || domaine || "Site sans nom",
      statut: statut ? { titre: statut.titre || null, couleur: statut.couleur || null } : null,
      domainePrincipal: domaine,
      urlSite: domaine ? `https://${domaine}` : null,
      logo: logoDuSite(resumes?.get(String(g.id))),
      cockpit
    });
  }
  return cartes;
}

function filtrer(cartes, query = {}) {
  const q = sansAccent(query.q);
  const statut = String(query.statut || "").trim();
  const avecCockpit = ["oui", "non"].includes(query.cockpit) ? query.cockpit : "";
  const tri = TRIS.includes(query.tri) ? query.tri : "nom";
  const sens = query.sens === "desc" ? -1 : 1;
  const parPage = Math.min(48, Math.max(1, parseInt(query.parPage, 10) || 12));
  const statutDe = (c) => c.statut?.titre || "Non renseigné";
  const res = cartes.filter((c) => (!q || [c.nom, c.domainePrincipal].some((v) => sansAccent(v).includes(q))) &&
    (!statut || statutDe(c) === statut) &&
    (!avecCockpit || (avecCockpit === "oui") === Boolean(c.cockpit)));
  const valeur = { nom: (c) => sansAccent(c.nom), statut: (c) => sansAccent(statutDe(c)), domaine: (c) => sansAccent(c.domainePrincipal) }[tri];
  res.sort((a, b) => valeur(a).localeCompare(valeur(b), "fr") * sens || sansAccent(a.nom).localeCompare(sansAccent(b.nom), "fr"));
  const pages = Math.max(1, Math.ceil(res.length / parPage));
  const page = Math.min(pages, Math.max(1, parseInt(query.page, 10) || 1));
  const statutsDispo = [...new Set(cartes.map(statutDe))].sort((a, b) => a.localeCompare(b, "fr"));
  return {
    elements: res.slice((page - 1) * parPage, page * parPage),
    total: res.length, totalSites: cartes.length, page, pages, parPage,
    options: { statuts: statutsDispo, cockpit: cartes.some((c) => c.cockpit) && cartes.some((c) => !c.cockpit), tris: TRIS },
    criteres: { q: String(query.q || "").slice(0, 100), statut, cockpit: avecCockpit, tri, sens: sens < 0 ? "desc" : "asc" }
  };
}

module.exports = { OPERATION_GALERIE, OPERATION_COCKPIT, peutLire, cockpitsParSite, construireCartes, filtrer, domaineOfficiel };
