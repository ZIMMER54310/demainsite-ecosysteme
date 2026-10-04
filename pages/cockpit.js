import { initializeAuth } from "../js/auth.js";
import { setState } from "../js/state.js";
import {
  getSitesCockpit, getSiteCockpit, getEdition, apercuEdition, confirmerEdition,
  getAdminTableau, getAdminUtilisateurs, apercuAdmin, confirmerAdmin
} from "../services/cockpit.service.js";
import {
  rendreConnexion, rendreSansAcces, rendreAccueil, rendreListeSites, rendreVueSite, rendreAssistant,
  CRITERES_SITES, lienSites, rendreEdition, rendreApercu, rendreResultatEcriture, rendreAdministration, rendreUtilisateurs
} from "../modules/cockpit/cockpit.js";

const CLE_ASSISTANT = "dseAssistantSite";
const MESSAGES_CONNEXION = {
  echec: "La connexion n'a pas abouti. Merci de réessayer.",
  indisponible: "Ce mode de connexion n'est pas encore disponible."
};
const indisponible = `<section class="cockpit card"><p>Le cockpit est momentanément indisponible. Merci de réessayer dans quelques instants.</p></section>`;

const moiDepuis = (u) => ({
  nom: u.displayName, role: u.role, fonctions: u.fonctions, niveau: u.niveau, menu: u.menu,
  domaineAccueil: u.domaineAccueil, nombreSites: u.nombreSites, fournisseurs: u.fournisseurs
});
const domaineCourant = () => location.hostname.trim().toLowerCase().replace(/^www\./, "");

async function contexte(params = {}) {
  document.body.classList.remove("dse-public");
  const user = await initializeAuth();
  setState({ user });
  if (!user.authenticated) return { html: rendreConnexion({ fournisseurs: user.fournisseurs, message: MESSAGES_CONNEXION[params.connexion] || "" }) };
  if (!user.reconnu || !user.fonctions.length) return { html: rendreSansAcces(moiDepuis(user)) };
  return { moi: moiDepuis(user) };
}

async function vue(domaine) {
  if (!domaine) return null;
  try { return (await getSiteCockpit(domaine))?.donnees || null; } catch { return null; }
}

export async function cockpitAccueilPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    // Domaine d'accueil decide par le serveur (domaine courant du perimetre, sinon site principal).
    // Aucun choix par ordre : sans site principal designe, l'utilisateur choisit dans sa liste.
    const vueCourante = c.moi.fonctions.includes("sites") ? await vue(c.moi.domaineAccueil) : null;
    return rendreAccueil({ moi: c.moi, vueCourante, domaineCourant: domaineCourant() });
  } catch { return indisponible; }
}

export async function cockpitSitesPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    const criteres = Object.fromEntries(CRITERES_SITES.filter((k) => params?.[k]).map((k) => [k, params[k]]));
    const resultat = (await getSitesCockpit(criteres).catch(() => null))?.donnees || null;
    return rendreListeSites(c.moi, resultat);
  } catch { return indisponible; }
}

export async function cockpitSitePage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    const v = await vue(params.domaine);
    if (!v) return `<section class="cockpit card"><p>Ce site n'est pas disponible dans votre espace.</p><a class="btn btn-secondary" href="#/cockpit">Retour au cockpit</a></section>`;
    return rendreVueSite(c.moi, v, params.section);
  } catch { return indisponible; }
}

function lireAssistant() {
  try { return JSON.parse(sessionStorage.getItem(CLE_ASSISTANT) || "{}") || {}; } catch { return {}; }
}

export async function cockpitAssistantPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    if (!c.moi.fonctions.includes("creer")) return `<section class="cockpit card"><p>La création de site n'est pas disponible pour votre profil.</p><a class="btn btn-secondary" href="#/cockpit">Retour au cockpit</a></section>`;
    return rendreAssistant({ moi: c.moi, numero: params.etape, valeurs: lireAssistant() });
  } catch { return indisponible; }
}

// Saisies conservees uniquement dans la session du navigateur : aucune ecriture serveur.
// Filtres de « Mes sites » : l'adresse porte les criteres, l'API applique le filtrage.
export function activerFiltresSites(racine = document) {
  const form = racine.querySelector("[data-filtres-sites]");
  if (!form) return;
  const appliquer = () => { location.hash = lienSites(Object.fromEntries(new FormData(form))); };
  form.addEventListener("submit", (ev) => { ev.preventDefault(); appliquer(); });
  form.addEventListener("change", (ev) => { if (ev.target.tagName === "SELECT") appliquer(); });
}

