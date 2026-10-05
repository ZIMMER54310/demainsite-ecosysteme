"use strict";

/*
 * Inventaire transverse du cockpit : medias, pages, En-tetes, Footer et articles de tous les sites
 * d'un perimetre (tous les sites pour l'administration globale, ceux d'un client ou d'un utilisateur sinon).
 * Lecture seule : la gestion se fait ensuite dans le cockpit du site concerne (memes controles qu'aujourd'hui).
 * Aucun libelle metier code en dur : types, portees et etats viennent des listes SharePoint.
 */

const B = require("./builder");
const C = require("./constructeur");
const { relations, cleChamp } = require("./catalogue");

const TYPES = Object.freeze({
  medias: { libelle: "Médias", fonction: "logo-medias" },
  pages: { libelle: "Pages", fonction: "pages" },
  entetes: { libelle: "En-têtes", fonction: "entete" },
  footers: { libelle: "Footer", fonction: "footer" },
  articles: { libelle: "Articles", fonction: "pages" }
});

const rels = (el, nom) => relations(el, [cleChamp(nom)]);
const rel = (el, nom) => rels(el, nom)[0] || null;
const titreDe = (el) => String(el?._fields?.Title ?? "").trim();

function etatDe(el) {
  const actif = rel(el, "OBJ-ACTIF")?.titre || null;
  const valide = rel(el, "OBJ-VALIDE")?.titre || null;
  return { actif, valide, publiable: B.publiable(el), inactif: C.inactif(el), brouillon: C.brouillon(el) };
}

/*
 * perimetre = { global: bool, groupes: [{ id, titre, domaines, fiches, clientId }] }
 * Chaque fiche OBJ-SITE-PUBLIC est rattachee a son site (groupe) pour afficher le bon domaine.
 */
function indexSites(groupes) {
  const parFiche = new Map();
  for (const g of groupes) {
    const site = { titre: g.titre || null, domaine: (g.domaines || [])[0] || null };
    for (const f of g.fiches || [String(g.id)]) parFiche.set(String(f), site);
  }
  return parFiche;
}

const sitesDe = (ids, parFiche) => {
  const vus = new Map();
  for (const id of ids) { const s = parFiche.get(String(id)); if (s && !vus.has(s.domaine || s.titre)) vus.set(s.domaine || s.titre, s); }
  return [...vus.values()];
};

function elementsConstructeur(d, type, parFiche) {
  const def = C.CONTENEURS[type];
  return (d[def.cle] || []).map((el) => {
    const ids = type === "page" ? rels(el, "OBJ-SITE-PUBLIC").map((s) => s.id) : [rel(el, "OBJ-SITE-PUBLIC")?.id].filter(Boolean);
    const sites = sitesDe(ids, parFiche);
    if (!sites.length) return null;
    const ligne = { titre: titreDe(el) || `${def.libelle} sans titre`, sites, etat: etatDe(el) };
    if (type === "page") {
      ligne.url = String(el?._fields?.URL ?? "").trim() || "/";
      ligne.entete = rel(el, "OBJ-ENTETE-SITE")?.titre || null;
      ligne.footer = rel(el, "OBJ-FOOTER-SITE")?.titre || null;
    } else {
      ligne.pages = (d.pages || []).filter((p) => rel(p, def.relation)?.id === el.id).length;
    }
    return ligne;
  }).filter(Boolean);
}

function medias(d, perimetre, parFiche, clients) {
  return (d.medias || []).map((m) => {
    const sites = sitesDe(rels(m, "OBJ-SITE-PUBLIC").map((s) => s.id), parFiche);
    const clientsMedia = rels(m, "OBJ-CLIENT").filter((c) => clients.has(c.id));
    // Hors administration globale : uniquement les medias rattaches aux sites ou clients du perimetre.
    if (!perimetre.global && !sites.length && !clientsMedia.length) return null;
    return {
      titre: titreDe(m) || "Média sans titre",
      type: rel(m, "OBJ-MEDIA-TYPE")?.titre || null,
      portee: rel(m, "OBJ-MEDIA-PORTEE")?.titre || null,
      clients: clientsMedia.map((c) => c.titre).filter(Boolean),
      sites, etat: etatDe(m),
      url: `/api/v1/media/${encodeURIComponent(m.id)}`
    };
  }).filter(Boolean);
}

function articles(index, parFiche) {
  return (index?.items || []).filter((i) => i.type === "article").map((a) => {
    const sites = sitesDe(a.plateformes.map((p) => p.id), parFiche);
    if (!sites.length) return null;
    return {
      titre: a.titre, sites, url: a.url || null,
      etat: { actif: a.etat.actif ? "Oui" : "Non", valide: a.etat.valide ? "Oui" : "Non", publiable: a.etat.actif && a.etat.valide && a.etat.public, inactif: !a.etat.actif, brouillon: false }
    };
  }).filter(Boolean);
}

const parTitre = (a, b) => String(a.sites[0]?.titre || "").localeCompare(String(b.sites[0]?.titre || ""), "fr") || a.titre.localeCompare(b.titre, "fr");

function construire({ type, perimetre, donneesBuilder, indexCatalogue }) {
  const parFiche = indexSites(perimetre.groupes);
  const clients = new Set(perimetre.groupes.map((g) => g.clientId).filter(Boolean).map(String));
  const d = donneesBuilder || {};
  const lignes = type === "medias" ? medias(d, perimetre, parFiche, clients)
    : type === "pages" ? elementsConstructeur(d, "page", parFiche)
      : type === "entetes" ? elementsConstructeur(d, "entete", parFiche)
        : type === "footers" ? elementsConstructeur(d, "footer", parFiche)
          : type === "articles" ? articles(indexCatalogue, parFiche) : [];
  return lignes.sort(parTitre);
}

module.exports = { TYPES, construire, _test: { indexSites, sitesDe } };
