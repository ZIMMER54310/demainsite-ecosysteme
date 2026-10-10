import { escapeHtml as e } from "../public/outils.js";
import { rendreEnteteCockpit } from "./cockpit.js";
import { getAdminDroits, apercuDroitAdmin, confirmerEdition } from "../../services/cockpit.service.js";

export function rendreMatrice(d, cible) {
  if (!cible) return "<p>Aucune affectation disponible dans votre périmètre.</p>";
  const groupes = new Map();
  for (const op of d.operations) {
    if (!groupes.has(op.groupe)) groupes.set(op.groupe, []);
    groupes.get(op.groupe).push(op);
  }
  return [...groupes].map(([groupe, operations]) => {
    const lignes = operations.map((op) => {
      const droit = cible.droits.find((x) => x.ref === op.ref);
      const checked = droit.valeur === null ? droit.effectif : droit.valeur;
      return `<tr><td><label><input type="checkbox" data-droit="${e(op.ref)}" ${checked ? "checked" : ""}
        ${droit.modifiable ? "" : `disabled title="${e(droit.motif)}"`}> ${e(op.titre)}</label>
        <details><summary>Informations sur ce droit</summary><p>${e(op.code)} · ${e(op.action)}</p></details></td>
        <td>${droit.valeur === null ? "Hérité des réglages existants" : droit.valeur ? "Autorisation individuelle" : "Interdiction individuelle"}</td>
        <td>${droit.effectif ? "Autorisé" : "Non autorisé"}${droit.modifiable ? "" : `<br><small>${e(droit.motif)}</small>`}</td></tr>`;
    }).join("");
    return `<details data-groupe-droits class="card"><summary><strong>${e(groupe)}</strong> · ${operations.length} droits</summary>
      <p><label><input type="checkbox" data-tout-droits> Tout autoriser dans ce groupe</label></p>
      <div style="overflow-x:auto"><table class="cockpit-table"><thead><tr><th>Action et autorisation souhaitée</th><th>Origine du réglage</th><th>Droit effectif actuel</th></tr></thead>
      <tbody>${lignes}</tbody></table></div></details>`;
  }).join("");
}

export function rendreDroits(moi, d, domaine = "") {
  const choix = (xs) => xs.map((x) => `<option value="${e(x.ref)}">${e(x.titre)}</option>`).join("");
  const creation = !d.peutCreer
    ? "<p>La gestion des profils et l’ajout de nouveaux droits nécessitent un accès super administrateur global. Un rôle limité à un site ne donne pas cet accès global.</p>"
    : `<details class="card"><summary>Ajouter un nouveau droit · Super administrateur</summary>
    <p>Ajoute une entrée au catalogue, sans attribuer de permission. Une nouvelle action métier doit aussi être raccordée dans le logiciel : ce formulaire ne crée pas sa fonctionnalité.</p>
    <form data-creer-droit>
      <p><label>Nom affiché <input name="titre" required maxlength="255"></label></p>
      <p><label>Code technique unique <input name="code" required pattern="[a-z][a-z0-9.\\-]{2,119}" placeholder="image.telecharger" maxlength="120"></label></p>
      <p><label>Groupe <select name="capacite" required><option value="">Choisir</option>${choix(d.capacites)}</select></label></p>
      <p><label>Type d’action <select name="typeAction" required><option value="">Choisir</option>${choix(d.actions)}</select></label></p>
      <p><label>Fonction du cockpit <input name="fonction" required placeholder="logo-medias" maxlength="80"></label></p>
      <p><label>Route du cockpit <input name="route" required placeholder="medias" maxlength="120"></label></p>
      <p><label>Mode <select name="mode"><option value="read">Lecture</option><option value="write">Modification</option></select></label></p>
      <button class="btn btn-primary">Vérifier avant d’ajouter</button>
    </form></details>`;
  return `<section class="cockpit">${rendreEnteteCockpit(moi)}
    <h2>Droits et autorisations</h2>
    <p><a href="#/cockpit/administration${domaine ? `?domaine=${encodeURIComponent(domaine)}` : ""}">Retour à l’administration</a></p>
    <div data-administration-droits data-configuration="${e(JSON.stringify(d))}" data-domaine="${e(domaine)}">
      <p>Chaque case concerne une seule action. Ouvrez un groupe pour voir les détails. « Tout » ne modifie que les cases disponibles ; les droits protégés restent inchangés.</p>
      <p>Le super administrateur gère tous les sites. Seul un autre super administrateur peut lui retirer ce rôle ; le dernier super administrateur global est protégé. Vos propres accès et votre profil restent protégés ici. Les administrateurs ne gèrent que leurs sites et les droits autorisés par le super administrateur.</p>
      <p>Les réglages existants restent hérités tant que vous ne cochez ou décochez pas une case. Le droit effectif tient aussi compte du profil et des autres affectations.</p>
      <form data-modifier-droits>
        <p><label>Gérer les droits <select data-mode-droits><option value="utilisateur">D’un utilisateur, sur ses sites</option>${d.peutCreer ? '<option value="profil">D’un profil de rôle</option>' : ""}</select></label></p>
        <p><label>Choisir <select data-cible-droits></select></label></p>
        <div data-matrice-droits></div>
        <button class="btn btn-primary" data-enregistrer-droits>Vérifier les modifications</button>
        <button class="btn btn-secondary" type="button" data-annuler-droits>Annuler les modifications non enregistrées</button>
        <button class="btn btn-secondary" type="button" data-relire-droits>Recharger les droits enregistrés</button>
      </form>${creation}
      <div data-resultat-droits role="status" aria-live="polite"></div>
    </div></section>`;
}

