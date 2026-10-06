/*
 * Etat global « DemainSite Écosystème travaille » : un seul indicateur pour toutes les navigations
 * du cockpit et pour les appels API longs. Etats stricts IDLE / LOADING / READY / FORBIDDEN / ERROR :
 * FORBIDDEN uniquement apres un refus definitif du serveur (401/403), jamais pendant LOADING.
 */
export const ETATS = Object.freeze({ IDLE: "IDLE", LOADING: "LOADING", READY: "READY", FORBIDDEN: "FORBIDDEN", ERROR: "ERROR" });
const TITRE = "DemainSite Écosystème travaille…";
const DELAI_APPELS_MS = 300;

let etat = ETATS.IDLE;
let navigation = null;
let appels = 0;
let appelsVisibles = false;
let minuterie = null;

export const etatChargement = () => etat;
export const classerErreur = (err) => (err?.status === 401 || err?.status === 403 ? ETATS.FORBIDDEN : ETATS.ERROR);

const echapper = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);

function element() {
  if (typeof document === "undefined" || typeof document.createElement !== "function" || !document.body?.appendChild) return null;
  let el = document.getElementById("dse-travail");
  if (!el) {
    el = document.createElement("div");
    el.id = "dse-travail";
    el.className = "dse-travail";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

function afficher() {
  const el = element();
  if (!el) return;
  const visible = Boolean(navigation) || appelsVisibles;
  const detail = navigation?.detail || "Traitement en cours";
  if (visible) el.innerHTML = `<span class="dse-spinner dse-spinner-petit" aria-hidden="true"></span><span><strong>${TITRE}</strong><small>${echapper(detail)}</small></span>`;
  else el.textContent = "";
  el.hidden = !visible;
  document.querySelector?.("#app-page")?.setAttribute("aria-busy", String(Boolean(navigation)));
}

// Debut d'une navigation : affichage immediat, sans attendre la moindre donnee.
export function commencerNavigation(detail, jeton) {
  navigation = { detail, jeton };
  etat = ETATS.LOADING;
  afficher();
}

// Seule la navigation courante peut terminer l'etat (une reponse ancienne n'ecrase jamais la plus recente).
export function terminerNavigation(jeton, etatFinal = ETATS.READY) {
  if (!navigation || navigation.jeton !== jeton) return false;
  navigation = null;
  etat = Object.values(ETATS).includes(etatFinal) && etatFinal !== ETATS.LOADING ? etatFinal : ETATS.ERROR;
  afficher();
  return true;
}

// Appels API (actions, onglets, Reessayer) : indicateur apres un court delai pour eviter le clignotement.
export function suivreAppel() {
  appels++;
  if (!minuterie && !appelsVisibles) minuterie = setTimeout(() => { minuterie = null; if (appels > 0) { appelsVisibles = true; afficher(); } }, DELAI_APPELS_MS);
  let fini = false;
  return () => {
    if (fini) return;
    fini = true;
    appels = Math.max(0, appels - 1);
    if (appels > 0) return;
    if (minuterie) { clearTimeout(minuterie); minuterie = null; }
    if (appelsVisibles) { appelsVisibles = false; afficher(); }
  };
}

// Zone centrale pendant LOADING : contexte connu conserve ailleurs, squelette ici.
export function rendreChargement(detail) {
  return `<section class="cockpit cockpit-ouverture" aria-busy="true" data-dse-etat="${ETATS.LOADING}">
    <div class="card cockpit-ouverture-statut">
      <span class="dse-spinner" aria-hidden="true"></span>
      <div><p class="cockpit-ouverture-titre">${TITRE}</p>
      <p class="muted">${echapper(detail || "Chargement en cours")}</p></div></div>
    <div class="cockpit-squelette" aria-hidden="true">
      <div class="cockpit-squelette-bloc cockpit-squelette-entete"></div>
      <div class="cockpit-squelette-grille">${"<div class=\"cockpit-squelette-bloc\"></div>".repeat(4)}</div>
      <div class="cockpit-squelette-bloc cockpit-squelette-large"></div></div></section>`;
}

// Etat final porte par la page rendue (data-dse-etat), READY par defaut.
export function etatPage(html) {
  const m = /data-dse-etat="(FORBIDDEN|ERROR)"/.exec(typeof html === "string" ? html : "");
  return m ? m[1] : ETATS.READY;
}
