import { escapeHtml } from "../public/outils.js";
import { getDemandesComptes, deciderDemandeCompte } from "../../services/cockpit.service.js";

const e = escapeHtml;

export function rendreDemandesComptes(donnees, domaine) {
  const demandes = donnees.demandes || [];
  return `<section class="cockpit card" data-demandes-comptes data-domaine="${e(domaine)}">
    <header><h1>Demandes de compte</h1><p>${e(donnees.site || "")}</p>
      <p class="muted">Une décision ne crée pas de compte et n’attribue aucun rôle, droit ou périmètre.</p></header>
    ${demandes.length ? `<ul class="liste-simple">${demandes.map((d) => `<li class="card">
      <strong>${e(d.demandeur)}</strong><p>Reçue le ${e(new Date(d.dateDemande).toLocaleString("fr-FR"))}</p>
      <div class="cockpit-actions">
        <button class="btn btn-primary" type="button" data-demande-decision="accepter" data-reference="${e(d.reference)}">Accepter la demande</button>
        <button class="btn btn-secondary" type="button" data-demande-decision="refuser" data-reference="${e(d.reference)}">Refuser</button>
      </div></li>`).join("")}</ul>` : `<p>Aucune demande en attente.</p>`}
    <p role="status" aria-live="polite" data-demandes-message></p>
  </section>`;
}

export function activerDemandesComptes(root, donnees, domaine) {
  const vue = root.querySelector("[data-demandes-comptes]");
  if (!vue) return;
  const message = vue.querySelector("[data-demandes-message]");
  vue.querySelectorAll("[data-demande-decision]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await deciderDemandeCompte(domaine, button.dataset.reference, button.dataset.demandeDecision);
      const resultat = await getDemandesComptes(domaine);
      if (!resultat?.donnees) throw new Error("Les demandes mises à jour ne peuvent pas être relues.");
      root.innerHTML = rendreDemandesComptes(resultat.donnees, domaine);
      activerDemandesComptes(root, resultat.donnees, domaine);
    } catch (err) {
      message.textContent = err?.message || "La décision n’a pas pu être enregistrée. Réessayez.";
      button.disabled = false;
    }
  }));
}
