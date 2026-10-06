"use strict";

const { FONCTIONS_COCKPIT } = require("../shared/cockpit");

function politiqueDepuisRoles(roles, correspondances = []) {
  const politique = { roles: {} };
  for (const role of roles) {
    if (!role.actif || !role.valide) continue;
    const portee = { TOUS: "tous", CLIENT: "client", ATTRIBUES: "attribues", "SITES-ATTRIBUES": "attribues" }[role.portee];
    const niveau = { LECTURE: "lecture", ECRITURE: "ecriture", ADMINISTRATION: "administration" }[role.niveau];
    const codes = String(role.fonctions || "").split(/[;,\n]+/).map((v) => v.trim()).filter(Boolean);
    if (!portee || !niveau || !codes.length) continue;
    const fonctions = new Set();
    let inconnue = false;
    for (const code of codes) {
      const mappings = correspondances.filter((o) => o.mode === "compatibility" &&
        o.operation === `compatibilite.${code.toUpperCase()}` && (!o.route || o.route === `${portee}/${niveau}`));
      if (mappings.length === 1) mappings[0].fonction.split(",")
        .filter((f) => FONCTIONS_COCKPIT.includes(f)).forEach((f) => fonctions.add(f));
      else if (FONCTIONS_COCKPIT.includes(code.toLowerCase())) fonctions.add(code.toLowerCase());
      else inconnue = true;
    }
    if (!inconnue && fonctions.size) politique.roles[String(role.id)] = { portee, niveau, fonctions: [...fonctions] };
  }
  return politique;
}

module.exports = { politiqueDepuisRoles };
