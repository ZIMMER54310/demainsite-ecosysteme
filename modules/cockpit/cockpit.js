import { escapeHtml } from "../public/outils.js";
import { icon, iconForRoute } from "../../components/icons.js";
import { navigationSite } from "./navigation-site.js";

/*
 * Cockpit DSE generique : une seule interface qui s'adapte aux fonctions
 * autorisees par le serveur et aux donnees disponibles. Aucune donnee metier
 * ni aucun detail technique n'est code ou affiche ici.
 */

export const PICTOS = Object.freeze({ termine: "✅", encours: "🔄", afaire: "⬜", attention: "⚠" });
export const LIBELLES_ETAT = Object.freeze({ termine: "Terminé", encours: "En cours", afaire: "À faire", attention: "Attention" });

const e = escapeHtml;
const lienSite = (domaine, section) =>
  domaine ? `#/cockpit/site/${encodeURIComponent(domaine)}${section ? `?section=${encodeURIComponent(section)}` : ""}` : "#/cockpit/sites";

export const CARTES = Object.freeze([
  { fonction: "sites", icone: "🌐", titre: "Mes sites", texte: "Retrouver les sites de votre espace.", cible: () => "#/cockpit/sites" },
  { fonction: "creer", icone: "✨", titre: "Créer / configurer un site", texte: "Lancer l'assistant de création.", cible: () => "#/cockpit/creer" },
  { fonction: "pages", icone: "📄", titre: "Pages", texte: "Pages et contenus du site.", cible: (d) => lienSite(d, "pages") },
  { fonction: "entete", icone: "🧭", titre: "En-tête", texte: "Haut de page du site.", cible: (d) => lienSite(d, "entete") },
  { fonction: "logo-medias", icone: "🖼️", titre: "Médias", texte: "Logos, images et fichiers autorisés.", cible: (d) => d ? `#/cockpit/site/${encodeURIComponent(d)}/medias` : "#/cockpit/sites" },
  { fonction: "menu", icone: "☰", titre: "Menu", texte: "Navigation du site.", cible: (d) => lienSite(d, "menu") },
  { fonction: "footer", icone: "⬇️", titre: "Footer", texte: "Bas de page du site.", cible: (d) => lienSite(d, "footer") },
  { fonction: "seo", icone: "🔎", titre: "SEO", texte: "Référencement dans les moteurs.", cible: (d) => lienSite(d, "seo") },
  { fonction: "domaine", icone: "🔗", titre: "Domaine", texte: "Adresse publique du site.", cible: (d) => lienSite(d, "domaine") },
  { fonction: "apercu", icone: "👁️", titre: "Aperçu du site", texte: "Voir le site tel que le public le voit.", cible: (d) => (d ? `https://${d}/` : "#/cockpit/sites"), externe: true },
  { fonction: "suivi", icone: "📈", titre: "Suivi / progression", texte: "Avancement de la configuration.", cible: (d) => lienSite(d) },
  { fonction: "administration", icone: "🛡️", titre: "Administration", texte: "Problèmes, anomalies et prochaines actions.", cible: () => "#/cockpit/administration" },
  { fonction: "utilisateurs", icone: "👥", titre: "Utilisateurs et accès", texte: "Rôles et sites attribués.", cible: () => "#/cockpit/utilisateurs" }
]);

/* Reglages modifiables depuis le cockpit (le serveur refait tous les controles). */
export const EDITIONS = Object.freeze([
  { composant: "entete", fonction: "entete", libelle: "Modifier l'En-tête" },
  { composant: "seo", fonction: "seo", libelle: "Modifier le SEO" },
  { composant: "footer", fonction: "footer", libelle: "Modifier le Footer" },
  { composant: "menu", fonction: "menu", libelle: "Modifier le menu" },
  { composant: "pages", fonction: "pages", libelle: "Modifier les pages" }
]);
const NIVEAUX = { lecture: 0, ecriture: 1, administration: 2 };
export function editionsVisibles(moi, fonctionsSite = []) {
  if ((NIVEAUX[moi?.niveau] ?? -1) < NIVEAUX.ecriture) return [];
  const f = new Set(fonctionsSite);
  return EDITIONS.filter((x) => f.has(x.fonction));
}

export function cartesVisibles(fonctions = []) {
  const autorisees = new Set(Array.isArray(fonctions) ? fonctions : []);
  return CARTES.filter((c) => autorisees.has(c.fonction));
}

export function rendreCartes(fonctions, domaine) {
  const cartes = cartesVisibles(fonctions);
  if (!cartes.length) return `<div class="empty">Aucune fonction n'est encore disponible pour votre profil.</div>`;
  return `<div class="cockpit-cartes">${cartes.map((c) => {
    const cible = c.cible(domaine);
    const externe = c.externe && cible.startsWith("https://");
    return `<a class="cockpit-carte card" href="${e(cible)}"${externe ? ' target="_blank" rel="noopener"' : ""}>
      <span class="cockpit-carte-icone" aria-hidden="true">${icon(iconForRoute(cible))}</span>
      <strong>${e(c.titre)}</strong><span class="muted">${e(c.texte)}</span></a>`;
  }).join("")}</div>`;
}

function badgeStatut(statut) {
  if (!statut?.titre) return `<span class="cockpit-badge">Statut non renseigné</span>`;
  return `<span class="cockpit-badge ${statut.actif ? "actif" : "situation"}">${e(statut.titre)}</span>`;
}

function styleProgression(visuel) {
  return /^#[0-9a-f]{6}$/i.test(visuel?.couleur || "") ? ` style="--progression-couleur:${visuel.couleur}"` : "";
}

function rendreAccesRapides(fonctions, domaine) {
  return `<details class="cockpit-pliant cockpit-raccourcis">
    <summary>Accès rapides</summary><div class="cockpit-pliant-contenu">${rendreCartes(fonctions, domaine)}</div>
  </details>`;
}

