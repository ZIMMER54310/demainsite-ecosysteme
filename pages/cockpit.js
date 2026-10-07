import { initializeAuth } from "../js/auth.js";
import { classerErreur, ETATS } from "../js/chargement.js";
import { setState, getState } from "../js/state.js";
import {
  getSitesCockpit, getClientCockpit, getSiteCockpit, getEdition, apercuEdition, confirmerEdition,
  getAdminTableau, getAdminUtilisateurs, getMonCompte, apercuAdmin, confirmerAdmin, getIncidents, deciderIncident, getStatutsSite, getConstruire,
  apercuDemandeAcces, confirmerDemandeAcces, getUsagesSite, apercuAjoutUsageSite, confirmerAjoutUsageSite,
  getDomainesCreationSite, getBrouillonsSite, apercuCreationSite, apercuModificationSite, apercuValidationSite
} from "../services/cockpit.service.js";
import { activerConstructeur } from "../modules/cockpit/constructeur.js";
import {
  rendreConnexion, rendreSansAcces, rendreAccueil, rendreListeSites, rendreVueSite, rendreAssistant,
  CRITERES_SITES, lienSites, rendreEdition, adressePublique, rendreApercu, rendreResultatEcriture, rendreAdministration, rendreUtilisateurs, rendreMonCompte
} from "../modules/cockpit/cockpit.js";
import { escapeHtml } from "../modules/public/outils.js";
import { getMediasCockpit, actionConstruire, televerserMedia } from "../services/cockpit.service.js";
import { rendreMedias } from "../modules/cockpit/medias.js";
import { rendreSynchronisations, activerSynchronisations } from "../modules/cockpit/synchronisations.js";
import { getSynchronisations } from "../services/cockpit.service.js";
import { rendreContenus, rendreRaccourcisContenus, activerContenus } from "../modules/cockpit/contenus.js";
import { getContenusCockpit } from "../services/cockpit.service.js";
import { getEspaces } from "../services/cockpit.service.js";
import { getGalerie, getGalerieCockpit } from "../services/cockpit.service.js";
import { rendreGalerie, CRITERES_GALERIE, lienGalerie } from "../modules/cockpit/galerie-sites.js";
import { rendreComptes, rendreEspaces, activerFiltresComptes, activerFiltresEspaces } from "../modules/cockpit/comptes.js";
import { rendreMenus, activerMenus } from "../modules/cockpit/menus.js";
import { getMenus } from "../services/cockpit.service.js";
import { getDemandesComptes, getReglagesAccesSite } from "../services/cockpit.service.js";
import { rendreDemandesComptes, activerDemandesComptes } from "../modules/cockpit/demandes-comptes.js";
import { rendreReglagesAcces, activerReglagesAcces } from "../modules/cockpit/reglages-acces.js";

const CLE_ASSISTANT = "dseAssistantSite";
const MESSAGES_CONNEXION = {
  echec: "La connexion n'a pas abouti. Merci de réessayer.",
  "inscription-refusee": "Inscription refusée ou incomplète. Votre administrateur doit vérifier l'autorisation SharePoint pour ce compte et ce site.",
  securise: "Accès temporairement sécurisé. Contactez votre administrateur pour vérification.",
  indisponible: "Ce mode de connexion n'est pas encore disponible."
};
// ERROR : echec reel (delai, reseau, 5xx) avec Reessayer ; jamais un refus d'acces.
export const echecChargement = () => `<section class="cockpit card" role="alert" data-dse-etat="${ETATS.ERROR}"><h2>Le chargement n'a pas abouti</h2>
  <p>DemainSite Écosystème n'a pas reçu de réponse complète à temps. Vos droits ne sont pas en cause.</p>
  <div class="cockpit-actions"><a class="btn btn-primary" href="${escapeHtml(location.hash || "#/cockpit")}" data-reessayer-site>Réessayer</a>
  <a class="btn btn-secondary" href="#/cockpit/sites">Mes sites</a></div></section>`;
// FORBIDDEN : uniquement apres un refus definitif du serveur (401/403).
const refusAcces = (texte) => `<section class="cockpit card" data-dse-etat="${ETATS.FORBIDDEN}"><p>${escapeHtml(texte || "Cette fonction n'est pas disponible dans votre espace.")}</p><a class="btn btn-secondary" href="#/cockpit/sites">Retour à Mes sites</a></section>`;
// Lance une lecture sans rejet non capture : { r } ou { erreur }.
const lancer = (appel) => Promise.resolve().then(appel).then((r) => ({ r }), (erreur) => ({ erreur }));
export const echec = (err, texteRefus) => (classerErreur(err) === ETATS.FORBIDDEN ? refusAcces(texteRefus || err?.message) : echecChargement());

const moiDepuis = (u) => ({
  nom: u.displayName, role: u.role, fonctions: u.fonctions, niveau: u.niveau, menu: u.menu,
  accesType: u.accesType, contexte: u.contexte, autorisations: u.autorisations,
  domaineAccueil: u.domaineAccueil, nombreSites: u.nombreSites, clients: u.clients || [], porteeGlobale: u.porteeGlobale === true, fournisseurs: u.fournisseurs
});
const domaineCourant = () => location.hostname.trim().toLowerCase().replace(/^www\./, "");

/*
 * Reutilisation pendant une meme navigation (affichage uniquement) : le contexte /moi et la vue
 * du site deja charges sont reutilises peu de temps. Chaque donnee metier reste controlee par le
 * serveur (identite, droits, perimetre) a chaque appel.
 */
const REUTILISATION_MOI_MS = 30000;
const REUTILISATION_VUE_MS = 60000;
let moiCharge = null;
let vueChargee = null;

