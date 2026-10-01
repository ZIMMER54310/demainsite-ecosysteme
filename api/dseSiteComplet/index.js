"use strict";

const dse = require("../shared/dse");

/* =========================================================
   COMPOSANTS DIRECTEMENT LIES AU SITE
   ========================================================= */

const COMPOSANTS_SITE = {
  menu: {
    noms: [
      "OBJ-MENU-SITE"
    ],
    multiple: true
  },

  logo: {
    noms: [
      "OBJ-LOGO-SITE"
    ],
    multiple: false
  },

  entete: {
    noms: [
      "OBJ-ENTETE-SITE"
    ],
    multiple: false
  },

  theme: {
    noms: [
      "OBJ-THEME",
      "OBJ-THEME-SITE",
      "OBJ-THEME-PPW"
    ],
    multiple: false
  },

  seo: {
    noms: [
      "OBJ-SEO",
      "OBJ-SEO-SITE"
    ],
    multiple: false
  }
};

/* =========================================================
   LISTES DE CONTENU SPECIALISEES PAR MODULE
   ========================================================= */

const CONTENUS_MODULES = {
  hero: {
    noms: [
      "OBJ-MODULE-HERO"
    ]
  }
};

/* =========================================================
   SIMPLIFICATION DES COMPOSANTS
   ========================================================= */

function simplifierComposant(resultat) {
  if (!resultat.disponible) {
    return {
      disponible: false,
      liste: resultat.liste,
      listeId:
        resultat.listeId ||
        null,
      donnees: null
    };
  }

  if (resultat.multiple) {
    return {
      disponible: true,
      liste: resultat.liste,
      listeId:
        resultat.listeId ||
        null,
      donnees:
        resultat.elements
    };
  }

  return {
    disponible: true,
    liste: resultat.liste,
    listeId:
      resultat.listeId ||
      null,
    donnees:
      resultat.elements.length
        ? resultat.elements[0]
        : null
  };
}

/* =========================================================
   NORMALISATION DES IDS
   ========================================================= */

function idTexte(valeur) {
  if (
    valeur === null ||
    valeur === undefined
  ) {
    return null;
  }

  const id =
    String(valeur)
      .trim();

  return id || null;
}

function idsElements(elements) {
  if (!Array.isArray(elements)) {
    return [];
  }

  return elements
    .map(
      (element) =>
        idTexte(element?.id)
    )
    .filter(Boolean);
}

/* =========================================================
   EXTRACTION DES IDS DE RELATION
   ========================================================= */

function idsRelation(
  element,
  nomRelation
) {
  const relation =
    element?.relations?.[nomRelation];

  if (!relation) {
    return [];
  }

  const valeurs =
    Array.isArray(relation)
      ? relation
      : [relation];

  return valeurs
    .map(
      (valeur) =>
        idTexte(valeur?.id)
    )
    .filter(Boolean);
}

function premierIdRelation(
  element,
  nomRelation
) {
  const ids =
    idsRelation(
      element,
      nomRelation
    );

  return ids.length
    ? ids[0]
    : null;
}

/* =========================================================
   REGROUPEMENT DES ELEMENTS PAR PARENT
   ========================================================= */

function regrouperParRelation(
  elements,
  nomRelation
) {
  const regroupement =
    new Map();

  for (
    const element of
    Array.isArray(elements)
      ? elements
      : []
  ) {
    const idsParents =
      idsRelation(
        element,
        nomRelation
      );

    for (const idParent of idsParents) {
      if (
        !regroupement.has(idParent)
      ) {
        regroupement.set(
          idParent,
          []
        );
      }

      regroupement
        .get(idParent)
        .push(element);
    }
  }

  return regroupement;
}

/* =========================================================
   CONTENUS SPECIALISES DES MODULES
   ========================================================= */

