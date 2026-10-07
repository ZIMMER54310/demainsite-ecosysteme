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
  { fonction: "administration", icone: "🛡️", titre: "Administration", texte: "Problèmes, anomalies et prochaines actions.", cible: (d) => `#/cockpit/administration${d ? `?domaine=${encodeURIComponent(d)}` : ""}` },
  { fonction: "utilisateurs", icone: "👥", titre: "Comptes", texte: "Rôles et profils par site.", cible: (d) => `#/cockpit/utilisateurs${d ? `?domaine=${encodeURIComponent(d)}` : ""}` }
]);

/* Reglages modifiables depuis le cockpit (le serveur refait tous les controles). */
export const EDITIONS = Object.freeze([
  { composant: "entete", fonction: "entete", libelle: "Modifier l'En-tête" },
  { composant: "seo", fonction: "seo", libelle: "Modifier le SEO" },
  { composant: "footer", fonction: "footer", libelle: "Modifier le Footer" },
  { composant: "menu", fonction: "menu", libelle: "Modifier le menu" },
  { composant: "pages", fonction: "pages", libelle: "Modifier les pages" },
  { composant: "articles", fonction: "articles", libelle: "Modifier les articles" }
]);
const NIVEAUX = { lecture: 0, ecriture: 1, administration: 2 };
export function editionsVisibles(moi, fonctionsSite = []) {
  if ((NIVEAUX[moi?.niveau] ?? -1) < NIVEAUX.ecriture) return [];
  const f = new Set(fonctionsSite);
  return EDITIONS.filter((x) => f.has(x.fonction) &&
    (!moi?.autorisations || moi.autorisations.operations.some((o) => o.operation === `${x.fonction}.modifier`)));
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
  const couleur = /^#[0-9a-f]{6}$/i.test(statut.couleur || "") ? ` style="color:${e(statut.couleur)};border-color:currentColor"` : "";
  return `<span class="cockpit-badge ${statut.actif ? "actif" : "situation"}"${couleur}>${e(statut.titre)}</span>`;
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
        ${x.realisations?.map((r) => `<p>${e(r.nom)} – ${e(r.titre)}${r.actionAutorisee && r.libelleAction ? ` · ${e(r.libelleAction)}` : ""}</p>`).join("") || ""}
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
    ${moi?.accesType?.titre ? `<p class="muted">Accès : ${e(moi.accesType.titre)}</p>` : ""}
    <a class="btn btn-secondary" href="/api/v1/auth/deconnexion">Se déconnecter</a></div>`;
}

export function rendreAccueil({ moi, vueCourante = null, domaineCourant = "", complement = "" }) {
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
    ${complement}
    ${rendreAccompagnement(vueCourante?.accompagnement)}
    ${vueCourante ? rendreProgression(vueCourante) : ""}
    ${rendreAccesRapides(moi?.fonctions, domaine)}
  </section>`;
}

export function rendreAccompagnement(configuration) {
  if (!configuration?.texte) return "";
  return `<article class="card cockpit-accompagnement"><h2>Votre accompagnement</h2>
    <p>${e(configuration.texte).replace(/\n/g, "<br>")}</p>
    <div class="grid">${(configuration.identites || []).map((i) => `<section>
      ${i.avatar ? `<img src="${e(i.avatar)}" alt="${e(i.libelle)}" width="64" height="64" loading="lazy">` : ""}
      <h3>${e(i.libelle)}</h3><p>${e(i.description || "")}</p></section>`).join("")}</div>
    <p class="muted">L'assistance IA ne dispose d'aucun accès supplémentaire à votre compte et ne réalise aucune opération à votre place.</p></article>`;
}

// Parametres de « Mes sites » transmis par l'adresse ; l'API refait tout le controle.
export const CRITERES_SITES = Object.freeze(["q", "statut", "client", "progression", "aCompleter", "tri", "sens", "page", "parPage", "domaine"]);

const lienSitesBase = (...a) => lienSites(...a);
export const lienClient = (id) => `#/cockpit/client/${encodeURIComponent(id)}`;