async function contexte(params = {}, { reutiliser = false } = {}) {
  document.body.classList.remove("dse-public");
  const domaine = params.domaine || "";
  const precedent = getState().user;
  const etabli = Boolean(precedent?.authenticated && precedent.reconnu && !precedent.erreur);
  let user;
  if (reutiliser && etabli && moiCharge?.domaine === domaine && Date.now() - moiCharge.t < REUTILISATION_MOI_MS) user = precedent;
  else {
    user = await initializeAuth(domaine);
    if (!user.erreur) moiCharge = { domaine, t: Date.now() };
    else if (etabli && user.statut !== 401 && user.statut !== 403) {
      // Incident temporaire : le contexte deja etabli (menu, site selectionne) reste affiche.
      console.warn("[DSE cockpit] contexte conserve apres incident temporaire");
      user = precedent;
    }
  }
  setState({ user });
  if (user.erreur) return { html: user.statut === 401 || user.statut === 403 ? refusAcces(user.erreur) : echecChargement() };
  if (!user.authenticated) return { html: rendreConnexion({ fournisseurs: user.fournisseurs, message: MESSAGES_CONNEXION[params.connexion] || "" }) };
  if (!user.reconnu) return { html: rendreSansAcces(moiDepuis(user)) + (user.identification?.codeLiaison
    ? `<section class="cockpit card"><h2>Lier votre compte existant</h2><p>${escapeHtml(user.identification.message)}</p>
      <p>Transmettez uniquement à votre administrateur ce code de liaison OAuth :</p><input readonly aria-label="Code personnel de liaison" value="${escapeHtml(user.identification.codeLiaison)}">
      <p>Ne publiez pas ce code. Après liaison, rechargez Mes sites ; aucun rôle ne sera créé.</p></section>` : "") };
  return { moi: moiDepuis(user) };
}

/*
 * Etats explicites d'ouverture d'un site : READY, FORBIDDEN (refus definitif du serveur, 401/403)
 * ou ERROR (delai, reseau, indisponibilite). Une reponse absente ou en cours n'est jamais un refus.
 */
export function etatOuverture(resultat) {
  if (resultat?.erreur) {
    const statut = resultat.erreur.status;
    return statut === 403 || statut === 401 ? { etat: "FORBIDDEN", message: resultat.erreur.message || "" } : { etat: "ERROR" };
  }
  return resultat?.site ? { etat: "READY", site: resultat.site } : { etat: "ERROR" };
}

function appliquerVue(site, domaine) {
  setState({ selectedSite: site });
  vueChargee = site ? { domaine, t: Date.now() } : null;
  if (site?.contexteUtilisateur) {
    const user = { ...getState().user, ...site.contexteUtilisateur,
      porteeGlobale: site.contexteUtilisateur.porteeGlobale === true };
    setState({ user });
  }
}

export function rendreOuverture(nom) {
  return `<section class="cockpit cockpit-ouverture" aria-busy="true">
    <div class="card cockpit-ouverture-statut" role="status" aria-live="polite">
      <span class="dse-spinner" aria-hidden="true"></span>
      <div><p class="cockpit-ouverture-titre">Ouverture de ${escapeHtml(nom || "votre site")}…</p>
      <p class="muted">Vérification de vos droits et chargement du cockpit.</p></div></div>
    <div class="cockpit-squelette" aria-hidden="true">
      <div class="cockpit-squelette-bloc cockpit-squelette-entete"></div>
      <div class="cockpit-squelette-grille">${"<div class=\"cockpit-squelette-bloc\"></div>".repeat(4)}</div>
      <div class="cockpit-squelette-bloc cockpit-squelette-large"></div></div></section>`;
}

const refusSite = `<section class="cockpit card" data-dse-etat="${ETATS.FORBIDDEN}"><p>Ce site n'est pas disponible dans votre espace.</p><a class="btn btn-secondary" href="#/cockpit/sites">Retour à Mes sites</a></section>`;
const erreurSite = (domaine) => `<section class="cockpit card" role="alert" data-dse-etat="${ETATS.ERROR}"><h2>Le cockpit n'a pas pu être chargé</h2>
  <p>DemainSite Écosystème n'a pas reçu de réponse complète à temps. Vos droits ne sont pas en cause.</p>
  <div class="cockpit-actions"><a class="btn btn-primary" href="#/cockpit/site/${encodeURIComponent(domaine || "")}" data-reessayer-site>Réessayer</a>
  <a class="btn btn-secondary" href="#/cockpit/sites">Retour à Mes sites</a></div></section>`;

/*
 * Contexte du site pour le menu. Pendant une navigation interne au site, la vue deja chargee
 * (meme domaine, recente) est reutilisee. Seul un refus definitif retire le site selectionne :
 * un incident temporaire conserve le contexte affiche.
 */
async function vue(domaine, { recente = false } = {}) {
  if (!domaine) return null;
  const courant = getState().selectedSite;
  if (recente && courant && !courant.provisoire && vueChargee?.domaine === domaine && Date.now() - vueChargee.t < REUTILISATION_VUE_MS) return courant;
  try {
    const site = (await getSiteCockpit(domaine))?.donnees || null;
    appliquerVue(site, domaine);
    return site;
  } catch (err) {
    if (classerErreur(err) === ETATS.FORBIDDEN) setState({ selectedSite: null });
    console.error("[DSE cockpit] contexte du site non actualise", err.message);
    return null;
  }
}

// Contexte visuel immediat du site demande (nom deja connu) en attendant la reponse du serveur.
export function preparerContexteSite(domaine) {
  if (!domaine) return;
  const courant = getState().selectedSite;
  if (courant && (courant.acces === domaine || courant.domaine === domaine)) return;
  let nom = domaine;
  try { nom = sessionStorage.getItem(`dseOuverture:${domaine}`) || domaine; } catch { /* stockage indisponible */ }
  setState({ selectedSite: { acces: domaine, domaine, nom, provisoire: true, fonctions: [] } });
}

