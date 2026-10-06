import { apiGet, apiPost, ApiError } from "../js/api.js";
import { CONFIG } from "../js/config.js";
export const getMoi = (domaine = "") => apiGet("/moi", { domaine });
export const getMonCompte = () => apiGet("/cockpit/compte");
export const getSitesCockpit = (criteres = {}) => apiGet("/cockpit/sites", criteres);
export const getGalerie = (criteres = {}) => apiGet("/cockpit/galerie", criteres);
export const getGalerieCockpit = (domaine) => apiGet("/cockpit/galerie/cockpit", { domaine });
export const getContenusCockpit = (criteres = {}) => apiGet("/cockpit/contenus", criteres);
export const getClientCockpit = (id, criteres = {}) => apiGet("/cockpit/client", { ...criteres, id });
export const getStatutsSite = (domaine) => apiGet("/cockpit/sites/statuts", { domaine });
export const getSiteCockpit = (domaine) => apiGet("/cockpit/site", { domaine });
export const getEdition = (domaine, composant, element = "") => apiGet("/cockpit/edition", { domaine, composant, element });
export const apercuEdition = (domaine, composant, valeurs, element = "") => apiPost("/cockpit/edition/apercu", { domaine, composant, valeurs, element });
export const confirmerEdition = (jeton) => apiPost("/cockpit/edition/confirmer", { jeton });
export const apercuDemandeAcces = (domaine, operation, motif) => apiPost("/cockpit/demandes-acces/apercu", { domaine, operation, motif });
export const confirmerDemandeAcces = (jeton) => apiPost("/cockpit/demandes-acces/confirmer", { jeton });
export const getAdminTableau = (contexteDomaine = "") => apiGet("/cockpit/admin/tableau", { contexteDomaine });
export const getAdminUtilisateurs = (contexteDomaine = "", criteres = {}) => apiGet("/cockpit/admin/utilisateurs", { ...criteres, contexteDomaine });
export const getEspaces = (criteres = {}) => apiGet("/cockpit/espaces", criteres);
export const apercuAdmin = (action, params) => apiPost("/cockpit/admin/apercu", { action, params });
export const confirmerAdmin = (jeton) => apiPost("/cockpit/admin/confirmer", { jeton });
export const getIncidents = () => apiGet("/cockpit/incidents");
export const deciderIncident = (incident, decision) => apiPost("/cockpit/incidents/decision", { incident, decision });
export const getConstruire = (domaine, conteneur = "") => apiGet("/cockpit/construire", { domaine, conteneur });
export const synchroniserMedias = () => apiPost("/cockpit/medias/synchroniser", {});
export const getSynchronisations = () => apiGet("/cockpit/admin/synchronisations");
export const reglerSynchronisation = (code, mode, frequence, unite) => apiPost("/cockpit/admin/synchronisations/reglage", { code, mode, frequence, unite });
export const lancerSynchronisation = (code) => apiPost("/cockpit/admin/synchronisations/lancer", { code });
export const getSauvegardes = () => apiGet("/cockpit/admin/synchronisations/sauvegardes");
export const getListesSauvegarde = (manifeste) => apiGet("/cockpit/admin/synchronisations/sauvegardes", { manifeste });
export const apercuRestauration = (manifeste, liste) => apiPost("/cockpit/admin/synchronisations/restauration/apercu", { manifeste, liste });
export const confirmerRestauration = (jeton, selection) => apiPost("/cockpit/admin/synchronisations/restauration/confirmer", { jeton, selection });
export const getMediasCockpit = (domaine) => apiGet("/cockpit/construire", { domaine, vue: "medias" });
// Cle d'idempotence par action : un double clic ou une relance reseau ne cree jamais de doublon.
export const actionConstruire = (domaine, action, params = {}, confirmation = {}) =>
  apiPost("/cockpit/construire/action", { domaine, action, params, cle: crypto.randomUUID(), ...confirmation });

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
