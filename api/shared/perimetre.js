"use strict";
/*
 * Chaine CLIENT -> SITE PRINCIPAL -> DOMAINE PRINCIPAL -> DOMAINES ALIAS.
 * Le principal n'est JAMAIS deduit d'un nom, d'un ordre ou d'un ID :
 * il doit etre designe explicitement dans les donnees, ou etre le seul candidat.
 * Sinon il reste "a preciser" et aucun choix n'est fait a la place des donnees.
 */

const normaliser = (v) => {
  const d = String(v ?? "").trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
};

function domainesDuSite(info) {
  const tous = [...new Set((Array.isArray(info?.domaines) ? info.domaines : []).map(normaliser).filter(Boolean))];
  const explicite = normaliser(info?.domainePrincipal);
  if (explicite && !tous.includes(explicite)) tous.unshift(explicite);
  const principal = explicite || (tous.length === 1 ? tous[0] : null);
  return {
    principal,
    alias: tous.filter((d) => d !== principal).sort(),
    tous,
    aPreciser: !principal && tous.length > 1
  };
}

function sitePrincipal({ siteIds = [], explicite = null } = {}) {
  const ids = siteIds.map(String);
  if (explicite !== null && explicite !== undefined && ids.includes(String(explicite))) return String(explicite);
  return ids.length === 1 ? ids[0] : null;
}

// Cle de navigation vers un site : le domaine demande s'il en fait partie, sinon le principal.
function domaineAcces(info, demande = null) {
  const d = domainesDuSite(info);
  const n = normaliser(demande);
  if (n && d.tous.includes(n)) return n;
  return d.principal || [...d.tous].sort()[0] || null;
}

/*
 * Regroupe les fiches de sites en veritables sites principaux, par ID SharePoint natifs :
 * une fiche dont le DOMAINE-PRINCIPAL appartient aux domaines d'UNE autre fiche est un alias
 * de cette fiche. Une fiche qui porte elle-meme son domaine principal, ou dont le rattachement
 * est absent ou ambigu, reste un site a part entiere. Rien n'est deduit d'un nom ou d'un ordre.
 */
function regrouperSites(sites = []) {
  const liste = [...sites].filter(Boolean);
  const parId = new Map(liste.map((s) => [String(s.id), s]));
  const proprietaires = new Map();
  for (const s of liste) {
    for (const d of s.domaineIds || []) {
      const cle = String(d);
      if (!proprietaires.has(cle)) proprietaires.set(cle, new Set());
      proprietaires.get(cle).add(String(s.id));
    }
  }
  const parent = (s) => {
    if (!s.domainePrincipalId) return null;
    const ids = [...(proprietaires.get(String(s.domainePrincipalId)) || [])];
    if (ids.includes(String(s.id)) || ids.length !== 1) return null;
    return ids[0];
  };
  const racine = (s) => {
    const vus = new Set([String(s.id)]);
    let courant = s;
    for (let p = parent(courant); p; p = parent(courant)) {
      if (vus.has(p) || !parId.has(p)) return s; // cycle ou cible absente : aucune supposition
      vus.add(p);
      courant = parId.get(p);
    }
    return courant;
  };

  const groupes = new Map();
  for (const s of liste) {
    const r = racine(s);
    const cle = String(r.id);
    if (!groupes.has(cle)) groupes.set(cle, { site: r, membres: [] });
    if (r !== s) groupes.get(cle).membres.push(s);
  }

  return [...groupes.values()].map(({ site, membres }) => {
    const domaines = [...new Set([...(site.domaines || []), ...membres.flatMap((m) => m.domaines || [])])];
    return { ...site, domaines, fiches: [String(site.id), ...membres.map((m) => String(m.id))] };
  });
}

// Site principal (groupe) contenant un domaine donne, principal ou alias.
function groupeParDomaine(groupes, domaine) {
  const n = normaliser(domaine);
  if (!n) return null;
  const trouves = groupes.filter((g) => domainesDuSite(g).tous.includes(n));
  return trouves.length === 1 ? trouves[0] : null; // domaine ambigu : aucun choix arbitraire
}

module.exports = { normaliser, domainesDuSite, sitePrincipal, domaineAcces, regrouperSites, groupeParDomaine };
