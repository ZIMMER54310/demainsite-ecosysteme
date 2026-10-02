"use strict";

const dse = require("../shared/dse");
const resoudreur = require("../shared/resolveur-domaine");
const builder = require("../shared/builder");
const source = require("../shared/builder-source");

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
  if (r.type === "construction") return { site: null, construction: true };
  if (r.type !== "site") throw dse.creerErreur("DSE-API-SITE-ININTROUVABLE", 404, "Domaine inconnu");
  return { site: { id: String(r.site.id) } };
}

function fabrique(construire) {
  return async function (context, req) {
    const id = dse.correlationId(req);
    try {
      const { site, construction } = await contexteDomaine(req);
      const donnees = construction ? { mode: "construction", sections: [] } : construire({ donnees: await source.obtenirDonnees(), site, req });
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

const sortie = (r) => ({ mode: r.mode, sections: r.sections.map((s) => ({ ...s, lignes: s.lignes.map((l) => ({ ...l,
  colonnes: l.colonnes.map((c) => ({ ...c, modules: c.modules.map(({ _id, ...m }) => m) })) })) })) });

module.exports = {
  page: fabrique(({ donnees, site, req }) => sortie(builder.composerPage(donnees, site, { appareil: req.query.appareil, route: req.query.route || "/" }))),
  // Un ID de page n'est accepte que s'il appartient au site du domaine.
  pageParId: fabrique(({ donnees, site, req }) => sortie(builder.composerPage(donnees, site, { pageId: String(req.params.pageId || "").replace(/\D/g, ""), appareil: req.query.appareil }))),
  modeles: fabrique(({ donnees, site }) => ({ modeles: builder.listerModeles(donnees, site) })),
  typesModules: fabrique(({ donnees }) => ({ types: builder.listerTypes(donnees) }))
};
