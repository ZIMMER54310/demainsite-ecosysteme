"use strict";

const dse = require("../shared/dse");
const resoudreur = require("../shared/resolveur-domaine");
const builder = require("../shared/builder");
const source = require("../shared/builder-source");
const statutsSite = require("../shared/statuts-site");

const MESSAGES = {
  "DSE-API-DOMAINE-INVALIDE": "Le domaine fourni est invalide.",
  "DSE-API-SITE-ININTROUVABLE": "Aucun site public ne correspond au domaine demandé."
};

const meta = (id) => ({ versionApi: "0.9", correlationId: id, genereLe: new Date().toISOString() });

// Le site est TOUJOURS deduit du domaine : aucun ID de site n'est accepte du client.
async function contexteDomaine(req) {
  const domaine = dse.normaliserDomaine(req.query.domaine);
  if (!domaine || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domaine)) {
    throw dse.creerErreur("DSE-API-DOMAINE-INVALIDE", 400, "Domaine invalide");
  }

  const r = await resoudreur.resoudreDomaine(domaine);
  if (r.type === "declare") return { site: null, mode: "situation" };
  if (r.type !== "site") throw dse.creerErreur("DSE-API-SITE-ININTROUVABLE", 404, "Domaine inconnu");
  // Seul le vrai site (ACTIF ou transition historique) est compose ; toute autre situation
  // est rendue par la page generique, sans contenu Builder.
  if (!statutsSite.periodeApplicable(r.site).applicable || !statutsSite.afficheVraiSite(r.statut.rendu)) {
    return { site: null, mode: "situation" };
  }
  return {
    site: { id: String(r.site.id) },
    pageId: r.site.pagePubliqueId ? String(r.site.pagePubliqueId) : null
  };
}

function fabrique(construire) {
  return async function (context, req) {
    const id = dse.correlationId(req);
    try {
      const { site, pageId, mode } = await contexteDomaine(req);
      const donnees = mode
        ? { mode, sections: [] }
        : construire({ donnees: await source.obtenirDonnees(), site, pageId, req });
      dse.reponseJson(context, req, 200, { succes: true, donnees, meta: meta(id) }, id);
    } catch (e) {
      context.log.error(`[DSE ${id}] ${e.codeDse || e.message}`);
      dse.reponseJson(context, req, e.status || 500, {
        succes: false,
        erreur: { code: e.codeDse || "DSE-API-ERREUR-INTERNE", message: MESSAGES[e.codeDse] || "Le service DSE est indisponible." },
        meta: meta(id)
      }, id);
    }
  };
}

// Retire les ID internes (_id) a tous les niveaux ; seule la reference signee d'apercu (_ref) peut subsister.
const sansId = ({ _id, ...x }) => x;
const nettoyer = (sections) => (sections || []).map((s) => ({ ...sansId(s), lignes: (s.lignes || []).map((l) => ({ ...sansId(l),
  colonnes: (l.colonnes || []).map((c) => ({ ...sansId(c), modules: (c.modules || []).map(sansId) })) })) }));
const zone = (z) => ({ sections: nettoyer(z.sections), ...(z.noeuds ? { noeuds: z.noeuds } : {}),
  ...(z.style ? { style: z.style } : {}), ...(z.responsive ? { responsive: z.responsive } : {}) });
const sortie = (r) => ({ mode: r.mode, sections: nettoyer(r.sections),
  ...(r.noeuds ? { noeuds: r.noeuds } : {}),
  ...(typeof r.page?.bandeauChantier === "boolean" ? { bandeauChantier: r.page.bandeauChantier } : {}),
  ...(r.page?.style ? { style: r.page.style, responsive: r.page.responsive || {} } : {}),
  ...(r.theme && Object.keys(r.theme).length ? { theme: r.theme } : {}),
  ...(r.entete ? { entete: zone(r.entete) } : {}),
  ...(r.footer ? { footer: zone(r.footer) } : {}) });

module.exports = {
  nettoyer, zone,
  page: fabrique(({ donnees, site, pageId, req }) => sortie(builder.composerPage(donnees, site, {
    appareil: req.query.appareil,
    pageId: pageId || undefined,
    route: pageId ? undefined : req.query.route || "/"
  }))),
  // Un ID de page n'est accepte que s'il appartient au site du domaine.
  pageParId: fabrique(({ donnees, site, req }) => sortie(builder.composerPage(donnees, site, {
    pageId: String(req.params.pageId || "").replace(/\D/g, ""),
    appareil: req.query.appareil
  }))),
  modeles: fabrique(({ donnees, site }) => ({ modeles: builder.listerModeles(donnees, site) })),
  typesModules: fabrique(({ donnees }) => ({ types: builder.listerTypes(donnees) }))
};
