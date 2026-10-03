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
  const possible = [
    info?.creation,
    info?.creationDate,
    info?.createdAt,
    info?.creationDateTime,
    info?.dateAchat
  ];
  for (const value of possible) {
    if (!value) continue;
    const dateOnly = String(value).match(/^(\d{4}-\d{2}-\d{2})$/);
    if (dateOnly) return dateSharePointValeur(dateOnly[1]);
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date.toISOString();
  }
  return null;
}

function dateOvhJour(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function dateSharePointJour(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${part.year}-${part.month}-${part.day}`;
}

function dateSharePointValeur(date) {
  const jour = dateOvhJour(date);
  if (!jour) throw new Error("DATE_OVH_INVALIDE");
  const minuitUTC = new Date(`${jour}T00:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(minuitUTC);
  const part = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const heureLocaleUTC = Date.UTC(
    Number(part.year), Number(part.month) - 1, Number(part.day),
    Number(part.hour), Number(part.minute), Number(part.second)
  );
  return new Date(minuitUTC.valueOf() - (heureLocaleUTC - minuitUTC.valueOf())).toISOString();
}

function souscriptionDepuisMois(mois, items) {
  if (!Number.isInteger(mois) || mois < 12 || mois % 12 !== 0) {
    return { item: null, reason: "PÉRIODE_OVH_NON_CONVERTIBLE_EN_ANNÉES" };
  }
  const annees = mois / 12;
  const titre = `${annees} ${annees === 1 ? "AN" : "ANS"}`;
  const matches = items.filter((item) => cleNom(item.fields?.Title) === cleNom(titre));
  if (matches.length !== 1) {
    return { item: null, reason: matches.length ? "SOUSCRIPTION_SHAREPOINT_AMBIGUË" : "SOUSCRIPTION_SHAREPOINT_ABSENTE" };
  }
  return { item: matches[0], title: matches[0].fields?.Title, months: mois, derived: true };
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
  dateOvhJour,
  dateSharePointJour,
  dateSharePointValeur,
  souscriptionDepuisMois,
  referenceParId,
  referenceParTitre,
  domaineDansSite
};
