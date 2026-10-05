import { escapeHtml as e } from "../public/outils.js";
import { icon } from "../../components/icons.js";
import {
  getSynchronisations, reglerSynchronisation, lancerSynchronisation, getSauvegardes, getListesSauvegarde,
  apercuRestauration, confirmerRestauration
} from "../../services/cockpit.service.js";

/*
 * Administration globale : reglage et lancement des synchronisations, sauvegardes et restauration manuelle.
 * Toutes les decisions (droits, frequences autorisees, contenu des sauvegardes) sont prises par le serveur.
 */

const UNITES = { MINUTES: "minute(s)", HEURES: "heure(s)", JOURS: "jour(s)" };
const date = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
};
const nomDonnees = (t) => String(t || "").replace(/^OBJ-/i, "");

function carte(s, modes, unites) {
  const derniere = s.derniere
    ? `<p>${s.derniere.ok ? "✅" : "⚠"} Dernier passage : <strong>${e(date(s.derniere.le))}</strong>${s.derniere.resume ? ` · ${e(s.derniere.resume)}` : ""}</p>`
    : `<p class="muted">Aucun passage connu pour l'instant.</p>`;
  const historique = (s.historique || []).length
    ? `<details class="cockpit-synchro-detail"><summary>Historique depuis le démarrage du service (${s.historique.length})</summary><ul>${s.historique.map((h) =>
      `<li>${h.ok ? "✅" : "⚠"} ${e(date(h.le))} · ${e(h.resume || "")} <small class="muted">${h.acteur === "Synchronisation automatique" ? "automatique" : "lancé manuellement"}</small></li>`).join("")}</ul></details>`
    : "";
  return `<article class="card cockpit-synchro" data-synchro="${e(s.code)}">
    <div class="cockpit-synchro-entete"><div><h2>${icon("sync")} ${e(s.titre)}</h2><p class="muted">${e(s.description)}</p></div>
      <button type="button" class="btn btn-primary" data-lancer="${e(s.code)}"${s.enCours ? " disabled" : ""}>${icon("sync")} ${s.enCours ? "En cours…" : "Lancer maintenant"}</button></div>
    <form class="cockpit-synchro-reglage" data-reglage="${e(s.code)}">
      <label class="cockpit-champ"><span>Mode</span><select name="mode">${modes.map((m) => `<option value="${e(m)}"${m === s.mode ? " selected" : ""}>${m === "AUTOMATIQUE" ? "Automatique" : "Manuel"}</option>`).join("")}</select></label>
      <label class="cockpit-champ" data-frequence><span>Toutes les</span><input type="number" name="frequence" min="1" step="1" value="${Number(s.frequence) || 1}" required></label>
      <label class="cockpit-champ" data-frequence><span>Unité</span><select name="unite">${unites.map((u) => `<option value="${e(u)}"${u === s.unite ? " selected" : ""}>${e(UNITES[u] || u)}</option>`).join("")}</select></label>
      <button type="submit" class="btn btn-secondary">Enregistrer</button>
    </form>
    <p class="muted">${s.enregistre ? (s.invalide ? "⚠ Réglage enregistré invalide : réglage par défaut appliqué." : "Réglage enregistré.") : "Réglage par défaut (non enregistré)."}
      ${s.mode === "AUTOMATIQUE" && s.prochaine ? ` Prochain passage vers ${e(date(s.prochaine))}.` : s.mode === "MANUEL" ? " Passage uniquement sur demande." : ""}</p>
    <div aria-live="polite" data-synchro-message></div>
    ${derniere}${historique}
  </article>`;
}

export function rendreSynchronisations(v) {
  if (!v) return `<section class="cockpit card"><p role="alert">Les synchronisations sont réservées à l'administration globale.</p><a class="btn btn-secondary" href="#/cockpit">Retour au cockpit</a></section>`;
  return `<section class="cockpit cockpit-synchronisations">
    <h1>${icon("sync")} Synchronisations</h1>
    <p class="muted">Les passages automatiques continuent selon le réglage choisi. Chaque passage peut aussi être lancé à la main. Rien n'est jamais supprimé.</p>
    ${!v.reglagesDisponibles ? `<p role="alert">⚠ ${e(v.erreurReglages || "Réglages indisponibles : réglages par défaut appliqués.")}</p>` : ""}
    ${v.synchronisations.map((s) => carte(s, v.modes, v.unites)).join("")}
    <article class="card cockpit-restauration" data-restauration>
      <h2>${icon("layers")} Restaurer depuis une sauvegarde</h2>
      <p class="muted">Choisissez une sauvegarde puis des données : un aperçu montre les fiches modifiées ou disparues. Seules les fiches cochées sont rétablies, après confirmation. Aucune fiche n'est supprimée ni dupliquée. Le journal, la géographie et les références protégées ne se restaurent jamais.</p>
      <div class="cockpit-synchro-reglage">
        <label class="cockpit-champ"><span>Sauvegarde</span><select data-choix-sauvegarde><option value="">Chargement…</option></select></label>
        <label class="cockpit-champ"><span>Données</span><select data-choix-donnees disabled><option value="">Choisir une sauvegarde</option></select></label>
        <button type="button" class="btn btn-secondary" data-apercu-restauration disabled>Voir les différences</button>
      </div>
      <div aria-live="polite" data-restauration-zone></div>
    </article>
  </section>`;
}

