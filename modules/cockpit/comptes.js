import { escapeHtml as e } from "../public/outils.js";
import { rendreEnteteCockpit, rendreUtilisateurs } from "./cockpit.js";

const ouiNon = (v) => v ? "Oui" : "Non";
const options = (liste, valeur = "", vide = "Tous") => `<option value="">${e(vide)}</option>${(liste || []).map((v) =>
  `<option value="${e(v.ref)}"${v.ref === valeur ? " selected" : ""}>${e(v.titre || "Non renseigné")}</option>`).join("")}`;
const choix = (nom, titre, liste, valeur) => `<label>${e(titre)}<select name="${nom}">${options(liste, valeur)}</select></label>`;
const etats = (nom, titre, valeur) => choix(nom, titre,
  [{ ref: "true", titre: "Oui" }, { ref: "false", titre: "Non" }], valeur);
const url = (base, params) => `#${base}?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null))}`;

export function pagination(base, p, params, nomPage = "page") {
  return `<nav aria-label="Pagination"><p>${p.total} résultat(s) filtré(s) / ${p.totalElements} au total · Page ${p.page} / ${p.pages}</p>
    ${[["Première", 1], ["Précédente", p.page - 1], ["Suivante", p.page + 1], ["Dernière", p.pages]]
      .map(([titre, page]) => page < 1 || page > p.pages || page === p.page
        ? `<span class="btn btn-secondary" aria-disabled="true">${titre}</span>`
        : `<a class="btn btn-secondary" href="${e(url(base, { ...params, [nomPage]: page }))}">${titre}</a>`).join("")}</nav>`;
}

function tri(liste, p) {
  return `${choix("tri", "Trier par", liste.map(([ref, titre]) => ({ ref, titre })), p.tri)}
    ${choix("sens", "Ordre", [{ ref: "asc", titre: "Croissant" }, { ref: "desc", titre: "Décroissant" }], p.sens)}
    ${choix("parPage", "Lignes par page", [10, 25, 50, 100].map((v) => ({ ref: String(v), titre: String(v) })), String(p.parPage))}`;
}

function hidden(nom, valeur) { return `<input type="hidden" name="${nom}" value="${e(valeur || "")}">`; }
function champsAcces(d, u, s) {
  const bool = (nom, titre, v) => `<label>${titre}<select name="${nom}" required><option value="">Choisir</option>
    <option value="true"${v === true ? " selected" : ""}>Oui</option><option value="false"${v === false ? " selected" : ""}>Non</option></select></label>`;
  return `${hidden("utilisateur", u.ref)}${s ? hidden("relation", s.ref) + hidden("domaine", s.domaine) + hidden("client", s.clientRef) : ""}
    <label>Rôle contextuel<select name="role" required>${options(d.roles, s?.roleRef, "Choisir")}</select></label>
    <label>Type d'accès<select name="accesType" required>${options(d.accesTypes, s?.accesTypeRef, "Choisir")}</select></label>
    ${bool("actif", "Actif", s?.actif)}${bool("valide", "Valide", s?.valide)}${bool("verrouille", "Verrouillé", s?.verrouille)}
    <button class="btn btn-primary" type="submit">Prévisualiser et confirmer</button>`;
}