export function rendreProgression(vue, sectionActive) {
  const etapes = Array.isArray(vue?.etapes) ? vue.etapes : [];
  if (!etapes.length) return `<div class="empty">Aucune information de progression disponible.</div>`;
  const visuel = vue.progressionVisuelle;
  return `<details class="cockpit-pliant cockpit-progression"${styleProgression(visuel)}${sectionActive ? " open" : ""}>
    <summary>Progression du site - ${Number(vue.progression) || 0} %${visuel?.libelle ? ` <span class="cockpit-progression-libelle">${e(visuel.libelle)}</span>` : ""}</summary>
    <div class="cockpit-pliant-contenu">
    ${visuel?.description ? `<p class="muted">${e(visuel.description)}</p>` : ""}
    ${visuel?.message ? `<p class="cockpit-alerte" role="status">${e(visuel.message)}</p>` : ""}
    ${visuel?.avertissement ? `<p class="cockpit-alerte" role="status">${e(visuel.avertissement)}</p>` : ""}
    <div class="cockpit-jauge" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Number(vue.progression) || 0}">
      <span style="width:${Math.max(0, Math.min(100, Number(vue.progression) || 0))}%"></span></div>
    <p class="muted">${Number(vue.progression) || 0} % de la configuration terminée</p>
    <ul class="cockpit-etapes">${etapes.map((x) => `
      <li id="section-${e(x.cle)}" class="cockpit-etape ${e(x.etat)}${sectionActive === x.cle ? " active" : ""}">
        <span class="cockpit-picto" aria-hidden="true">${PICTOS[x.etat] || PICTOS.afaire}</span>
        <div><strong>${e(x.libelle)}</strong> <span class="muted">· ${e(LIBELLES_ETAT[x.etat] || LIBELLES_ETAT.afaire)}</span>
        ${x.alerte ? `<p class="cockpit-alerte">${e(x.alerte)}</p>` : ""}
        ${Array.isArray(x.resume) && x.resume.length ? `<p class="muted">${x.resume.map(e).join(" · ")}</p>` : ""}</div>
      </li>`).join("")}</ul></div></details>`;
}

export function rendreConnexion({ fournisseurs = [], message = "" } = {}) {
  const disponibles = fournisseurs.filter((f) => f.disponible);
  const bientot = fournisseurs.filter((f) => !f.disponible);
  const retour = typeof location !== "undefined" ? location.hostname.replace(/^www\./, "") : "";
  return `<section class="cockpit cockpit-connexion card">
    <h1 class="page-title">Espace de gestion</h1>
    <p>Connectez-vous pour accéder à vos sites et à vos fonctions.</p>
    ${message ? `<p class="cockpit-alerte" role="alert">${e(message)}</p>` : ""}
    <div class="cockpit-actions">${disponibles.map((f) =>
      `<a class="btn btn-primary" href="/api/v1/auth/${encodeURIComponent(f.id)}/connexion?domaine=${encodeURIComponent(retour)}">Se connecter · ${e(f.libelle)}</a>`).join("")}
      ${disponibles.length ? "" : `<p class="muted">La connexion n'est pas encore ouverte.</p>`}</div>
    ${bientot.length ? `<p class="muted">Bientôt disponible : ${bientot.map((f) => e(f.libelle)).join(", ")}.</p>` : ""}
  </section>`;
}

export function rendreSansAcces(moi) {
  return `<section class="cockpit card">
    <h1 class="page-title">Bonjour${moi?.nom ? ` ${e(moi.nom)}` : ""}</h1>
    <p>Votre connexion est bien reconnue, mais aucun accès ne vous a encore été attribué.</p>
    <p class="muted">Votre administrateur doit activer votre profil pour que vos sites apparaissent ici.</p>
    <a class="btn btn-secondary" href="/api/v1/auth/deconnexion">Se déconnecter</a>
  </section>`;
}

export function rendreEnteteCockpit(moi) {
  return `<div class="cockpit-entete">
    <div><h1 class="page-title">Bonjour${moi?.nom ? ` ${e(moi.nom)}` : ""}</h1>
    ${moi?.role?.titre ? `<p class="muted">Profil : ${e(moi.role.titre)}</p>` : ""}</div>
    <a class="btn btn-secondary" href="/api/v1/auth/deconnexion">Se déconnecter</a></div>`;
}

export function rendreAccueil({ moi, vueCourante = null, domaineCourant = "" }) {
  const domaine = vueCourante?.acces || vueCourante?.domaine || null;
  return `<section class="cockpit">
    ${rendreEnteteCockpit(moi)}
    <div class="grid cockpit-resume">
      <div class="card"><h2>Site actuel</h2>${vueCourante
        ? `<p class="metric">${e(vueCourante.nom || domaine)}</p><p>${e(domaine)} ${badgeStatut(vueCourante.statut)}</p>`
        : `<p class="muted">${domaineCourant ? `Le domaine ${e(domaineCourant)} ne fait pas partie de votre espace. ` : ""}Choisissez un site dans <a href="#/cockpit/sites">Mes sites</a>.</p>`}</div>
      <div class="card cockpit-progression-resume"${styleProgression(vueCourante?.progressionVisuelle)}><h2>Configuration</h2>${vueCourante
        ? `<p class="metric">${Number(vueCourante.progression) || 0} %</p><p class="muted">de la configuration terminée</p>`
        : `<p class="muted">Choisissez un site pour suivre sa progression.</p>`}</div>
      <div class="card"><h2>Mes sites</h2><p class="metric">${Number(moi?.nombreSites) || 0}</p><p class="muted">site(s) dans votre espace</p></div>
    </div>
    ${vueCourante ? rendreProgression(vueCourante) : ""}
    ${rendreAccesRapides(moi?.fonctions, domaine)}
  </section>`;
}

// Parametres de « Mes sites » transmis par l'adresse ; l'API refait tout le controle.
export const CRITERES_SITES = Object.freeze(["q", "statut", "client", "progression", "aCompleter", "tri", "sens", "page", "parPage"]);

export function lienSites(criteres = {}, changements = {}) {
  const p = new URLSearchParams();
  const tout = { ...criteres, ...changements };
  for (const cle of CRITERES_SITES) if (tout[cle] !== undefined && tout[cle] !== null && tout[cle] !== "") p.set(cle, tout[cle]);
  const qs = p.toString();
  return `#/cockpit/sites${qs ? `?${qs}` : ""}`;
}

const LIBELLES_TRI = { nom: "Nom", domaine: "Domaine", statut: "Statut", client: "Client", progression: "Progression" };
const option = (valeur, libelle, choisi) => `<option value="${e(valeur)}"${String(choisi) === String(valeur) ? " selected" : ""}>${e(libelle)}</option>`;

