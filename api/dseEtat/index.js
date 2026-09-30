"use strict";
const dse = require("../shared/dse");
module.exports = async function (context, req) {
  const id = dse.correlationId(req);
  try {
    const token = await dse.obtenirJetonGraph();
    const site = await dse.obtenirSiteGraph(token);
    dse.reponseJson(context, req, 200, {
      succes: true,
      donnees: {
        service: "DSE-API", version: "0.9", statut: "Disponible",
        identiteGereeAccessible: true, microsoftGraphAccessible: true, sharePointAccessible: true,
        site: { id: site.id, nom: site.displayName, url: site.webUrl }
      },
      meta: { correlationId: id, genereLe: new Date().toISOString() }
    }, id);
  } catch (e) {
    dse.reponseJson(context, req, e.status || 500, {
      succes: false,
      erreur: { code: e.codeDse || "DSE-API-ERREUR-INTERNE", message: "Service DSE indisponible." },
      meta: { correlationId: id, genereLe: new Date().toISOString() }
    }, id);
  }
};
