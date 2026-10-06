"use strict";

const crypto = require("crypto");
const preuves = new Map();
const DUREE_MS = 15 * 60 * 1000;

function nettoyer() {
  for (const [code, p] of preuves) if (p.expire < Date.now()) preuves.delete(code);
}

function proposer(identite) {
  nettoyer();
  if (identite.fournisseur !== "entra" || !/^[a-f0-9-]{36}$/i.test(identite.sujet)) return null;
  const existante = [...preuves.entries()].find(([, p]) => p.sujet === identite.sujet);
  if (existante) return existante[0];
  if (preuves.size >= 10000) throw new Error("Trop de demandes de liaison d'identité en cours.");
  const code = crypto.randomBytes(24).toString("base64url");
  preuves.set(code, { sujet: identite.sujet, nom: identite.nom || null, email: identite.email || null,
    expire: Date.now() + DUREE_MS });
  return code;
}

function lire(code) {
  nettoyer();
  return preuves.get(String(code || "")) || null;
}

module.exports = { proposer, lire };