function choix(nom, libelle, tous, valeurs, choisi) {
  return `<label class="cockpit-champ"><span>${e(libelle)}</span><select name="${nom}">${option("", tous, choisi)}${valeurs.map((v) => typeof v === "string" ? option(v, v, choisi) : option(v.valeur, v.libelle, choisi)).join("")}</select></label>`;
}

function jaugeCourte(valeur, visuel) {
  if (typeof valeur !== "number") return `<span class="muted">—</span>`;
  return `<span class="cockpit-mini-jauge"${styleProgression(visuel)} title="${e(visuel?.libelle ? `${valeur} % · ${visuel.libelle}` : `${valeur} %`)}"><span class="cockpit-jauge"><span style="width:${Math.max(0, Math.min(100, valeur))}%"></span></span><small>${valeur} %</small></span>`;
}

export function rendreListeSites(moi, resultat) {
  const r = Array.isArray(resultat)
    ? { elements: resultat, total: resultat.length, totalSites: resultat.length, page: 1, pages: 1, compteurs: [], options: {}, criteres: {} }
    : (resultat || { elements: [], total: 0, totalSites: 0, page: 1, pages: 1, compteurs: [], options: {}, criteres: {} });
  const c = r.criteres || {};
  const o = r.options || {};
  const elements = r.elements || [];
  const filtre = ["q", "statut", "client", "progression", "aCompleter"].some((k) => c[k]);

  const compteurs = `<ul class="cockpit-compteurs">
    <li><a class="card cockpit-compteur ${c.statut ? "" : "selectionne"}" href="${e(lienSites(c, { statut: "", page: "" }))}"${!c.statut ? ' aria-current="true"' : ""}><span class="cockpit-compteur-icone">${icon("globe")}</span><span><strong>${Number(r.totalSites) || 0}</strong><span>Sites au total</span><small>Tous vos sites</small></span></a></li>
    ${(r.compteurs || []).map((x) => `<li><a class="card cockpit-compteur ${c.statut === x.valeur ? "selectionne" : ""}" href="${e(lienSites(c, { statut: x.valeur, page: "" }))}"${c.statut === x.valeur ? ' aria-current="true"' : ""}><span class="cockpit-compteur-icone">${icon("layers")}</span><span><strong>${Number(x.nombre) || 0}</strong><span>${e(x.valeur)}</span><small>${r.totalSites ? Math.round(x.nombre / r.totalSites * 100) : 0} % des sites</small></span></a></li>`).join("")}</ul>`;

  const synthese = `<div class="cockpit-sites-synthese">
    <article class="card"><h2>${icon("chart")} Situation générale</h2><p class="muted">Progression moyenne de tous vos sites</p>
      ${typeof r.synthese?.progressionMoyenne === "number" ? `<div class="cockpit-moyenne">${jaugeCourte(r.synthese.progressionMoyenne)}</div>` : `<p class="muted">Progression globale non disponible${r.synthese ? ` · ${Number(r.synthese.progressionConnue) || 0} site(s) renseigné(s) sur ${Number(r.totalSites) || 0}` : ""}.</p>`}
      ${r.synthese ? `<small class="muted">${Number(r.synthese.aCompleter) || 0} site(s) avec des étapes à compléter identifiées.</small>` : ""}
    </article>
    <article class="card"><h2>${icon("layers")} Actions rapides</h2><div class="cockpit-sites-raccourcis">${cartesVisibles(moi?.fonctions).filter((x) => ["creer", "administration", "utilisateurs"].includes(x.fonction)).map((x) => `<a class="btn btn-secondary" href="${e(x.cible())}">${icon(iconForRoute(x.cible()))}${e(x.titre)}</a>`).join("")}<a class="btn btn-secondary" href="#/cockpit">${icon("home")}Cockpit</a></div></article>
  </div>`;

  const filtres = `<form class="card cockpit-filtres" data-filtres-sites role="search">
    <label class="cockpit-champ cockpit-recherche"><span>Rechercher</span><input type="search" name="q" value="${e(c.q || "")}" placeholder="Nom du site ou domaine"></label>
    ${choix("statut", "Statut", "Tous les statuts", o.statuts || [], c.statut)}
    ${(o.clients || []).length > 1 ? choix("client", "Client", "Tous les clients", o.clients, c.client) : ""}
    ${choix("progression", "Progression", "Toutes", o.progressions || [], c.progression)}
    ${choix("aCompleter", "À compléter", "Indifférent", [{ valeur: "tout", libelle: "Au moins une étape" }, ...(o.aCompleter || [])], c.aCompleter)}
    <label class="cockpit-champ"><span>Trier par</span><select name="tri">${(o.tris || Object.keys(LIBELLES_TRI)).map((t) => option(t, LIBELLES_TRI[t] || t, c.tri || "nom")).join("")}</select></label>
    <label class="cockpit-champ"><span>Ordre</span><select name="sens">${option("asc", "Croissant", c.sens || "asc")}${option("desc", "Décroissant", c.sens)}</select></label>
    <div class="cockpit-actions"><button class="btn btn-primary" type="submit">Appliquer</button>${filtre ? `<a class="btn btn-secondary" href="#/cockpit/sites">Réinitialiser</a>` : ""}</div>
    <div class="cockpit-mode-affichage" role="group" aria-label="Présentation des sites"><button class="btn btn-secondary" type="button" data-vue-sites="lignes" aria-pressed="true">${icon("list")}Liste</button><button class="btn btn-secondary" type="button" data-vue-sites="cartes" aria-pressed="false">${icon("grid")}Cartes</button></div>
  </form>`;

  const lignes = elements.length ? `<div class="cockpit-tableau"><table>
    <thead><tr><th>Site</th><th>Domaine principal</th><th>Statut</th><th>Progression</th>${(o.clients || []).length > 1 ? "<th>Client</th>" : ""}<th><span class="sr-only">Action</span></th></tr></thead>
    <tbody>${elements.map((s) => `<tr>
      <td data-label="Site"><div class="cockpit-site-identite"><span class="cockpit-site-avatar">${e((s.nom || s.domaine || s.acces || "—").slice(0, 2).toUpperCase())}</span><div><strong>${e(s.nom || s.domaine || s.acces)}</strong>${(s.alias || []).length ? `<br><small class="muted" title="${e((s.alias || []).join(", "))}">${(s.alias || []).length} alias</small>` : ""}</div></div></td>
      <td data-label="Domaine principal">${s.domaine ? e(s.domaine) : `<span class="cockpit-alerte">Domaine principal à préciser</span>`}</td>
      <td data-label="Statut">${badgeStatut(s.statut)}${r.peutChangerStatut ? ` <button type="button" class="icon-btn" data-changer-statut="${e(s.acces || s.domaine)}" aria-label="Changer le statut de ${e(s.nom)}" title="Changer le statut">${icon("edit")}</button>` : ""}</td>
      <td data-label="Progression">${jaugeCourte(s.progression, s.progressionVisuelle)}${s.progressionVisuelle?.message || s.progressionVisuelle?.avertissement ? ` <span title="${e(s.progressionVisuelle.message || s.progressionVisuelle.avertissement)}">⚠</span>` : ""}${(s.aCompleter || []).some((x) => x.etat === "attention") ? ` <span title="Un point demande votre attention">⚠</span>` : ""}</td>
      ${(o.clients || []).length > 1 ? `<td data-label="Client">${e(s.client || "Non renseigné")}</td>` : ""}
      <td><div class="cockpit-actions"><a class="btn btn-secondary" href="#/cockpit/site/${encodeURIComponent(s.acces || s.domaine)}">Ouvrir ${icon("arrow")}</a>${s.domaine ? `<a class="btn btn-primary" href="https://${e(s.domaine)}/" target="_blank" rel="noopener noreferrer">${icon("external")} Voir le site</a>` : ""}</div></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty">${filtre ? "Aucun site ne correspond à votre recherche." : "Aucun site dans votre espace pour le moment."}</div>`;

  const pagination = (r.pages || 1) > 1 ? `<nav class="cockpit-pagination" aria-label="Pages de résultats">
    ${r.page > 1 ? `<a class="btn btn-secondary" href="${e(lienSites(c, { page: r.page - 1 }))}">← Précédent</a>` : ""}
    <span>Page ${Number(r.page)} sur ${Number(r.pages)}</span>
    ${r.page < r.pages ? `<a class="btn btn-secondary" href="${e(lienSites(c, { page: r.page + 1 }))}">Suivant →</a>` : ""}</nav>` : "";

  return `<section class="cockpit cockpit-mes-sites">
    <div class="cockpit-entete"><div><h1 class="page-title">Mes sites</h1><p class="muted">Gérez, construisez et suivez l'ensemble de vos sites.</p></div>${moi?.fonctions?.includes("creer") ? `<a class="btn btn-primary" href="#/cockpit/creer">${icon("plus")}Créer un site</a>` : ""}</div>
    <p data-resultat-statut role="status"></p>
    ${r.avertissementProgression ? `<p class="cockpit-alerte" role="status">${e(r.avertissementProgression)}</p>` : ""}
    ${compteurs}
    ${synthese}
    ${filtres}
    ${lignes}
    <p class="muted cockpit-resultats-sites">${elements.length} site(s) affiché(s) sur ${Number(r.total) || 0}${filtre ? ` · ${Number(r.totalSites) || 0} dans votre espace` : ""}</p>
    ${pagination}
  </section>`;
}

