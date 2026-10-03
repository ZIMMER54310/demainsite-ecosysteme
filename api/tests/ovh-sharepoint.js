"use strict";
const assert = require("assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { listerDomainesOvh } = require("../shared/ovh-sharepoint");
const domainSync = require("../shared/domain-sync");
const { main, logWriter, journalBlockedReason } = require("../tools/sync-ovh-sharepoint");

(async () => {
  // Domaines normalisés : espace et point final supprimés, www conservé.
  assert.strictEqual(domainSync.normaliserDomaine("  WWW.Exemple.FR. "), "www.exemple.fr");
  assert.strictEqual(domainSync.normaliserEtValiderDomaine("domaine invalide.fr"), null);
  const d = await listerDomainesOvh(async (m, c) => {
    assert.strictEqual(m, "GET");
    assert.strictEqual(c, "/domain");
    return ["Nouveau.FR", "connu.fr", "WWW.Exemple.fr.", "pas invalide"];
  });
  assert.deepStrictEqual(d, ["connu.fr", "nouveau.fr", "www.exemple.fr"]);

  await assert.rejects(listerDomainesOvh(async () => { throw new Error("403"); }), (e) => e.code === "OVH-LISTE-REFUSEE");

  assert.deepStrictEqual(domainSync.lireLookupIds({
    Domaines: [{ LookupId: 12 }, { LookupId: "13" }]
  }, { name: "Domaines" }), ["12", "13"]);
  assert.deepStrictEqual(domainSync.lookupChamp({ name: "Domaines" }, "12", true), {
    "Domaines@odata.type": "Collection(Edm.Int32)",
    DomainesLookupId: [12]
  });
  assert.deepStrictEqual(domainSync.lookupChamp({ name: "Statut" }, "2"), { StatutLookupId: 2 });

  const context = contexteFictif();
  const events = [];
  const writes = [];
  const dependencies = {
    context,
    token: "mock",
    graphSite: { id: "graph-site" },
    listDomains: async () => ["nouveau.fr"],
    getDomainInfo: async () => ({ creationDate: "2022-02-03T00:00:00Z" }),
    logger: { emit: (event) => events.push(event), localBlocked: null, filename: "/tmp/domain-sync.jsonl" },
    write: async (method, url, body) => {
      writes.push({ method, url, body });
      if (method === "POST" && url.includes("/domain-list/")) {
        const item = { id: String(context.data.domains.length + 1), fields: body.fields };
        context.data.domains.push(item);
        return { id: item.id };
      }
      if (method === "POST" && url.includes("/site-list/")) {
        const item = { id: String(context.data.sites.length + 10), fields: body.fields };
        context.data.sites.push(item);
        return { id: item.id };
      }
      if (method === "PATCH") {
        const id = url.match(/items\/(\d+)\/fields/)?.[1];
        const item = context.data.domains.find((entry) => entry.id === id);
        Object.assign(item.fields, body);
        return {};
      }
      throw new Error(`unexpected mock write ${method} ${url}`);
    }
  };

  // Dry-run : aucune écriture; rapports de domaine et site à créer.
  const beforeDryRun = writes.length;
  await main(["--dry-run"], { ...dependencies, logger: { ...dependencies.logger, emit: (event) => events.push(event) } });
  assert.strictEqual(writes.length, beforeDryRun);
  assert.ok(events.some((event) => event.code === "DOMAINE_À_CRÉER"));
  assert.ok(events.some((event) => event.code === "SITE_À_CRÉER" && event.status === "Construction"));
  const beforeDefault = writes.length;
  await main([], { ...dependencies, logger: { ...dependencies.logger, emit: (event) => events.push(event) } });
  assert.strictEqual(writes.length, beforeDefault);
  await main(["--dry-run", "--domain", "nouveau.fr"], { ...dependencies, logger: { ...dependencies.logger, emit: (event) => events.push(event) } });
  assert.strictEqual(writes.length, beforeDefault);

  // Création du domaine et du site avec Lookup natifs, puis affectation du statut Construction.
  events.length = 0;
  const first = await main(["--domain", "nouveau.fr"], dependencies);
  assert.strictEqual(first.counts.domainCreated, 1);
  assert.strictEqual(first.counts.siteCreated, 1);
  const domainItem = context.data.domains[0];
  const siteItem = context.data.sites[0];
  assert.strictEqual(domainItem.fields.domainTypeLookupId, 21);
  assert.strictEqual(domainItem.fields.clientLookupId, 22);
  assert.deepStrictEqual(siteItem.fields.domainLookupId, [Number(domainItem.id)]);
  assert.strictEqual(siteItem.fields.statusLookupId, 25);
  assert.strictEqual(siteItem.fields.activeLookupId, 26);
  assert.strictEqual(siteItem.fields.validLookupId, 27);
  assert.ok(writes.some((entry) => entry.method === "PATCH" && entry.body.siteLookupId === Number(siteItem.id)));

  // Idempotence : deuxième passage, aucun POST.
  events.length = 0;
  const postsBeforeSecond = writes.filter((entry) => entry.method === "POST").length;
  const second = await main(["--domain", "nouveau.fr"], dependencies);
  assert.strictEqual(second.counts.domainExisting, 1);
  assert.strictEqual(second.counts.siteExisting, 1);
  assert.strictEqual(writes.filter((entry) => entry.method === "POST").length, postsBeforeSecond);
  assert.ok(events.some((event) => event.code === "SITE_DÉJÀ_EXISTANT"));

  // Domaine trouvé mais valeur obligatoire manquante : aucune écriture partielle.
  const blockedContext = contexteFictif();
  blockedContext.refs.domainType = null;
  const blockedWrites = [];
  const blockedEvents = [];
  const blocked = await main(["--sync"], {
    ...dependencies,
    context: blockedContext,
    write: async (...args) => { blockedWrites.push(args); },
    logger: { emit: (event) => blockedEvents.push(event), localBlocked: null, filename: "/tmp/domain-sync.jsonl" }
  });
  assert.strictEqual(blocked.counts.domainBlocked, 1);
  assert.strictEqual(blockedWrites.length, 0);
  assert.ok(blockedEvents.some((event) => event.code === "DOMAINE_BLOQUÉ" && event.missing.some((missing) => missing.includes("OBJ-NOM DE DOMAINE-TYPE"))));

  // Un site qui référence déjà l'ID natif du domaine n'est jamais dupliqué.
  const existingContext = contexteFictif();
  existingContext.data.domains.push({ id: "51", fields: { Title: "connu.fr", clientLookupId: 22, supplierLookupId: 23 } });
  existingContext.data.sites.push({ id: "61", fields: { domain: [{ LookupId: 51 }], statusLookupId: 25 } });
  const existingWrites = [];
  const existing = await main(["--domain", "connu.fr"], {
    ...dependencies, context: existingContext,
    listDomains: async () => ["connu.fr"],
    write: async (...args) => { existingWrites.push(args); },
    logger: { emit: () => {}, localBlocked: null, filename: "/tmp/domain-sync.jsonl" }
  });
  assert.strictEqual(existing.counts.siteExisting, 1);
  assert.strictEqual(existingWrites.filter(([method]) => method === "POST").length, 0);

  await assert.rejects(main(["--sync"], {
    ...dependencies,
    listDomains: async () => { throw Object.assign(new Error("OVH unavailable"), { code: "OVH-LISTE-REFUSEE" }); },
    logger: { emit: () => {}, localBlocked: null, filename: "/tmp/domain-sync.jsonl" }
  }), /OVH unavailable/);
  await assert.rejects(main(["--dry-run"], {
    ...dependencies,
    context: { ...context, snapshot: async () => { throw new Error("Graph unavailable"); } },
    listDomains: async () => ["nouveau.fr"],
    logger: { emit: () => {}, localBlocked: null, filename: "/tmp/domain-sync.jsonl" }
  }), /Graph unavailable/);

  assert.match(journalBlockedReason({
    journal: {
      columns: [{ displayName: "STATUT", required: true, lookup: { listId: "orphan-list" } }],
      targetStatusList: null
    }
  }), /liste absente/);

  const tempLogs = fs.mkdtempSync(path.join(os.tmpdir(), "dse-sync-test-"));
  const previousLogDir = process.env.DSE_DOMAIN_SYNC_LOG_DIR;
  process.env.DSE_DOMAIN_SYNC_LOG_DIR = tempLogs;
  const localLogger = logWriter("test-run");
  localLogger.emit({ code: "RAPPORT_TEST", domain: "exemple.fr" });
  const logLines = fs.readFileSync(path.join(tempLogs, "domain-sync.jsonl"), "utf8").trim().split("\n");
  assert.strictEqual(JSON.parse(logLines[0]).runId, "test-run");
  assert.strictEqual(JSON.parse(logLines[0]).code, "RAPPORT_TEST");
  if (previousLogDir === undefined) delete process.env.DSE_DOMAIN_SYNC_LOG_DIR;
  else process.env.DSE_DOMAIN_SYNC_LOG_DIR = previousLogDir;
  fs.rmSync(tempLogs, { recursive: true, force: true });

  const service = fs.readFileSync(path.join(__dirname, "../../deploy/systemd/dse-sync.service"), "utf8");
  assert.match(service, /sync-ovh-sharepoint\.js --sync/);
  assert.match(service, /ExecStartPost=.*sync-domaines\.js/);
  console.log("ovh-sharepoint OK");
})().catch((e) => { console.error(e); process.exit(1); });

function contexteFictif() {
  const col = (name, required = true, lookup = {}) => ({ name, required, lookup });
  return {
    siteId: "sharepoint-site",
    lists: { domain: { id: "domain-list" }, site: { id: "site-list" } },
    columns: {
      domain: {
        title: col("Title"),
        type: col("domainType", true, { listId: "type-list" }),
        client: col("client", true, { listId: "client-list" }),
        supplier: col("supplier", true, { listId: "supplier-list" }),
        purchaseDate: col("purchaseDate"),
        subscription: col("subscription", true, { listId: "term-list" }),
        active: col("active", true, { listId: "active-list" }),
        valid: col("valid", true, { listId: "valid-list" }),
        locked: col("locked", true, { listId: "locked-list" }),
        site: col("site", false, { listId: "site-list" })
      },
      site: {
        title: col("Title"),
        client: col("client", true, { listId: "client-list" }),
        domain: col("domain", true, { listId: "domain-list", allowMultipleValues: true }),
        status: col("status", true, { listId: "status-list" }),
        active: col("active", true, { listId: "active-list" }),
        valid: col("valid", true, { listId: "valid-list" })
      }
    },
    refs: {
      supplier: { id: "23" },
      construction: { id: "25" },
      domainType: { id: "21" },
      domainClient: { id: "22" },
      subscription: { id: "24" },
      domainActive: { id: "28" },
      domainValid: { id: "29" },
      domainLocked: { id: "30" },
      siteActive: { id: "26" },
      siteValid: { id: "27" },
      clientIds: new Set(["22"])
    },
    env: {},
    journal: { columns: [{ displayName: "STATUT", required: true, lookup: { listId: "orphan-list" } }], targetStatusList: null },
    data: { domains: [], sites: [] },
    snapshot: async function () { return { domains: this.data.domains, sites: this.data.sites }; }
  };
}
