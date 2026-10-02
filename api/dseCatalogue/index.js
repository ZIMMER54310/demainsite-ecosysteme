"use strict";

const dse = require("../shared/dse");
const catalogue = require("../shared/catalogue");
const source = require("../shared/catalogue-source");

const MESSAGES = {
  "DSE-API-DOMAINE-INVALIDE": "Le domaine fourni est invalide.",
  "DSE-API-SITE-ININTROUVABLE": "Aucun site public ne correspond au domaine demandé.",
  "DSE-API-CATALOGUE-ELEMENT-ININTROUVABLE": "Contenu introuvable.",
  "DSE-API-CATALOGUE-CLE-INVALIDE": "Identifiant de contenu invalide."
};

const meta = (id) => ({ versionApi: "0.9", correlationId: id, genereLe: new Date().toISOString() });

// Le site courant est TOUJOURS deduit du domaine : aucun ID de site n'est accepte du client.
async function contexteDomaine(req) {
  const domaine = dse.normaliserDomaine(req.query.domaine);

  if (!domaine || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domaine)) {
    throw dse.creerErreur("DSE-API-DOMAINE-INVALIDE", 400, "Domaine invalide");
  }

  const index = await source.obtenirIndex();
  const site = catalogue.siteDuDomaine(index, domaine);

  if (!site) {
    throw dse.creerErreur("DSE-API-SITE-ININTROUVABLE", 404, "Domaine inconnu");
  }

  return { index, site };
}

function fabrique(construireReponse) {
  return async function (context, req) {
    const id = dse.correlationId(req);

    try {
      const { index, site } = await contexteDomaine(req);
      const donnees = construireReponse({ index, site, req });

      dse.reponseJson(context, req, 200, { succes: true, donnees, meta: meta(id) }, id);
    } catch (e) {
      context.log.error(`[DSE ${id}] ${e.codeDse || e.message}`);

      dse.reponseJson(context, req, e.status || 500, {
        succes: false,
        erreur: {
          code: e.codeDse || "DSE-API-ERREUR-INTERNE",
          message: MESSAGES[e.codeDse] || "Le service DSE est indisponible."
        },
        meta: meta(id)
      }, id);
    }
  };
}

// Reponse commune : le site n'est decrit que par son identite publique.
function enveloppe(site, resultat) {
  return {
    site: { id: site.id, nom: site.titre, portail: Boolean(site.portail) },
    ...resultat
  };
}

const parType = (types) =>
  fabrique(({ index, site, req }) =>
    enveloppe(site, catalogue.interroger(index, site, req.query, { types })));

module.exports = {
  catalogue: parType(null),
  articles: parType(["article"]),
  produits: parType(["produit"]),
  services: parType(["service"]),

  recherche: fabrique(({ index, site, req }) => {
    const q = catalogue.normaliserTexte(req.query.q);

    // Recherche trop courte : resultat vide propre, pas d'erreur.
    if (q.length < 2) {
      return enveloppe(site, catalogue.interroger(index, site, { ...req.query, q: "", limite: 1 }, { types: [] }));
    }

    return enveloppe(site, catalogue.interroger(index, site, req.query, {}));
  }),

  themes: fabrique(({ index, site }) =>
    enveloppe(site, catalogue.referentielsDuSite(index, site, null))),

  element: fabrique(({ index, site, req }) => {
    const cle = String(req.params.cle || "");

    if (!/^(article|produit|service)-\d+$/.test(cle)) {
      throw dse.creerErreur("DSE-API-CATALOGUE-CLE-INVALIDE", 400, "Cle invalide");
    }

    const resultat = catalogue.detail(index, site, cle);

    if (!resultat) {
      throw dse.creerErreur("DSE-API-CATALOGUE-ELEMENT-ININTROUVABLE", 404, "Introuvable");
    }

    return enveloppe(site, resultat);
  })
};
