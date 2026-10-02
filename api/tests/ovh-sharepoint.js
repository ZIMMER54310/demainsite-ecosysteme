"use strict";
const assert = require("assert");
const { listerDomainesOvh, planifier } = require("../shared/ovh-sharepoint");

(async () => {
  const d = await listerDomainesOvh(async (m, c) => (c === "/domain" ? ["Nouveau.FR", "connu.fr"] : ["connu.fr", "zone-seule.com", "pas valide"]));
  assert.deepStrictEqual(d, ["connu.fr", "nouveau.fr", "zone-seule.com"]);

  await assert.rejects(listerDomainesOvh(async () => { throw new Error("403"); }), (e) => e.code === "OVH-LISTE-REFUSEE");

  const defauts = { client: "5", type: "1", fournisseur: "1", temps: "1", actif: "1", valide: "1", nonVerrouille: "2" };
  const etat = {
    domainesSp: [{ id: "1", domaine: "connu.fr", siteId: "9" }, { id: "2", domaine: "orphelin.fr", siteId: null, clientId: "3" }],
    sites: [{ id: "9", domaineIds: ["1"] }]
  };
  let p = planifier(d, etat, defauts);
  assert.deepStrictEqual(p.aCreerDomaines.map((x) => x.domaine), ["nouveau.fr", "zone-seule.com"]); // anti-doublon : connu.fr exclu
  assert.strictEqual(p.sitesACreer.length, 2);
  p = planifier([...d, "orphelin.fr"], etat, defauts, { orphelins: true });
  assert.ok(p.sitesACreer.some((s) => s.domaineId === "2"));
  assert.strictEqual(planifier(["connu.fr"], etat, defauts).sitesACreer.length, 0);
  p = planifier(["nouveau.fr"], etat, { ...defauts, client: null });
  assert.strictEqual(p.aCreerDomaines.length, 0);
  assert.match(p.ignores[0].raison, /client/);
  console.log("ovh-sharepoint OK");
})().catch((e) => { console.error(e); process.exit(1); });