export async function cockpitAccueilPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    // Domaine d'accueil decide par le serveur (domaine courant du perimetre, sinon site principal).
    // Aucun choix par ordre : sans site principal designe, l'utilisateur choisit dans sa liste.
    const vueCourante = c.moi.fonctions.includes("sites") ? await vue(c.moi.domaineAccueil) : null;
    return rendreAccueil({ moi: c.moi, vueCourante, domaineCourant: domaineCourant(), complement: rendreRaccourcisContenus(c.moi) });
  } catch (err) { return echec(err); }
}

export async function cockpitSitesPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    const criteres = Object.fromEntries(CRITERES_SITES.filter((k) => params?.[k]).map((k) => [k, params[k]]));
    const resultat = (await getSitesCockpit(criteres))?.donnees || null;
    return rendreListeSites(c.moi, resultat, { complement: rendreRaccourcisContenus(c.moi) });
  } catch (err) { return echec(err); }
}

export async function cockpitGaleriePage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    const criteres = Object.fromEntries(CRITERES_GALERIE.filter((k) => params?.[k]).map((k) => [k, params[k]]));
    try {
      return rendreGalerie((await getGalerie(criteres)).donnees);
    } catch (e) {
      return rendreGalerie(null, e);
    }
  } catch (err) { return echec(err); }
}

// Le bouton cockpit est verifie par l'API (droit + relation SharePoint) avant toute navigation.
export function activerGalerie(racine = document) {
  const form = racine.querySelector("[data-filtres-galerie]");
  if (form) {
    const appliquer = () => { location.hash = lienGalerie(Object.fromEntries(new FormData(form))); };
    form.addEventListener("submit", (ev) => { ev.preventDefault(); appliquer(); });
    form.addEventListener("change", (ev) => { if (ev.target.tagName === "SELECT") appliquer(); });
  }
  racine.querySelector("[data-galerie-reessayer]")?.addEventListener("click", () => location.reload());
  racine.querySelectorAll("[data-ouvrir-cockpit]").forEach((bouton) => {
    bouton.addEventListener("click", async () => {
      if (bouton.disabled) return;
      const message = racine.querySelector("[data-galerie-message]");
      const libelle = bouton.innerHTML;
      const nom = bouton.dataset.nom || bouton.dataset.ouvrirCockpit;
      bouton.disabled = true;
      bouton.setAttribute("aria-busy", "true");
      bouton.innerHTML = `<span class="dse-spinner dse-spinner-petit" aria-hidden="true"></span> Ouverture…`;
      if (message) message.textContent = `Ouverture de ${nom}… Vérification de vos droits et chargement du cockpit.`;
      try {
        const r = (await getGalerieCockpit(bouton.dataset.ouvrirCockpit)).donnees;
        try { sessionStorage.setItem(`dseOuverture:${bouton.dataset.ouvrirCockpit}`, nom); } catch { /* stockage indisponible */ }
        location.hash = `#${r.url}`;
      } catch (e) {
        // Refus uniquement sur reponse definitive du serveur ; sinon incident temporaire.
        if (message) message.textContent = e.status === 403 || e.status === 401 ? "Le cockpit de ce site n’est pas disponible pour votre compte." : "Ouverture impossible pour le moment. Merci de réessayer.";
        bouton.disabled = false;
        bouton.removeAttribute("aria-busy");
        bouton.innerHTML = libelle;
      }
    });
  });
}

export async function cockpitClientPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    const criteres = Object.fromEntries(CRITERES_SITES.filter((k) => k !== "client" && params?.[k]).map((k) => [k, params[k]]));
    const resultat = (await getClientCockpit(params.id, { ...criteres, contexteDomaine: params.domaine || "" }).catch((err) => {
      if (err?.status === 403 || err?.status === 404) return null;
      throw err;
    }))?.donnees || null;
    if (!resultat?.client) return `<section class="cockpit card"><p>Cet espace client n'est pas disponible.</p><a class="btn btn-secondary" href="#/cockpit">Retour au cockpit</a></section>`;
    return rendreListeSites(c.moi, resultat, { complement: rendreRaccourcisContenus(c.moi, { client: resultat.client.id }) });
  } catch (err) { return echec(err); }
}

export async function cockpitContenusPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    const criteres = { type: params?.type || "medias" };
    if (params?.client) criteres.client = params.client;
    criteres.contexteDomaine = params.domaine || "";
    const r = (await getContenusCockpit(criteres))?.donnees || null;
    return rendreContenus(r);
  } catch (err) { return echec(err); }
}

export { activerContenus };

export async function cockpitSynchronisationsPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    try {
      return rendreSynchronisations((await getSynchronisations())?.donnees || null);
    } catch (err) {
      if (err?.status === 403 || err?.status === 401) return rendreSynchronisations(null);
      throw err;
    }
  } catch (err) { return echec(err); }
}

export { activerSynchronisations };