export function rendreComptes(moi, d, params = {}) {
  const u = d.utilisateur, p = d.pagination, c = p.criteres;
  const base = "/cockpit/utilisateurs";
  const maintien = { domaine: d.contexteDomaine || "", utilisateur: u?.ref || "" };
  const contexte = hidden("domaine", maintien.domaine) + hidden("utilisateur", maintien.utilisateur);
  const barre = `<form data-comptes-filtres class="cockpit-form-inline">${contexte}
    <label>Recherche<input name="q" type="search" value="${e(c.q)}" maxlength="255" placeholder="${u ? "Site, domaine, client, rôle, type d'accès" : "Identité ou rôle global"}"></label>
    ${u ? ["site", "client", "role", "accesType"].map((cle) => choix(cle,
      { site: "Site", client: "Client", role: "Rôle", accesType: "Type d'accès" }[cle], d.optionsFiltre[cle], c[cle])).join("") +
      etats("actif", "Actif", c.actif) + etats("valide", "Valide", c.valide) + etats("verrouille", "Verrouillé", c.verrouille) +
      choix("incomplet", "Contexte", [{ ref: "false", titre: "Complet" }, { ref: "true", titre: "Incomplet" }], c.incomplet) : ""}
    ${tri(u ? [["site", "Site"], ["domaine", "Domaine"], ["client", "Client"], ["role", "Rôle"], ["accesType", "Type d'accès"],
      ["etat", "État"], ["modifieLe", "Modification"]] : [["identite", "Identité"], ["role", "Rôle global"], ["etat", "État"], ["affectations", "Affectations"]], c)}
    <button class="btn btn-primary">Appliquer</button><a class="btn btn-secondary" href="${e(url(base, maintien))}">Réinitialiser les filtres</a></form>`;
  const paginationHtml = pagination(base, p, { ...params, ...c, ...maintien });
  let contenu;
  if (!u) {
    contenu = `<h2>Comptes</h2>${barre}<div class="table-wrap"><table class="cockpit-table">
      <thead><tr><th>Identité</th><th>Rôle global</th><th>État global</th><th>Affectations</th><th>Actions</th></tr></thead><tbody>
      ${d.utilisateurs.map((v) => `<tr><td>${e(v.email)}${v.moi ? " (vous)" : ""}</td><td>${e(v.role || "Non renseigné")}</td>
        <td>${v.actif ? "Actif et valide" : "Inactif ou non valide"}</td><td>${v.affectations}</td>
        <td><a class="btn btn-secondary" href="${e(url(base, { ...maintien, utilisateur: v.ref }))}">Gérer les accès</a></td></tr>`).join("") ||
        '<tr><td colspan="5">Aucun utilisateur dans votre périmètre.</td></tr>'}</tbody></table></div>${paginationHtml}`;
  } else {
    const s = d.synthese;
    const repartition = (titre, liste) => `<h4>${titre}</h4><ul>${liste.map((v) => `<li>${e(v.titre)} : ${v.nombre}</li>`).join("")}</ul>`;
    const liaison = u.peutLierIdentite ? `<section class="card"><h3>Identité Microsoft non liée</h3>
      <p>Utiliser uniquement le code affiché dans la session OAuth réelle du titulaire. Vérifier l'identité présentée dans l'aperçu avant de confirmer. Le titre n'est jamais une clé d'identification.</p>
      <form data-action-admin="lier-identite-utilisateur">${hidden("utilisateur", u.ref)}
      <label>Code OAuth personnel<input name="codeLiaison" required maxlength="255" autocomplete="off"></label>
      <button class="btn btn-secondary">Vérifier la liaison</button></form></section>` : "";
    const global = `<details class="card"><summary>Rôle global · ${e(u.role || "Non renseigné")}</summary>
      <p>Distinct des affectations. Ne détermine pas le rôle d'un site.</p>${u.roleGlobalModifiable ? `
      <form data-action-admin="changer-role">${hidden("utilisateur", u.ref)}<label>Rôle global<select name="role" required>${options(d.roles, u.roleGlobalRef, "Choisir")}</select></label>
      <button class="btn btn-secondary">Prévisualiser le rôle global</button></form>` : "<p>Modification non autorisée dans cette interface.</p>"}</details>`;
    const ajouter = u.modifiable ? `<section class="card"><h3>Ajouter un accès à un site</h3>
      <form data-comptes-recherche-site class="cockpit-form-inline"><label>Rechercher un site<input type="search" name="qSite" value="${e(params.qSite || "")}" maxlength="255"></label><button class="btn btn-secondary">Rechercher</button></form>
      <p>${d.paginationSites.total} site(s) affectable(s), ${d.sites.length} affiché(s).</p>
      ${d.paginationSites.pages > 1 ? pagination(base, d.paginationSites, { ...params, ...maintien }, "pageSite") : ""}
      <form data-action-admin="ajouter-acces-site" class="cockpit-edition">
        <label>Site<select name="domaine" data-site-affectation required><option value="">Choisir</option>${d.sites.map((v) =>
          `<option value="${e(v.domaine)}" data-client="${e(v.clientRef)}" data-client-nom="${e(v.client)}">${e(v.nom)} · ${e(v.domaine)}</option>`).join("")}</select></label>
        ${hidden("client", "")}<label>Client cohérent avec le site<input data-client-affectation readonly value=""></label>
        ${champsAcces(d, u)}</form></section>` : `<p>Vos propres droits sont protégés. Consultation uniquement.</p>`;
    contenu = `<a href="${e(url(base, { domaine: maintien.domaine }))}">Retour aux utilisateurs</a><h2>Accès de ${e(u.email)}</h2>${liaison}${global}
      <section class="card"><h3>Synthèse utilisateur</h3><p>${s.autorises} sites autorisés · ${s.total} affectations · ${s.actives} actives ·
      ${s.incompletes} incomplètes · ${s.verrouillees} verrouillées</p>${repartition("Répartition par rôle", s.roles)}${repartition("Répartition par type d'accès", s.accesTypes)}</section>
      ${barre}<div class="table-wrap"><table class="cockpit-table"><thead><tr>${["Site", "Domaine", "Client", "Rôle", "Type d'accès", "Actif", "Valide", "Verrouillé", "Actions"].map((t) => `<th>${t}</th>`).join("")}</tr></thead>
      <tbody>${u.sites.map((v) => `<tr><td>${e(v.nom)}${v.incomplet ? `<br>Contexte incomplet : ${e(v.motif)}` : ""}</td><td>${e(v.domaine || "Non renseigné")}</td>
        <td>${e(v.client || "Non renseigné")}</td><td>${e(v.role || "Non renseigné")}</td><td>${e(v.accesType || "Non renseigné")}</td>
        <td>${ouiNon(v.actif)}</td><td>${ouiNon(v.valide)}</td><td>${ouiNon(v.verrouille)}</td><td>
        ${v.domaine ? `<a href="#/cockpit/site/${encodeURIComponent(v.domaine)}">Consulter le site</a>` : ""}
        ${v.modifiable && v.domaine ? `<details><summary>Modifier l'affectation</summary><form data-action-admin="modifier-acces-site" class="cockpit-edition">${champsAcces(d, u, v)}</form>
          <p>Retirer l'accès : choisir Actif = Non, puis confirmer. Aucune suppression.</p></details>` : ""}
        ${v.deverrouillable ? `<form data-action-admin="deverrouiller-acces-site">${hidden("utilisateur", u.ref)}${hidden("relation", v.ref)}<button class="btn btn-secondary">Prévisualiser le déverrouillage</button></form>` : ""}
        ${v.verrouille ? "<p>Relation protégée contre modification.</p>" : ""}</td></tr>`).join("") ||
        '<tr><td colspan="9">Aucune affectation correspondant aux filtres.</td></tr>'}</tbody></table></div>${paginationHtml}${ajouter}`;
  }
  return `<section class="cockpit" data-comptes-contexte="${e(d.contexteDomaine || "")}">${rendreEnteteCockpit(moi)}
    <div data-apercu aria-live="polite"></div>${contenu}${!u ? rendreUtilisateurs(moi, { ...d, utilisateurs: [], gestionGlobaleSeulement: true }) : ""}</section>`;
}

