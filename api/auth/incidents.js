"use strict";

const ecriture = require("../shared/ecriture");
const global = (d) => d.reconnu && d.portee === "tous" && d.niveau === "administration" && d.fonctions.includes("utilisateurs");
const identifiant = (identite) => ecriture.hash([identite.fournisseur, String(identite.sujet).toLowerCase()]);

// Le blocage automatique adosse a OBJ-JRN est desactive par decision explicite.
async function lire() {
  return { incidents: [], regle: null, desactive: true,
    message: "Le blocage automatique lié au journal est désactivé. Les contrôles d'accès DSE restent appliqués." };
}

async function verifier() { return false; }
async function refuser() { console.warn("[DSE acces] opération hors périmètre refusée"); }
async function decider() { return false; }
async function politique() { return null; }

module.exports = { lire, verifier, refuser, decider, global, identifiant, politique, viderCache() {} };