export function rendreVueSite(moi, vue, section) {
  const domaine = vue.acces || vue.domaine;
  const base = `/cockpit/site/${encodeURIComponent(domaine)}`;
  const nav = navigationSite(vue, moi?.niveau);
  const etapes = vue.etapes || [];
  const terminees = etapes.filter((x) => x.etat === "termine").length;
  const prochaines = etapes.filter((x) => x.etat !== "termine");
  const cibleEtape = (x) => nav.find((n) => n.libelle === x.libelle || (x.cle === "identite" && n.libelle === "Médias")
    || (x.cle === "seo" && n.libelle === "SEO") || (x.cle === "contenus" && n.libelle === "Pages"))?.url || `${base}?section=${encodeURIComponent(x.cle)}`;
  const lien = (url, libelle, i, classe = "btn btn-secondary") => `<a class="${classe}" href="#${e(url)}">${icon(i)}${e(libelle)}</a>`;
  const metriques = ["pages", "identite", "entete", "footer", "seo"].map((cle) => {
    const etape = etapes.find((x) => x.cle === cle);
    if (!etape) return "";
    const pages = cle === "pages" ? vue.statistiques?.pages : null;
    return `<article class="card cockpit-site-metrique"><span class="cockpit-metrique-icone">${icon(cle === "identite" ? "image" : cle === "seo" ? "search" : "file")}</span><h2>${e(etape.libelle)}</h2>
      ${pages ? `<strong class="metric">${Number(pages.total) || 0}</strong><p class="muted">${Number(pages.publiees) || 0} active(s) et validée(s)</p>` : `<strong class="cockpit-metrique-etat">${e(LIBELLES_ETAT[etape.etat] || LIBELLES_ETAT.afaire)}</strong><p class="muted">${Number(etape.nombre) || 0} élément(s) associé(s)</p>`}
      ${lien(cibleEtape(etape), "Consulter", "arrow", "cockpit-lien-texte")}</article>`;
  }).join("");
  return `<section class="cockpit cockpit-vue-site">
    <header class="card cockpit-site-titre cockpit-site-banniere"><div class="cockpit-site-monogramme">${e((vue.nom || domaine || "—").slice(0, 2).toUpperCase())}</div>
      <div class="cockpit-site-identification"><h1>${e(vue.nom || domaine)} ${badgeStatut(vue.statut)}</h1><p>${e(vue.domaine || "Domaine principal à préciser")}</p>${vue.client ? `<p>Client : ${e(vue.client)}</p>` : ""}${vue.statut?.message ? `<p>${e(vue.statut.message)}</p>` : ""}${moi?.fonctions?.includes("sites") ? lien("/cockpit/sites", "Changer de site", "globe") : ""}</div>
      ${vue.domaine && vue.fonctions?.includes("apercu") ? `<a class="btn cockpit-public-site" href="https://${e(vue.domaine)}/" target="_blank" rel="noopener noreferrer">Voir le site public ${icon("external")}</a>` : ""}
    </header>
    <div class="cockpit-site-metriques"><article class="card cockpit-site-metrique cockpit-site-progression"${styleProgression(vue.progressionVisuelle)}><h2>${icon("chart")} Progression globale</h2><strong class="metric">${Number(vue.progression) || 0} %</strong><div class="cockpit-jauge"><span style="width:${Math.max(0, Math.min(100, Number(vue.progression) || 0))}%"></span></div><p class="muted">${terminees} / ${etapes.length} étapes terminées</p><a class="cockpit-lien-texte" href="#progression-site" data-ouvrir-progression>Voir le détail ${icon("arrow")}</a></article>${metriques}</div>
    <div class="cockpit-site-pilotage"><article class="card cockpit-site-prochaines"><h2>${icon("chart")} Que dois-je faire maintenant ?</h2><p class="muted">Les étapes non terminées de ce site.</p>
      ${prochaines.length ? `<ol>${prochaines.map((x) => `<li><div><strong>${e(x.libelle)}</strong><p class="muted">${e(x.alerte || LIBELLES_ETAT[x.etat] || LIBELLES_ETAT.afaire)}</p></div>${lien(cibleEtape(x), "Continuer", "arrow")}</li>`).join("")}</ol>` : "<p>Toutes les étapes de configuration sont terminées.</p>"}</article>
      <div class="cockpit-site-detail"><article class="card"><h2>${icon("globe")} Situation du site</h2><dl class="cockpit-site-infos"><dt>Statut</dt><dd>${badgeStatut(vue.statut)}</dd><dt>Domaine principal</dt><dd>${e(vue.domaine || "À préciser")}</dd><dt>Alias</dt><dd>${(vue.alias || []).length ? vue.alias.map(e).join(", ") : "Aucun"}</dd>${vue.client ? `<dt>Client</dt><dd>${e(vue.client)}</dd>` : ""}</dl></article>
      <article class="card"><h2>${icon("layers")} Structure du site</h2><p class="muted">Accéder aux éléments du site sélectionné.</p><div class="cockpit-site-structure">${nav.filter((x) => ["En-tête", "Pages", "Footer"].includes(x.libelle)).map((x) => lien(x.url, x.libelle, x.icone)).join("")}</div>${nav.some((x) => x.url === `${base}/construire`) ? lien(`${base}/construire`, "Ouvrir le constructeur", "arrow", "btn btn-primary") : ""}</article></div>
    </div>
    ${editionsVisibles(moi, vue.fonctions).length ? `<div class="cockpit-actions">${editionsVisibles(moi, vue.fonctions).map((x) => lien(`${base}/modifier/${x.composant}`, x.libelle, "edit")).join("")}</div>` : ""}
    <div id="progression-site">${rendreProgression(vue, section)}</div>
    <details class="cockpit-pliant cockpit-raccourcis"><summary>Accès rapides</summary><div class="cockpit-pliant-contenu cockpit-site-raccourcis">${nav.slice(1).map((x) => lien(x.url, x.libelle, x.icone)).join("")}${rendreCartes((vue.fonctions || []).filter((f) => !["sites", "creer", "administration", "utilisateurs", "plateforme"].includes(f)), domaine)}</div></details>
  </section>`;
}

