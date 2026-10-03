"use strict";

/*
 * Mode de connexion sans compte Microsoft (clients, collaborateurs externes,
 * clients de clients). Emplacement branchable : il deviendra disponible des
 * qu'un mecanisme (lien par e-mail, identifiant DSE...) sera implemente ici,
 * sans modifier le cockpit ni la resolution des droits.
 */

module.exports = {
  id: "externe",
  libelle: "Accès sans compte Microsoft",
  disponible: () => false,
  demarrer: () => false,
  rappel: async () => ({ ok: false, cible: "/" })
};