async function chargerContenusSpecialises(
  token,
  siteGraphId,
  listes,
  modules,
  context
) {
  const moduleIds =
    idsElements(modules);

  const resultats = {};

  if (!moduleIds.length) {
    for (
      const cle of
      Object.keys(
        CONTENUS_MODULES
      )
    ) {
      resultats[cle] = {
        disponible: false,
        liste:
          CONTENUS_MODULES[cle]
            .noms[0],
        listeId: null,
        lookup: null,
        donnees: []
      };
    }

    return resultats;
  }

  for (
    const [
      cle,
      definition
    ] of Object.entries(
      CONTENUS_MODULES
    )
  ) {
    const resultat =
      await dse.chargerContenusModules(
        token,
        siteGraphId,
        listes,
        {
          nomsListeContenu:
            definition.noms,
          moduleItemIds:
            moduleIds
        }
      );

    resultats[cle] = {
      disponible:
        resultat.disponible,
      liste:
        resultat.liste,
      listeId:
        resultat.listeId ||
        null,
      lookup:
        resultat.lookup ||
        null,
      donnees:
        resultat.elements
    };

    if (cle === "hero") {
      resultats[cle].donnees =
        await hydraterMediasHero(
          token,
          siteGraphId,
          listes,
          resultat.elements,
          context
        );
    }
  }

  return resultats;
}

async function hydraterMediasHero(
  token,
  siteGraphId,
  listes,
  contenusHero,
  context
) {
  const listeMedia =
    dse.trouverListe(
      listes,
      ["OBJ-MEDIA"]
    );

  const relationsMedia =
    (Array.isArray(contenusHero)
      ? contenusHero
      : []
    ).map(
      (contenu) => {
        const nomRelation =
          Object.keys(
            contenu?.relations || {}
          ).find(
            (nom) =>
              nom
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "") ===
              "OBJMEDIA"
          );

        const relation =
          nomRelation
            ? contenu.relations[nomRelation]
            : null;

        return {
          relation,
          ids: idsRelation(
            contenu,
            nomRelation
          )
        };
      }
    );

  const idsMedia =
    dse.convertirIdsLookup(
      relationsMedia.flatMap(
        (relation) => relation.ids
      )
    );

  let medias = [];

  if (listeMedia && idsMedia.length) {
    try {
      medias =
        await dse.chargerElementsParIds(
          token,
          siteGraphId,
          listeMedia.id,
          idsMedia,
          (erreur, id) =>
            context.log.error(
              `OBJ-MEDIA ${id} non charge: ` +
              `${
                erreur.codeDse ||
                erreur.message
              }`
            )
        );
    } catch (erreur) {
      medias = [];
      context.log.error(
        "OBJ-MEDIA indisponible: " +
        `${
          erreur.codeDse ||
          erreur.message
        }`
      );
    }
  }

  const mediasParId =
    new Map(
      medias.map(
        (media) => [
          dse.convertirIdsLookup(
            media.id
          )[0] || null,
          media
        ]
      )
    );

  return (Array.isArray(contenusHero)
    ? contenusHero
    : []
  ).map(
    (contenu, index) => {
      const { relation, ids } =
        relationsMedia[index];

      let media = null;

      if (ids.length) {
        if (Array.isArray(relation)) {
          media =
            ids.map(
              (id) =>
                mediasParId.get(
                  dse.convertirIdsLookup(
                    id
                  )[0]
                ) ||
                null
            );
        } else {
          media =
            mediasParId.get(
              dse.convertirIdsLookup(
                ids[0]
              )[0]
            ) ||
            null;
        }
      }

      return {
        ...contenu,
        media
      };
    }
  );
}

/* =========================================================
   ASSOCIATION DES CONTENUS AUX MODULES
   ========================================================= */

function construireModulesAvecContenus(
  modules,
  contenusSpecialises
) {
  const contenusParType = {};

  for (
    const [
      cle,
      resultat
    ] of Object.entries(
      contenusSpecialises
    )
  ) {
    contenusParType[cle] =
      regrouperParRelation(
        resultat.donnees,
        "OBJ-MODULE-SITE-PUBLIC"
      );
  }

  return modules.map(
    (module) => {
      const moduleId =
        idTexte(module.id);

      const contenus = {};

      for (
        const [
          cle,
          groupes
        ] of Object.entries(
          contenusParType
        )
      ) {
        contenus[cle] =
          groupes.get(moduleId) ||
          [];
      }

      return {
        ...module,
        pageId:
          premierIdRelation(
            module,
            "OBJ-PAGES-SITE"
          ),
        contenus
      };
    }
  );
}