export function lienSites(criteres = {}, changements = {}, base = "/cockpit/sites") {
  const p = new URLSearchParams();
  const tout = { ...criteres, ...changements };
  for (const cle of CRITERES_SITES) if (tout[cle] !== undefined && tout[cle] !== null && tout[cle] !== "") p.set(cle, tout[cle]);
  const qs = p.toString();
  return `#${base}${qs ? `?${qs}` : ""}`;
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

export function rendreListeSites(moi, resultat, { complement = "" } = {}) {
  const r = Array.isArray(resultat)
    ? { elements: resultat, total: resultat.length, totalSites: resultat.length, page: 1, pages: 1, compteurs: [], options: {}, criteres: {} }
    : (resultat || { elements: [], total: 0, totalSites: 0, page: 1, pages: 1, compteurs: [], options: {}, criteres: {} });
  const c = r.criteres || {};
  const o = r.options || {};
  const elements = r.elements || [];
  const filtre = ["q", "statut", "client", "progression", "aCompleter"].some((k) => c[k]);
  // Meme moteur pour « Mes sites » et pour le cockpit d'un client (sites du client uniquement).
  const client = r.client || null;
  const base = client ? `/cockpit/client/${encodeURIComponent(client.id)}` : "/cockpit/sites";
  const lienSites = (crit, ch) => lienSitesBase(crit, ch, base);
  const colonneClient = !client && (o.clients || []).length > 1;

  const compteurs = `<ul class="cockpit-compteurs">
    <li><a class="card cockpit-compteur ${c.statut ? "" : "selectionne"}" href="${e(lienSites(c, { statut: "", page: "" }))}"${!c.statut ? ' aria-current="true"' : ""}><span class="cockpit-compteur-icone">${icon("globe")}</span><span><strong>${Number(r.totalSites) || 0}</strong><span>Sites au total</span><small>${client ? "Tous les sites du client" : "Tous vos sites"}</small></span></a></li>
    ${(r.compteurs || []).map((x) => `<li><a class="card cockpit-compteur ${c.statut === x.valeur ? "selectionne" : ""}" href="${e(lienSites(c, { statut: x.valeur, page: "" }))}"${c.statut === x.valeur ? ' aria-current="true"' : ""}><span class="cockpit-compteur-icone">${icon("layers")}</span><span><strong>${Number(x.nombre) || 0}</strong><span>${e(x.valeur)}</span><small>${r.totalSites ? Math.round(x.nombre / r.totalSites * 100) : 0} % des sites</small></span></a></li>`).join("")}</ul>`;

  const synthese = `<div class="cockpit-sites-synthese">
    <article class="card"><h2>${icon("chart")} Situation générale</h2><p class="muted">Progression moyenne de ${client ? "tous les sites du client" : "tous vos sites"}</p>
      ${typeof r.synthese?.progressionMoyenne === "number" ? `<div class="cockpit-moyenne">${jaugeCourte(r.synthese.progressionMoyenne)}</div>` : `<p class="muted">Progression globale non disponible${r.synthese ? ` · ${Number(r.synthese.progressionConnue) || 0} site(s) renseigné(s) sur ${Number(r.totalSites) || 0}` : ""}.</p>`}
      ${r.synthese ? `<small class="muted">${Number(r.synthese.aCompleter) || 0} site(s) avec des étapes à compléter identifiées.</small>` : ""}
    </article>
    <article class="card"><h2>${icon("layers")} Actions rapides</h2><div class="cockpit-sites-raccourcis">${cartesVisibles(moi?.fonctions).filter((x) => ["creer", "administration", "utilisateurs"].includes(x.fonction)).map((x) => `<a class="btn btn-secondary" href="${e(x.cible())}">${icon(iconForRoute(x.cible()))}${e(x.titre)}</a>`).join("")}<a class="btn btn-secondary" href="#/cockpit">${icon("home")}Cockpit</a></div></article>
  </div>`;

  const filtres = `<form class="card cockpit-filtres" data-filtres-sites data-base="${e(base)}" role="search">
    ${c.domaine ? `<input type="hidden" name="domaine" value="${e(c.domaine)}">` : ""}
    <label class="cockpit-champ cockpit-recherche"><span>Rechercher</span><input type="search" name="q" value="${e(c.q || "")}" placeholder="Nom du site ou domaine"></label>
    ${choix("statut", "Statut", "Tous les statuts", o.statuts || [], c.statut)}
    ${colonneClient ? choix("client", "Client", "Tous les clients", o.clients, c.client) : ""}
    ${choix("progression", "Progression", "Toutes", o.progressions || [], c.progression)}
    ${choix("aCompleter", "À compléter", "Indifférent", [{ valeur: "tout", libelle: "Au moins une étape" }, ...(o.aCompleter || [])], c.aCompleter)}
    <label class="cockpit-champ"><span>Trier par</span><select name="tri">${(o.tris || Object.keys(LIBELLES_TRI)).map((t) => option(t, LIBELLES_TRI[t] || t, c.tri || "nom")).join("")}</select></label>
    <label class="cockpit-champ"><span>Ordre</span><select name="sens">${option("asc", "Croissant", c.sens || "asc")}${option("desc", "Décroissant", c.sens)}</select></label>
    <div class="cockpit-actions"><button class="btn btn-primary" type="submit">Appliquer</button>${filtre ? `<a class="btn btn-secondary" href="#${e(base)}">Réinitialiser</a>` : ""}</div>
    <div class="cockpit-mode-affichage" role="group" aria-label="Présentation des sites"><button class="btn btn-secondary" type="button" data-vue-sites="lignes" aria-pressed="true">${icon("list")}Liste</button><button class="btn btn-secondary" type="button" data-vue-sites="cartes" aria-pressed="false">${icon("grid")}Cartes</button></div>
  </form>`;

  const lignes = elements.length ? `<div class="cockpit-tableau"><table>
    <thead><tr><th>Site</th><th>Domaine principal</th><th>Statut</th><th>Progression</th>${colonneClient ? "<th>Client</th>" : ""}<th><span class="sr-only">Action</span></th></tr></thead>
    <tbody>${elements.map((s) => `<tr>
      <td data-label="Site"><div class="cockpit-site-identite"><span class="cockpit-site-avatar">${e((s.nom || s.domaine || s.acces || "—").slice(0, 2).toUpperCase())}</span><div><strong>${e(s.nom || s.domaine || s.acces)}</strong>${(s.alias || []).length ? `<br><small class="muted" title="${e((s.alias || []).join(", "))}">${(s.alias || []).length} alias</small>` : ""}</div></div></td>
      <td data-label="Domaine principal">${s.domaine ? e(s.domaine) : `<span class="cockpit-alerte">Domaine principal à préciser</span>`}</td>
      <td data-label="Statut">${badgeStatut(s.statut)}${r.peutChangerStatut ? ` <button type="button" class="icon-btn" data-changer-statut="${e(s.acces || s.domaine)}" aria-label="Changer le statut de ${e(s.nom)}" title="Changer le statut">${icon("edit")}</button>` : ""}</td>
      <td data-label="Progression">${jaugeCourte(s.progression, s.progressionVisuelle)}${s.progressionVisuelle?.message || s.progressionVisuelle?.avertissement ? ` <span title="${e(s.progressionVisuelle.message || s.progressionVisuelle.avertissement)}">⚠</span>` : ""}${(s.aCompleter || []).some((x) => x.etat === "attention") ? ` <span title="Un point demande votre attention">⚠</span>` : ""}</td>
      ${colonneClient ? `<td data-label="Client">${s.clientCockpit ? `<a href="${e(lienClient(s.clientCockpit))}" title="Ouvrir l'espace client">${e(s.client || "Non renseigné")}</a>` : e(s.client || "Non renseigné")}</td>` : ""}
      <td>${s.contexte?.etat === "CONTEXTE INCOMPLET" ? `<p role="status">CONTEXTE INCOMPLET : ${e(s.contexte.message)}</p>` :
        `<p class="muted">${e(s.role || "")}${s.accesType ? ` / ${e(s.accesType)}` : ""}</p>`}
        <div class="cockpit-actions"><a class="btn btn-secondary" data-ouvrir-site data-nom="${e(s.nom || s.domaine || "")}" href="#/cockpit/site/${encodeURIComponent(s.acces || s.domaine)}">Ouvrir ${icon("arrow")}</a>${s.domaine ? `<a class="btn btn-primary" href="https://${e(s.domaine)}/" target="_blank" rel="noopener noreferrer">${icon("external")} Voir le site</a>` : ""}</div></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty">${filtre ? "Aucun site ne correspond à votre recherche." : "Aucun site dans votre espace pour le moment."}</div>`;

  const pagination = (r.pages || 1) > 1 ? `<nav class="cockpit-pagination" aria-label="Pages de résultats">
    ${r.page > 1 ? `<a class="btn btn-secondary" href="${e(lienSites(c, { page: r.page - 1 }))}">← Précédent</a>` : ""}
    <span>Page ${Number(r.page)} sur ${Number(r.pages)}</span>
    ${r.page < r.pages ? `<a class="btn btn-secondary" href="${e(lienSites(c, { page: r.page + 1 }))}">Suivant →</a>` : ""}</nav>` : "";

  const clients = !client && (r.clientsCockpit || []).length ? `<article class="card cockpit-clients"><h2>${icon("users")} Espaces clients</h2>
    <p class="muted">Pilotez ensemble tous les sites d'un même client.</p>
    <ul class="cockpit-clients-liste">${r.clientsCockpit.map((x) => `<li><a class="btn btn-secondary" href="${e(lienClient(x.id))}">${icon("layers")}<span>${e(x.titre || "Client sans nom")}</span><small>${Number(x.nombreSites) || 0} site(s)</small></a></li>`).join("")}</ul></article>` : "";
  const entete = client
    ? `<div class="cockpit-entete"><div><p class="cockpit-surtitre">Espace client</p><h1 class="page-title">${e(client.titre || "Client sans nom")}</h1><p class="muted">Pilotage commun des ${Number(client.nombreSites) || 0} site(s) de ce client. Chaque site garde son cockpit individuel.</p></div>${(moi?.clients || []).length > 1 || moi?.fonctions?.includes("sites") ? `<a class="btn btn-secondary" href="#/cockpit/sites">${icon("globe")}Tous mes sites</a>` : ""}</div>`
    : `<div class="cockpit-entete"><div><h1 class="page-title">Mes sites</h1><p class="muted">Gérez, construisez et suivez l'ensemble de vos sites.</p></div>${moi?.fonctions?.includes("creer") ? `<a class="btn btn-primary" href="#/cockpit/creer">${icon("plus")}Créer un site</a>` : ""}</div>`;
  return `<section class="cockpit cockpit-mes-sites${client ? " cockpit-espace-client" : ""}">
    ${entete}
    <p data-resultat-statut role="status"></p>
    ${r.avertissementProgression ? `<p class="cockpit-alerte" role="status">${e(r.avertissementProgression)}</p>` : ""}
    ${compteurs}
    ${synthese}
    ${complement}
    ${clients}
    ${filtres}
    ${lignes}
    <p class="muted cockpit-resultats-sites">${elements.length} site(s) affiché(s) sur ${Number(r.total) || 0}${filtre ? ` · ${Number(r.totalSites) || 0} ${client ? "pour ce client" : "dans votre espace"}` : ""}</p>
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
      ${pages ? `<strong class="metric">${Number(pages.total) || 0}</strong><p class="muted">${Number(pages.publiees) || 0} active(s) et validée(s)</p>` : `<strong class="cockpit-metrique-etat">${e(etape.realisations?.length ? [...new Set(etape.realisations.map((r) => r.titre))].join(" · ") : LIBELLES_ETAT[etape.etat] || LIBELLES_ETAT.afaire)}</strong><p class="muted">${Number(etape.nombre) || 0} élément(s) associé(s)</p>`}
      ${lien(cibleEtape(etape), "Consulter", "arrow", "cockpit-lien-texte")}</article>`;
  }).join("");
  return `<section class="cockpit cockpit-vue-site">
    <header class="card cockpit-site-titre cockpit-site-banniere"><div class="cockpit-site-monogramme">${e((vue.nom || domaine || "—").slice(0, 2).toUpperCase())}</div>
      <div class="cockpit-site-identification"><h1>${e(vue.nom || domaine)} ${badgeStatut(vue.statut)}</h1><p>${e(vue.domaine || "Domaine principal à préciser")}</p>${vue.client ? `<p>Client : ${vue.clientCockpit ? `<a href="${e(lienClient(vue.clientCockpit))}" title="Ouvrir l'espace client">${e(vue.client)}</a>` : e(vue.client)}</p>` : ""}${vue.statut?.message ? `<p>${e(vue.statut.message)}</p>` : ""}${moi?.fonctions?.includes("sites") ? lien("/cockpit/sites", "Changer de site", "globe") : ""}</div>
      ${vue.domaine && vue.fonctions?.includes("apercu") ? `<a class="btn cockpit-public-site" href="https://${e(vue.domaine)}/" target="_blank" rel="noopener noreferrer">Voir le site public ${icon("external")}</a>` : ""}
    </header>
    ${rendreUsagesSite(vue)}
    ${vue.contexteUtilisateur?.autorisations?.operations?.some((op) => op.operation === "site.modifier")
      ? `<article class="card cockpit-site-modifier"><h2>Modifier le nom du site</h2>
        <form data-site-modifier-form data-domaine="${e(domaine)}">
          <label class="field cockpit-champ"><span>Nom du site</span><input name="nom" required maxlength="255" value="${e(vue.nom || "")}"></label>
          <button class="btn btn-secondary" type="submit">Préparer l’aperçu</button>
        </form><div data-site-modifier-result aria-live="polite"></div></article>` : ""}
    <div class="cockpit-site-metriques"><article class="card cockpit-site-metrique cockpit-site-progression"${styleProgression(vue.progressionVisuelle)}><h2>${icon("chart")} Progression globale</h2><strong class="metric">${Number(vue.progression) || 0} %</strong><div class="cockpit-jauge"><span style="width:${Math.max(0, Math.min(100, Number(vue.progression) || 0))}%"></span></div><p class="muted">${terminees} / ${etapes.length} étapes terminées</p><a class="cockpit-lien-texte" href="#progression-site" data-ouvrir-progression>Voir le détail ${icon("arrow")}</a></article>${metriques}</div>
    <div class="cockpit-site-pilotage"><article class="card cockpit-site-prochaines"><h2>${icon("chart")} Que dois-je faire maintenant ?</h2><p class="muted">Les étapes non terminées de ce site.</p>
      ${prochaines.length ? `<ol>${prochaines.map((x) => `<li><div><strong>${e(x.libelle)}</strong><p class="muted">${e(x.alerte || x.realisations?.map((r) => `${r.nom} – ${r.titre}`).join(" · ") || LIBELLES_ETAT[x.etat] || LIBELLES_ETAT.afaire)}</p></div>${lien(cibleEtape(x), x.realisations?.find((r) => r.actionAutorisee && r.libelleAction)?.libelleAction || "Continuer", "arrow")}</li>`).join("")}</ol>` : "<p>Toutes les étapes de configuration sont terminées.</p>"}</article>
      <div class="cockpit-site-detail"><article class="card"><h2>${icon("globe")} Situation du site</h2><dl class="cockpit-site-infos"><dt>Statut</dt><dd>${badgeStatut(vue.statut)}</dd><dt>Domaine principal</dt><dd>${e(vue.domaine || "À préciser")}</dd><dt>Alias</dt><dd>${(vue.alias || []).length ? vue.alias.map(e).join(", ") : "Aucun"}</dd>${vue.client ? `<dt>Client</dt><dd>${e(vue.client)}</dd>` : ""}</dl></article>
      <article class="card"><h2>${icon("layers")} Structure du site</h2><p class="muted">Accéder aux éléments du site sélectionné.</p><div class="cockpit-site-structure">${nav.filter((x) => ["En-tête", "Pages", "Footer"].includes(x.libelle)).map((x) => lien(x.url, x.libelle, x.icone)).join("")}</div>${nav.some((x) => x.url === `${base}/construire`) ? lien(`${base}/construire`, "Ouvrir le constructeur", "arrow", "btn btn-primary") : ""}</article></div>
    </div>
    ${editionsVisibles(moi, vue.fonctions).length ? `<div class="cockpit-actions">${editionsVisibles(moi, vue.fonctions).map((x) => lien(`${base}/modifier/${x.composant}`, x.libelle, "edit")).join("")}</div>` : ""}
    <div id="progression-site">${rendreProgression(vue, section)}</div>
    ${(vue.demandesAcces || []).length ? `<article class="card"><h2>Accès complémentaires</h2>
      ${vue.demandesAcces.map((d) => `<div><strong>${e(d.libelle)}</strong><p>${e(d.message)}</p>
        <button type="button" class="btn btn-secondary" data-demande-acces="${e(d.operation)}" data-domaine="${e(domaine)}">Demander l'accès</button></div>`).join("")}</article>` : ""}
    ${vue.configurationCockpit ? `<details class="cockpit-pliant"><summary>Configuration cockpit — administration</summary>
      <div class="cockpit-pliant-contenu">${Object.entries(vue.configurationCockpit).map(([cle, c]) =>
        `<p>${e(cle)} : ${e(c.etat)}${c.message ? ` — ${e(c.message)}` : ""}</p>`).join("")}</div></details>` : ""}
    ${rendreAccompagnement(vue.accompagnement)}
    <details class="cockpit-pliant cockpit-raccourcis"><summary>Accès rapides</summary><div class="cockpit-pliant-contenu cockpit-site-raccourcis">${nav.slice(1).map((x) => lien(x.url, x.libelle, x.icone)).join("")}${rendreCartes((vue.fonctions || []).filter((f) => !["sites", "creer", "administration", "utilisateurs", "plateforme"].includes(f)), domaine)}</div></details>
  </section>`;
}

