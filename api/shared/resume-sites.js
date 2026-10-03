"use strict";

/*
 * Resume leger de tous les sites pour « Mes sites » : chaque liste SharePoint est lue
 * UNE fois (et non site-complet par site), puis repartie par ID natifs avec les memes
 * regles que site-complet (memes listes, meme selection des pages selon le statut).
 * Le resultat a la forme attendue par cockpit.vueSite : la progression est donc calculee
 * par le meme moteur que la fiche site. Lecture seule.
 */

const dse = require("./dse");
const catalogueSource = require("./catalogue-source");
const statutsSite = require("./statuts-site");
const siteComplet = require("../dseSiteComplet");

let cache = null;
let enCours = null;

const dureeCacheMs = () => {
  const s = Number(process.env.DSE_CATALOGUE_CACHE_SECONDES);
  return (Number.isFinite(s) && s >= 0 ? s : 60) * 1000;
};

const idListe = (id) => String(id || "").toLowerCase();

async function lireListe(token, siteGraphId, listes, noms, mediaListId, cacheTitres) {
  const liste = dse.trouverListe(listes, noms);
  if (!liste) return { disponible: false, liste: null, elements: [] };
  const elements = await catalogueSource.lireElements(token, siteGraphId, liste, cacheTitres);
  for (const el of elements) el.media = statutsSite.mediaElement(el._colonnes, el._fields, mediaListId);
  return { disponible: true, liste, elements };
}

// Elements dont un Lookup vers la liste parente contient l'un des IDs attendus.
function liesA(resultat, listeParente, ids) {
  if (!resultat.disponible || !listeParente) return [];
  const attendus = new Set([].concat(ids).map(String));
  if (!attendus.size) return [];
  return resultat.elements.filter((el) => {
    const colonne = dse.trouverColonneLookupVersListe(el._colonnes, listeParente.id);
    return colonne && dse.idsLookupColonne(el._fields, colonne).some((id) => attendus.has(id));
  });
}

const publics = (elements) => {
  const sortie = elements.map(({ _fields, _colonnes, ...reste }) => reste);
  dse.trierElements(sortie);
  return sortie;
};

async function chargerResumes() {
  const index = await catalogueSource.obtenirIndex();
  const token = await dse.obtenirJetonGraph();
  const siteGraph = await dse.obtenirSiteGraph(token);
  const listes = await dse.collecter(token, `/sites/${siteGraph.id}/lists?$select=id,displayName,name`);
  const listeSite = dse.trouverListe(listes, ["OBJ-SITE-PUBLIC"]);
  const listeMedia = dse.trouverListe(listes, ["OBJ-MEDIA"]);
  const mediaListId = listeMedia ? idListe(listeMedia.id) : null;
  const cacheTitres = new Map();
  const lire = (noms) => lireListe(token, siteGraph.id, listes, noms, mediaListId, cacheTitres);

  const composants = Object.entries(siteComplet.COMPOSANTS_SITE);
  const contenus = Object.entries(siteComplet.CONTENUS_MODULES);
  const [resComposants, pages, modules, resContenus] = await Promise.all([
    Promise.all(composants.map(([, d]) => lire(d.noms))),
    lire(["OBJ-PAGES-SITE"]),
    lire(["OBJ-MODULE-SITE-PUBLIC"]),
    Promise.all(contenus.map(([, d]) => lire(d.noms)))
  ]);

  const resumes = new Map();
  for (const [id, info] of index.sites) {
    const sc = { site: { nom: null } };
    composants.forEach(([cle], i) => {
      const r = resComposants[i];
      sc[cle] = {
        disponible: r.disponible,
        donnees: r.disponible
          ? publics(r.elements.filter((el) => dse.correspondAuSite(el._fields, el._colonnes, id, listeSite?.id || null)))
          : []
      };
    });

    const decision = statutsSite.decider(info, index.statuts);
    const selection = siteComplet.pagesPourStatut(
      publics(liesA(pages, listeSite, [id])), info, decision.rendu, statutsSite.periodeApplicable(info).applicable
    );
    const pageIds = selection.pages.map((p) => String(p.id));
    const modulesSite = liesA(modules, pages.liste, pageIds);
    const idsModules = modulesSite.map((m) => String(m.id));
    const tousContenus = Object.fromEntries(contenus.map(([cle], i) => [cle, {
      disponible: resContenus[i].disponible,
      donnees: publics(liesA(resContenus[i], modules.liste, idsModules))
    }]));

    sc.pages = { disponible: pages.disponible, donnees: selection.vraiSite ? selection.pages : [] };
    sc.contenus = selection.vraiSite ? tousContenus : { footer: tousContenus.footer };
    resumes.set(String(id), sc);
  }
  return resumes;
}

async function obtenirResumes() {
  if (cache && Date.now() - cache.le < dureeCacheMs()) return cache.resumes;
  if (!enCours) {
    enCours = chargerResumes()
      .then((resumes) => { cache = { le: Date.now(), resumes }; return resumes; })
      .finally(() => { enCours = null; });
  }
  return enCours;
}

module.exports = { obtenirResumes };