/* ---------------- Assistant « Créer un nouveau site » (interface seule) ---------------- */

export const ETAPES_ASSISTANT = Object.freeze([
  { cle: "informations", libelle: "Informations", aide: "Présentez le site en quelques mots.", champs: [
    { nom: "nom", libelle: "Nom du site", requis: true }, { nom: "description", libelle: "Description courte", type: "textarea" }] },
  { cle: "domaine", libelle: "Domaine", aide: "Adresse publique du site.", champs: [
    { nom: "domaine", libelle: "Nom de domaine", requis: true, exemple: "exemple.fr", controle: "domaine" }] },
  { cle: "identite", libelle: "Identité visuelle", aide: "Logo et couleurs.", champs: [
    { nom: "logo", libelle: "Logo (nom du fichier)" }, { nom: "couleur", libelle: "Couleur principale", type: "color" }] },
  { cle: "entete", libelle: "En-tête", aide: "Haut de page.", champs: [
    { nom: "enteteTitre", libelle: "Titre affiché" }, { nom: "enteteAccroche", libelle: "Accroche" }] },
  { cle: "menu", libelle: "Menu", aide: "Un lien par ligne : libellé | adresse.", champs: [
    { nom: "menu", libelle: "Liens du menu", type: "textarea" }] },
  { cle: "pages", libelle: "Pages", aide: "Une page par ligne.", champs: [
    { nom: "pages", libelle: "Pages souhaitées", type: "textarea" }] },
  { cle: "contenus", libelle: "Contenus / médias", aide: "Texte d'accueil et image principale.", champs: [
    { nom: "accueil", libelle: "Texte d'accueil", type: "textarea" }, { nom: "image", libelle: "Image principale (nom du fichier)" }] },
  { cle: "footer", libelle: "Footer", aide: "Bas de page.", champs: [
    { nom: "footerTexte", libelle: "Texte" }, { nom: "footerMentions", libelle: "Mentions" }] },
  { cle: "seo", libelle: "SEO", aide: "Référencement.", champs: [
    { nom: "seoTitre", libelle: "Titre pour les moteurs de recherche" }, { nom: "seoDescription", libelle: "Description", type: "textarea" }] },
  { cle: "apercu", libelle: "Aperçu", aide: "Vérifiez les informations saisies.", champs: [] },
  { cle: "validation", libelle: "Validation", aide: "Envoi de la demande de création.", champs: [] },
  { cle: "progression", libelle: "Progression", aide: "Avancement de votre demande.", champs: [] }
]);

const domaineValide = (v) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(String(v || "").trim());

export function etatEtapeAssistant(etape, valeurs = {}) {
  const champs = etape.champs || [];
  if (!champs.length) return null;
  if (champs.some((c) => c.controle === "domaine" && valeurs[c.nom] && !domaineValide(valeurs[c.nom]))) return "attention";
  const remplis = champs.filter((c) => String(valeurs[c.nom] ?? "").trim()).length;
  if (remplis === 0) return "afaire";
  if (champs.some((c) => c.requis && !String(valeurs[c.nom] ?? "").trim())) return "attention";
  return remplis === champs.length ? "termine" : "encours";
}

