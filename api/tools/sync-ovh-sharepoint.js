"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const dse = require("../shared/dse");
const ovh = require("../shared/ovh");
const P = require("../shared/provisionnement");
const domainSync = require("../shared/domain-sync");
const { listerDomainesOvh } = require("../shared/ovh-sharepoint");

const LIST_NAMES = {
  domain: "OBJ-NOM DE DOMAINE",
  site: "OBJ-SITE-PUBLIC",
  status: "OBJ-SITES-STATUT",
  client: "OBJ-CLIENT",
  type: "OBJ-NOM DE DOMAINE-TYPE",
  supplier: "OBJ-NOM DE DOMAINE-FOURNISSEUR",
  subscription: "OBJ-TEMPS",
  active: "OBJ-ACTIF",
  valid: "OBJ-VALIDE",
  locked: "OBJ-VEROUILLE",
  journal: "OBJ-JRN"
};

const LABELS = {
  domain: {
    title: ["Title", "Titre OBJ-NOM DE DOMAINE"],
    type: ["OBJ-NOM DE DOMAINE-TYPE"],
    client: ["OBJ-CLIENT"],
    supplier: ["OBJ-NOM DE DOMAINE-FOURNISSEUR"],
    purchaseDate: ["Date Achat"],
    subscription: ["Temps de souscription"],
    active: ["OBJ-ACTIF"],
    valid: ["OBJ-VALIDE"],
    locked: ["OBJ-VEROUILLE"],
    site: ["OBJ-SITE"]
  },
  site: {
    title: ["Title", "Titre OBJ-SITE-PUBLIC"],
    client: ["OBJ-CLIENT"],
    domain: ["OBJ-NOM DE DOMAINE"],
    status: ["OBJ-SITES-STATUT"],
    active: ["OBJ-ACTIF"],
    valid: ["OBJ-VALIDE"]
  }
};

function logWriter(runId) {
  const directory = process.env.DSE_DOMAIN_SYNC_LOG_DIR || "/var/log/dse";
  const filename = path.join(directory, "domain-sync.jsonl");
  let localBlocked = null;
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
    fs.accessSync(directory, fs.constants.W_OK);
  } catch (error) {
    localBlocked = `JOURNAL_LOCAL_BLOQUÉ: ${error.code || "EACCES"} (${directory})`;
  }
  const emit = (entry) => {
    const record = { runId, at: new Date().toISOString(), ...entry };
    const line = JSON.stringify(record);
    console.log(line);
    if (!localBlocked) {
      try { fs.appendFileSync(filename, `${line}\n`, { mode: 0o600 }); }
      catch (error) {
        localBlocked = `JOURNAL_LOCAL_BLOQUÉ: ${error.code || "EACCES"} (${filename})`;
        console.error(JSON.stringify({ runId, at: new Date().toISOString(), code: "JOURNAL_LOCAL_BLOQUÉ", reason: localBlocked }));
      }
    }
    return record;
  };
  return { emit, get localBlocked() { return localBlocked; }, filename };
}

function byDisplayName(lists, displayName) {
  const matches = lists.filter((list) => domainSync.cleNom(list.displayName || list.name) === domainSync.cleNom(displayName));
  if (matches.length !== 1) throw new Error(`LISTE_${matches.length ? "AMBIGUE" : "ABSENTE"}:${displayName}`);
  return matches[0];
}

async function listItems(token, siteId, list) {
  return dse.collecter(token, `/sites/${siteId}/lists/${list.id}/items?$expand=fields&$top=200`, 100);
}

async function listColumns(token, siteId, list) {
  return dse.collecter(token, `/sites/${siteId}/lists/${list.id}/columns?$select=id,name,displayName,hidden,required,lookup,text,number,dateTime,boolean`, 100);
}

