"use strict";

// Tests de fumee en LECTURE SEULE (uniquement des GET).
// Usage : DSE_SMOKE_BASE=http://127.0.0.1:3000 npm run smoke
const base = process.env.DSE_SMOKE_BASE || "http://127.0.0.1:3000";
const domaine = process.env.DSE_SMOKE_DOMAINE || "dseco.fr";
const siteId = process.env.DSE_SMOKE_SITE_ID || "4";

let echecs = 0;

async function test(nom, chemin, verifier, headers = {}) {
  try {
    const rep = await fetch(base + chemin, {
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(30000)
    });
    const corps = await rep.json().catch(() => null);
    verifier(rep.status, corps);
    console.log(`OK    ${nom}`);
  } catch (e) {
    echecs++;
    console.error(`ECHEC ${nom} : ${e.message}`);
  }
}

function exiger(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  await test("GET /etat", "/api/v1/etat", (s, c) => {
    exiger(s === 200, `statut ${s}`);
    exiger(c?.succes === true, "succes != true");
    exiger(c.donnees?.sharePointAccessible === true, "SharePoint inaccessible");
  });

  await test("GET /sites/par-domaine", `/api/v1/sites/par-domaine?domaine=${domaine}`, (s, c) => {
    exiger(s === 200, `statut ${s}`);
    exiger(c?.succes === true, "succes != true");
  });

  await test("GET /site/:id", `/api/v1/site/${siteId}`, (s, c) => {
    exiger(s === 200, `statut ${s}`);
    exiger(c?.succes === true, "succes != true");
  });

  await test("GET /site-complet/:id", `/api/v1/site-complet/${siteId}`, (s, c) => {
    exiger(s === 200, `statut ${s}`);
    exiger(c?.succes === true, "succes != true");
    exiger(Array.isArray(c.donnees?.pages?.donnees), "pages absentes");
  });

  const rep = await fetch(`${base}/api/v1/media/1`).catch(() => null);
  const ct = rep?.headers.get("content-type") || "";
  if (rep?.status === 200 && ct.startsWith("image/")) console.log("OK    GET /media/1 (image)");
  else { echecs++; console.error(`ECHEC GET /media/1 : ${rep?.status} ${ct}`); }
  await test("GET /media/abc refuse", "/api/v1/media/abc", (s) => exiger(s === 400, `statut ${s}`));
  await test("GET /media/999999 inexistant", "/api/v1/media/999999", (s) => exiger(s === 404, `statut ${s}`));

  // Les anciens en-tetes Azure ne doivent JAMAIS authentifier.
  const faux = {
    "x-ms-client-principal-id": "00000000-0000-0000-0000-000000000000",
    "x-ms-client-principal": Buffer.from(
      JSON.stringify({ claims: [{ typ: "oid", val: "x" }] })
    ).toString("base64")
  };
  await test("GET /moi : en-tetes Azure ignores, non connecte", "/api/v1/moi", (s, c) => {
    exiger(s === 200, `statut ${s}`);
    exiger(c?.donnees?.connecte === false, "connecte != false");
  }, faux);
  await test("GET /cockpit/sites refuse sans session", "/api/v1/cockpit/sites", (s) => exiger(s === 401, `statut ${s}`), faux);
  await test("GET /cockpit/site refuse sans session", "/api/v1/cockpit/site?domaine=dseco.fr", (s) => exiger(s === 401, `statut ${s}`), faux);

  console.log(echecs ? `${echecs} echec(s).` : "Tous les tests de fumee sont OK.");
  process.exit(echecs ? 1 : 0);
})();