export async function cockpitSitePage(params) {
  try {
    // Lectures independantes lancees ensemble ; le serveur controle chacune (identite, droits, perimetre).
    const chargement = params.domaine
      ? getSiteCockpit(params.domaine).then((r) => ({ site: r?.donnees || null }), (erreur) => ({ erreur }))
      : Promise.resolve({ erreur: { status: 403 } });
    const c = await contexte(params);
    if (c.html) {
      chargement.catch(() => {});
      return c.html;
    }
    const resultat = etatOuverture(await chargement);
    if (resultat.etat === "READY") {
      const ops = resultat.site.contexteUtilisateur?.autorisations?.operations || [];
      if (ops.some((operation) => ["usage-site.voir", "usage-site.creer"].includes(operation.operation))) {
        try {
          resultat.site.usagesSite = (await getUsagesSite(params.domaine))?.donnees || {
            erreur: "Les usages du site n’ont pas pu être chargés."
          };
        } catch (err) {
          console.error("[DSE cockpit] usages du site", err.message);
          resultat.site.usagesSite = { erreur: err.message || "Les usages du site ne sont pas disponibles." };
        }
      }
      appliquerVue(resultat.site, params.domaine);
      return rendreVueSite(c.moi, resultat.site, params.section);
    }
    if (resultat.etat === "FORBIDDEN") {
      setState({ selectedSite: null });
      return refusSite;
    }
    console.error("[DSE cockpit] ouverture du site interrompue");
    return erreurSite(params.domaine);
  } catch (err) { return echec(err); }
}

function lireAssistant() {
  try { return JSON.parse(sessionStorage.getItem(CLE_ASSISTANT) || "{}") || {}; } catch { return {}; }
}

export function activerVueSite(racine) {
  racine.querySelectorAll("[data-site-modifier-form]").forEach((form) => {
    const zone = form.parentElement.querySelector("[data-site-modifier-result]");
    const lancer = brancherConfirmation(zone,
      (donnees) => apercuModificationSite(form.dataset.domaine, donnees.nom),
      confirmerEdition,
      () => { form.querySelector("[name=nom]").defaultValue = form.querySelector("[name=nom]").value; });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      lancer({ nom: String(new FormData(form).get("nom") || "") });
    });
  });
  racine.querySelectorAll("[data-usages-site-form]").forEach((form) => {
    const zone = racine.querySelector("[data-usage-site-result]");
    let jeton = null;
    const afficherErreur = (message) => {
      if (zone) zone.innerHTML = `<p class="cockpit-ecriture-erreur" role="alert">${escapeHtml(message)}</p>`;
    };
    form.addEventListener("input", () => {
      jeton = null;
      if (zone) zone.replaceChildren();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const donnees = new FormData(form);
      const bouton = form.querySelector('[type="submit"]');
      bouton.disabled = true;
      try {
        const apercu = (await apercuAjoutUsageSite(form.dataset.domaine,
          String(donnees.get("usageReference") || ""), String(donnees.get("dateEffet") || "")))?.donnees;
        if (!apercu?.jeton || !apercu.apercu) throw new Error("L’aperçu sécurisé n’a pas pu être préparé.");
        jeton = apercu.jeton;
        const lignes = (apercu.apercu.changements || []).map((x) =>
          `<dt>${escapeHtml(x.libelle)}</dt><dd>${escapeHtml(x.apres)}</dd>`).join("");
        zone.innerHTML = `<div class="cockpit-usages-apercu"><h3>Vérifier le changement</h3>
          <p>Site : ${escapeHtml(apercu.apercu.contexte?.site || "")}</p><dl>${lignes}</dl>
          <p class="muted">${escapeHtml(apercu.apercu.impact || "")}</p>
          <button type="button" class="btn btn-primary" data-confirmer-usage>Confirmer l’ajout</button>
          <button type="button" class="btn btn-secondary" data-annuler-usage>Annuler</button>
          <p role="status" data-usage-message></p></div>`;
        zone.querySelector("[data-annuler-usage]").addEventListener("click", () => {
          jeton = null;
          zone.replaceChildren();
        });
        zone.querySelector("[data-confirmer-usage]").addEventListener("click", async (confirmationEvent) => {
          const boutonConfirmer = confirmationEvent.currentTarget;
          boutonConfirmer.disabled = true;
          const message = zone.querySelector("[data-usage-message]");
          try {
            const resultat = (await confirmerAjoutUsageSite(jeton))?.donnees;
            if (!resultat?.succes) throw new Error(resultat?.erreur || "L’enregistrement doit être vérifié.");
            message.textContent = "Usage enregistré, relu dans SharePoint et journalisé dans OBJ-JRN.";
            form.hidden = true;
            jeton = null;
          } catch (err) {
            message.textContent = err.message;
            boutonConfirmer.disabled = false;
            if (err.details?.enregistrementEffectue) boutonConfirmer.textContent = "Reprendre la journalisation";
          }
        });
      } catch (err) {
        jeton = null;
        afficherErreur(err.message);
      } finally {
        bouton.disabled = false;
      }
    });
  });
  racine.querySelectorAll("[data-demande-acces]").forEach((bouton) => bouton.addEventListener("click", () => {
    const dialogue = document.createElement("dialog");
    dialogue.className = "cockpit-statut-dialogue";
    dialogue.innerHTML = `<form><h2>Demander l'accès</h2><label>Expliquez votre besoin
      <textarea name="motif" required maxlength="4000"></textarea></label><div data-apercu-demande></div>
      <p role="status" data-message-demande></p><button class="btn btn-primary" type="submit">Voir l'aperçu</button>
      <button class="btn btn-secondary" type="button" data-fermer>Annuler</button></form>`;
    let jeton = null;
    const fermer = () => { dialogue.close(); dialogue.remove(); };
    dialogue.querySelector("[data-fermer]").addEventListener("click", fermer);
    dialogue.addEventListener("cancel", (ev) => { ev.preventDefault(); fermer(); });
    dialogue.querySelector("textarea").addEventListener("input", () => {
      jeton = null; dialogue.querySelector("[type=submit]").textContent = "Voir l'aperçu";
      dialogue.querySelector("[data-apercu-demande]").innerHTML = "";
    });
    dialogue.querySelector("form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const submit = dialogue.querySelector("[type=submit]");
      submit.disabled = true;
      try {
        if (!jeton) {
          const r = (await apercuDemandeAcces(bouton.dataset.domaine, bouton.dataset.demandeAcces,
            dialogue.querySelector("textarea").value)).donnees;
          if (!r?.jeton || !r.apercu) throw new Error("L'aperçu de la demande n'a pas été confirmé.");
          jeton = r.jeton;
          dialogue.querySelector("[data-apercu-demande]").innerHTML = `<dl>${Object.entries(r.apercu)
            .map(([cle, valeur]) => `<dt>${escapeHtml(cle)}</dt><dd>${escapeHtml(valeur || "")}</dd>`).join("")}</dl>`;
          submit.textContent = "Confirmer la demande";
        } else {
          const r = (await confirmerDemandeAcces(jeton)).donnees;
          if (!r?.succes) throw new Error(r?.erreur || "L'enregistrement de la demande doit être vérifié.");
          dialogue.querySelector("[data-message-demande]").textContent = "Votre demande est enregistrée. Aucun droit n'a été attribué automatiquement.";
          jeton = null; submit.hidden = true; dialogue.querySelector("textarea").readOnly = true;
          dialogue.querySelector("[data-fermer]").textContent = "Fermer";
        }
      } catch (err) { dialogue.querySelector("[data-message-demande]").textContent = err.message; }
      finally { submit.disabled = false; }
    });
    document.body.append(dialogue); dialogue.showModal();
  }));
  racine.querySelector("[data-ouvrir-progression]")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    const details = racine.querySelector(".cockpit-progression");
    if (!details) return;
    details.open = true;
    details.querySelector("summary").focus();
    details.scrollIntoView({ block: "start", behavior: "auto" });
  });
}