function resolveListColumns(columns, labels, listLabel) {
  const resolved = {};
  for (const [key, candidates] of Object.entries(labels)) {
    let found = null;
    for (const candidate of candidates) {
      let exact = candidate === "Title"
        ? columns.filter((column) => !column.hidden && column.name === "Title")
        : [];
      if (!exact.length) {
        exact = columns.filter((column) => !column.hidden &&
          domainSync.cleNom(column.displayName) === domainSync.cleNom(candidate));
      }
      if (!exact.length) {
        exact = columns.filter((column) => !column.hidden && domainSync.cleNom(column.name) === domainSync.cleNom(candidate));
      }
      if (exact.length) {
        if (exact.length !== 1) throw new Error(`COLONNE_AMBIGUE:${listLabel}.${candidate}`);
        found = exact[0];
        break;
      }
    }
    if (!found) throw new Error(`COLONNE_ABSENTE:${listLabel}.${candidates[0]}`);
    resolved[key] = found;
  }
  return resolved;
}

function assertLookup(column, targetList, label, multipleExpected) {
  if (!column || !column.lookup || column.lookup.listId !== targetList.id) {
    throw new Error(`LOOKUP_INVALIDE:${label}`);
  }
  if (Boolean(column.lookup.allowMultipleValues) !== multipleExpected) {
    throw new Error(`LOOKUP_MULTIPLE_INVALIDE:${label}`);
  }
}

function assertType(column, typeKey, label) {
  if (!column || !column[typeKey]) throw new Error(`TYPE_COLONNE_INVALIDE:${label}:${typeKey}`);
}

function assertRefConfig(env, name, items) {
  const id = env[name];
  if (!id) return null;
  return domainSync.referenceParId(items, id, name);
}

function resoudreReference(refs, name, operation) {
  try {
    return operation();
  } catch (error) {
    refs.errors.push(`${name}: ${error.message}`);
    return null;
  }
}

