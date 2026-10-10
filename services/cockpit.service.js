import { apiGet, apiPost, ApiError } from "../js/api.js";
import { CONFIG } from "../js/config.js";
export const getMoi = (domaine = "") => apiGet("/moi", { domaine }, { timeoutMs: 30000 });
export const getMonCompte = () => apiGet("/cockpit/compte");
export const getSitesCockpit = (criteres = {}) => apiGet("/cockpit/sites", criteres);
export const getReferentielsCreationSite = () => apiGet("/cockpit/creer/referentiels", {}, { timeoutMs: 45000 });
export const getDomainesCreationSite = () => apiGet("/cockpit/creer/domaines", {}, { timeoutMs: 45000 });
export const getBrouillonsSite = () => apiGet("/cockpit/sites/brouillons", {}, { timeoutMs: 45000 });
export const apercuCreationSite = (nom, reference) => apiPost("/cockpit/site/creer/apercu", { nom, reference });
export const apercuModificationSite = (domaine, nom) => apiPost("/cockpit/site/modifier/apercu", { domaine, nom });
export const apercuValidationSite = (reference) => apiPost("/cockpit/site/valider/apercu", { reference });
export const getUsagesSite = (domaine) => apiGet("/cockpit/site/usages", { domaine }, { timeoutMs: 45000 });
export const apercuAjoutUsageSite = (domaine, usageReference, dateEffet) =>
  apiPost("/cockpit/usages/apercu", { domaine, usageReference, dateEffet });
export const confirmerAjoutUsageSite = (jeton) => apiPost("/cockpit/edition/confirmer", { jeton });
export const getGalerie = (criteres = {}) => apiGet("/cockpit/galerie", criteres);
// Ouverture d'un cockpit : delai elargi, un depassement est un incident et jamais un refus.
export const getGalerieCockpit = (domaine) => apiGet("/cockpit/galerie/cockpit", { domaine }, { timeoutMs: 45000 });
export const getContenusCockpit = (criteres = {}) => apiGet("/cockpit/contenus", criteres);
export const getClientCockpit = (id, criteres = {}) => apiGet("/cockpit/client", { ...criteres, id });
export const getStatutsSite = (domaine) => apiGet("/cockpit/sites/statuts", { domaine });
export const getSiteCockpit = (domaine) => apiGet("/cockpit/site", { domaine }, { timeoutMs: 45000 });
export const getEdition = (domaine, composant, element = "") => apiGet("/cockpit/edition", { domaine, composant, element }, { timeoutMs: 45000 });
export const apercuEdition = (domaine, composant, valeurs, element = "", action = "modifier") =>
  apiPost("/cockpit/edition/apercu", { domaine, composant, valeurs, element, action });
export const confirmerEdition = (jeton) => apiPost("/cockpit/edition/confirmer", { jeton });
export const apercuDemandeAcces = (domaine, operation, motif) => apiPost("/cockpit/demandes-acces/apercu", { domaine, operation, motif });
export const confirmerDemandeAcces = (jeton) => apiPost("/cockpit/demandes-acces/confirmer", { jeton });
export const getAdminTableau = (contexteDomaine = "") => apiGet("/cockpit/admin/tableau", { contexteDomaine });
export const getAdminDroits = (contexteDomaine = "") => apiGet("/cockpit/admin/droits", { contexteDomaine }, { timeoutMs: 45000 });
export const apercuDroitAdmin = (params) => apiPost("/cockpit/admin/droits/apercu", params);
export const getAdminUtilisateurs = (contexteDomaine = "", criteres = {}) => apiGet("/cockpit/admin/utilisateurs", { ...criteres, contexteDomaine });
export const getEspaces = (criteres = {}) => apiGet("/cockpit/espaces", criteres);
export const apercuAdmin = (action, params) => apiPost("/cockpit/admin/apercu", { action, params });
export const confirmerAdmin = (jeton) => apiPost("/cockpit/admin/confirmer", { jeton });
export const getIncidents = () => apiGet("/cockpit/incidents");
export const deciderIncident = (incident, decision) => apiPost("/cockpit/incidents/decision", { incident, decision });
export const getConstruire = (domaine, conteneur = "") => apiGet("/cockpit/construire", { domaine, conteneur }, { timeoutMs: 45000 });
export const synchroniserMedias = () => apiPost("/cockpit/medias/synchroniser", {});
export const getSynchronisations = () => apiGet("/cockpit/admin/synchronisations");
export const reglerSynchronisation = (code, mode, frequence, unite) => apiPost("/cockpit/admin/synchronisations/reglage", { code, mode, frequence, unite });
export const lancerSynchronisation = (code) => apiPost("/cockpit/admin/synchronisations/lancer", { code });
export const getSauvegardes = () => apiGet("/cockpit/admin/synchronisations/sauvegardes");
export const getListesSauvegarde = (manifeste) => apiGet("/cockpit/admin/synchronisations/sauvegardes", { manifeste });
export const apercuRestauration = (manifeste, liste) => apiPost("/cockpit/admin/synchronisations/restauration/apercu", { manifeste, liste });
export const confirmerRestauration = (jeton, selection) => apiPost("/cockpit/admin/synchronisations/restauration/confirmer", { jeton, selection });
export const getMediasCockpit = (domaine) => apiGet("/cockpit/construire", { domaine, vue: "medias" }, { timeoutMs: 45000 });
// Cle d'idempotence par action : un double clic ou une relance reseau ne cree jamais de doublon.
export const actionConstruire = (domaine, action, params = {}, confirmation = {}) =>
  apiPost("/cockpit/construire/action", { domaine, action, params, cle: crypto.randomUUID(), ...confirmation });
export const getMenus = (domaine) => apiGet("/cockpit/menus", { domaine }, { timeoutMs: 45000 });
export const apercuMenu = (domaine, action, params = {}) => apiPost("/cockpit/menus/apercu", { domaine, action, params });
export const initialiserMenusSite = (domaine) => apiPost("/cockpit/menus/initialiser", { domaine });
export const getDemandesComptes = (domaine) => apiGet("/cockpit/demandes-comptes", { domaine }, { timeoutMs: 45000 });
export const deciderDemandeCompte = (domaine, reference, decision) =>
  apiPost("/cockpit/demandes-comptes/decision", { domaine, reference, decision });
export const getReglagesAccesSite = (domaine) =>
  apiGet("/cockpit/site/reglages-acces", { domaine }, { timeoutMs: 45000 });
export const enregistrerReglagesAccesSite = (domaine, valeurs) =>
  apiPost("/cockpit/site/reglages-acces", { domaine, valeurs });

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