export async function cockpitAssistantPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    if (!c.moi.fonctions.includes("creer")) return `<section class="cockpit card"><p>La création de site n'est pas disponible pour votre profil.</p><a class="btn btn-secondary" href="#/cockpit">Retour au cockpit</a></section>`;
    const [domaines, brouillons] = await Promise.all([
      lancer(getDomainesCreationSite), lancer(getBrouillonsSite)
    ]);
    return rendreAssistant({
      moi: c.moi, numero: params.etape, valeurs: lireAssistant(),
      domaines: domaines.r?.donnees || [], erreurDomaines: domaines.erreur?.message || null,
      brouillons: brouillons.r?.donnees || [], erreurBrouillons: brouillons.erreur?.message || null
    });
  } catch (err) { return echec(err); }
}

// Saisies conservees uniquement dans la session du navigateur : aucune ecriture serveur.
// Filtres de « Mes sites » : l'adresse porte les criteres, l'API applique le filtrage.
export function activerFiltresSites(racine = document) {
  racine.querySelectorAll("[data-vue-sites]").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      racine.querySelector(".cockpit-tableau")?.classList.toggle("cockpit-vue-cartes", bouton.dataset.vueSites === "cartes");
      racine.querySelectorAll("[data-vue-sites]").forEach((b) => b.setAttribute("aria-pressed", String(b === bouton)));
    });
  });
  racine.querySelectorAll("[data-changer-statut]").forEach((bouton) => {
    bouton.addEventListener("click", async () => {
      const dialogue = document.createElement("dialog");
      dialogue.className = "cockpit-statut-dialogue";
      dialogue.innerHTML = `<h2>Changer le statut du site</h2><div data-statut-form><p>Chargement des statuts…</p></div>
        <div data-apercu role="status"></div><button class="btn btn-secondary" data-fermer type="button">Annuler</button>`;
      document.body.append(dialogue);
      dialogue.addEventListener("close", () => dialogue.remove(), { once: true });
      dialogue.querySelector("[data-fermer]").addEventListener("click", () => dialogue.close());
      dialogue.showModal();
      const zone = dialogue.querySelector("[data-apercu]");
      try {
        const d = (await getStatutsSite(bouton.dataset.changerStatut)).donnees;
        if (!dialogue.isConnected) return;
        dialogue.querySelector("[data-statut-form]").innerHTML = `<p>${escapeHtml(d.site)}</p><form data-statut-selection>
          <label>Nouveau statut<select name="statut" required>${!d.statuts.some((s) => s.ref === d.actuel) ? `<option value="" selected disabled>${escapeHtml(d.statutActuel)}</option>` : ""}
          ${d.statuts.map((s) => `<option value="${escapeHtml(s.ref)}"${s.ref === d.actuel ? " selected" : ""}>${escapeHtml(s.titre)}</option>`).join("")}</select></label>
          <button class="btn btn-primary" type="submit">Valider</button></form>`;
        const lancer = brancherConfirmation(zone, (p) => apercuAdmin("changer-statut-site", p), confirmerAdmin, async (resultat) => {
          const criteres = Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || ""));
          try {
            const clientId = /^#\/cockpit\/client\/(\d+)/.exec(location.hash)?.[1];
            const r = (await (clientId ? getClientCockpit(clientId, criteres) : getSitesCockpit(criteres))).donnees;
            const user = getState().user;
            racine.innerHTML = rendreListeSites(moiDepuis(user), r);
            activerFiltresSites(racine);
            racine.querySelector("[data-resultat-statut]").textContent = resultat.journal?.enregistre
              ? "Statut enregistré et journalisé." : "Statut enregistré, mais journalisation indisponible : vérification nécessaire.";
            dialogue.close();
          } catch (e) {
            zone.innerHTML = rendreResultatEcriture({ erreur: `Statut enregistré ; actualisation impossible : ${e.message}` });
          }
        });
        dialogue.querySelector("form").addEventListener("submit", (ev) => {
          ev.preventDefault();
          lancer({ domaine: bouton.dataset.changerStatut, statut: new FormData(ev.currentTarget).get("statut") });
        });
      } catch (e) { zone.innerHTML = rendreResultatEcriture({ erreur: e.message }); }
    });
  });
  const form = racine.querySelector("[data-filtres-sites]");
  if (!form) return;
  const appliquer = () => { location.hash = lienSites(Object.fromEntries(new FormData(form)), {}, form.dataset.base); };
  form.addEventListener("submit", (ev) => { ev.preventDefault(); appliquer(); });
  form.addEventListener("change", (ev) => { if (ev.target.tagName === "SELECT") appliquer(); });
}

