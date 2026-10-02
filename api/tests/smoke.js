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

  // Les anciens en-tetes Azure ne doivent JAMAIS authentifier.
  const faux = {
    "x-ms-client-principal-id": "00000000-0000-0000-0000-000000000000",
    "x-ms-client-principal": Buffer.from(
      JSON.stringify({ claims: [{ typ: "oid", val: "x" }] })
    ).toString("base64")
  };
  await test("GET /moi desactivee (en-tetes Azure ignores)", "/api/v1/moi", (s, c) => {
    exiger(s === 501, `statut ${s} (501 attendu)`);
    exiger(c?.succes === false, "succes != false");
    exiger(c.erreur?.code === "DSE-AUTHENTIFICATION-DESACTIVEE", "code inattendu");
  }, faux);

  console.log(echecs ? `${echecs} echec(s).` : "Tous les tests de fumee sont OK.");
  process.exit(echecs ? 1 : 0);
})();
