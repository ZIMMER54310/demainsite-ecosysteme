"use strict";

// Test LECTURE SEULE de l'acces Microsoft Graph/SharePoint avec l'identite applicative API DSE.
// Aucune ecriture. Ne jamais afficher secret ni jeton.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const dse = require("../shared/dse");

const CLIENT_ID_ATTENDU = "feeacae2-c662-4018-a41e-226e93a3ba94";
const ok = (b) => (b ? "OK" : "ECHEC");

(async () => {
  console.log("DEBUT test SharePoint app-only\n");
  let echec = false;
  const manque = ["DSE_TENANT_ID", "DSE_CLIENT_ID", "DSE_CLIENT_SECRET", "DSE_SHAREPOINT_HOSTNAME", "DSE_SHAREPOINT_SITE_PATH"].filter((v) => !process.env[v]);
  if (manque.length) { console.log(`Variables absentes : ${manque.join(", ")}\nFIN\nTERMINÉ (ECHEC)`); process.exit(1); }

  const idOk = (process.env.DSE_CLIENT_ID || "").toLowerCase() === CLIENT_ID_ATTENDU;
  console.log("IDENTITE");
  console.log(`API DSE : ${idOk ? "OK" : "DIFFERENT"}`);
  if (!idOk) echec = true;

  let token = null;
  console.log("\nAUTHENTIFICATION");
  try {
    token = await dse.obtenirJetonGraph();
    console.log("Microsoft Graph : OK");
    try {
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      const roles = Array.isArray(claims.roles) ? claims.roles : [];
      console.log(`Jeton app-only (appid correspond) : ${ok((claims.appid || claims.azp) === CLIENT_ID_ATTENDU)}`);
      console.log(`Roles applicatifs Graph : ${roles.length ? roles.join(", ") : "aucun (acces via Sites.Selected / permission par site)"}`);
    } catch (_) { /* claims non lisibles : non bloquant */ }
  } catch (e) {
    echec = true;
    console.log(`Microsoft Graph : ECHEC (${e.code || e.message})`);
  }

  let siteOk = false, listesOk = false, nbListes = 0, meta = null;
  console.log("\nSHAREPOINT");
  if (token) {
    let site = null;
    try { site = await dse.obtenirSiteGraph(token); siteOk = !!site.id; } catch (e) { console.log(`  site : HTTP ${e.status || e.statusCode || "?"} ${e.code || ""}`); }
    console.log(`Site Bibliotheque : ${ok(siteOk)}${siteOk ? " (HTTP 200)" : ""}`);
    if (siteOk) {
      try {
        const r = await dse.graph(token, `/sites/${site.id}/lists?$select=id,displayName&$top=200`);
        const listes = r.value || [];
        nbListes = listes.length; listesOk = true;
        const l = listes.find((x) => /^OBJ-/i.test(x.displayName)) || listes[0];
        if (l) {
          const m = await dse.graph(token, `/sites/${site.id}/lists/${l.id}?$select=displayName,list`);
          meta = !!m.displayName;
        }
      } catch (e) { console.log(`  listes : HTTP ${e.status || e.statusCode || "?"} ${e.code || ""}`); }
    }
    console.log(`Lecture listes : ${ok(listesOk)}${listesOk ? ` (HTTP 200, ${nbListes} listes${meta ? ", metadonnees lisibles" : ""})` : ""}`);
  } else { console.log("Site Bibliotheque : NON TESTE\nLecture listes : NON TESTE"); }
  if (!siteOk || !listesOk) echec = true;

  console.log("\nRESULTAT");
  console.log(`SITES.SELECTED : ${ok(siteOk && listesOk)}`);
  console.log("WRITE attribué : connu administrativement, non exercé par ce test");
  console.log(`\nFIN\nTERMINÉ${echec ? " (ECHEC)" : ""}`);
  process.exit(echec ? 1 : 0);
})().catch((e) => { console.log(`ERREUR : ${e.code || e.message}`); process.exit(1); });