async function construireContexte(token, siteGraph) {
  const lists = await dse.collecter(token, `/sites/${siteGraph.id}/lists?$select=id,displayName,name`, 100);
  const requiredListNames = Object.entries(LIST_NAMES).filter(([key]) => key !== "journal");
  const listMap = {};
  for (const [key, name] of requiredListNames) listMap[key] = byDisplayName(lists, name);
  const maybeJournal = lists.find((list) => domainSync.cleNom(list.displayName || list.name) === domainSync.cleNom(LIST_NAMES.journal)) || null;

  const columnMap = {};
  for (const key of ["domain", "site"]) {
    const columns = await listColumns(token, siteGraph.id, listMap[key]);
    columnMap[key] = resolveListColumns(columns, LABELS[key], LIST_NAMES[key]);
  }

  for (const key of ["type", "client", "supplier", "subscription", "active", "valid", "locked", "status"]) {
    columnMap[key] = await listColumns(token, siteGraph.id, listMap[key]);
  }
  assertLookup(columnMap.domain.type, listMap.type, `${LIST_NAMES.domain}.type`, false);
  assertLookup(columnMap.domain.client, listMap.client, `${LIST_NAMES.domain}.client`, false);
  assertLookup(columnMap.domain.supplier, listMap.supplier, `${LIST_NAMES.domain}.supplier`, false);
  assertLookup(columnMap.domain.subscription, listMap.subscription, `${LIST_NAMES.domain}.subscription`, false);
  assertLookup(columnMap.domain.active, listMap.active, `${LIST_NAMES.domain}.active`, false);
  assertLookup(columnMap.domain.valid, listMap.valid, `${LIST_NAMES.domain}.valid`, false);
  assertLookup(columnMap.domain.locked, listMap.locked, `${LIST_NAMES.domain}.locked`, false);
  assertLookup(columnMap.domain.site, listMap.site, `${LIST_NAMES.domain}.site`, false);
  assertType(columnMap.domain.title, "text", `${LIST_NAMES.domain}.Title`);
  assertType(columnMap.domain.purchaseDate, "dateTime", `${LIST_NAMES.domain}.Date Achat`);
  assertType(columnMap.site.title, "text", `${LIST_NAMES.site}.Title`);
  assertLookup(columnMap.site.client, listMap.client, `${LIST_NAMES.site}.client`, false);
  assertLookup(columnMap.site.domain, listMap.domain, `${LIST_NAMES.site}.domain`, true);
  assertLookup(columnMap.site.status, listMap.status, `${LIST_NAMES.site}.status`, false);
  assertLookup(columnMap.site.active, listMap.active, `${LIST_NAMES.site}.active`, false);
  assertLookup(columnMap.site.valid, listMap.valid, `${LIST_NAMES.site}.valid`, false);

  const refs = {};
  refs.errors = [];
  const allRefItems = {};
  for (const key of ["type", "client", "supplier", "subscription", "active", "valid", "locked", "status"]) {
    allRefItems[key] = await listItems(token, siteGraph.id, listMap[key]);
  }
  refs.supplier = resoudreReference(refs, "FOURNISSEUR_OVH", () =>
    domainSync.referenceParTitre(allRefItems.supplier, ["OVH"], "FOURNISSEUR_OVH"));
  refs.construction = resoudreReference(refs, "STATUT_CONSTRUCTION", () =>
    domainSync.referenceParTitre(allRefItems.status, ["Construction"], "STATUT_CONSTRUCTION"));
  const statusCode = columnMap.status.find((column) => !column.hidden && domainSync.cleNom(column.displayName || column.name) === "CODE");
  if (refs.construction && (!statusCode || domainSync.cleNom(refs.construction.fields?.[statusCode.name]) !== "CONSTRUCTION")) {
    refs.errors.push("STATUT_CONSTRUCTION: CODE absent ou différent de CONSTRUCTION");
    refs.construction = null;
  }
  const statusActive = columnMap.status.find((column) => !column.hidden && domainSync.cleNom(column.displayName || column.name) === "OBJACTIF");
  const statusValid = columnMap.status.find((column) => !column.hidden && domainSync.cleNom(column.displayName || column.name) === "OBJVALIDE");
  if (!statusActive?.lookup || statusActive.lookup.listId !== listMap.active.id || statusActive.lookup.allowMultipleValues ||
      !statusValid?.lookup || statusValid.lookup.listId !== listMap.valid.id || statusValid.lookup.allowMultipleValues) {
    refs.errors.push("STATUT_CONSTRUCTION: lookups OBJ-ACTIF/OBJ-VALIDE absents ou invalides");
    refs.construction = null;
  }
  const yesActive = resoudreReference(refs, "STATUT_ACTIF_OUI", () =>
    domainSync.referenceParTitre(allRefItems.active, ["Oui - Actif"], "STATUT_ACTIF_OUI"));
  const yesValid = resoudreReference(refs, "STATUT_VALIDE_OUI", () =>
    domainSync.referenceParTitre(allRefItems.valid, ["OUI"], "STATUT_VALIDE_OUI"));
  if (refs.construction && (!yesActive || !yesValid)) refs.construction = null;
  if (refs.construction && yesActive && yesValid &&
      (domainSync.lireLookupIds(refs.construction.fields, statusActive)[0] !== String(yesActive.id) ||
       domainSync.lireLookupIds(refs.construction.fields, statusValid)[0] !== String(yesValid.id))) {
    refs.errors.push("STATUT_CONSTRUCTION: valeur inactive ou non validée");
    refs.construction = null;
  }
  refs.expectedSupplierId = process.env.DSE_OVH_EXPECTED_SUPPLIER_ID || null;
  refs.expectedConstructionId = process.env.DSE_OVH_EXPECTED_CONSTRUCTION_STATUS_ID || null;
  if (refs.expectedSupplierId && refs.supplier?.id !== refs.expectedSupplierId) {
    refs.errors.push("FOURNISSEUR_OVH: ID inattendu");
    refs.supplier = null;
  }
  if (refs.expectedConstructionId && refs.construction?.id !== refs.expectedConstructionId) {
    refs.errors.push("STATUT_CONSTRUCTION: ID inattendu");
    refs.construction = null;
  }

  const env = process.env;
  refs.domainType = resoudreReference(refs, "DSE_OVH_DOMAIN_TYPE_ID", () =>
    assertRefConfig(env, "DSE_OVH_DOMAIN_TYPE_ID", allRefItems.type));
  refs.domainClient = resoudreReference(refs, "DSE_OVH_CLIENT_ID", () =>
    assertRefConfig(env, "DSE_OVH_CLIENT_ID", allRefItems.client));
  refs.subscription = resoudreReference(refs, "DSE_OVH_SUBSCRIPTION_ID", () =>
    assertRefConfig(env, "DSE_OVH_SUBSCRIPTION_ID", allRefItems.subscription));
  refs.domainActive = resoudreReference(refs, "DSE_OVH_DOMAIN_ACTIVE_ID", () =>
    assertRefConfig(env, "DSE_OVH_DOMAIN_ACTIVE_ID", allRefItems.active));
  refs.domainValid = resoudreReference(refs, "DSE_OVH_DOMAIN_VALID_ID", () =>
    assertRefConfig(env, "DSE_OVH_DOMAIN_VALID_ID", allRefItems.valid));
  refs.domainLocked = resoudreReference(refs, "DSE_OVH_DOMAIN_LOCKED_ID", () =>
    assertRefConfig(env, "DSE_OVH_DOMAIN_LOCKED_ID", allRefItems.locked));
  refs.siteActive = resoudreReference(refs, "SITE_ACTIF_NON", () =>
    domainSync.referenceParTitre(allRefItems.active, ["NON - Actif"], "SITE_ACTIF_NON"));
  refs.siteValid = resoudreReference(refs, "SITE_VALIDE_NON", () =>
    domainSync.referenceParTitre(allRefItems.valid, ["NON"], "SITE_VALIDE_NON"));
  refs.clientIds = new Set(allRefItems.client.map((item) => String(item.id)));
  for (const [name, item] of [["DSE_OVH_DOMAIN_LOCKED_ID", refs.domainLocked]]) {
    if (item && !["NON", "NONACTIF", "INACTIF", "INACTIVE", "FALSE"].includes(domainSync.cleNom(item.fields?.Title))) {
      refs.errors.push(`${name}: doit désigner une valeur non verrouillée`);
      refs.domainLocked = null;
    }
  }

  const journal = maybeJournal ? {
    list: maybeJournal,
    columns: await listColumns(token, siteGraph.id, maybeJournal)
  } : null;
  if (journal) {
    const status = journal.columns.find((column) =>
      !column.hidden && domainSync.cleNom(column.displayName || column.name) === "STATUT"
    );
    journal.targetStatusList = status?.lookup?.listId
      ? lists.find((list) => list.id === status.lookup.listId) || null
      : null;
  }
  const snapshot = async () => ({
    domains: await listItems(token, siteGraph.id, listMap.domain),
    sites: await listItems(token, siteGraph.id, listMap.site)
  });
  return { siteId: siteGraph.id, lists: listMap, columns: columnMap, refs, env, journal, snapshot };
}