export function rendreApercuRestauration(a) {
  const modifiees = a.modifiees.map((m) => `<li><label><input type="checkbox" data-selection value="${e(m.id)}" checked> <strong>${e(m.titre)}</strong> <small class="muted">n° ${e(m.id)}</small></label>
    <ul>${m.champs.map((c) => `<li>${e(c.libelle)} : <del>${e(c.actuel)}</del> → <ins>${e(c.sauvegarde)}</ins></li>`).join("")}</ul></li>`).join("");
  const manquantes = a.manquantes.map((m) => `<li><label><input type="checkbox" data-selection value="${e(m.id)}"${m.homonyme ? " disabled" : ""}> <strong>${e(m.titre)}</strong> <small class="muted">ancien n° ${e(m.id)} · ${Number(m.champs)} information(s)</small></label>
    ${m.homonyme ? `<br><small>Une fiche du même nom existe déjà : recréation impossible (aucun doublon).</small>` : `<br><small>Sera recréée avec un nouveau numéro : les liens qui pointaient vers l'ancien numéro sont à vérifier.</small>`}</li>`).join("");
  const rien = !a.modifiees.length && !a.manquantes.length;
  return `<div class="cockpit-restauration-apercu">
    <p><strong>${e(nomDonnees(a.liste))}</strong> · sauvegarde du ${e(date(a.sauvegardeDu))} · ${Number(a.identiques)} fiche(s) identique(s)${a.ajouteesDepuis ? ` · ${Number(a.ajouteesDepuis)} fiche(s) ajoutée(s) depuis (conservées)` : ""}</p>
    ${rien ? `<p>✅ Aucune différence : rien à restaurer.</p>` : `
    ${a.modifiees.length ? `<h3>Fiches modifiées depuis la sauvegarde (${a.modifiees.length})</h3><ul class="cockpit-liste">${modifiees}</ul>` : ""}
    ${a.manquantes.length ? `<h3>Fiches disparues depuis la sauvegarde (${a.manquantes.length})</h3><ul class="cockpit-liste">${manquantes}</ul>` : ""}
    <button type="button" class="btn btn-primary" data-confirmer-restauration="${e(a.jeton)}">Restaurer les fiches cochées</button>`}
  </div>`;
}

function rendreRapport(r) {
  const ligne = (t, items, f) => items.length ? `<p>${t} (${items.length}) : ${items.map(f).join(", ")}</p>` : "";
  return `<div class="card cockpit-resultat ok"><p>✅ Restauration terminée : ${r.retablies.length} fiche(s) rétablie(s), ${r.recreees.length} recréée(s).</p>
    ${ligne("Recréées", r.recreees, (x) => `${e(x.titre)} (ancien n° ${e(x.ancienNumero)} → nouveau n° ${e(x.nouveauNumero || "?")})`)}
    ${ligne("Non restaurées", r.ignorees, (x) => `${e(x.titre)} — ${e(x.raison)}`)}
    ${ligne("En erreur", r.erreurs, (x) => `${e(x.titre)} — ${e(x.raison)}`)}
    <p class="muted">${r.journal ? "✅ Restauration journalisée." : "⚠ Restauration effectuée mais non journalisée."}</p></div>`;
}

const recharger = () => window.dispatchEvent(new HashChangeEvent("hashchange"));

function activerReglages(racine) {
  racine.querySelectorAll("[data-reglage]").forEach((form) => {
    const basculer = () => form.querySelectorAll("[data-frequence]").forEach((x) => { x.hidden = form.mode.value !== "AUTOMATIQUE"; });
    form.mode.addEventListener("change", basculer);
    basculer();
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const zone = form.closest("[data-synchro]").querySelector("[data-synchro-message]");
      const bouton = form.querySelector("button");
      bouton.disabled = true;
      try {
        const r = await reglerSynchronisation(form.dataset.reglage, form.mode.value, Number(form.frequence.value), form.unite.value);
        zone.innerHTML = `<p>✅ ${e(r?.donnees?.message || "Réglage enregistré.")}</p>`;
        setTimeout(recharger, 900);
      } catch (err) {
        zone.innerHTML = `<p role="alert">${e(err?.message || "Le réglage n'a pas été enregistré.")}</p>`;
        bouton.disabled = false;
      }
    });
  });
  racine.querySelectorAll("[data-lancer]").forEach((bouton) => bouton.addEventListener("click", async () => {
    const zone = bouton.closest("[data-synchro]").querySelector("[data-synchro-message]");
    bouton.disabled = true;
    bouton.textContent = "En cours…";
    try {
      const r = await lancerSynchronisation(bouton.dataset.lancer);
      zone.innerHTML = r?.donnees?.termine
        ? `<p>${r.donnees.resultat?.ok ? "✅" : "⚠"} ${e(r.donnees.resultat?.resume || "Passage terminé.")}</p>`
        : `<p>⏳ Passage en cours en arrière-plan. Actualisez la page dans quelques minutes pour voir le résultat.</p>`;
      if (r?.donnees?.termine) setTimeout(recharger, 1500);
    } catch (err) {
      zone.innerHTML = `<p role="alert">${e(err?.message || "Le passage n'a pas été lancé.")}</p>`;
      bouton.disabled = false;
      bouton.textContent = "Lancer maintenant";
    }
  }));
}

