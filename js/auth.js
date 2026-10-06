// Identite fournie par le serveur (session HttpOnly). Aucun secret ni jeton n'est manipule ici.
import { getMoi } from "../services/cockpit.service.js";

export async function initializeAuth(domaine = "") {
  try {
    const moi = (await getMoi(domaine))?.donnees || {};
    return {
      authenticated: moi.connecte === true,
      displayName: moi.nom || null,
      reconnu: moi.reconnu === true,
      role: moi.role || null,
      accesType: moi.accesType || null,
      contexte: moi.contexte || null,
      fonctions: Array.isArray(moi.fonctions) ? moi.fonctions : [],
      niveau: moi.niveau || null,
      menu: Array.isArray(moi.menu) ? moi.menu : [],
      domaineAccueil: moi.domaineAccueil || null,
      nombreSites: Number(moi.nombreSites) || 0,
      sitesPublics: Array.isArray(moi.sitesPublics) ? moi.sitesPublics : [],
      clients: Array.isArray(moi.clients) ? moi.clients : [],
      porteeGlobale: moi.porteeGlobale === true,
      fournisseurs: Array.isArray(moi.fournisseurs) ? moi.fournisseurs : []
    };
  } catch (err) {
    console.error("[DSE compte]", err.message);
    return { authenticated: false, erreur: err.message, displayName: null, reconnu: false, role: null, fonctions: [], niveau: null, menu: [], nombreSites: 0, fournisseurs: [] };
  }
}

export function signIn(fournisseur = "entra") {
  const domaine = location.hostname.replace(/^www\./, "");
  location.href = `/api/v1/auth/${encodeURIComponent(fournisseur)}/connexion?domaine=${encodeURIComponent(domaine)}`;
}

export function signOut() { location.href = "/api/v1/auth/deconnexion"; }