function journalBlockedReason(context) {
  if (!context.journal) return "OBJ-JRN absente";
  const required = context.journal.columns.filter((column) => column.required && !column.hidden);
  const status = required.find((column) => domainSync.cleNom(column.displayName || column.name) === "STATUT");
  if (!status) return "le schéma ne permet pas de déterminer les valeurs officielles obligatoires";
  const names = new Set(required.map((column) => domainSync.cleNom(column.displayName || column.name)));
  if (status.lookup?.listId) {
    const target = context.journal.targetStatusList;
    return target
      ? `Lookup STATUT obligatoire (${target.displayName}); ses valeurs n'ont pas été résolues de façon certaine`
      : `Lookup STATUT obligatoire vers une liste absente du catalogue SharePoint (${status.lookup.listId}); écriture OBJ-JRN bloquée`;
  }
  return `champs obligatoires non configurés: ${[...names].join(", ")}`;
}

function makeDomainFields(context, domain, info) {
  const s = context.columns;
  const refs = context.refs;
  const required = [
    ["OBJ-NOM DE DOMAINE-TYPE", s.domain.type, refs.domainType?.id, "DSE_OVH_DOMAIN_TYPE_ID"],
    ["OBJ-CLIENT", s.domain.client, refs.domainClient?.id, "DSE_OVH_CLIENT_ID"],
    ["OBJ-NOM DE DOMAINE-FOURNISSEUR", s.domain.supplier, refs.supplier?.id, null],
    ["Temps de souscription", s.domain.subscription, refs.subscription?.id, "DSE_OVH_SUBSCRIPTION_ID"],
    ["OBJ-ACTIF", s.domain.active, refs.domainActive?.id, "DSE_OVH_DOMAIN_ACTIVE_ID"],
    ["OBJ-VALIDE", s.domain.valid, refs.domainValid?.id, "DSE_OVH_DOMAIN_VALID_ID"],
    ["OBJ-VEROUILLE", s.domain.locked, refs.domainLocked?.id, "DSE_OVH_DOMAIN_LOCKED_ID"]
  ];
  const missing = required.filter(([, column, id]) => column?.required && !id)
    .map(([label, , , variable]) => variable ? `${label} (${variable})` : label);
  const date = domainSync.dateOVH(info);
  if (s.domain.purchaseDate?.required && !date) missing.push("Date Achat (date certaine fournie par OVH)");
  const fields = { [s.domain.title.name]: domain };
  for (const [, column, id] of required) if (id) fields[`${column.name}LookupId`] = Number(id);
  if (date && s.domain.purchaseDate) fields[s.domain.purchaseDate.name] = date;
  return { fields, missing };
}

