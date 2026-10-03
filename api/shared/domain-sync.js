"use strict";

const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const { domainToASCII } = require("node:url");

const normaliserDomaine = (value) => {
  if (value === null || value === undefined) return "";
  const domaine = String(value).trim().toLowerCase().replace(/\.$/, "");
  return domainToASCII(domaine).toLowerCase();
};

function normaliserEtValiderDomaine(value) {
  const domaine = normaliserDomaine(value);
  const dernierLabel = domaine.split(".").at(-1) || "";
  return DOMAIN_RE.test(domaine) && dernierLabel.length >= 2 ? domaine : null;
}

function cleNom(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function lireLookupIds(fields, column) {
  if (!column) return [];
  const values = fields?.[column.name];
  const ids = Array.isArray(values) ? values.map((value) => value?.LookupId ?? value?.Id ?? value)
    : values === null || values === undefined ? [] : [values];
  const direct = fields?.[`${column.name}LookupId`];
  if (direct !== undefined && direct !== null) ids.push(...(Array.isArray(direct) ? direct : [direct]));
  return [...new Set(ids.map(String).filter((id) => /^\d+$/.test(id)))];
}

function lookupChamp(column, id, multiple = false) {
  if (!column || !/^\d+$/.test(String(id))) throw new Error("LOOKUP_ID_INVALIDE");
  return multiple
    ? { [`${column.name}LookupId@odata.type`]: "Collection(Edm.Int32)", [`${column.name}LookupId`]: [Number(id)] }
    : { [`${column.name}LookupId`]: Number(id) };
}

function dateOVH(info) {
  const possible = [info?.creationDate, info?.createdAt, info?.creationDateTime, info?.dateAchat];
  for (const value of possible) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date.toISOString();
  }
  return null;
}

function referenceParId(items, id, name) {
  const found = items.find((item) => String(item.id) === String(id));
  if (!found) throw new Error(`REFERENCE_${name}_ID_ABSENT`);
  return found;
}

function referenceParTitre(items, names, label) {
  const wanted = new Set(names.map(cleNom));
  const matches = items.filter((item) => wanted.has(cleNom(item.fields?.Title)));
  if (matches.length !== 1) throw new Error(`REFERENCE_${label}_${matches.length ? "AMBIGUE" : "ABSENTE"}`);
  return matches[0];
}

function domaineDansSite(item, column, domainId) {
  return lireLookupIds(item.fields || {}, column).includes(String(domainId));
}

module.exports = {
  normaliserDomaine,
  normaliserEtValiderDomaine,
  cleNom,
  lireLookupIds,
  lookupChamp,
  dateOVH,
  referenceParId,
  referenceParTitre,
  domaineDansSite
};
