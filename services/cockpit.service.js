import { apiGet, apiPost, ApiError } from "../js/api.js";
import { CONFIG } from "../js/config.js";
export const getMoi = () => apiGet("/moi");
export const getSitesCockpit = (criteres = {}) => apiGet("/cockpit/sites", criteres);
export const getStatutsSite = (domaine) => apiGet("/cockpit/sites/statuts", { domaine });
export const getSiteCockpit = (domaine) => apiGet("/cockpit/site", { domaine });
export const getEdition = (domaine, composant, element = "") => apiGet("/cockpit/edition", { domaine, composant, element });
export const apercuEdition = (domaine, composant, valeurs, element = "") => apiPost("/cockpit/edition/apercu", { domaine, composant, valeurs, element });
export const confirmerEdition = (jeton) => apiPost("/cockpit/edition/confirmer", { jeton });
export const getAdminTableau = () => apiGet("/cockpit/admin/tableau");
export const getAdminUtilisateurs = () => apiGet("/cockpit/admin/utilisateurs");
export const apercuAdmin = (action, params) => apiPost("/cockpit/admin/apercu", { action, params });
export const confirmerAdmin = (jeton) => apiPost("/cockpit/admin/confirmer", { jeton });
export const getIncidents = () => apiGet("/cockpit/incidents");
export const deciderIncident = (incident, decision) => apiPost("/cockpit/incidents/decision", { incident, decision });
export const getConstruire = (domaine, conteneur = "") => apiGet("/cockpit/construire", { domaine, conteneur });
export const getMediasCockpit = (domaine) => apiGet("/cockpit/construire", { domaine, vue: "medias" });
// Cle d'idempotence par action : un double clic ou une relance reseau ne cree jamais de doublon.
export const actionConstruire = (domaine, action, params = {}) =>
  apiPost("/cockpit/construire/action", { domaine, action, params, cle: crypto.randomUUID() });

// Import d'un media (corps binaire) avec suivi de progression ; cle d'idempotence par envoi.
export async function televerserMedia(domaine, fichier, { type, titre }, progression = () => {}) {
  const acces = await apiGet("/acces/status");
  const url = new URL(`${CONFIG.API_BASE_URL}/cockpit/medias/televerser`, window.location.origin);
  Object.entries({ domaine, type, titre, nom: fichier.name, cle: crypto.randomUUID() })
    .forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.timeout = 600000;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-DSE-CSRF", acces?.donnees?.csrf || "");
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) progression(Math.round((ev.loaded / ev.total) * 100)); };
    xhr.onload = () => {
      let payload = null;
      try { payload = JSON.parse(xhr.responseText); } catch { /* reponse non JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(payload);
      reject(new ApiError(payload?.erreur?.message || (xhr.status === 413 ? "Fichier trop volumineux." : `Erreur ${xhr.status}`), xhr.status, payload));
    };
    xhr.onerror = () => reject(new ApiError("Connexion impossible pendant l'envoi."));
    xhr.ontimeout = () => reject(new ApiError("Le délai d'envoi est dépassé. Vérifiez la bibliothèque avant de recommencer."));
    xhr.send(fichier);
  });
}