function makeSiteFields(context, domain, domainId, domainFields) {
  const s = context.columns.site;
  const refs = context.refs;
  const clientId = domainSync.lireLookupIds(domainFields, context.columns.domain.client)[0] || refs.domainClient?.id || null;
  const missing = [];
  if (s.client.required && (!clientId || !refs.clientIds?.has(String(clientId)))) missing.push("OBJ-CLIENT (aucune valeur officielle résolue)");
  if (!refs.siteActive?.id) missing.push("OBJ-ACTIF (valeur non publiée non résolue)");
  if (!refs.siteValid?.id) missing.push("OBJ-VALIDE (valeur NON non résolue)");
  const fields = { [s.title.name]: domain };
  if (clientId) fields[`${s.client.name}LookupId`] = Number(clientId);
  if (refs.construction?.id) fields[`${s.status.name}LookupId`] = Number(refs.construction.id);
  else missing.push("OBJ-SITES-STATUT (statut Construction non résolu)");
  if (refs.siteActive?.id) fields[`${s.active.name}LookupId`] = Number(refs.siteActive.id);
  if (refs.siteValid?.id) fields[`${s.valid.name}LookupId`] = Number(refs.siteValid.id);
  Object.assign(fields, domainSync.lookupChamp(s.domain, domainId, true));
  return { fields, missing, clientId };
}

