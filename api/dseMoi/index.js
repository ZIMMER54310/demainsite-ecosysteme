"use strict";

const dse = require("../shared/dse");

module.exports = async function (context, req) {
  const correlationId = dse.correlationId(req);

  try {
    // =========================================================
    // 1. Fonctions locales
    // =========================================================

    function lireEntete(nom) {
      const headers = req.headers || {};
      const nomRecherche = String(nom).toLowerCase();

      const cle = Object.keys(headers).find(
        (k) => String(k).toLowerCase() === nomRecherche
      );

      return cle ? headers[cle] : null;
    }

    function normaliserTexte(valeur) {
      return String(valeur || "")
        .trim()
        .toLowerCase();
    }

    function normaliserNom(valeur) {
      return String(valeur || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();
    }

    function lireClaim(claims, noms) {
      const nomsNormalises = noms.map(normaliserTexte);

      const claim = claims.find((element) =>
        nomsNormalises.includes(
          normaliserTexte(element.typ)
        )
      );

      return claim && claim.val !== undefined
        ? String(claim.val)
        : null;
    }

    // =========================================================
    // 2. Identite fournie par Azure App Service Authentication
    // =========================================================

    const entraObjectIdEntete = lireEntete(
      "x-ms-client-principal-id"
    );

    const entraPrincipalName = lireEntete(
      "x-ms-client-principal-name"
    );

    const fournisseurIdentite = lireEntete(
      "x-ms-client-principal-idp"
    );

    const principalEncode = lireEntete(
      "x-ms-client-principal"
    );

    if (!entraObjectIdEntete || !principalEncode) {
      throw dse.creerErreur(
        "DSE-API-NON-AUTHENTIFIE",
        401,
        "Une connexion Microsoft Entra est necessaire."
      );
    }

    // =========================================================
    // 3. Decodage du principal Microsoft Entra
    // =========================================================

    let principal;

    try {
      principal = JSON.parse(
        Buffer.from(
          String(principalEncode),
          "base64"
        ).toString("utf8")
      );
    } catch (erreurDecodage) {
      throw dse.creerErreur(
        "DSE-API-IDENTITE-INVALIDE",
        401,
        "L'identite Microsoft Entra recue est invalide."
      );
    }

    const claims = Array.isArray(principal.claims)
      ? principal.claims
      : [];

    const entraObjectIdClaim = lireClaim(
      claims,
      [
        "oid",
        "http://schemas.microsoft.com/identity/claims/objectidentifier"
      ]
    );

    const entraObjectId =
      entraObjectIdClaim ||
      String(entraObjectIdEntete);

    const emailTechnique = lireClaim(
      claims,
      [
        "email",
        "emails",
        "preferred_username",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
      ]
    );

    const scopeBrut = lireClaim(
      claims,
      [
        "scp",
        "http://schemas.microsoft.com/identity/claims/scope"
      ]
    );

    const scopes = String(scopeBrut || "")
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean);

    if (
      scopes.length > 0 &&
      !scopes.includes("access_as_user")
    ) {
      throw dse.creerErreur(
        "DSE-API-AUTORISATION-ABSENTE",
        403,
        "L'autorisation access_as_user est absente."
      );
    }

    // =========================================================
    // 4. Connexion a Microsoft Graph et SharePoint
    // =========================================================

    const token = await dse.obtenirJetonGraph();
    const siteGraph = await dse.obtenirSiteGraph(token);

    // =========================================================
    // 5. Recherche de la liste OBJ-CLIENT
    // =========================================================

    const listes = await dse.collecter(
      token,
      `/sites/${siteGraph.id}/lists?$select=id,displayName,name,webUrl`
    );

    const listeClient = listes.find((liste) => {
      const nom = normaliserNom(
        liste.displayName || liste.name
      );

      return nom === "objclient";
    });

    if (!listeClient) {
      throw dse.creerErreur(
        "DSE-API-OBJ-CLIENT-INTROUVABLE",
        500,
        "La liste OBJ-CLIENT est introuvable."
      );
    }

    // =========================================================
    // 6. Lecture des colonnes et elements OBJ-CLIENT
    // =========================================================

    const colonnes = await dse.collecter(
      token,
      `/sites/${siteGraph.id}/lists/${listeClient.id}/columns?$select=id,name,displayName,hidden,lookup`
    );

    const items = await dse.collecter(
      token,
      `/sites/${siteGraph.id}/lists/${listeClient.id}/items?$expand=fields&$top=200`
    );

    // =========================================================
    // 7. Rapprochement Entra Object ID vers OBJ-CLIENT
    // =========================================================

    let client = null;

    for (const item of items) {
      const champs = item.fields || {};

      const objectIdClient = dse.trouverChamp(
        champs,
        colonnes,
        ["entraobjectid"]
      );

      if (
        objectIdClient &&
        normaliserTexte(objectIdClient) ===
          normaliserTexte(entraObjectId)
      ) {
        client = item;
        break;
      }
    }

    if (!client) {
      throw dse.creerErreur(
        "DSE-API-CLIENT-NON-AUTORISE",
        403,
        "Le compte Microsoft Entra n'est rattache a aucun client DSE."
      );
    }

    const fields = client.fields || {};

    // =========================================================
    // 8. Resolution generique d'un Lookup SharePoint DSE
    // =========================================================

    async function resoudreLookup(
      motifsColonne,
      champsSource
    ) {
      const motifs = motifsColonne.map(normaliserNom);

      const colonne = colonnes.find((element) => {
        const noms = [
          element.name,
          element.displayName
        ].map(normaliserNom);

        return motifs.some((motif) =>
          noms.some((nom) => nom.includes(motif))
        );
      });

      if (
        !colonne ||
        !colonne.lookup ||
        !colonne.lookup.listId
      ) {
        return {
          valeur: null,
          lookupId: null,
          colonne: colonne || null
        };
      }

      const cleLookup = `${colonne.name}LookupId`;

      let lookupId = fields[cleLookup];

      if (
        lookupId === null ||
        lookupId === undefined
      ) {
        const cleReelle = Object.keys(fields).find(
          (cle) =>
            normaliserNom(cle) ===
            normaliserNom(cleLookup)
        );

        lookupId = cleReelle
          ? fields[cleReelle]
          : null;
      }

      if (Array.isArray(lookupId)) {
        lookupId = lookupId.length > 0
          ? lookupId[0]
          : null;
      }

      if (
        lookupId === null ||
        lookupId === undefined ||
        String(lookupId).trim() === ""
      ) {
        return {
          valeur: null,
          lookupId: null,
          colonne
        };
      }

      const itemLookup = await dse.graph(
        token,
        `/sites/${siteGraph.id}/lists/${colonne.lookup.listId}/items/${lookupId}?$expand=fields`
      );

      const lookupFields =
        itemLookup && itemLookup.fields
          ? itemLookup.fields
          : {};

      const champsRecherches =
        champsSource.map(normaliserNom);

      for (const cle of Object.keys(lookupFields)) {
        if (
          champsRecherches.includes(
            normaliserNom(cle)
          )
        ) {
          return {
            valeur: lookupFields[cle],
            lookupId: String(lookupId),
            colonne
          };
        }
      }

      return {
        valeur:
          lookupFields.Title !== undefined
            ? lookupFields.Title
            : null,

        lookupId: String(lookupId),
        colonne
      };
    }

    // =========================================================
    // 9. Resolution des trois Lookups verifies dans SharePoint
    // =========================================================

    const lookupActif = await resoudreLookup(
      ["objactif"],
      ["actif", "title"]
    );

    const lookupValide = await resoudreLookup(
      ["objvalide"],
      ["title"]
    );

    const lookupVerrouille = await resoudreLookup(
      ["objverouille"],
      ["title"]
    );

    // =========================================================
    // 10. Donnees publiques du client
    // =========================================================

    const idClient =
      dse.trouverChamp(
        fields,
        colonnes,
        ["idclient"]
      ) || client.id;

    const titreClient =
      dse.trouverChamp(
        fields,
        colonnes,
        [
          "titreobjclient",
          "nomclient",
          "title",
          "titre"
        ]
      ) ||
      fields.Title ||
      null;

    const emailClient =
      dse.trouverChamp(
        fields,
        colonnes,
        ["entraemail"]
      ) || null;

    const statutEntra =
      dse.trouverChamp(
        fields,
        colonnes,
        ["entrastatut"]
      ) || null;

    const actifPublic =
      lookupActif.valeur === null ||
      lookupActif.valeur === undefined
        ? null
        : dse.booleenPublic(
            lookupActif.valeur
          );

    const validePublic =
      lookupValide.valeur === null ||
      lookupValide.valeur === undefined
        ? null
        : dse.booleenPublic(
            lookupValide.valeur
          );

    const verrouillePublic =
      lookupVerrouille.valeur === null ||
      lookupVerrouille.valeur === undefined
        ? null
        : dse.booleenPublic(
            lookupVerrouille.valeur
          );

    // =========================================================
    // 11. Reponse DSE
    // =========================================================

    dse.reponseJson(
      context,
      req,
      200,
      {
        succes: true,

        donnees: {
          utilisateur: {
            entraObjectId:
              String(entraObjectId),

            principal:
              entraPrincipalName === null
                ? null
                : String(entraPrincipalName),

            emailTechnique:
              emailTechnique === null
                ? null
                : String(emailTechnique),

            fournisseur:
              fournisseurIdentite === null
                ? null
                : String(fournisseurIdentite)
          },

          client: {
            id: String(idClient),

            titre:
              titreClient === null
                ? null
                : String(titreClient),

            email:
              emailClient === null
                ? null
                : String(emailClient),

            statutEntra:
              statutEntra === null
                ? null
                : String(statutEntra),

            etat: {
              actif: actifPublic,
              valide: validePublic,
              verrouille:
                verrouillePublic
            },

            references: {
              actifLookupId:
                lookupActif.lookupId,

              valideLookupId:
                lookupValide.lookupId,

              verrouilleLookupId:
                lookupVerrouille.lookupId
            }
          }
        },

        meta: {
          versionApi: "0.9",
          correlationId,
          genereLe:
            new Date().toISOString()
        }
      },
      correlationId
    );
  } catch (erreur) {
    const status = erreur.status || 500;

    const messages = {
      "DSE-API-NON-AUTHENTIFIE":
        "Une connexion Microsoft Entra est necessaire.",

      "DSE-API-IDENTITE-INVALIDE":
        "L'identite Microsoft Entra recue est invalide.",

      "DSE-API-AUTORISATION-ABSENTE":
        "Le compte ne dispose pas de l'autorisation requise.",

      "DSE-API-OBJ-CLIENT-INTROUVABLE":
        "La source OBJ-CLIENT est indisponible.",

      "DSE-API-CLIENT-NON-AUTORISE":
        "Ce compte n'est pas rattache a un client DSE."
    };

    context.log.error(
      `[DSE ${correlationId}] ${
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
            messages[erreur.codeDse] ||
            erreur.message ||
            "Le service DSE est indisponible."
        },

        meta: {
          versionApi: "0.9",
          correlationId,
          genereLe:
            new Date().toISOString()
        }
      },
      correlationId
    );
  }
};