async function activerRestauration(racine) {
  const bloc = racine.querySelector("[data-restauration]");
  if (!bloc) return;
  const choixS = bloc.querySelector("[data-choix-sauvegarde]");
  const choixD = bloc.querySelector("[data-choix-donnees]");
  const boutonA = bloc.querySelector("[data-apercu-restauration]");
  const zone = bloc.querySelector("[data-restauration-zone]");
  try {
    const s = (await getSauvegardes())?.donnees?.sauvegardes || [];
    choixS.innerHTML = s.length ? `<option value="">Choisir…</option>${s.map((x) => `<option value="${e(x.nom)}">${e(date(x.le))}</option>`).join("")}`
      : `<option value="">Aucune sauvegarde pour l'instant</option>`;
  } catch (err) {
    choixS.innerHTML = `<option value="">Sauvegardes indisponibles</option>`;
  }
  choixS.addEventListener("change", async () => {
    choixD.disabled = true; boutonA.disabled = true; zone.innerHTML = "";
    if (!choixS.value) return;
    choixD.innerHTML = `<option value="">Chargement…</option>`;
    try {
      const l = (await getListesSauvegarde(choixS.value))?.donnees?.listes || [];
      choixD.innerHTML = `<option value="">Choisir…</option>${l.filter((x) => x.restaurable).sort((a, b) => nomDonnees(a.titre).localeCompare(nomDonnees(b.titre), "fr"))
        .map((x) => `<option value="${e(x.id)}">${e(nomDonnees(x.titre))} (${Number(x.elements)} fiche(s))</option>`).join("")}`;
      choixD.disabled = false;
    } catch (err) {
      zone.innerHTML = `<p role="alert">${e(err?.message || "Sauvegarde illisible.")}</p>`;
    }
  });
  choixD.addEventListener("change", () => { boutonA.disabled = !choixD.value; zone.innerHTML = ""; });
  boutonA.addEventListener("click", async () => {
    boutonA.disabled = true;
    zone.innerHTML = `<p>⏳ Comparaison en cours…</p>`;
    try {
      const a = (await apercuRestauration(choixS.value, choixD.value))?.donnees;
      zone.innerHTML = rendreApercuRestauration(a);
      const conf = zone.querySelector("[data-confirmer-restauration]");
      conf?.addEventListener("click", async () => {
        const selection = [...zone.querySelectorAll("[data-selection]:checked")].map((x) => x.value);
        if (!selection.length) { alert("Cochez au moins une fiche."); return; }
        if (!confirm(`Restaurer ${selection.length} fiche(s) depuis cette sauvegarde ? Aucune fiche ne sera supprimée.`)) return;
        conf.disabled = true;
        try {
          zone.innerHTML = rendreRapport((await confirmerRestauration(conf.dataset.confirmerRestauration, selection))?.donnees);
        } catch (err) {
          zone.insertAdjacentHTML("beforeend", `<p role="alert">${e(err?.message || "La restauration n'a pas abouti.")}</p>`);
        }
      });
    } catch (err) {
      zone.innerHTML = `<p role="alert">${e(err?.message || "Aperçu indisponible.")}</p>`;
    }
    boutonA.disabled = false;
  });
}

export function activerSynchronisations(racine) {
  if (!racine?.querySelector(".cockpit-synchronisations")) return;
  activerReglages(racine);
  activerRestauration(racine);
}
