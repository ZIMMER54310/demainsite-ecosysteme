import { initializeAuth } from "../js/auth.js";
import { setState } from "../js/state.js";
import { getSitesCockpit, getSiteCockpit } from "../services/cockpit.service.js";
import {
  rendreConnexion, rendreSansAcces, rendreAccueil, rendreListeSites, rendreVueSite, rendreAssistant
} from "../modules/cockpit/cockpit.js";

const CLE_ASSISTANT = "dseAssistantSite";
const MESSAGES_CONNEXION = {
  echec: "La connexion n'a pas abouti. Merci de réessayer.",
  indisponible: "Ce mode de connexion n'est pas encore disponible."
};
const indisponible = `<section class="cockpit card"><p>Le cockpit est momentanément indisponible. Merci de réessayer dans quelques instants.</p></section>`;

const moiDepuis = (u) => ({ nom: u.displayName, role: u.role, fonctions: u.fonctions, nombreSites: u.nombreSites, fournisseurs: u.fournisseurs });
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
    let vueCourante = await vue(domaineCourant());
    // Hors domaine d'un site du perimetre : premier site autorise.
    if (!vueCourante && c.moi.fonctions.includes("sites")) {
      const sites = (await getSitesCockpit().catch(() => null))?.donnees || [];
      if (sites[0]?.domaine) vueCourante = await vue(sites[0].domaine);
    }
    return rendreAccueil({ moi: c.moi, vueCourante, domaineCourant: domaineCourant() });
  } catch { return indisponible; }
}

export async function cockpitSitesPage(params) {
  try {
    const c = await contexte(params);
    if (c.html) return c.html;
    const sites = (await getSitesCockpit().catch(() => null))?.donnees || [];
    return rendreListeSites(c.moi, sites);
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