export function synchroniserTout(groupe) {
  const cases = [...groupe.querySelectorAll("[data-droit]:not(:disabled)")];
  const tout = groupe.querySelector("[data-tout-droits]");
  tout.disabled = !cases.length;
  tout.checked = cases.length > 0 && cases.every((c) => c.checked);
  tout.indeterminate = cases.some((c) => c.checked) && !tout.checked;
}

export function activerDroits(racine = document) {
  const root = racine.querySelector("[data-administration-droits]");
  if (!root) return;
  let d = JSON.parse(root.dataset.configuration);
  const mode = root.querySelector("[data-mode-droits]");
  const cible = root.querySelector("[data-cible-droits]");
  const matrice = root.querySelector("[data-matrice-droits]");
  const resultat = root.querySelector("[data-resultat-droits]");
  const formulaire = root.querySelector("[data-modifier-droits]");
  let occupe = false;
  let relectureRequise = false;
  const afficher = () => {
    const xs = mode.value === "profil" ? d.profils : d.utilisateurs;
    const selection = xs.find((x) => x.ref === cible.value);
    matrice.innerHTML = rendreMatrice(d, selection);
    matrice.querySelectorAll("[data-groupe-droits]").forEach(synchroniserTout);
  };
  const choisir = () => {
    const xs = mode.value === "profil" ? d.profils : d.utilisateurs;
    cible.innerHTML = xs.map((x) => `<option value="${e(x.ref)}">${e(x.titre)}${x.profil ? ` · ${e(x.profil)} · ${e(x.sites.join(", "))}` : ""}</option>`).join("");
    afficher();
  };
  const modifie = () => !!matrice.querySelector('[data-modifie="true"]');
  mode.addEventListener("change", () => {
    if (modifie() && !confirm("Abandonner les modifications non enregistrées ?")) {
      mode.value = mode.value === "profil" ? "utilisateur" : "profil";
      return;
    }
    choisir();
    precedente = cible.value;
  });
  let precedente = "";
  cible.addEventListener("change", () => {
    if (modifie() && !confirm("Abandonner les modifications non enregistrées ?")) { cible.value = precedente; return; }
    afficher();
    precedente = cible.value;
  });
  root.querySelector("[data-annuler-droits]").addEventListener("click", afficher);
  root.querySelector("[data-relire-droits]").addEventListener("click", async () => {
    if (occupe || modifie() && !confirm("Abandonner les modifications non enregistrées et relire les droits ?")) return;
    occupe = true;
    try {
      const r = await getAdminDroits(root.dataset.domaine);
      if (!r?.donnees) throw new Error("Relecture des droits incomplète.");
      d = r.donnees;
      choisir();
      precedente = cible.value;
      relectureRequise = false;
      resultat.textContent = "Droits enregistrés rechargés.";
    } catch (err) {
      console.error("[DSE droits relecture]", err.message);
      resultat.textContent = err.message;
    } finally { occupe = false; }
  });
  matrice.addEventListener("change", (event) => {
    const c = event.target;
    const groupe = c.closest("[data-groupe-droits]");
    if (!groupe) return;
    if (c.matches("[data-tout-droits]")) groupe.querySelectorAll("[data-droit]:not(:disabled)").forEach((x) => {
      x.checked = c.checked;
      x.dataset.modifie = "true";
    });
    else if (c.matches("[data-droit]") && !c.disabled) c.dataset.modifie = "true";
    synchroniserTout(groupe);
  });
  async function enregistrer(demandes) {
    if (occupe) return;
    if (relectureRequise) { resultat.textContent = "Rechargez les droits enregistrés avant une nouvelle tentative."; return; }
    if (!demandes.length) { resultat.textContent = "Aucune modification sélectionnée."; return; }
    occupe = true;
    const controles = [...root.querySelectorAll("input,select,button")];
    const etats = controles.map((x) => x.disabled);
    controles.forEach((x) => { x.disabled = true; });
    let termines = 0;
    try {
      const plans = [];
      for (const demande of demandes) {
        resultat.textContent = `Vérification ${plans.length + 1} sur ${demandes.length}…`;
        const r = await apercuDroitAdmin({ ...demande, contexteDomaine: root.dataset.domaine });
        if (!r?.donnees?.jeton) throw new Error("Aperçu incomplet : aucune modification enregistrée.");
        plans.push(r.donnees);
      }
      const texte = plans.map((p) => p.changements.map((x) => `${x.libelle} : ${x.apres}`).join("\n")).join("\n");
      if (!confirm(`Confirmer ces ${plans.length} modifications ?\n\n${texte}\n\nChaque droit sera enregistré et journalisé séparément. En cas d’erreur, les changements déjà confirmés resteront enregistrés.`)) {
        resultat.textContent = "Confirmation annulée. Aucun droit modifié.";
        return;
      }
      for (const plan of plans) {
        resultat.textContent = `Enregistrement ${termines + 1} sur ${plans.length}…`;
        const r = await confirmerEdition(plan.jeton);
        if (!r?.donnees?.succes) throw new Error(r?.donnees?.erreur || "L’enregistrement n’a pas été confirmé.");
        termines++;
      }
      const r = await getAdminDroits(root.dataset.domaine);
      if (!r?.donnees) throw new Error("La relecture du tableau est incomplète.");
      d = r.donnees;
      const selection = cible.value;
      choisir();
      if ([...cible.options].some((x) => x.value === selection)) { cible.value = selection; afficher(); }
      resultat.textContent = `${termines} droit(s) enregistré(s), relu(s) et journalisé(s).`;
    } catch (err) {
      console.error("[DSE droits]", err.message);
      relectureRequise = true;
      resultat.textContent = `${termines} sur ${demandes.length} modification(s) confirmée(s). Arrêt : ${err.message}. Certaines autres écritures peuvent avoir été appliquées sans confirmation reçue. Rechargez les droits avant de poursuivre.`;
    } finally {
      controles.forEach((x, i) => { if (x.isConnected) x.disabled = etats[i]; });
      occupe = false;
      precedente = cible.value;
    }
  }
  formulaire.addEventListener("submit", (event) => {
    event.preventDefault();
    const selection = (mode.value === "profil" ? d.profils : d.utilisateurs).find((u) => u.ref === cible.value);
    const demandes = [...matrice.querySelectorAll('[data-droit][data-modifie="true"]:not(:disabled)')]
      .map((c) => ({ action: selection?.global ? "global" : mode.value, cible: cible.value, operation: c.dataset.droit, valeur: String(c.checked) }));
    void enregistrer(demandes);
  });
  root.querySelector("[data-creer-droit]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const params = Object.fromEntries(new FormData(event.target));
    void enregistrer([{ ...params, action: "creer" }]);
  });
  choisir();
  precedente = cible.value;
}