export function activerAssistant(racine = document) {
  const form = racine.querySelector("[data-assistant]");
  if (!form) return;
  form.addEventListener("input", (ev) => {
    const champ = ev.target.closest("[data-assistant-champ]");
    if (!champ) return;
    const valeurs = lireAssistant();
    valeurs[champ.name] = champ.value;
    sessionStorage.setItem(CLE_ASSISTANT, JSON.stringify(valeurs));
  });
}

/* ---------------- Edition : formulaire -> apercu -> confirmation -> resultat ---------------- */

const nonDisponible = (texte) => `<section class="cockpit card"><p>${texte}</p><a class="btn btn-secondary" href="#/cockpit">Retour au cockpit</a></section>`;

export async function cockpitEditionPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    const r = await getEdition(params.domaine, params.composant, params.element || "").catch(() => null);
    if (!r?.donnees) return nonDisponible("Ce réglage n'est pas disponible dans votre espace.");
    return rendreEdition(c.moi, r.donnees, params);
  } catch { return indisponible; }
}

/*
 * Workflow commun aux formulaires d'ecriture : l'apercu est calcule par le serveur,
 * puis la confirmation est envoyee avec le jeton recu (aucune donnee technique cote navigateur).
 */
function brancherConfirmation(zone, apercu, confirmer, apresSucces) {
  const afficherErreur = (err) => { zone.innerHTML = rendreResultatEcriture({ erreur: err.message }); };
  return async (demande) => {
    zone.innerHTML = `<p class="muted">Préparation de l'aperçu…</p>`;
    let r;
    try { r = (await apercu(demande))?.donnees; } catch (err) { return afficherErreur(err); }
    zone.innerHTML = rendreApercu(r);
    zone.querySelector("[data-annuler]")?.addEventListener("click", () => { zone.innerHTML = ""; });
    const bouton = zone.querySelector("[data-confirmer]");
    bouton?.addEventListener("click", async () => {
      bouton.disabled = true;
      bouton.textContent = "Enregistrement…";
      try {
        const res = (await confirmer(r.jeton))?.donnees;
        zone.innerHTML = rendreResultatEcriture(res);
        apresSucces?.();
      } catch (err) { afficherErreur(err); }
    }, { once: true });
  };
}

export function activerEdition(racine = document) {
  const form = racine.querySelector("[data-edition]");
  const zone = racine.querySelector("[data-apercu]");
  if (!form || !zone) return;
  const lancer = brancherConfirmation(zone, (d) => apercuEdition(d.domaine, d.composant, d.valeurs, d.element), confirmerEdition, () => {
    form.querySelectorAll("[data-champ]").forEach((c) => { c.defaultValue = c.value; });
  });
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const valeurs = {};
    form.querySelectorAll("[data-champ]").forEach((c) => { valeurs[c.name] = c.value; });
    lancer({ domaine: form.dataset.domaine, composant: form.dataset.composant, element: form.dataset.element, valeurs });
  });
}

/* ---------------- Administration ---------------- */

export async function cockpitAdministrationPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    if (!c.moi.fonctions.includes("administration")) return nonDisponible("L'administration n'est pas disponible pour votre profil.");
    const r = await getAdminTableau().catch(() => null);
    if (!r?.donnees) return indisponible;
    return rendreAdministration(c.moi, r.donnees);
  } catch { return indisponible; }
}

export async function cockpitUtilisateursPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    if (!c.moi.fonctions.includes("utilisateurs")) return nonDisponible("La gestion des utilisateurs n'est pas disponible pour votre profil.");
    const r = await getAdminUtilisateurs().catch(() => null);
    if (!r?.donnees) return indisponible;
    return rendreUtilisateurs(c.moi, r.donnees);
  } catch { return indisponible; }
}

export function activerUtilisateurs(racine = document) {
  const zone = racine.querySelector("[data-apercu]");
  if (!zone) return;
  const lancer = brancherConfirmation(zone, (d) => apercuAdmin(d.action, d.params), confirmerAdmin);
  racine.querySelectorAll("form[data-action-admin]").forEach((form) => {
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const params = Object.fromEntries(new FormData(form));
      lancer({ action: form.dataset.actionAdmin, params });
      zone.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}
