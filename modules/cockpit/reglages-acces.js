import { escapeHtml } from "../public/outils.js";
import { enregistrerReglagesAccesSite } from "../../services/cockpit.service.js";

const e = escapeHtml;
const options = [
  ["afficherAccesCockpit", "Afficher « Accès au cockpit »"],
  ["creationCompteAutorisee", "Autoriser les demandes de création de compte"],
  ["approbationProprietaire", "Exiger l’approbation du propriétaire"]
];

export function rendreReglagesAcces(donnees, domaine) {
  const valeurs = donnees.valeurs || {};
  return `<section class="cockpit card" data-reglages-acces data-domaine="${e(domaine)}">
    <h1>Accès et comptes</h1><p>${e(donnees.site || "")}</p>
    <form data-reglages-acces-form>${options.map(([cle, libelle]) => `<label class="dse-menu-check">
      <input type="checkbox" name="${e(cle)}"${valeurs[cle] ? " checked" : ""}> ${e(libelle)}
    </label>`).join("")}
    <p class="muted">Une demande acceptée ne crée pas automatiquement de compte et n’attribue aucun rôle, droit ou périmètre. Les demandes sont suspendues si l’approbation du propriétaire est désactivée.</p>
    <div class="cockpit-actions"><button class="btn btn-primary" type="submit">Enregistrer</button>
      ${valeurs.approbationProprietaire && donnees.peutTraiterDemandes
        ? `<a class="btn btn-secondary" href="#/cockpit/site/${encodeURIComponent(domaine)}/demandes-comptes">Voir les demandes en attente</a>` : ""}
    </div><p role="status" aria-live="polite" data-reglages-message></p></form>
  </section>`;
}

export function activerReglagesAcces(root, donnees, domaine) {
  const form = root.querySelector("[data-reglages-acces-form]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const bouton = form.querySelector('button[type="submit"]');
    const message = form.querySelector("[data-reglages-message]");
    bouton.disabled = true;
    message.textContent = "Enregistrement en cours…";
    const valeurs = Object.fromEntries(options.map(([cle]) => [cle, form.elements[cle].checked]));
    try {
      const resultat = await enregistrerReglagesAccesSite(domaine, valeurs);
      if (!resultat?.donnees?.valeurs) throw new Error("Les réglages n’ont pas pu être relus après enregistrement.");
      root.innerHTML = rendreReglagesAcces({ ...donnees, valeurs: resultat.donnees.valeurs }, domaine);
      activerReglagesAcces(root, { ...donnees, valeurs: resultat.donnees.valeurs }, domaine);
    } catch (err) {
      message.textContent = err?.message || "L’enregistrement a échoué. Vérifiez la connexion puis réessayez.";
      bouton.disabled = false;
    }
  });
}