export function progressionAssistant(valeurs = {}) {
  return ETAPES_ASSISTANT
    .map((etape) => ({ cle: etape.cle, libelle: etape.libelle, etat: etatEtapeAssistant(etape, valeurs) }))
    .filter((x) => x.etat);
}

function champHtml(c, valeurs) {
  const v = valeurs[c.nom] ?? "";
  const attrs = `id="assistant-${e(c.nom)}" name="${e(c.nom)}" data-assistant-champ${c.requis ? " required" : ""}`;
  const saisie = c.type === "textarea"
    ? `<textarea ${attrs} rows="4">${e(v)}</textarea>`
    : `<input ${attrs} type="${c.type === "color" ? "color" : "text"}" value="${e(v || (c.type === "color" ? "#19a974" : ""))}"${c.exemple ? ` placeholder="${e(c.exemple)}"` : ""}>`;
  return `<label class="field cockpit-champ" for="assistant-${e(c.nom)}"><span>${e(c.libelle)}${c.requis ? " *" : ""}</span>${saisie}</label>`;
}

export function rendreAssistant({ moi, numero = 1, valeurs = {} }) {
  const total = ETAPES_ASSISTANT.length;
  const n = Math.min(total, Math.max(1, Number(numero) || 1));
  const etape = ETAPES_ASSISTANT[n - 1];
  const suivi = progressionAssistant(valeurs);
  let corps = etape.champs.map((c) => champHtml(c, valeurs)).join("");
  if (etape.cle === "apercu") {
    const lignes = ETAPES_ASSISTANT.flatMap((x) => x.champs).filter((c) => String(valeurs[c.nom] ?? "").trim());
    corps = lignes.length
      ? `<dl class="kv">${lignes.map((c) => `<dt>${e(c.libelle)}</dt><dd>${e(valeurs[c.nom]).replaceAll("\n", "<br>")}</dd>`).join("")}</dl>`
      : `<div class="empty">Aucune information saisie pour l'instant.</div>`;
  } else if (etape.cle === "validation") {
    corps = `<p>Votre demande sera transmise pour création lorsque l'enregistrement sera ouvert.</p>
      <button class="btn btn-primary" type="button" disabled aria-disabled="true">Enregistrement bientôt disponible</button>
      <p class="muted">Aucune information n'est enregistrée pour le moment : vos saisies restent sur cet appareil.</p>`;
  } else if (etape.cle === "progression") {
    corps = `<ul class="cockpit-etapes">${suivi.map((x) =>
      `<li class="cockpit-etape ${e(x.etat)}"><span class="cockpit-picto" aria-hidden="true">${PICTOS[x.etat]}</span><div><strong>${e(x.libelle)}</strong> <span class="muted">· ${e(LIBELLES_ETAT[x.etat])}</span></div></li>`).join("")}</ul>`;
  }
  const etatDe = (cle) => suivi.find((x) => x.cle === cle)?.etat;
  return `<section class="cockpit cockpit-assistant">
    ${rendreEnteteCockpit(moi)}
    <h2>Créer un nouveau site</h2>
    <ol class="cockpit-fil">${ETAPES_ASSISTANT.map((x, i) => {
      const etat = etatDe(x.cle);
      return `<li class="${i + 1 === n ? "active" : ""}"><a href="#/cockpit/creer?etape=${i + 1}">${etat ? `${PICTOS[etat]} ` : ""}${i + 1}. ${e(x.libelle)}</a></li>`;
    }).join("")}</ol>
    <form class="card cockpit-formulaire" data-assistant onsubmit="return false">
      <h3>Étape ${n} / ${total} · ${e(etape.libelle)}</h3>
      <p class="muted">${e(etape.aide)}</p>
      ${corps}
      <div class="cockpit-actions">
        ${n > 1 ? `<a class="btn btn-secondary" href="#/cockpit/creer?etape=${n - 1}">Précédent</a>` : ""}
        ${n < total ? `<a class="btn btn-primary" href="#/cockpit/creer?etape=${n + 1}">Suivant</a>` : ""}
      </div>
    </form>
  </section>`;
}

/* ---------------- Ecriture : formulaire, apercu, resultat ---------------- */

export function rendreEdition(moi, d, params = {}) {
  const retour = `#/cockpit/site/${encodeURIComponent(d.domaine || params.domaine)}`;
  if (d.selection) return `<section class="cockpit">${rendreEnteteCockpit(moi)}<div class="card"><h2>${e(d.libelle)}</h2><ul class="cockpit-liste">${(d.elements || []).map((x) => `<li><a href="${retour}/modifier/${encodeURIComponent(params.composant)}?element=${encodeURIComponent(x.ref)}">${e(x.titre)}</a></li>`).join("")}</ul><a class="btn btn-secondary" href="${retour}">Retour au site</a></div></section>`;
  if (!d.disponible) {
    return `<section class="cockpit">${rendreEnteteCockpit(moi)}
      <div class="card"><h2>${e(d.libelle || "Réglage")} — ${e(d.site || "")}</h2>
      <p>⚠ ${e(d.raison || "Ce réglage n'est pas encore modifiable.")}</p>
      <a class="btn btn-secondary" href="${retour}">Retour au site</a></div></section>`;
  }
  const champs = (d.champs || []).map((c) => {
    const id = `ed-${e(c.cle)}`;
    const commun = `id="${id}" name="${e(c.cle)}" data-champ maxlength="${Number(c.max) || 255}"`;
    return `<div class="form-field"><label for="${id}">${e(c.libelle)}</label>${c.multiligne
      ? `<textarea ${commun} rows="5">${e(c.valeur || "")}</textarea>`
      : `<input type="text" ${commun} value="${e(c.valeur || "")}">`}</div>`;
  }).join("");
  return `<section class="cockpit">${rendreEnteteCockpit(moi)}
    <div class="card">
      <h2>${e(d.libelle)} — ${e(d.site || "")}</h2>
      <p class="muted">${d.creation ? "Aucun réglage n'est lié à ce site. Renseignez les valeurs pour le créer." : "Modifiez les valeurs puis vérifiez l'aperçu des changements avant de confirmer."}</p>
      <form class="cockpit-edition" data-edition data-domaine="${e(d.domaine || params.domaine)}" data-composant="${e(params.composant)}" data-element="${e(params.element || "")}">
        ${champs}
        <div class="cockpit-actions"><button class="btn btn-primary" type="submit">Voir les changements</button>
        <a class="btn btn-secondary" href="${retour}">Retour au site</a></div>
      </form>
    </div>
    <div data-apercu aria-live="polite"></div>
  </section>`;
}