/* ---------------- Assistant « Créer un nouveau site » (interface seule) ---------------- */

export const ETAPES_ASSISTANT = Object.freeze([
  { cle: "informations", libelle: "Informations", aide: "Choisissez le nom du site.", champs: [
    { nom: "nom", libelle: "Nom du site", requis: true }] },
  { cle: "domaine", libelle: "Domaine", aide: "Sélectionnez un domaine existant, actif, validé et non rattaché.", champs: [
    { nom: "domaineReference", libelle: "Domaine existant", requis: true }] },
  { cle: "validation", libelle: "Aperçu et validation", aide: "Le site sera créé en brouillon, inactif et non validé.", champs: [] }
]);

export function etatEtapeAssistant(etape, valeurs = {}) {
  const champs = etape.champs || [];
  if (!champs.length) return null;
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

export function rendreAssistant({ moi, numero = 1, valeurs = {}, domaines = [], brouillons = [],
  erreurDomaines = null, erreurBrouillons = null }) {
  const total = ETAPES_ASSISTANT.length;
  const n = Math.min(total, Math.max(1, Number(numero) || 1));
  const etape = ETAPES_ASSISTANT[n - 1];
  const suivi = progressionAssistant(valeurs);
  let corps = etape.champs.map((c) => champHtml(c, valeurs)).join("");
  if (etape.cle === "domaine") {
    corps = `${erreurDomaines ? `<p role="alert">${e(erreurDomaines)}</p>` : ""}
      <label class="field cockpit-champ" for="assistant-domaineReference"><span>Domaine existant *</span>
        <select id="assistant-domaineReference" name="domaineReference" data-assistant-champ required>
          <option value="">Choisir un domaine disponible</option>${domaines.map((x) =>
      `<option value="${e(x.reference)}"${String(valeurs.domaineReference || "") === String(x.reference) ? " selected" : ""}>${e(x.domaine)} — ${e(x.client)}</option>`).join("")}
        </select></label>
      ${!domaines.length ? '<p class="muted">Aucun domaine admissible n’est disponible dans votre espace.</p>' : ""}`;
  } else if (etape.cle === "validation") {
    const pretPourApercu = String(valeurs.nom || "").trim() &&
      domaines.some((domaine) => String(domaine.reference) === String(valeurs.domaineReference || ""));
    corps = `<p>Création autorisée uniquement après un aperçu serveur et une confirmation explicite.</p>
      <button class="btn btn-primary" type="button" data-site-creer-apercu${pretPourApercu ? "" : " disabled"}>Préparer l’aperçu de création</button>
      <div data-site-creer-result aria-live="polite"></div>
      <h3>Sites en attente de validation</h3>${erreurBrouillons ? `<p role="alert">${e(erreurBrouillons)}</p>` : brouillons.length
        ? `<ul class="cockpit-etapes">${brouillons.map((site) => `<li><div><strong>${e(site.nom)}</strong>
            <p class="muted">${e(site.domaine)} · ${e(site.client)} · ${e(site.statut)}</p>
            ${site.peutValider ? `<button class="btn btn-secondary" type="button" data-site-valider="${e(site.reference)}">Préparer la validation</button>` : ""}
          </div></li>`).join("")}</ul>`
        : '<p class="muted">Aucun brouillon accessible n’est en attente de validation.</p>'}
      <p class="muted">La validation ne rendra pas le site actif ni public.</p>`;
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

/* Adresse publique d'un article : domaine principal officiel + chemin (jamais saisi par l'utilisateur). */
export function adressePublique(domaine, chemin) {
  const v = String(chemin || "").trim();
  if (!v) return "(aucun chemin)";
  if (/^https?:\/\//i.test(v)) return v;
  if (!domaine) return "(domaine principal non renseigné)";
  return `https://${domaine}/${v.replace(/^\/+/, "")}`;
}

function rendreUsagesSite(vue) {
  const donnees = vue.usagesSite;
  if (!donnees) return "";
  if (donnees.erreur) return `<article class="card cockpit-usages-site" role="status">
    <h2>Usages du site</h2><p class="muted">${e(donnees.erreur)}</p></article>`;
  const usages = (donnees.usages || []).map((usage) =>
    `<li><strong>${e(usage.usage || usage.titre || "Usage")}</strong>${usage.dateEffet ? `<small>${e(usage.dateEffet.slice(0, 10))}</small>` : ""}</li>`).join("");
  const choix = donnees.autorisations?.creer ? (donnees.choix || []) : [];
  return `<article class="card cockpit-usages-site"><h2>Usages du site</h2>
    ${donnees.autorisations?.voir
      ? usages ? `<ul class="cockpit-usages-liste">${usages}</ul>` : '<p class="muted">Aucun usage rattaché à ce site.</p>'
      : '<p class="muted">La consultation des usages existants n’est pas autorisée.</p>'}
    ${donnees.autorisations?.creer ? choix.length
      ? `<form data-usages-site-form data-domaine="${e(vue.acces || vue.domaine)}">
          <label class="cockpit-champ"><span>Ajouter un usage</span><select name="usageReference" required>
            <option value="">Choisir un usage configuré</option>${choix.map((x) => `<option value="${e(x.reference)}">${e(x.titre)}</option>`).join("")}
          </select></label>
          <label class="cockpit-champ"><span>Date d'effet</span><input name="dateEffet" type="date" required></label>
          <button class="btn btn-primary" type="submit">Préparer l'aperçu</button>
        </form>`
      : '<p class="muted">Aucun usage actif et validé n’est disponible dans SharePoint.</p>' : ""}
    <div data-usage-site-result aria-live="polite"></div></article>`;
}

export function rendreEdition(moi, d, params = {}) {
  const retour = `#/cockpit/site/${encodeURIComponent(d.domaine || params.domaine)}`;
  if (d.selection) return `<section class="cockpit">${rendreEnteteCockpit(moi)}<div class="card"><h2>${e(d.libelle)}</h2>
    ${d.peutCreer ? `<a class="btn btn-primary" href="${retour}/modifier/${encodeURIComponent(params.composant)}?element=nouveau">Créer</a>` : ""}
    <ul class="cockpit-liste">${(d.elements || []).map((x) => `<li><a href="${retour}/modifier/${encodeURIComponent(params.composant)}?element=${encodeURIComponent(x.ref)}">${e(x.titre)}</a></li>`).join("")}</ul><a class="btn btn-secondary" href="${retour}">Retour au site</a></div></section>`;
  if (!d.disponible) {
    return `<section class="cockpit">${rendreEnteteCockpit(moi)}
      <div class="card"><h2>${e(d.libelle || "Réglage")} — ${e(d.site || "")}</h2>
      <p>⚠ ${e(d.raison || "Ce réglage n'est pas encore modifiable.")}</p>
      <a class="btn btn-secondary" href="${retour}">Retour au site</a></div></section>`;
  }
  const domaine = d.domainePrincipal || "";
  const champs = (d.champs || []).map((c) => {
    const id = `ed-${e(c.cle)}`;
    const commun = `id="${id}" name="${e(c.cle)}" data-champ maxlength="${Number(c.max) || 255}"`;
    if (c.chemin) {
      return `<div class="form-field cockpit-chemin"><label for="${id}">${e(c.libelle)}</label>
        <div class="cockpit-chemin-saisie">${domaine ? `<span class="cockpit-chemin-domaine" aria-hidden="true">https://${e(domaine)}</span>` : ""}
        <input type="text" ${commun} value="${e(c.valeur || "")}" placeholder="/actualites/mon-article" spellcheck="false" autocomplete="off" aria-describedby="${id}-aide" data-chemin data-domaine-principal="${e(domaine)}"></div>
        <small id="${id}-aide" class="muted">${domaine
          ? `Saisissez seulement le chemin : le domaine principal du site (${e(domaine)}) est ajouté automatiquement.`
          : "Le domaine principal de ce site n'est pas renseigné dans SharePoint : l'adresse publique sera calculée dès qu'il le sera."}
        <br>Adresse publique : <span data-chemin-apercu>${e(adressePublique(domaine, c.valeur))}</span></small></div>`;
    }
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
  const journal = "";
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
    ${d.incidents.desactive ? `<p>${e(d.incidents.message)}</p>` : !d.incidents.politiqueDisponible ? "<p>Blocage automatique en attente de configuration de la politique SharePoint. Aucune durée inventée.</p>" : ""}
    <p data-resultat-incident role="status"></p>
    ${(d.incidents.incidents || []).map((i) => `<details><summary>${e(i.utilisateur)} — ${e(i.domaine)} — ${e({ OUVERT: "OUVERT", BLOQUE: "BLOQUÉ", RESOLU: "RÉSOLU" }[i.etat] || i.etat)} (${i.nombre} refus) · Examiner</summary>
      <p>Motif : ${e(i.motif)}<br>Premier refus : ${e(i.premier)}<br>Dernier refus : ${e(i.dernier)}<br>Journal : ${e(i.journalId)}</p>
      <button class="btn btn-secondary" data-incident="${e(i.id)}" data-decision-incident="reactiver">Réactiver après vérification</button>
      <button class="btn btn-secondary" data-incident="${e(i.id)}" data-decision-incident="maintenir">Maintenir le blocage</button>
    </details>`).join("") || "<p>Aucun incident d’accès.</p>"}</section>` : "";
  const options = (liste, selected = "") => `<option value="">Choisir</option>${(liste || []).map((v) =>
    `<option value="${e(v.ref)}"${v.ref === selected ? " selected" : ""}>${e(v.titre)}</option>`).join("")}`;
  const roles = options(d.roles);
  const profils = options(d.accesTypes);
  const sites = (d.sites || []).map((s) => `<option value="${e(s.domaine)}">${e(s.nom)} — ${e(s.domaine)}</option>`).join("");
  const lignes = (d.utilisateurs || []).map((u) => `<tr>
    <td>${e(u.email)}${u.moi ? ' <span class="muted">(vous)</span>' : ""}</td>
    <td>${e(u.role || "Aucun")}</td>
    <td>${u.actif ? "✅ Actif" : "⬜ Inactif"}</td>
    <td>${u.sites.length ? u.sites.map((s) => `<div><strong>${e(s.nom)}</strong> · ${e(s.role || "Rôle manquant")} / ${e(s.accesType || "Profil manquant")}
      ${s.incomplet ? "<p>CONTEXTE INCOMPLET</p>" : ""}
      ${s.modifiable && s.domaine ? `<form data-action-admin="modifier-acces-site" class="cockpit-form-inline">
        <input type="hidden" name="utilisateur" value="${e(u.ref)}"><input type="hidden" name="relation" value="${e(s.ref)}">
        <input type="hidden" name="domaine" value="${e(s.domaine)}">
        <label>Rôle du site<select name="role" required>${options(d.roles, s.roleRef)}</select></label>
        <label>Profil d'accès<select name="accesType" required>${options(d.accesTypes, s.accesTypeRef)}</select></label>
        <button type="submit" class="btn btn-secondary">Modifier ce contexte</button></form>` : ""}</div>`).join("") : (u.portee === "tous" ? '<span class="muted">Administration globale ; aucun contexte site attribué</span>' : "⚠ Aucun site")}</td>
    <td>${u.modifiable ? `
      ${u.roleGlobalModifiable ? `<form data-action-admin="changer-role" class="cockpit-form-inline"><input type="hidden" name="utilisateur" value="${e(u.ref)}">
        <label class="sr-only" for="r-${e(u.ref)}">Rôle</label><select id="r-${e(u.ref)}" name="role" required>${options(d.roles, u.roleGlobalRef)}</select>
        <button class="btn btn-secondary" type="submit">Changer le rôle global</button></form>` : ""}
      ${sites ? `<form data-action-admin="ajouter-acces-site" class="cockpit-form-inline"><input type="hidden" name="utilisateur" value="${e(u.ref)}">
        <label class="sr-only" for="s-${e(u.ref)}">Site</label><select id="s-${e(u.ref)}" name="domaine" required>${sites}</select>
        <label>Rôle du site<select name="role" required>${options(d.roles)}</select></label>
        <label>Profil d'accès<select name="accesType" required>${profils}</select></label>
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
  if (d.gestionGlobaleSeulement) return `${creation}${politiques ? `<h2>Politiques globales des rôles</h2>${politiques}` : ""}`;
  return `<section class="cockpit" data-comptes-contexte="${e(d.contexteDomaine || "")}">${rendreEnteteCockpit(moi)}
    <h2>Comptes · utilisateurs et droits par site <span class="muted">(${(d.utilisateurs || []).length})</span></h2>
    <div data-apercu aria-live="polite"></div>
    <div class="card"><div class="table-wrap"><table class="cockpit-table">
      <thead><tr><th>Utilisateur</th><th>Rôle</th><th>État</th><th>Sites</th><th>Actions</th></tr></thead>
      <tbody>${lignes || '<tr><td colspan="5" class="muted">Aucun utilisateur dans votre périmètre.</td></tr>'}</tbody></table></div></div>
    ${creation}
    ${incidents}
    ${politiques ? `<h2>Politiques des rôles</h2>${politiques}` : ""}
  </section>`;
}

export function rendreMonCompte(moi, d) {
  return `<section class="cockpit">${rendreEnteteCockpit(moi)}<article class="card"><h2>Mon compte</h2>
    <p>${e(d.nom || moi.nom || "")}</p><p>${e(d.email || "")}</p>
    ${d.roleGlobal ? `<p class="muted">Rôle global conservé : ${e(d.roleGlobal)}</p>` : ""}
    <h3>Mes contextes de site</h3>${(d.sites || []).map((s) => `<article><h4>${e(s.nom || s.domaine || "Site")}</h4>
      <p>${e(s.contexte?.etat || "CONTEXTE INCOMPLET")}</p>
      ${s.contexte?.message ? `<p role="status">${e(s.contexte.message)}</p>` : `<p>${e(s.role?.titre || "")} / ${e(s.accesType?.titre || "")}</p>`}
      ${s.domaine ? `<a class="btn btn-secondary" data-ouvrir-site data-nom="${e(s.nom || s.domaine || "")}" href="#/cockpit/site/${encodeURIComponent(s.domaine)}">Ouvrir</a>` : ""}</article>`).join("") || "<p>Aucun site attribué.</p>"}
    <a class="btn btn-secondary" href="#/cockpit/sites">Mes sites</a></article></section>`;
}
