"use strict";

/* Registre des fournisseurs d'identite : ajouter un fournisseur = ajouter un module ici. */

const FOURNISSEURS = [
  require("./entra"),
  require("./externe")
];

function trouver(id) {
  return FOURNISSEURS.find((f) => f.id === id) || null;
}

function lister() {
  return FOURNISSEURS.map((f) => ({ id: f.id, libelle: f.libelle, disponible: Boolean(f.disponible()) }));
}

module.exports = { trouver, lister };