export function rendreApercu(r) {
  if (!r || r.aucunChangement) return `<div class="card"><p>Aucun changement à enregistrer.</p></div>`;
  return `<div class="card cockpit-apercu"><h2>Aperçu des changements</h2>
    <table class="cockpit-diff"><thead><tr><th>Élément</th><th>Valeur actuelle</th><th>Nouvelle valeur</th></tr></thead><tbody>
    ${(r.changements || []).map((c) => `<tr><th scope="row">${e(c.libelle)}</th><td class="avant">${e(c.avant) || '<span class="muted">(vide)</span>'}</td><td class="apres">${e(c.apres) || '<span class="muted">(vide)</span>'}</td></tr>`).join("")}
    </tbody></table>
    <div class="cockpit-actions"><button class="btn btn-primary" type="button" data-confirmer>Confirmer l'enregistrement</button>
    <button class="btn btn-secondary" type="button" data-annuler>Annuler</button></div></div>`;
}

export function rendreResultatEcriture(r) {
  if (!r || r.erreur) return `<div class="card cockpit-resultat erreur"><p>⚠ ${e(r?.erreur || "L'enregistrement n'a pas abouti.")}</p></div>`;
  const journal = r.journal ? (r.journal.enregistre ? "✅ Modification journalisée." : "⚠ La modification est enregistrée mais n'a pas pu être journalisée.") : "";
  return `<div class="card cockpit-resultat ok"><p>✅ ${e(r.message || (r.deja ? "Modification déjà enregistrée." : "Modification enregistrée et vérifiée."))}</p>
    ${journal ? `<p class="muted">${journal}</p>` : ""}${r.journal?.erreur ? `<p>${e(r.journal.erreur)}</p>` : ""}</div>`;
}

/* ---------------- Administration ---------------- */

const lienInterne = (url) => `#${String(url || "/cockpit").replace(/^#/, "")}`;
const NIVEAU_PROBLEME = { critique: "🔴", attention: "⚠" };

export function rendreAdministration(moi, t) {
  const cartesStatut = (t.sitesParStatut || []).map((s) =>
    `<li><a href="${e(lienInterne(s.lien))}">${e(s.statut)} · ${Number(s.nombre) || 0}</a></li>`).join("");
  const problemes = (t.problemes || []).length
    ? `<ul class="cockpit-liste">${t.problemes.map((p) => `<li><a href="${e(lienInterne(p.lien))}">${NIVEAU_PROBLEME[p.niveau] || "⚠"} ${e(p.titre)}</a></li>`).join("")}</ul>`
    : `<p>✅ Aucun problème détecté.</p>`;
  const prochaines = (t.prochaines || []).length
    ? `<ul class="cockpit-liste">${t.prochaines.map((p) => `<li><a href="${e(lienInterne(p.lien))}">➡ ${e(p.titre)}</a></li>`).join("")}</ul>`
    : `<p class="muted">Aucune action en attente.</p>`;
  const aCompleter = (t.aCompleter || []).length
    ? `<ul class="cockpit-liste">${t.aCompleter.map((s) => `<li><a href="${e(lienInterne(s.lien))}"><strong>${e(s.site)}</strong> ${s.progression !== null ? `— ${Number(s.progression)} %` : ""}</a><br><span class="muted">${(s.elements || []).map(e).join(", ")}</span></li>`).join("")}</ul>`
    : `<p>✅ Rien à compléter.</p>`;
  const utilisateurs = t.utilisateursParRole
    ? `<ul class="cockpit-liste">${t.utilisateursParRole.map((u) => `<li>${e(u.role)} : <strong>${Number(u.nombre)}</strong></li>`).join("")}</ul><a class="btn btn-secondary" href="#/cockpit/utilisateurs">Gérer les utilisateurs</a>`
    : "";
  const apps = t.applications;
  const applications = !apps?.disponible ? `<p class="muted">Applications non disponibles.</p>`
    : apps.liste.length ? `<ul class="cockpit-liste">${apps.liste.map((a) => `<li>${a.actif && a.valide ? "✅" : "⬜"} ${e(a.titre || "Application")}${a.description ? ` <span class="muted">— ${e(a.description)}</span>` : ""}</li>`).join("")}</ul>`
      : `<p class="muted">Aucune application déclarée pour l'instant.</p>`;
  const manquantes = (apps?.colonnesManquantes || []).length
    ? `<p class="muted">⚠ Informations à prévoir pour publier une application dans le menu : ${apps.colonnesManquantes.map(e).join(", ")}.</p>` : "";
  const ecritures = !t.ecrituresRecentes?.disponible ? `<p>🔴 Journal indisponible.</p>`
    : t.ecrituresRecentes.liste.length ? `<ul class="cockpit-liste">${t.ecrituresRecentes.liste.map((x) => `<li>${e(String(x.le || "").replace("T", " ").slice(0, 16))} — ${e(x.objet || x.action || "")} ${x.statut ? `<span class="cockpit-badge">${e(x.statut)}</span>` : ""}</li>`).join("")}</ul>`
      : `<p class="muted">Aucune écriture depuis le cockpit pour l'instant.</p>`;
  const journal = t.journal?.ecritureDisponible === false ? `<p>🔴 ${e(t.journal.raison || "Journalisation indisponible.")}</p>`
    : t.journal?.derniere && !t.journal.derniere.enregistre ? `<p>🔴 La dernière écriture n'a pas pu être journalisée.</p>` : "";
  return `<section class="cockpit">${rendreEnteteCockpit(moi)}
    <h2>Administration</h2>
    <h3>Sites par statut <span class="muted">(${Number(t.nombreSites) || 0})</span></h3>
    ${cartesStatut ? `<ul class="cockpit-fil cockpit-compteurs">${cartesStatut}</ul>` : '<p class="muted">Aucun site.</p>'}
    <div class="grid cockpit-admin">
      <div class="card"><h3>Problèmes et anomalies</h3>${problemes}</div>
      <div class="card"><h3>Prochaines actions</h3>${prochaines}</div>
      <div class="card"><h3>Éléments à compléter</h3>${aCompleter}</div>
      ${utilisateurs ? `<div class="card"><h3>Utilisateurs et droits</h3>${utilisateurs}</div>` : ""}
      <div class="card"><h3>Applications</h3>${applications}${manquantes}</div>
      <div class="card"><h3>Écritures récentes</h3>${journal}${ecritures}</div>
    </div>
  </section>`;
}

