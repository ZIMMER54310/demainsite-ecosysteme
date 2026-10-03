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

module.exports = { normaliser, domainesDuSite, sitePrincipal, domaineAcces };