async function main(args = process.argv.slice(2), dependencies = {}) {
  const runId = crypto.randomUUID();
  const logger = dependencies.logger || logWriter(runId);
  const domainIndex = args.indexOf("--domain");
  const domainArg = domainIndex >= 0 ? args[domainIndex + 1] : null;
  const unknown = args.filter((arg, index) =>
    !["--dry-run", "--sync", "--domain"].includes(arg) && !(domainIndex >= 0 && index === domainIndex + 1)
  );
  const syncMode = args.includes("--sync");
  const dryMode = args.includes("--dry-run");
  if (unknown.length || args.filter((arg) => arg === "--sync").length > 1 ||
      args.filter((arg) => arg === "--dry-run").length > 1 ||
      args.filter((arg) => arg === "--domain").length > 1 ||
      (syncMode && (dryMode || domainIndex >= 0)) || (domainIndex >= 0 && !domainArg)) {
    throw new Error("Options: [--dry-run] | --domain exemple.fr | --sync");
  }
  const mode = syncMode ? "--sync" : domainIndex >= 0 ? "--domain" : "--dry-run";
  const dryRun = dryMode || (!syncMode && domainIndex < 0);
  const filter = domainArg ? domainSync.normaliserEtValiderDomaine(domainArg) : null;
  if (domainArg && !filter) throw new Error("DOMAINE_INVALIDE");

  const counts = { detected: 0, domainCreated: 0, domainExisting: 0, domainBlocked: 0, siteCreated: 0, siteExisting: 0, siteBlocked: 0 };
  logger.emit({ phase: "DEBUT", mode: mode === "--domain" ? "--domain" : mode, dryRun, code: "DEBUT" });
  let context;
  try {
    const ovhDomains = await (dependencies.listDomains || listerDomainesOvh)();
    const domains = filter ? ovhDomains.filter((domain) => domain === filter) : ovhDomains;
    if (filter && !domains.length) throw new Error("DOMAINE_ABSENT_DU_COMPTE_OVH");
    const token = dependencies.token || await dse.obtenirJetonGraph();
    const graphSite = dependencies.graphSite || await dse.obtenirSiteGraph(token);
    context = dependencies.context || await (dependencies.getContext || construireContexte)(token, graphSite);
    const write = dependencies.write || ((method, url, body) => P.appel(token, method, url, body));
    const getDomainInfo = dependencies.getDomainInfo || ((domain) => ovh.appel("GET", `/domain/${encodeURIComponent(domain)}`));
    const journalReason = journalBlockedReason(context);
    logger.emit({ code: "JOURNAL_OBJ_JRN_BLOQUÉ", reason: journalReason });
    logger.emit({
      code: "SCHEMA_RÉSOLU",
      lists: Object.fromEntries(Object.entries(context.lists).map(([key, value]) => [key, value.id])),
      columns: Object.fromEntries(["domain", "site"].map((section) => [
        section,
        Object.fromEntries(Object.entries(context.columns[section]).map(([key, column]) => [key, column?.name || null]))
      ])),
      references: {
        supplierOVH: context.refs.supplier ? String(context.refs.supplier.id) : null,
        construction: context.refs.construction ? String(context.refs.construction.id) : null,
        siteNotActive: context.refs.siteActive ? String(context.refs.siteActive.id) : null,
        siteNotValid: context.refs.siteValid ? String(context.refs.siteValid.id) : null
      },
      referenceErrors: context.refs.errors
    });
    counts.detected = domains.length;

    for (const domain of domains) {
      logger.emit({ code: "DOMAINE_OVH_DÉTECTÉ", domain });
      let data = await context.snapshot();
      let matches = data.domains.filter((item) =>
        domainSync.normaliserEtValiderDomaine(item.fields?.[context.columns.domain.title.name]) === domain
      );
      if (matches.length > 1) {
        counts.domainBlocked += 1;
        logger.emit({ code: "DOMAINE_BLOQUÉ", domain, reason: "Plusieurs enregistrements SharePoint correspondent au domaine normalisé." });
        continue;
      }
      let domainItem = matches[0] || null;
      if (domainItem) {
        counts.domainExisting += 1;
        logger.emit({ code: "DOMAINE_EXISTANT", domain, domainId: String(domainItem.id) });
        const supplierIds = domainSync.lireLookupIds(domainItem.fields, context.columns.domain.supplier);
        if (!context.refs.supplier) {
          logger.emit({ code: "FOURNISSEUR_NON_VÉRIFIÉ", domain, domainId: String(domainItem.id), reason: "La valeur SharePoint OVH n'a pas pu être résolue sans ambiguïté." });
        } else if (!supplierIds.length) {
          logger.emit({ code: "FOURNISSEUR_MANQUANT", domain, domainId: String(domainItem.id), supplierId: String(context.refs.supplier.id) });
          if (!dryRun) {
            const latest = await context.snapshot();
            const current = latest.domains.find((item) => String(item.id) === String(domainItem.id));
            if (!current) {
              counts.domainBlocked += 1;
              logger.emit({ code: "DOMAINE_BLOQUÉ", domain, domainId: String(domainItem.id), reason: "L'enregistrement SharePoint a changé pendant la synchronisation." });
              continue;
            }
            const currentSupplierIds = domainSync.lireLookupIds(current?.fields || {}, context.columns.domain.supplier);
            if (!currentSupplierIds.length) {
              await write("PATCH", `/sites/${context.siteId}/lists/${context.lists.domain.id}/items/${domainItem.id}/fields`,
                { [`${context.columns.domain.supplier.name}LookupId`]: Number(context.refs.supplier.id) });
              domainItem = current;
              logger.emit({ code: "FOURNISSEUR_OVH_AFFECTÉ", domain, domainId: String(domainItem.id), supplierId: String(context.refs.supplier.id) });
            } else if (!currentSupplierIds.includes(String(context.refs.supplier.id))) {
              counts.domainBlocked += 1;
              logger.emit({ code: "DOMAINE_BLOQUÉ", domain, domainId: String(domainItem.id), reason: "Le fournisseur a changé pendant la synchronisation; aucune valeur manuelle n'a été remplacée." });
              continue;
            } else {
              domainItem = current;
            }
          }
        } else if (!supplierIds.includes(String(context.refs.supplier.id))) {
          counts.domainBlocked += 1;
          logger.emit({ code: "DOMAINE_BLOQUÉ", domain, domainId: String(domainItem.id), reason: "Le fournisseur existant n'est pas OVH; aucune donnée métier n'a été remplacée." });
          continue;
        }
      } else {
        const details = await getDomainInfo(domain).catch((error) => {
          logger.emit({ code: "DETAILS_OVH_INDISPONIBLES", domain, error: error.code || error.message });
          return null;
        });
        const domainCreation = makeDomainFields(context, domain, details);
        const preflightSite = makeSiteFields(context, domain, "1", domainCreation.fields);
        domainCreation.missing.push(...preflightSite.missing);
        if (domainCreation.missing.length) {
          counts.domainBlocked += 1;
          logger.emit({ code: "DOMAINE_BLOQUÉ", domain, missing: domainCreation.missing });
          continue;
        }
        logger.emit({ code: "DOMAINE_À_CRÉER", domain, fields: Object.keys(domainCreation.fields) });
        if (dryRun) {
          domainItem = { id: "0", fields: domainCreation.fields };
        } else {
          data = await context.snapshot();
          matches = data.domains.filter((item) =>
            domainSync.normaliserEtValiderDomaine(item.fields?.[context.columns.domain.title.name]) === domain
          );
          if (matches.length) {
            if (matches.length > 1) {
              counts.domainBlocked += 1;
              logger.emit({ code: "DOMAINE_BLOQUÉ", domain, reason: "Un doublon SharePoint est apparu avant l'écriture." });
              continue;
            }
            domainItem = matches[0];
            counts.domainExisting += 1;
          } else {
            const created = await write("POST", `/sites/${context.siteId}/lists/${context.lists.domain.id}/items`, { fields: domainCreation.fields });
            data = await context.snapshot();
            matches = data.domains.filter((item) =>
              domainSync.normaliserEtValiderDomaine(item.fields?.[context.columns.domain.title.name]) === domain
            );
            if (matches.length > 1) {
              counts.domainBlocked += 1;
              logger.emit({ code: "DOMAINE_DOUBLON_DÉTECTÉ", domain, reason: "Une création concurrente a produit plusieurs enregistrements; aucune suppression automatique n'est autorisée." });
              continue;
            }
            if (matches.length !== 1) throw new Error(`RELECTURE_DOMAINE_IMPOSSIBLE:${domain}`);
            domainItem = matches[0];
            counts.domainCreated += 1;
            logger.emit({ code: "DOMAINE_CRÉÉ", domain, domainId: String(domainItem.id) });
          }
        }
      }

      const domainId = String(domainItem.id);
      data = await context.snapshot();
      const siteMatches = data.sites.filter((item) => domainSync.domaineDansSite(item, context.columns.site.domain, domainId));
      if (siteMatches.length > 1) {
        counts.siteBlocked += 1;
        logger.emit({ code: "SITE_BLOQUÉ", domain, domainId, reason: "Plusieurs OBJ-SITE-PUBLIC référencent cet ID de domaine." });
        continue;
      }
      let siteItem = siteMatches[0] || null;
      if (siteItem) {
        counts.siteExisting += 1;
        logger.emit({ code: "SITE_DÉJÀ_EXISTANT", domain, domainId, siteId: String(siteItem.id) });
      } else {
        const siteCreation = makeSiteFields(context, domain, domainId, domainItem.fields || {});
        if (siteCreation.missing.length) {
          counts.siteBlocked += 1;
          logger.emit({ code: "SITE_BLOQUÉ", domain, domainId, missing: siteCreation.missing });
          continue;
        }
        logger.emit({ code: "SITE_À_CRÉER", domain, domainId, status: "Construction", statusId: String(context.refs.construction.id) });
        if (dryRun) {
          logger.emit({ code: "LIAISON_DOMAINE_SITE_À_CRÉER", domain, domainId, status: "Construction" });
          continue;
        }
        data = await context.snapshot();
        const raced = data.sites.filter((item) => domainSync.domaineDansSite(item, context.columns.site.domain, domainId));
        if (raced.length) {
          if (raced.length > 1) {
            counts.siteBlocked += 1;
            logger.emit({ code: "SITE_BLOQUÉ", domain, domainId, reason: "Plusieurs sites sont apparus avant l'écriture." });
            continue;
          }
          siteItem = raced[0];
          counts.siteExisting += 1;
          logger.emit({ code: "SITE_DÉJÀ_EXISTANT", domain, domainId, siteId: String(siteItem.id) });
        } else {
          const created = await write("POST", `/sites/${context.siteId}/lists/${context.lists.site.id}/items`, { fields: siteCreation.fields });
          data = await context.snapshot();
          const siteMatchesAfterWrite = data.sites.filter((item) => domainSync.domaineDansSite(item, context.columns.site.domain, domainId));
          if (siteMatchesAfterWrite.length > 1) {
            counts.siteBlocked += 1;
            logger.emit({ code: "SITE_DOUBLON_DÉTECTÉ", domain, domainId, reason: "Plusieurs créations concurrentes ont lié le même ID de domaine." });
            continue;
          }
          siteItem = siteMatchesAfterWrite[0];
          if (!siteItem) throw new Error(`RELECTURE_SITE_IMPOSSIBLE:${domain}`);
          counts.siteCreated += 1;
          logger.emit({ code: "SITE_CRÉÉ", domain, domainId, siteId: String(siteItem.id), status: "Construction", statusId: String(context.refs.construction.id) });
        }
      }

      const existingSiteLink = domainSync.lireLookupIds(domainItem.fields || {}, context.columns.domain.site);
      if (context.columns.domain.site && !existingSiteLink.length && siteItem && dryRun) {
        logger.emit({ code: "LIAISON_DOMAINE_SITE_À_CRÉER", domain, domainId, siteId: String(siteItem.id) });
      } else if (context.columns.domain.site && !existingSiteLink.length && siteItem) {
        const latest = await context.snapshot();
        const current = latest.domains.find((item) => String(item.id) === domainId);
        const currentSiteIds = domainSync.lireLookupIds(current?.fields || {}, context.columns.domain.site);
        if (!currentSiteIds.length) {
          await write("PATCH", `/sites/${context.siteId}/lists/${context.lists.domain.id}/items/${domainId}/fields`,
            { [`${context.columns.domain.site.name}LookupId`]: Number(siteItem.id) });
          logger.emit({ code: "LIAISON_DOMAINE_SITE_CRÉÉE", domain, domainId, siteId: String(siteItem.id) });
        } else if (!currentSiteIds.includes(String(siteItem.id))) {
          logger.emit({ code: "LIAISON_DOMAINE_SITE_CONFLICTUELLE", domain, domainId, existingSiteIds: currentSiteIds });
        }
      } else if (existingSiteLink.length && siteItem && !existingSiteLink.includes(String(siteItem.id))) {
        logger.emit({ code: "LIAISON_DOMAINE_SITE_CONFLICTUELLE", domain, domainId, existingSiteIds: existingSiteLink });
      }
    }
  } catch (error) {
    logger.emit({ code: "ERREUR", error: error.code || error.message });
    throw error;
  } finally {
    logger.emit({ code: "FIN", counts, localLog: logger.localBlocked ? "BLOQUÉ" : logger.filename });
    logger.emit({ code: "TERMINÉ" });
  }
  return { runId, counts, journalReason: context ? journalBlockedReason(context) : "Contexte SharePoint indisponible", localLog: logger.filename };
}

if (require.main === module) {
  main().then((result) => {
    console.log(JSON.stringify({ code: "RAPPORT_COMPENSATOIRE", runId: result.runId, counts: result.counts, journal: "JOURNAL_OBJ_JRN_BLOQUÉ", journalReason: result.journalReason, localLog: result.localLog }));
  }).catch(() => process.exitCode = 1);
}

module.exports = { main, construireContexte, journalBlockedReason, makeDomainFields, makeSiteFields, logWriter, LIST_NAMES, LABELS };