export function activerAssistant(racine = document) {
  const form = racine.querySelector("[data-assistant]");
  if (form) {
    const enregistrer = (ev) => {
      const champ = ev.target.closest("[data-assistant-champ]");
      if (!champ) return;
      const valeurs = lireAssistant();
      valeurs[champ.name] = champ.value;
      sessionStorage.setItem(CLE_ASSISTANT, JSON.stringify(valeurs));
    };
    form.addEventListener("input", enregistrer);
    form.addEventListener("change", enregistrer);
  }
  const creation = racine.querySelector("[data-site-creer-apercu]");
  if (creation && form) {
    creation.addEventListener("click", () => {
      const zone = racine.querySelector("[data-site-creer-result]");
      const valeurs = lireAssistant();
      if (!String(valeurs.nom || "").trim() || !String(valeurs.domaineReference || "").trim()) {
        zone.textContent = "Renseignez le nom et sélectionnez un domaine avant de continuer.";
        return;
      }
      const lancer = brancherConfirmation(zone,
        () => apercuCreationSite(String(valeurs.nom || ""), String(valeurs.domaineReference || "")),
        confirmerEdition,
        (resultat) => {
          if (!resultat?.succes) return;
          creation.disabled = true;
          const init = resultat.initialisationMenu;
          const messageMenu = !init
            ? "Le menu automatique n’a pas été confirmé. Vérifiez l’initialisation avant de publier le site."
            : init.aReparer
              ? `Menu principal créé ; réparation nécessaire : ${init.accueil?.raison || init.affectation?.raison || init.erreur || "page d’accueil ou en-tête réel manquant"}.`
              : "Menu principal créé, page d’accueil ajoutée et menu affecté à l’en-tête.";
          zone.insertAdjacentHTML("beforeend", `<p role="status">Le site est créé en brouillon, inactif et non validé. ${escapeHtml(messageMenu)} Rechargez la page pour le voir dans la liste des validations.</p>`);
        });
      lancer({});
    });
  }
  racine.querySelectorAll("[data-site-valider]").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      const zone = document.createElement("div");
      bouton.insertAdjacentElement("afterend", zone);
      const lancer = brancherConfirmation(zone,
        () => apercuValidationSite(bouton.dataset.siteValider),
        confirmerEdition,
        (resultat) => {
          if (!resultat?.succes) return;
          bouton.disabled = true;
          bouton.textContent = "Validé · toujours inactif";
          const statut = bouton.closest("li")?.querySelector(".muted");
          if (statut) statut.textContent = "Validé · toujours inactif";
        });
      lancer({});
    });
  });
}

/* ---------------- Edition : formulaire -> apercu -> confirmation -> resultat ---------------- */

const nonDisponible = (texte) => `<section class="cockpit card" data-dse-etat="${ETATS.FORBIDDEN}"><p>${texte}</p><a class="btn btn-secondary" href="#/cockpit">Retour au cockpit</a></section>`;

export async function cockpitEditionPage(params) {
  try {
    const refus = "Ce réglage n'est pas disponible dans votre espace.";
    const donnees = lancer(() => getEdition(params.domaine, params.composant, params.element || ""));
    const c = await contexte(params, { reutiliser: true });
    if (c.html) return c.html;
    const [{ r, erreur }] = await Promise.all([donnees, vue(params.domaine, { recente: true })]);
    if (erreur) return echec(erreur, refus);
    if (!r?.donnees) return echecChargement();
    return rendreEdition(c.moi, r.donnees, params);
  } catch (err) { return echec(err); }
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
    const enregistrer = async () => {
      const courant = zone.querySelector("[data-confirmer]");
      if (courant) { courant.disabled = true; courant.textContent = "Enregistrement…"; }
      try {
        const res = (await confirmer(r.jeton))?.donnees;
        zone.innerHTML = rendreResultatEcriture(res);
        await apresSucces?.(res, demande);
      } catch (err) {
        afficherErreur(err);
        if (err.details?.enregistrementEffectue) {
          zone.insertAdjacentHTML("beforeend", '<button type="button" class="btn btn-secondary" data-confirmer>Reprendre uniquement la journalisation</button>');
          zone.querySelector("[data-confirmer]").addEventListener("click", enregistrer, { once: true });
        }
      }
    };
    bouton?.addEventListener("click", enregistrer, { once: true });
  };
}

export function activerEdition(racine = document) {
  const form = racine.querySelector("[data-edition]");
  const zone = racine.querySelector("[data-apercu]");
  if (!zone) return;
  const lancer = brancherConfirmation(zone, (d) =>
    apercuEdition(d.domaine, d.composant, d.valeurs, d.element, d.action), confirmerEdition, (_res, demande) => {
    if (demande?.action === "desactiver") location.hash = `#/cockpit/site/${encodeURIComponent(demande.domaine || "")}`;
    form?.querySelectorAll("[data-champ]").forEach((c) => { c.defaultValue = c.value; });
  });
  form?.querySelectorAll("[data-chemin]").forEach((champ) => {
    const apercu = champ.closest(".cockpit-chemin")?.querySelector("[data-chemin-apercu]");
    if (apercu) champ.addEventListener("input", () => { apercu.textContent = adressePublique(champ.dataset.domainePrincipal, champ.value); });
  });
  form?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const valeurs = {};
    form.querySelectorAll("[data-champ]").forEach((c) => { valeurs[c.name] = c.value; });
    lancer({ domaine: form.dataset.domaine, composant: form.dataset.composant, element: form.dataset.element, valeurs });
  });
  racine.querySelectorAll("[data-edition-etat]").forEach((bouton) => bouton.addEventListener("click", () => {
    const domaine = bouton.dataset.domaine || "";
    lancer({ domaine, composant: bouton.dataset.composant || "", element: bouton.dataset.element || "",
      action: bouton.dataset.action || "" });
  }));
}

