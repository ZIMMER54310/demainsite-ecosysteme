"use strict";
const dse = require("../shared/dse");
const { execFileSync } = require("child_process");
const path = require("path");
const demarreLe = new Date().toISOString();
let commit = null;
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: path.resolve(__dirname, "../.."), encoding: "utf8" }).trim();
} catch (e) {
  console.error("[DSE version] Commit de démarrage indisponible :", e.message);
}
module.exports = async function (context, req) {
  const id = dse.correlationId(req);
  try {
    const token = await dse.obtenirJetonGraph();
    const site = await dse.obtenirSiteGraph(token);
    dse.reponseJson(context, req, 200, {
      succes: true,
      donnees: {
        service: "DSE-API", version: "0.9", statut: "Disponible",
        commit, demarreLe,
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
