"use strict";

const { FONCTIONS_COCKPIT } = require("../shared/cockpit");

// Traduction des capacites SharePoint vers les routes du moteur, jamais des roles.
const CAPACITES = {
  "ADMINISTRATION-GLOBALE": FONCTIONS_COCKPIT,
  "GESTION-CLIENT": ["administration", "suivi"],
  "GESTION-UTILISATEURS-CLIENT": ["utilisateurs"],
  "GESTION-SITES-ATTRIBUES": ["sites", "pages", "entete", "logo-medias", "menu", "footer", "seo", "domaine", "apercu", "suivi"]
};

function politiqueDepuisRoles(roles) {
  const politique = { roles: {} };
  for (const role of roles) {
    if (!role.actif || !role.valide) continue;
    const portee = { TOUS: "tous", CLIENT: "client", ATTRIBUES: "attribues", "SITES-ATTRIBUES": "attribues" }[role.portee];
    const niveau = { LECTURE: "lecture", ECRITURE: "ecriture", ADMINISTRATION: "administration" }[role.niveau];
    const codes = String(role.fonctions || "").split(/[;,\n]+/).map((v) => v.trim()).filter(Boolean);
    if (!portee || !niveau || !codes.length) continue;
    if (codes.some((c) => c.toUpperCase() === "ADMINISTRATION-GLOBALE") &&
      (portee !== "tous" || niveau !== "administration")) continue;
    const fonctions = new Set();
    let inconnue = false;
    for (const code of codes) {
      const traduction = CAPACITES[code.toUpperCase()];
      if (traduction) traduction.forEach((f) => fonctions.add(f));
      else if (FONCTIONS_COCKPIT.includes(code.toLowerCase())) fonctions.add(code.toLowerCase());
      else inconnue = true;
    }
    if (!inconnue && fonctions.size) politique.roles[String(role.id)] = { portee, niveau, fonctions: [...fonctions] };
  }
  return politique;
}

module.exports = { politiqueDepuisRoles };