export function activerFiltresComptes(racine = document) {
  racine.querySelector("[data-comptes-filtres]")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    location.hash = url("/cockpit/utilisateurs", Object.fromEntries(new FormData(ev.currentTarget))).slice(1);
  });
  racine.querySelector("[data-comptes-recherche-site]")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    params.set("qSite", new FormData(ev.currentTarget).get("qSite")); params.delete("pageSite");
    location.hash = `/cockpit/utilisateurs?${params}`;
  });
  racine.querySelector("[data-site-affectation]")?.addEventListener("change", (ev) => {
    const option = ev.currentTarget.selectedOptions[0], form = ev.currentTarget.form;
    form.elements.client.value = option?.dataset.client || "";
    form.querySelector("[data-client-affectation]").value = option?.dataset.clientNom || "";
  });
}

export function rendreEspaces(moi, d, params) {
  const c = d.pagination.criteres, base = "/cockpit/espaces";
  return `<section class="cockpit">${rendreEnteteCockpit(moi)}<h2>Espaces</h2>
    <form data-espaces-filtres class="cockpit-form-inline"><label>Recherche<input name="q" type="search" value="${e(c.q)}" maxlength="255"></label>
    ${choix("client", "Client", d.clients, c.client)}${choix("statut", "Statut SharePoint", d.statuts, c.statut)}
    ${tri([["site", "Site"], ["domaine", "Domaine"], ["client", "Client"], ["statut", "Statut"]], c)}
    <button class="btn btn-primary">Appliquer</button><a href="#/cockpit/espaces">Réinitialiser les filtres</a></form>
    <div class="table-wrap"><table class="cockpit-table"><thead><tr><th>Site</th><th>Domaine</th><th>Client</th><th>Statut</th><th>Actions</th></tr></thead>
    <tbody>${d.espaces.map((v) => `<tr><td>${e(v.nom)}</td><td>${e(v.domaine || "Non renseigné")}</td><td>${e(v.client)}</td><td>${e(v.statut || "Non renseigné")}</td><td>
      ${v.domaine ? `<a href="#/cockpit/site/${encodeURIComponent(v.domaine)}">Ouvrir le cockpit</a> · <a href="https://${e(v.domaine)}/" target="_blank" rel="noopener noreferrer">Voir le site public</a>` : ""}</td></tr>`).join("") ||
      '<tr><td colspan="5">Aucun espace autorisé.</td></tr>'}</tbody></table></div>${pagination(base, d.pagination, { ...params, ...c })}</section>`;
}

export function activerFiltresEspaces(racine = document) {
  racine.querySelector("[data-espaces-filtres]")?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    location.hash = url("/cockpit/espaces", Object.fromEntries(new FormData(ev.currentTarget))).slice(1);
  });
}