/* ---------------- Administration ---------------- */

export async function cockpitAdministrationPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    if (!c.moi.fonctions.includes("administration")) return nonDisponible("L'administration n'est pas disponible pour votre profil.");
    const r = await getAdminTableau(params.domaine || "");
    if (!r?.donnees) return echecChargement();
    return rendreAdministration(c.moi, r.donnees);
  } catch (err) { return echec(err); }
}

export async function cockpitUtilisateursPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    if (!c.moi.fonctions.includes("utilisateurs")) return nonDisponible("La gestion des utilisateurs n'est pas disponible pour votre profil.");
    const r = await getAdminUtilisateurs(params.domaine || "", params);
    if (!r?.donnees) return echecChargement();
    if (r.donnees.peutGererIncidents) r.donnees.incidents = (await getIncidents()).donnees;
    return rendreComptes(c.moi, r.donnees, params);
  } catch (err) {
    console.error("[DSE Comptes]", err.message);
    return echec(err);
  }
}

export function activerUtilisateurs(racine = document) {
  activerFiltresComptes(racine);
  racine.querySelectorAll("[data-decision-incident]").forEach((bouton) => {
    bouton.addEventListener("click", async () => {
      if (!confirm("Confirmer cette décision après vérification de l’incident ?")) return;
      bouton.disabled = true;
      const zoneIncident = racine.querySelector("[data-resultat-incident]");
      try {
        await deciderIncident(bouton.dataset.incident, bouton.dataset.decisionIncident);
        zoneIncident.textContent = "Décision enregistrée et journalisée. Rechargez la page pour voir l’état actualisé.";
      } catch (e) {
        zoneIncident.textContent = e.message;
        bouton.disabled = false;
      }
    });
  });
  const zone = racine.querySelector("[data-apercu]");
  if (!zone) return;
  const lancer = brancherConfirmation(zone, (d) => apercuAdmin(d.action, d.params), confirmerAdmin,
    (resultat) => { if (resultat.succes) location.reload(); });
  racine.querySelectorAll("form[data-action-admin]").forEach((form) => {
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const params = Object.fromEntries(new FormData(form));
      if (racine.querySelector("[data-comptes-contexte]")) params.contexteDomaine = racine.querySelector("[data-comptes-contexte]").dataset.comptesContexte;
      lancer({ action: form.dataset.actionAdmin, params });
      zone.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}

export async function cockpitEspacesPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    return rendreEspaces(c.moi, (await getEspaces(params)).donnees, params);
  } catch (err) {
    console.error("[DSE Espaces]", err.message);
    return echec(err);
  }
}

export { activerFiltresEspaces };

export async function cockpitMonComptePage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    return rendreMonCompte(c.moi, (await getMonCompte()).donnees);
  } catch (err) {
    console.error("[DSE mon compte]", err.message);
    return echec(err);
  }
}

/* Constructeur DSE : les donnees et droits viennent du serveur (aucune page, aucun role code en dur). */
export async function cockpitConstruirePage(params) {
  try {
    // Lectures independantes lancees ensemble ; le serveur controle chacune (identite, droits, perimetre).
    const donnees = lancer(() => getConstruire(params.domaine));
    const c = await contexte(params, { reutiliser: true });
    if (c.html) return { html: c.html };
    const [{ r, erreur }] = await Promise.all([donnees, vue(params.domaine, { recente: true })]);
    if (erreur) return { html: echec(erreur, "La construction de ce site n'est pas disponible dans votre espace.") };
    if (!r?.donnees) return { html: echecChargement() };
    return { html: `<div data-constructeur-racine></div>`, moi: c.moi, donnees: r.donnees };
  } catch (err) { return { html: echec(err) }; }
}

export function activerConstruire(racinePage, page, domaine) {
  const racine = racinePage.querySelector("[data-constructeur-racine]");
  if (racine && page.donnees) activerConstructeur(racine, { moi: page.moi, domaine, donnees: page.donnees, onglet: new URLSearchParams(location.hash.split("?")[1] || "").get("onglet") });
}

export async function cockpitMenusPage(params) {
  try {
    const c = await contexte(params, { reutiliser: true });
    if (c.html) return c.html;
    const r = await getMenus(params.domaine);
    return { html: `<div data-menus-root></div>`, donnees: r?.donnees || null };
  } catch (err) {
    console.error("[DSE cockpit] menus page", err.message);
    return echec(err);
  }
}

export function activerMenusPage(racinePage, page, domaine) {
  const root = racinePage.querySelector("[data-menus-root]");
  if (!root || !page.donnees) return;
  const menuRef = new URLSearchParams(location.hash.split("?")[1] || "").get("menuRef") || "";
  root.innerHTML = rendreMenus(page.donnees, { domaine, menuRef });
  activerMenus(root, page.donnees, { domaine, menuRef });
}

export async function cockpitDemandesComptesPage(params) {
  try {
    const c = await contexte(params, { reutiliser: true });
    if (c.html) return c.html;
    const resultat = await getDemandesComptes(params.domaine);
    return { html: `<div data-demandes-comptes-root></div>`, donnees: resultat?.donnees || null };
  } catch (err) {
    console.error("[DSE cockpit] demandes de compte page", err.message);
    return echec(err);
  }
}

