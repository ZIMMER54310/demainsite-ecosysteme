import { escapeHtml as e } from "../public/outils.js";

export function confirmerApercuConstruction(apercu) {
  return new Promise((resolve) => {
    const dialogue = document.createElement("dialog");
    dialogue.className = "cockpit-statut-dialogue";
    dialogue.innerHTML = `<form><h2>Confirmer la modification</h2><p>Site : <strong>${e(apercu.site)}</strong></p>
      <p>Vérifiez les valeurs actuelles et proposées. Cette action sera recontrôlée avant enregistrement.</p>
      <table><thead><tr><th>Élément</th><th>Réglage</th><th>Valeur actuelle</th><th>Nouvelle valeur</th></tr></thead>
      <tbody>${(apercu.changements || []).map((c) => `<tr><td>${e(c.element)}</td><td>${e(c.champ)}</td>
        <td>${e(c.actuelle)}</td><td>${e(c.nouvelle)}</td></tr>`).join("")}</tbody></table>
      <label><input type="checkbox" required> Je confirme cette modification dans le site indiqué.</label>
      <button class="btn btn-primary" type="submit">Confirmer</button>
      <button class="btn btn-secondary" type="button" data-annuler>Annuler</button></form>`;
    const fermer = (jeton) => { dialogue.close(); dialogue.remove(); resolve(jeton); };
    dialogue.querySelector("[data-annuler]").addEventListener("click", () => fermer(null));
    dialogue.addEventListener("cancel", (ev) => { ev.preventDefault(); fermer(null); });
    dialogue.querySelector("form").addEventListener("submit", (ev) => { ev.preventDefault(); fermer(apercu.jeton); });
    document.body.append(dialogue); dialogue.showModal();
  });
}
