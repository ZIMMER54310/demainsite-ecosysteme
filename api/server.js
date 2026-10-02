"use strict";

require("dotenv").config();

const express = require("express");

const controleurEtat =
  require("./dseEtat");

const controleurSiteParDomaine =
  require("./dseSiteParDomaine");

const controleurSiteParId =
  require("./dseSiteParId");

const controleurSiteComplet =
  require("./dseSiteComplet");

const controleurBuilder = require("./dsePageBuilder");

const controleurCatalogue =
  require("./dseCatalogue");

const routeMedia =
  require("./media");

const application = express();

application.disable("x-powered-by");
application.set("trust proxy", 1);

application.use(
  express.json({
    limit: "1mb"
  })
);

function originesAutorisees() {
  return String(
    process.env.DSE_ALLOWED_ORIGINS || ""
  )
    .split(",")
    .map(
      (origine) =>
        origine.trim()
    )
    .filter(Boolean);
}

application.use(
  (req, res, suivant) => {
    const origine =
      req.headers.origin;

    const autorisees =
      originesAutorisees();

    if (
      origine &&
      autorisees.includes(origine)
    ) {
      res.setHeader(
        "Access-Control-Allow-Origin",
        origine
      );

      res.setHeader(
        "Vary",
        "Origin"
      );
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Accept,Content-Type,Authorization"
    );

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    suivant();
  }
);

function adapterControleur(
  controleur
) {
  return async function (
    req,
    res
  ) {
    const contexte = {
      res: null,

      log: {
        info:
          (...argumentsLog) =>
            console.log(...argumentsLog),

        warn:
          (...argumentsLog) =>
            console.warn(...argumentsLog),

        error:
          (...argumentsLog) =>
            console.error(...argumentsLog)
      }
    };

    try {
      await controleur(
        contexte,
        req
      );

      const resultat =
        contexte.res || {};

      const status =
        Number(
          resultat.status ||
          resultat.statusCode ||
          200
        );

      const headers =
        resultat.headers || {};

      for (
        const [nom, valeur]
        of Object.entries(headers)
      ) {
        if (
          valeur !== undefined &&
          valeur !== null
        ) {
          res.setHeader(
            nom,
            String(valeur)
          );
        }
      }

      if (
        resultat.body === undefined ||
        resultat.body === null
      ) {
        return res
          .status(status)
          .end();
      }

      if (
        typeof resultat.body === "object"
      ) {
        return res
          .status(status)
          .json(resultat.body);
      }

      return res
        .status(status)
        .send(resultat.body);
    } catch (erreur) {
      console.error(
        "[DSE API OVH]",
        erreur
      );

      return res
        .status(
          erreur.status || 500
        )
        .json({
          succes: false,

          erreur: {
            code:
              erreur.codeDse ||
              "DSE-API-ERREUR-INTERNE",

            message:
              "Le service DSE est indisponible."
          },

          meta: {
            genereLe:
              new Date()
                .toISOString()
          }
        });
    }
  };
}

application.get(
  "/api/v1/etat",
  adapterControleur(
    controleurEtat
  )
);

/*
 * AUTHENTIFICATION UTILISATEUR DSE : desactivee temporairement.
 * Les en-tetes x-ms-client-principal* provenaient d'Azure App Service
 * Authentication et ne prouvent aucune identite sur OVH.
 * dseMoi/ n'est volontairement plus charge tant qu'une authentification
 * Entra native (validation JWT) n'est pas implementee.
 */
application.all(
  "/api/v1/moi",
  (req, res) => {
    res
      .status(501)
      .set("Cache-Control", "no-store")
      .json({
        succes: false,

        erreur: {
          code:
            "DSE-AUTHENTIFICATION-DESACTIVEE",

          message:
            "L'authentification utilisateur est temporairement desactivee."
        },

        meta: {
          genereLe:
            new Date()
              .toISOString()
        }
      });
  }
);

application.get(
  "/api/v1/sites/par-domaine",
  adapterControleur(
    controleurSiteParDomaine
  )
);

application.get(
  "/api/v1/site/:siteId",
  adapterControleur(
    controleurSiteParId
  )
);

application.get(
  "/api/v1/site-complet/:siteId",
  adapterControleur(
    controleurSiteComplet
  )
);

/*
 * CATALOGUE MULTIPLATEFORME (articles, produits, services).
 * Le site est deduit du parametre ?domaine= ; la boutique commune
 * est la route produits (un produit existe une seule fois dans SharePoint).
 */
for (
  const [chemin, nom] of [
    ["catalogue", "catalogue"],
    ["articles", "articles"],
    ["produits", "produits"],
    ["boutique", "produits"],
    ["services", "services"],
    ["themes", "themes"],
    ["recherche", "recherche"]
  ]
) {
  application.get(
    `/api/v1/${chemin}`,
    adapterControleur(
      controleurCatalogue[nom]
    )
  );
}

application.get(
  "/api/v1/catalogue/element/:cle",
  adapterControleur(
    controleurCatalogue.element
  )
);

application.get("/api/v1/builder/page", adapterControleur(controleurBuilder.page));
application.get("/api/v1/builder/page/:pageId", adapterControleur(controleurBuilder.pageParId));
application.get("/api/v1/builder/modeles", adapterControleur(controleurBuilder.modeles));
application.get("/api/v1/builder/types-modules", adapterControleur(controleurBuilder.typesModules));

application.get(
  "/api/v1/media/:mediaId",
  routeMedia
);

application.use(
  "/api",
  (req, res) => {
    res.status(404).json({
      succes: false,

      erreur: {
        code:
          "DSE-API-ROUTE-ININTROUVABLE",

        message:
          "La route demandee est introuvable."
      },

      meta: {
        genereLe:
          new Date()
            .toISOString()
      }
    });
  }
);

const port =
  Number(
    process.env.PORT || 3000
  );

const serveur =
  application.listen(
    port,
    "127.0.0.1",
    () => {
      console.log(
        `[DSE API OVH] Disponible sur 127.0.0.1:${port}`
      );
    }
  );

function arreter(signal) {
  console.log(
    `[DSE API OVH] Arret demande : ${signal}`
  );

  serveur.close(
    () => {
      console.log(
        "[DSE API OVH] Arret termine"
      );

      process.exit(0);
    }
  );
}

process.on(
  "SIGTERM",
  () => arreter("SIGTERM")
);

process.on(
  "SIGINT",
  () => arreter("SIGINT")
);
