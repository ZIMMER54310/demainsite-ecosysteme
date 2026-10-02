"use strict";
// Controle LECTURE SEULE HERO/FOOTER par domaine, via l'API locale.
// Usage : npm run test:rendu-domaines [-- dom1 dom2 ...]   (defaut : DSE_RENDU_DOMAINES ou 4 sites prioritaires)
const path = require("path");
const API = process.env.DSE_API_BASE || "http://127.0.0.1:3000";
const domaines = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (process.env.DSE_RENDU_DOMAINES || "dseco.fr,demainsite.fr,pasclaure.fr,blogs-site.fr").split(",");

const get = async (p) => {
  const r = await fetch(API + p);
  return { status: r.status, corps: await r.json().catch(() => null) };
};
const actif = (e, rel, id) => [].concat(e?.relations?.[rel] ?? []).some((x) => String(x?.id) === id);
const publie = (e) => actif(e, "OBJ-ACTIF", "1") && actif(e, "OBJ-VALIDE", "1");

(async () => {
  console.log("DEBUT test rendu HERO/FOOTER (lecture seule)");
  console.log("DOMAINE | ETAT | SITE | PAGE | HERO | FOOTER | RESULTAT");
  let echec = false;
  for (const d of domaines) {
    const r = await get(`/api/v1/sites/par-domaine?domaine=${encodeURIComponent(d)}`);
    const site = r.corps?.donnees;
    if (r.status !== 200 || !site) { console.log(`${d} | ${r.status} | - | - | - | - | DOMAINE INCONNU`); echec = true; continue; }
    let page = "-", hero = "-", footer = "-";
    if (site.etat === "normal" && site.id) {
      const c = (await get(`/api/v1/site-complet/${site.id}`)).corps?.donnees;
      const p = (c?.pages?.donnees ?? []).find((x) => publie(x));
      page = p ? "oui" : "non";
      const mods = (c?.modules?.donnees ?? c?.modules ?? []).filter((m) => String(m.pageId) === String(p?.id) && publie(m));
      const a = (cle) => mods.some((m) => (m.contenus?.[cle] ?? []).some(publie)) ? "oui" : "non";
      hero = a("hero"); footer = a("footer");
    }
    const res = site.etat === "normal" ? (hero === "oui" ? "OK" : "INCOMPLET") : "CONSTRUCTION";
    console.log(`${d} | ${site.etat} | ${site.id ?? "-"} | ${page} | ${hero} | ${footer} | ${res}`);
  }
  console.log("FIN\nTERMINÉ");
  process.exit(echec ? 1 : 0);
})().catch((e) => { console.log("ERREUR", e.message); process.exit(1); });
