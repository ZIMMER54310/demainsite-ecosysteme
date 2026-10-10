import { escapeHtml as e } from "../modules/public/outils.js";

const SHA = /^[a-f0-9]{40}$/;
export const VERSION_COCKPIT = new URL(import.meta.url).searchParams.get("v") || "";

export function versionPubliee(html) {
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const url = new URL(match[1], "https://dse.invalid");
    const version = url.searchParams.get("v");
    if (url.origin === "https://dse.invalid" && url.pathname === "/js/app.js" && SHA.test(version || "")) return version;
  }
  throw new Error("La version publiée n'a pas pu être identifiée.");
}

export function creerSuiviVersion({ version, lire, confirmer, naviguer, avant = () => true, notifier = () => {} }) {
  const etat = { version, disponible: "", verification: false, erreur: "" };
  const verifier = async () => {
    if (etat.verification || !SHA.test(version)) return;
    etat.verification = true;
    etat.erreur = "";
    notifier();
    try {
      etat.disponible = versionPubliee(await lire());
    } catch (err) {
      etat.erreur = err.message || "Impossible de vérifier les mises à jour.";
    } finally {
      etat.verification = false;
      notifier();
    }
  };
  const appliquer = () => {
    if (etat.verification || etat.erreur || !etat.disponible || etat.disponible === version) return false;
    if (!avant()) return false;
    if (!confirmer("Mettre à jour le cockpit ? Enregistrez vos modifications avant de continuer. Les saisies non enregistrées seront perdues.")) return false;
    naviguer(etat.disponible);
    return true;
  };
  return { etat, verifier, appliquer };
}

export function rendreVersion(etat = suivi.etat) {
  const version = SHA.test(etat.version) ? etat.version.slice(0, 7) : "Développement";
  const disponible = !etat.erreur && etat.disponible && etat.disponible !== etat.version;
  return `<span class="cockpit-version" data-cockpit-version>
    <span title="${e(etat.version)}">Version ${e(version)}</span>
    <span role="status" aria-live="polite">${etat.erreur ? e(etat.erreur) : disponible ? `Nouvelle version ${e(etat.disponible.slice(0, 7))}` : ""}</span>
    ${disponible ? `<button type="button" class="btn btn-primary btn-mini" data-cockpit-mise-a-jour${etat.verification ? " disabled" : ""}>Mettre à jour</button>` : ""}
    ${SHA.test(etat.version) ? `<button type="button" class="btn btn-secondary btn-mini" data-cockpit-verifier-version${etat.verification ? " disabled" : ""}>${etat.verification ? "Vérification…" : etat.erreur ? "Réessayer" : "Vérifier"}</button>` : ""}
  </span>`;
}

const suivi = creerSuiviVersion({
  version: VERSION_COCKPIT,
  lire: async () => {
    const response = await fetch(`/index.html?dse-verification=${Date.now()}`, {
      cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Vérification des mises à jour indisponible (${response.status}).`);
    return response.text();
  },
  confirmer: (message) => window.confirm(message),
  avant: () => [...document.querySelectorAll("[data-constructeur-racine]")]
    .every((racine) => racine.dispatchEvent(new Event("dse:avant-mise-a-jour", { cancelable: true }))),
  naviguer: (version) => {
    const url = new URL(location.href);
    url.searchParams.set("dse-version", version);
    location.replace(url.href);
  },
  notifier: () => {
    for (const zone of document.querySelectorAll("[data-cockpit-version]")) zone.outerHTML = rendreVersion();
  }
});

let initialise = false;
export function activerMisesAJour() {
  if (initialise) return;
  initialise = true;
  let derniereVerification = 0;
  const verifier = (force = false) => {
    if (!/^#\/cockpit(?:\/|$|\?)/.test(location.hash) || document.visibilityState === "hidden") return;
    if (!force && Date.now() - derniereVerification < 60000) return;
    derniereVerification = Date.now();
    void suivi.verifier();
  };
  document.addEventListener("click", (ev) => {
    if (ev.target.closest?.("[data-cockpit-verifier-version]")) verifier(true);
    if (ev.target.closest?.("[data-cockpit-mise-a-jour]")) suivi.appliquer();
  });
  window.addEventListener("hashchange", () => verifier());
  window.addEventListener("focus", () => verifier());
  document.addEventListener("visibilitychange", () => verifier());
  setInterval(verifier, 60000);
  verifier();
}
