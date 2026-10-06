"use strict";

const { cleChamp } = require("./catalogue");

const estListeChamps = (nom) => cleChamp(nom) === "OBJBUILDERCHAMP";
const colonnesAutorisees = (nom, colonnes) => estListeChamps(nom) ? colonnes.filter((c) =>
  cleChamp(c.name) !== "APPAREIL" && cleChamp(c.displayName) !== "APPAREIL") : colonnes;
const selectionChamps = (colonnes) => [...new Set(["Title", ...colonnes.filter((c) => !c.hidden).map((c) =>
  c.lookup ? `${c.name}LookupId` : c.name)])].join(",");

module.exports = { estListeChamps, colonnesAutorisees, selectionChamps };