/* =========================================================
   ASSOCIATION DES MODULES AUX PAGES
   ========================================================= */

function construirePagesAvecModules(
  pages,
  modules
) {
  const modulesParPage =
    regrouperParRelation(
      modules,
      "OBJ-PAGES-SITE"
    );

  return pages.map(
    (page) => {
      const pageId =
        idTexte(page.id);

      return {
        ...page,
        siteId:
          premierIdRelation(
            page,
            "OBJ-SITE-PUBLIC"
          ),
        modules:
          modulesParPage.get(pageId) ||
          []
      };
    }
  );
}

/* =========================================================
   FONCTION AZURE
   ========================================================= */

module.exports =
  async function (
    context,
    req
  ) {
    const correlationId =
      dse.correlationId(req);

    try {
      /* -----------------------------------------------------
         VALIDATION DE L'ID SHAREPOINT DU SITE
         ----------------------------------------------------- */

      const siteIdDemande =
        String(
          req.params.siteId ||
          ""
        )
          .trim();

      if (
        !/^\d+$/.test(
          siteIdDemande
        )
      ) {
        throw dse.creerErreur(
          "DSE-API-ID-SITE-INVALIDE",
          400,
          "Identifiant SharePoint invalide"
        );
      }

      /* -----------------------------------------------------
         ACCES MICROSOFT GRAPH
         ----------------------------------------------------- */

      const token =
        await dse.obtenirJetonGraph();

      const siteGraph =
        await dse.obtenirSiteGraph(
          token
        );

      const listes =
        await dse.collecter(
          token,
          `/sites/${siteGraph.id}` +
          "/lists" +
          "?$select=" +
          "id,displayName,name,webUrl"
        );

      /* -----------------------------------------------------
         LISTE OBJ-SITE-PUBLIC
         ----------------------------------------------------- */

      const listeSite =
        dse.trouverListe(
          listes,
          [
            "OBJ-SITE-PUBLIC"
          ]
        );

      if (!listeSite) {
        throw dse.creerErreur(
          "DSE-API-LISTE-SITE-PUBLIC-ININTROUVABLE",
          404,
          "OBJ-SITE-PUBLIC introuvable"
        );
      }

      const colonnesSite =
        await dse.chargerColonnesListe(
          token,
          siteGraph.id,
          listeSite.id
        );

      /* -----------------------------------------------------
         ELEMENT SHAREPOINT DU SITE
         ----------------------------------------------------- */

      let itemSite;

      try {
        itemSite =
          await dse.graph(
            token,
            `/sites/${siteGraph.id}` +
            `/lists/${listeSite.id}` +
            `/items/${siteIdDemande}` +
            "?$expand=fields"
          );
      } catch (erreurGraph) {
        if (
          erreurGraph.status === 404
        ) {
          throw dse.creerErreur(
            "DSE-API-SITE-ININTROUVABLE",
            404,
            "Site public introuvable"
          );
        }

        throw erreurGraph;
      }

      const fieldsSite =
        itemSite.fields || {};

      /* -----------------------------------------------------
         PUBLICATION DU SITE
         ----------------------------------------------------- */

      const actifBrut =
        dse.trouverChamp(
          fieldsSite,
          colonnesSite,
          [
            "ACTIF",
            "ACTIVE"
          ]
        );

      const valideBrut =
        dse.trouverChamp(
          fieldsSite,
          colonnesSite,
          [
            "VALIDE",
            "VALIDATION",
            "PUBLIE"
          ]
        );

      const nom =
        dse.trouverChamp(
          fieldsSite,
          colonnesSite,
          [
            "NOMDUSITE",
            "NOMSITE",
            "TITRE",
            "TITLE"
          ]
        ) ||
        fieldsSite.Title ||
        null;

      /* -----------------------------------------------------
         COMPOSANTS DIRECTEMENT LIES AU SITE
         ----------------------------------------------------- */

      const resultatsSite = {};

      for (
        const [
          cle,
          definition
        ] of Object.entries(
          COMPOSANTS_SITE
        )
      ) {
        resultatsSite[cle] =
          simplifierComposant(
            await dse
              .chargerComposantSite(
                token,
                siteGraph.id,
                listes,
                definition,
                siteIdDemande
              )
          );
      }

      /* -----------------------------------------------------
         SITE → PAGES
         ----------------------------------------------------- */

      const resultatPages =
        await dse.chargerPagesSite(
          token,
          siteGraph.id,
          listes,
          siteIdDemande
        );

      const pages =
        resultatPages.elements || [];

      const pageIds =
        idsElements(pages);

      /* -----------------------------------------------------
         PAGES → MODULES
         ----------------------------------------------------- */

      const resultatModules =
        await dse.chargerModulesPages(
          token,
          siteGraph.id,
          listes,
          pageIds
        );

      const modules =
        resultatModules.elements || [];

      /* -----------------------------------------------------
         MODULES → CONTENUS SPECIALISES
         ----------------------------------------------------- */

      const contenusSpecialises =
        await chargerContenusSpecialises(
          token,
          siteGraph.id,
          listes,
          modules,
          context
        );

      const modulesAvecContenus =
        construireModulesAvecContenus(
          modules,
          contenusSpecialises
        );

      const pagesAvecModules =
        construirePagesAvecModules(
          pages,
          modulesAvecContenus
        );

      /* -----------------------------------------------------
         REPONSE JSON PUBLIQUE
         ----------------------------------------------------- */

      dse.reponseJson(
        context,
        req,
        200,
        {
          succes: true,

          donnees: {
            site: {
              id:
                String(
                  itemSite.id
                ),

              nom:
                nom === null
                  ? null
                  : String(nom),

              publication: {
                actif:
                  actifBrut === null
                    ? null
                    : dse
                      .booleenPublic(
                        actifBrut
                      ),

                valide:
                  valideBrut === null
                    ? null
                    : dse
                      .booleenPublic(
                        valideBrut
                      )
              },

              configuration:
                dse
                  .champsPublicsParNomAffiche(
                    fieldsSite,
                    colonnesSite
                  ),

              relations:
                await dse
                  .relationsLookup(
                    token,
                    siteGraph.id,
                    fieldsSite,
                    colonnesSite
                  )
            },

            pages: {
              disponible:
                resultatPages
                  .disponible,

              liste:
                resultatPages.liste,

              listeId:
                resultatPages
                  .listeId ||
                null,

              lookup:
                resultatPages.lookup ||
                null,

              donnees:
                pagesAvecModules
            },

            modules: {
              disponible:
                resultatModules
                  .disponible,

              liste:
                resultatModules.liste,

              listeId:
                resultatModules
                  .listeId ||
                null,

              lookup:
                resultatModules.lookup ||
                null,

              donnees:
                modulesAvecContenus
            },

            contenus:
              contenusSpecialises,

            menu:
              resultatsSite.menu,

            logo:
              resultatsSite.logo,

            entete:
              resultatsSite.entete,

            theme:
              resultatsSite.theme,

            seo:
              resultatsSite.seo
          },

          meta: {
            versionApi: "0.9",
            correlationId,
            genereLe:
              new Date()
                .toISOString()
          }
        },
        correlationId
      );
    } catch (erreur) {
      const status =
        erreur.status ||
        500;

      const messages = {
        "DSE-API-ID-SITE-INVALIDE":
          "L identifiant du site est invalide.",

        "DSE-API-LISTE-SITE-PUBLIC-ININTROUVABLE":
          "La source des sites publics est indisponible.",

        "DSE-API-SITE-ININTROUVABLE":
          "Le site public demande est introuvable."
      };

      context.log.error(
        `[DSE ${correlationId}] ` +
        `${
          erreur.codeDse ||
          erreur.message
        }`
      );

      dse.reponseJson(
        context,
        req,
        status,
        {
          succes: false,

          erreur: {
            code:
              erreur.codeDse ||
              "DSE-API-ERREUR-INTERNE",

            message:
              messages[
                erreur.codeDse
              ] ||
              "Le service DSE est indisponible."
          },

          meta: {
            versionApi: "0.9",
            correlationId,
            genereLe:
              new Date()
                .toISOString()
          }
        },
        correlationId
      );
    }
  };