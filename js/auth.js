// Identite fournie par le serveur (session HttpOnly). Aucun secret ni jeton n'est manipule ici.
import { getMoi } from "../services/cockpit.service.js";

export async function initializeAuth() {
  try {
    const moi = (await getMoi())?.donnees || {};
    return {
      authenticated: moi.connecte === true,
      displayName: moi.nom || null,
      reconnu: moi.reconnu === true,
      role: moi.role || null,
      fonctions: Array.isArray(moi.fonctions) ? moi.fonctions : [],
      niveau: moi.niveau || null,
      menu: Array.isArray(moi.menu) ? moi.menu : [],
      domaineAccueil: moi.domaineAccueil || null,
      nombreSites: Number(moi.nombreSites) || 0,
      fournisseurs: Array.isArray(moi.fournisseurs) ? moi.fournisseurs : []
    };
  } catch {
    return { authenticated: false, displayName: null, reconnu: false, role: null, fonctions: [], niveau: null, menu: [], nombreSites: 0, fournisseurs: [] };
  }
}

export function signIn(fournisseur = "entra") {
  const domaine = location.hostname.replace(/^www\./, "");
  location.href = `/api/v1/auth/${encodeURIComponent(fournisseur)}/connexion?domaine=${encodeURIComponent(domaine)}`;
}

export function signOut() { location.href = "/api/v1/auth/deconnexion"; }