export function activerDemandesComptesPage(racinePage, page, domaine) {
  const root = racinePage.querySelector("[data-demandes-comptes-root]");
  if (!root || !page.donnees) return;
  root.innerHTML = rendreDemandesComptes(page.donnees, domaine);
  activerDemandesComptes(root, page.donnees, domaine);
}

export async function cockpitReglagesAccesPage(params) {
  try {
    const c = await contexte(params, { reutiliser: true });
    if (c.html) return c.html;
    const resultat = await getReglagesAccesSite(params.domaine);
    const peutTraiterDemandes = c.moi.autorisations?.operations?.some((o) =>
      o.operation === "utilisateurs.demande-compte") === true;
    return { html: `<div data-reglages-acces-root></div>`,
      donnees: resultat?.donnees ? { ...resultat.donnees, peutTraiterDemandes } : null };
  } catch (err) {
    console.error("[DSE cockpit] réglages accès page", err.message);
    return echec(err);
  }
}

export function activerReglagesAccesPage(racinePage, page, domaine) {
  const root = racinePage.querySelector("[data-reglages-acces-root]");
  if (!root || !page.donnees) return;
  root.innerHTML = rendreReglagesAcces(page.donnees, domaine);
  activerReglagesAcces(root, page.donnees, domaine);
}

export async function cockpitMediasPage(params) {
  try {
    const donnees = lancer(() => getMediasCockpit(params.domaine));
    const c = await contexte(params, { reutiliser: true });
    if (c.html) return { html: c.html };
    const [{ r, erreur }] = await Promise.all([donnees, vue(params.domaine, { recente: true })]);
    if (erreur) return { html: echec(erreur, "Les médias de ce site ne sont pas disponibles dans votre espace.") };
    if (!r?.donnees) return { html: echecChargement() };
    return { html: rendreMedias(r.donnees, { domaine: params.domaine }), donnees: r.donnees };
  } catch (err) {
    console.error("[DSE cockpit] medias", err.message);
    return { html: echec(err) };
  }
}

export function activerMedias(racine, page, domaine) {
  if (!page.donnees) return;
  const form = racine.querySelector("[data-filtres-medias]");
  const filtrer = () => {
    const q = form.elements.q.value.trim().toLocaleLowerCase("fr");
    const type = form.elements.type.value;
    let visibles = 0;
    racine.querySelectorAll("[data-media-titre]").forEach((el) => {
      el.hidden = !el.dataset.mediaTitre.toLocaleLowerCase("fr").includes(q) || Boolean(type && el.dataset.mediaType !== type);
      if (!el.hidden) visibles++;
    });
    racine.querySelector("[data-medias-vide]").hidden = visibles > 0;
  };
  form.addEventListener("input", filtrer);
  form.addEventListener("submit", (ev) => { ev.preventDefault(); filtrer(); });
  const importer = racine.querySelector("[data-import-media]");
  importer?.elements.fichier.addEventListener("change", () => {
    const f = importer.elements.fichier.files[0];
    if (f && !importer.elements.titre.value.trim()) importer.elements.titre.value = f.name.replace(/\.[^.]+$/, "");
  });
  importer?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fichier = importer.elements.fichier.files[0];
    const zone = racine.querySelector("[data-medias-message]");
    const barre = importer.querySelector("[data-import-progression]");
    const max = Number(page.donnees.televersement?.tailleMaxMo) * 1024 * 1024;
    if (!fichier) return;
    if (max && fichier.size > max) { zone.innerHTML = `<p class="cockpit-alerte">${escapeHtml("Fichier trop volumineux.")}</p>`; return; }
    const champs = importer.querySelectorAll("input, select, button");
    champs.forEach((c) => { c.disabled = true; });
    barre.hidden = false; barre.value = 0;
    zone.textContent = "Envoi du fichier…";
    try {
      const r = await televerserMedia(domaine, fichier, { type: importer.elements.type.value, titre: importer.elements.titre.value.trim() },
        (pct) => { barre.value = pct; zone.textContent = pct < 100 ? `Envoi du fichier… ${pct} %` : "Enregistrement dans la bibliothèque…"; });
      const d = (await getMediasCockpit(domaine)).donnees;
      racine.innerHTML = rendreMedias(d, { domaine, message: `${r.donnees.message}${r.donnees.journal?.enregistre === false ? " Journalisation non confirmée : vérification nécessaire." : ""}` });
      activerMedias(racine, { donnees: d }, domaine);
    } catch (err) {
      zone.innerHTML = `<p class="cockpit-alerte">${escapeHtml(err.message)}</p>`;
      champs.forEach((c) => { c.disabled = false; });
      barre.hidden = true;
    }
  });
  racine.querySelectorAll("[data-media-logo]").forEach((bouton) => bouton.addEventListener("click", async () => {
    if (!confirm("Utiliser ce média comme logo du site ? L'ancien média sera conservé.")) return;
    const boutons = racine.querySelectorAll("[data-media-logo]");
    boutons.forEach((b) => { b.disabled = true; });
    const zone = racine.querySelector("[data-medias-message]");
    zone.textContent = "Enregistrement dans SharePoint…";
    try {
      const r = await actionConstruire(domaine, "logo.choisir", { media: bouton.dataset.mediaLogo });
      const d = (await getMediasCockpit(domaine)).donnees;
      racine.innerHTML = rendreMedias(d, { domaine, message: `${r.donnees.message}${r.donnees.journal?.enregistre === false ? " Journalisation non confirmée : vérification nécessaire." : ""}` });
      activerMedias(racine, { donnees: d }, domaine);
    } catch (err) {
      zone.textContent = err.message;
      boutons.forEach((b) => { b.disabled = false; });
    }
  }));
}
