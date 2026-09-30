"use strict";

const dse = require("../shared/dse");

module.exports = async function (context, req) {
  const correlationId = dse.correlationId(req);

  try {
    const siteIdDemande = String(req.params.siteId || "").trim();
    if (!/^\d+$/.test(siteIdDemande)) {
      throw dse.creerErreur("DSE-API-ID-SITE-INVALIDE", 400, "Identifiant SharePoint invalide");
    }

    const token = await dse.obtenirJetonGraph();
    const siteGraph = await dse.obtenirSiteGraph(token);

    const listes = await dse.collecter(
      token,
      `/sites/${siteGraph.id}/lists?$select=id,displayName,name,webUrl`
    );

    const liste = listes.find(
      (element) => String(element.displayName || element.name).toUpperCase() === "OBJ-SITE-PUBLIC"
    );

    if (!liste) {
      throw dse.creerErreur(
        "DSE-API-LISTE-SITE-PUBLIC-ININTROUVABLE",
        404,
        "Liste OBJ-SITE-PUBLIC introuvable"
      );
    }

    const colonnes = await dse.collecter(
      token,
      `/sites/${siteGraph.id}/lists/${liste.id}/columns?$select=id,name,displayName,hidden,lookup,boolean,text,number,dateTime`
    );

    let item;
    try {
      item = await dse.graph(
        token,
        `/sites/${siteGraph.id}/lists/${liste.id}/items/${siteIdDemande}?$expand=fields`
      );
    } catch (erreurGraph) {
      if (erreurGraph.status === 404) {
        throw dse.creerErreur("DSE-API-SITE-ININTROUVABLE", 404, "Site public introuvable");
      }
      throw erreurGraph;
    }

    const fields = item.fields || {};
    const champsPublics = dse.champsPublicsParNomAffiche(fields, colonnes);
    const relations = await dse.relationsLookup(token, siteGraph.id, fields, colonnes);

    const identifiantPermanent = dse.trouverChamp(
      fields,
      colonnes,
      ["IDOBJSITEPUBLIC", "IDSITEPUBLIC", "CODESITE"]
    );
    const nom = dse.trouverChamp(
      fields,
      colonnes,
      ["NOMDUSITE", "NOMSITE", "TITRE", "TITLE"]
    ) || fields.Title || null;
    const langue = dse.trouverChamp(fields, colonnes, ["LANGUE", "LANG"]);
    const actifBrut = dse.trouverChamp(fields, colonnes, ["ACTIF", "ACTIVE"]);
    const valideBrut = dse.trouverChamp(fields, colonnes, ["VALIDE", "VALIDATION", "PUBLIE"]);

    dse.reponseJson(context, req, 200, {
      succes: true,
      donnees: {
        id: String(item.id),
        identifiantPermanent: identifiantPermanent === null ? null : String(identifiantPermanent),
        nom: nom === null ? null : String(nom),
        langue: langue === null ? null : String(langue),
        publication: {
          actif: actifBrut === null ? null : dse.booleenPublic(actifBrut),
          valide: valideBrut === null ? null : dse.booleenPublic(valideBrut)
        },
        configuration: champsPublics,
        relations
      },
      meta: {
        versionApi: "0.9",
        correlationId,
        genereLe: new Date().toISOString()
      }
    }, correlationId);
  } catch (erreur) {
    const status = erreur.status || 500;
    const messages = {
      "DSE-API-ID-SITE-INVALIDE": "L identifiant du site est invalide.",
      "DSE-API-LISTE-SITE-PUBLIC-ININTROUVABLE": "La source des sites publics est indisponible.",
      "DSE-API-SITE-ININTROUVABLE": "Le site public demande est introuvable."
    };

    context.log.error(`[DSE ${correlationId}] ${erreur.codeDse || erreur.message}`);

    dse.reponseJson(context, req, status, {
      succes: false,
      erreur: {
        code: erreur.codeDse || "DSE-API-ERREUR-INTERNE",
        message: messages[erreur.codeDse] || "Le service DSE est indisponible."
      },
      meta: {
        versionApi: "0.9",
        correlationId,
        genereLe: new Date().toISOString()
      }
    }, correlationId);
  }
};