export function rendreUtilisateurs(moi, d) {
  const incidents = d.incidents ? `<section class="card"><h2>Incidents d’accès</h2>
    ${!d.incidents.politiqueDisponible ? "<p>Blocage automatique en attente de configuration de la politique SharePoint. Aucune durée inventée.</p>" : ""}
    <p data-resultat-incident role="status"></p>
    ${(d.incidents.incidents || []).map((i) => `<details><summary>${e(i.utilisateur)} — ${e(i.domaine)} — ${e({ OUVERT: "OUVERT", BLOQUE: "BLOQUÉ", RESOLU: "RÉSOLU" }[i.etat] || i.etat)} (${i.nombre} refus) · Examiner</summary>
      <p>Motif : ${e(i.motif)}<br>Premier refus : ${e(i.premier)}<br>Dernier refus : ${e(i.dernier)}<br>Journal : ${e(i.journalId)}</p>
      <button class="btn btn-secondary" data-incident="${e(i.id)}" data-decision-incident="reactiver">Réactiver après vérification</button>
      <button class="btn btn-secondary" data-incident="${e(i.id)}" data-decision-incident="maintenir">Maintenir le blocage</button>
    </details>`).join("") || "<p>Aucun incident d’accès.</p>"}</section>` : "";
  const roles = (d.roles || []).map((r) => `<option value="${e(r.ref)}">${e(r.titre)}</option>`).join("");
  const sites = (d.sites || []).map((s) => `<option value="${e(s.domaine)}">${e(s.nom)} — ${e(s.domaine)}</option>`).join("");
  const lignes = (d.utilisateurs || []).map((u) => `<tr>
    <td>${e(u.email)}${u.moi ? ' <span class="muted">(vous)</span>' : ""}</td>
    <td>${e(u.role || "Aucun")}</td>
    <td>${u.actif ? "✅ Actif" : "⬜ Inactif"}</td>
    <td>${u.sites.length ? u.sites.map((s) => e(s.nom)).join(", ") : (u.portee === "tous" ? '<span class="muted">Tous les sites</span>' : "⚠ Aucun site")}</td>
    <td>${u.modifiable ? `
      <form data-action-admin="changer-role" class="cockpit-form-inline"><input type="hidden" name="utilisateur" value="${e(u.ref)}">
        <label class="sr-only" for="r-${e(u.ref)}">Rôle</label><select id="r-${e(u.ref)}" name="role" required>${roles}</select>
        <button class="btn btn-secondary" type="submit">Changer le rôle</button></form>
      ${sites ? `<form data-action-admin="ajouter-acces-site" class="cockpit-form-inline"><input type="hidden" name="utilisateur" value="${e(u.ref)}">
        <label class="sr-only" for="s-${e(u.ref)}">Site</label><select id="s-${e(u.ref)}" name="domaine" required>${sites}</select>
        <button class="btn btn-secondary" type="submit">Donner accès</button></form>` : ""}` : '<span class="muted">—</span>'}</td>
  </tr>`).join("");
  const creation = d.peutCreer && roles ? `<div class="card"><h3>Ajouter un utilisateur</h3>
    <form data-action-admin="creer-utilisateur" class="cockpit-form-inline">
      <label for="nouvel-email">Adresse e-mail</label><input id="nouvel-email" type="email" name="email" required maxlength="255">
      <label for="nouveau-role">Rôle</label><select id="nouveau-role" name="role" required>${roles}</select>
      <label for="nouveau-client">Client</label><select id="nouveau-client" name="client"><option value="">Sans client</option>${(d.clients || []).map((c) => `<option value="${e(c.ref)}">${e(c.titre)}</option>`).join("")}</select>
      <button class="btn btn-primary" type="submit">Voir l'aperçu</button></form></div>` : "";
  const politiques = (d.politiques || []).map((r) => `<div class="card"><h3>${e(r.titre)}</h3>${r.modifiable ? `
    <form data-action-admin="modifier-politique-role" class="cockpit-edition">
      <input type="hidden" name="role" value="${e(r.ref)}">
      <label>Périmètre<select name="portee" required><option value="">Choisir</option>${[
        ["TOUS", "Tous les clients"], ["CLIENT", "Un client"], ["ATTRIBUES", "Sites attribués"]
      ].map(([v, t]) => `<option value="${v}"${r.portee === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Niveau<select name="niveau" required><option value="">Choisir</option>${[
        ["LECTURE", "Lecture"], ["ECRITURE", "Écriture"], ["ADMINISTRATION", "Administration"]
      ].map(([v, t]) => `<option value="${v}"${r.niveau === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Fonctions autorisées<textarea name="fonctions" required maxlength="2000">${e(r.fonctions || "")}</textarea></label>
      <p class="muted">Capacités disponibles : ADMINISTRATION-GLOBALE, GESTION-CLIENT, GESTION-UTILISATEURS-CLIENT, GESTION-SITES-ATTRIBUES. Les fonctions individuelles de votre espace sont aussi acceptées. Séparez-les par un point-virgule.</p>
      <button class="btn btn-primary" type="submit">Vérifier la politique</button>
    </form>` : '<p class="muted">Votre propre politique ne peut pas être modifiée dans ce formulaire.</p>'}</div>`).join("");
  return `<section class="cockpit">${rendreEnteteCockpit(moi)}
    <h2>Utilisateurs et accès <span class="muted">(${(d.utilisateurs || []).length})</span></h2>
    <div data-apercu aria-live="polite"></div>
    <div class="card"><div class="table-wrap"><table class="cockpit-table">
      <thead><tr><th>Utilisateur</th><th>Rôle</th><th>État</th><th>Sites</th><th>Actions</th></tr></thead>
      <tbody>${lignes || '<tr><td colspan="5" class="muted">Aucun utilisateur dans votre périmètre.</td></tr>'}</tbody></table></div></div>
    ${creation}
    ${incidents}
    ${politiques ? `<h2>Politiques des rôles</h2>${politiques}` : ""}
  </section>`;
}
