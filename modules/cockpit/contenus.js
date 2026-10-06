import { escapeHtml as e } from "../public/outils.js";
import { icon } from "../../components/icons.js";
import { badgeEtat } from "./constructeur.js";
import { imageMedia } from "./medias.js";
import { synchroniserMedias } from "../../services/cockpit.service.js";

/*
 * Gestion transverse : medias, pages, En-tetes, Footer et articles de tous les sites du perimetre.
 * Le serveur decide du perimetre et des onglets ; chaque ligne renvoie vers l'outil du site concerne.
 */

export const ONGLETS_CONTENUS = Object.freeze([
  { cle: "medias", libelle: "Médias", fonction: "logo-medias", icone: "image", texte: "Logos, images, vidéos, sons, favicons…" },
  { cle: "pages", libelle: "Pages", fonction: "pages", icone: "file", texte: "Toutes les pages et leurs En-tête / Footer." },
  { cle: "entetes", libelle: "En-têtes", fonction: "entete", icone: "layers", texte: "Les En-têtes de chaque site." },
  { cle: "footers", libelle: "Footer", fonction: "footer", icone: "panel", texte: "Les Footer de chaque site." },
  { cle: "articles", libelle: "Articles", fonction: "pages", icone: "list", texte: "Les articles publiés sur les sites." }
]);

export function lienContenus(type, client = null, domaine = "") {
  const p = new URLSearchParams({ type });
  if (client) p.set("client", client);
  if (domaine) p.set("domaine", domaine);
  return `#/cockpit/contenus?${p}`;
}

// Raccourcis (accueil du cockpit, espace client) : affiches selon les fonctions accordees par le serveur.
export function rendreRaccourcisContenus(moi, { client = null, titre = null } = {}) {
  const onglets = ONGLETS_CONTENUS.filter((o) => moi?.fonctions?.includes(o.fonction));
  if (!moi?.fonctions?.includes("sites") || !onglets.length) return "";
  const contexte = !!moi.contexte && !moi.porteeGlobale;
  const intitule = titre || (contexte ? "Gérer les contenus de ce site" : client ? "Gérer les sites de ce client" : moi.porteeGlobale ? "Gérer tous les sites" : "Gérer tous mes sites");
  return `<article class="card cockpit-contenus-raccourcis"><h2>${e(intitule)}</h2>
    <p class="muted">Médias, pages, En-têtes, Footer et articles de ${contexte ? "ce site" : client ? "tous les sites du client" : moi.porteeGlobale ? "tous les sites de l'écosystème" : "tous vos sites"}, réunis au même endroit.</p>
    <div class="cockpit-contenus-tuiles">${onglets.map((o) => `<a class="cockpit-contenus-tuile" href="${e(lienContenus(o.cle, client, moi.contexte?.domaine))}">${icon(o.icone)}<span><strong>${e(o.libelle)}</strong><small>${e(o.texte)}</small></span></a>`).join("")}</div></article>`;
}

const lienSite = (s, suite = "") => s?.domaine ? `#/cockpit/site/${encodeURIComponent(s.domaine)}${suite}` : null;
const GERER = {
  medias: (s) => lienSite(s, "/medias"),
  pages: (s) => lienSite(s, "/construire?onglet=pages"),
  entetes: (s) => lienSite(s, "/construire?onglet=entetes"),
  footers: (s) => lienSite(s, "/construire?onglet=footers"),
  articles: (s) => lienSite(s)
};

function etatFiltre(etat = {}) {
  return etat.inactif ? "inactif" : etat.brouillon ? "brouillon" : etat.publiable ? "publie" : "autre";
}

function cellulesSites(sites) {
  if (!sites.length) return `<span class="muted">Non rattaché à un site</span>`;
  return sites.map((s) => `<span class="cockpit-contenus-site">${e(s.titre || s.domaine || "Site")}${s.domaine ? `<small>${e(s.domaine)}</small>` : ""}</span>`).join("");
}

function actions(type, l) {
  const site = l.sites[0];
  const gerer = GERER[type]?.(site);
  const voir = type === "medias" ? l.url
    : type === "articles" && l.url && site?.domaine ? (/^https?:\/\//.test(l.url) ? l.url : `https://${site.domaine}${l.url.startsWith("/") ? "" : "/"}${l.url}`)
      : type === "pages" && site?.domaine ? `https://${site.domaine}${l.url?.startsWith("/") ? l.url : `/${l.url || ""}`}` : null;
  return `${gerer ? `<a class="btn btn-secondary" href="${e(gerer)}">${icon("edit")} ${type === "articles" ? "Cockpit du site" : "Gérer"}</a>` : ""}
    ${voir ? `<a class="btn btn-secondary" href="${e(voir)}" target="_blank" rel="noopener">${icon("external")} Voir</a>` : ""}`;
}

function detail(type, l) {
  if (type === "medias") return `${e(l.type || "Type non renseigné")}${l.portee ? ` · ${e(l.portee)}` : ""}${l.clients?.length ? ` · ${e(l.clients.join(", "))}` : ""}`;
  if (type === "pages") return `${e(l.url || "/")}<br><small class="muted">En-tête : ${e(l.entete || "aucun")} · Footer : ${e(l.footer || "aucun")}</small>`;
  if (type === "entetes" || type === "footers") return `Utilisé par ${Number(l.pages) || 0} page(s)`;
  return l.url ? e(l.url) : `<span class="muted">Adresse non renseignée</span>`;
}

const dateCourte = (iso) => { try { return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; } };

/* Bloc d'administration globale : rattachement des fichiers deposes dans la bibliotheque des medias. */
export function rendreSynchro(s) {
  if (!s) return "";
  const d = s.dernier;
  const liste = (titre, items, texte) => items.length ? `<details class="cockpit-synchro-detail"><summary>${e(titre)} (${items.length})</summary><ul>${items.map((x) => `<li>${texte(x)}</li>`).join("")}</ul></details>` : "";
  const resume = !d ? `<p class="muted">Aucune synchronisation depuis le dernier démarrage du service. Un passage automatique a lieu régulièrement.</p>`
    : !d.ok ? `<p role="alert">Dernière synchronisation (${e(dateCourte(d.le))}) : ${e(d.erreur || "non aboutie")}.</p>`
      : `<p>Dernière synchronisation : <strong>${e(dateCourte(d.le))}</strong> · ${Number(d.fichiers)} fichier(s) analysé(s) · ${Number(d.dejaReferences)} déjà référencé(s) · <strong>${d.crees.length}</strong> ajouté(s)${d.ignores.length ? ` · ${d.ignores.length} ignoré(s)` : ""}${d.erreurs.length ? ` · ${d.erreurs.length} en erreur` : ""}${d.reste ? " · suite au prochain passage" : ""}</p>
        ${liste("Médias ajoutés (en brouillon, à valider)", d.crees, (c) => `${e(c.chemin)} <small class="muted">${e(c.type || "")} · ${e(c.portee || "")}${c.aClasser ? " · type à classer" : ""}</small>`)}
        ${liste("Fichiers ignorés", d.ignores, (c) => `${e(c.chemin)} <small class="muted">${e(c.raison)}</small>`)}
        ${liste("Fichiers en erreur", d.erreurs, (c) => `${e(c.chemin)} <small class="muted">${e(c.raison)}</small>`)}`;
  return `<article class="card cockpit-synchro" data-synchro-medias>
    <div class="cockpit-synchro-entete"><div><h2>${icon("layers")} Bibliothèque des médias</h2>
      <p class="muted">Les fichiers déposés directement dans le dossier des sites publics sont ajoutés automatiquement au catalogue des médias, en brouillon. Aucun fichier n'est supprimé ni déplacé.</p></div>
      <button type="button" class="btn btn-primary" data-synchroniser${s.enCours ? " disabled" : ""}>${icon("layers")} ${s.enCours ? "Synchronisation en cours…" : "Synchroniser maintenant"}</button></div>
    <div data-synchro-resume aria-live="polite">${resume}</div></article>`;
}

export function rendreContenus(r) {
  if (!r) return `<section class="cockpit card"><p role="alert">Ces contenus ne sont pas disponibles dans votre espace.</p><a class="btn btn-secondary" href="#/cockpit">Retour au cockpit</a></section>`;
  const type = r.type;
  const onglet = r.onglets.find((o) => o.cle === type);
  const portee = r.client ? `Espace client ${r.client.titre || ""}` : r.global ? "Tous les sites" : "Mes sites";
  const sites = [...new Map(r.lignes.flatMap((l) => l.sites).map((s) => [s.domaine || s.titre, s])).values()]
    .sort((a, b) => String(a.titre || "").localeCompare(String(b.titre || ""), "fr"));
  const types = type === "medias" ? [...new Set(r.lignes.map((l) => l.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")) : [];
  const ligne = (l) => `<tr data-contenu data-titre="${e(l.titre)}" data-sites="${e(l.sites.map((s) => s.domaine || s.titre).join("|"))}" data-type="${e(l.type || "")}" data-etat="${etatFiltre(l.etat)}">
      ${type === "medias" ? `<td data-label="Aperçu" class="cockpit-contenus-vignette">${imageMedia(l.type) ? `<img src="${e(l.url)}" alt="" loading="lazy">` : icon("file")}</td>` : ""}
      <td data-label="Nom"><strong>${e(l.titre)}</strong></td>
      <td data-label="Site">${cellulesSites(l.sites)}</td>
      <td data-label="Détail">${detail(type, l)}</td>
      <td data-label="État">${badgeEtat(l.etat)}</td>
      <td data-label="Actions" class="cockpit-contenus-actions">${actions(type, l)}</td></tr>`;
  return `<section class="cockpit cockpit-contenus">
    <div class="cockpit-entete"><div><p class="cockpit-surtitre">${e(portee)}</p><h1 class="page-title">${e(onglet?.libelle || "Contenus")} de ${r.client ? "ses sites" : r.global ? "tous les sites" : "mes sites"}</h1>
      <p class="muted">${Number(r.nombreSites) || 0} site(s) concerné(s). La modification se fait dans le cockpit du site, avec les mêmes contrôles qu'aujourd'hui.</p></div>
      ${r.client ? `<a class="btn btn-secondary" href="#/cockpit/client/${encodeURIComponent(r.client.id)}">${icon("users")} Retour à l'espace client</a>` : `<a class="btn btn-secondary" href="#/cockpit/sites">${icon("globe")} Mes sites</a>`}</div>
    <nav class="cockpit-contenus-onglets" aria-label="Type de contenu">${r.onglets.map((o) => `<a class="btn ${o.cle === type ? "btn-primary" : "btn-secondary"}"${o.cle === type ? ' aria-current="page"' : ""} href="${e(lienContenus(o.cle, r.client?.id, r.contexteDomaine))}">${e(o.libelle)} <span class="badge">${Number(r.compteurs?.[o.cle]) || 0}</span></a>`).join("")}</nav>
    ${rendreSynchro(r.synchro)}
    <form class="card cockpit-filtres" data-filtres-contenus role="search">
      <label class="cockpit-champ"><span>Rechercher</span><input type="search" name="q" placeholder="Nom…"></label>
      <label class="cockpit-champ"><span>Site</span><select name="site"><option value="">Tous les sites</option>${sites.map((s) => `<option value="${e(s.domaine || s.titre)}">${e(s.titre || s.domaine)}</option>`).join("")}</select></label>
      ${types.length ? `<label class="cockpit-champ"><span>Type</span><select name="type"><option value="">Tous les types</option>${types.map((t) => `<option>${e(t)}</option>`).join("")}</select></label>` : ""}
      <label class="cockpit-champ"><span>État</span><select name="etat"><option value="">Tous</option><option value="publie">Actif et validé</option><option value="brouillon">Brouillon</option><option value="inactif">Désactivé</option><option value="autre">Autre état</option></select></label>
    </form>
    <article class="card"><h2><span data-contenus-compte>${r.lignes.length}</span> élément(s)</h2>
      ${r.lignes.length ? `<div class="table-wrap"><table class="cockpit-table cockpit-contenus-table"><thead><tr>${type === "medias" ? "<th>Aperçu</th>" : ""}<th>Nom</th><th>Site</th><th>Détail</th><th>État</th><th>Actions</th></tr></thead>
        <tbody>${r.lignes.map(ligne).join("")}</tbody></table></div>` : ""}
      <p class="muted" data-contenus-vide${r.lignes.length ? " hidden" : ""}>Aucun élément ne correspond à cette sélection.</p></article>
  </section>`;
}

function activerSynchro(racine) {
  const bouton = racine?.querySelector("[data-synchroniser]");
  if (!bouton) return;
  bouton.addEventListener("click", async () => {
    bouton.disabled = true;
    const libelle = bouton.innerHTML;
    bouton.textContent = "Synchronisation en cours…";
    const resume = racine.querySelector("[data-synchro-resume]");
    try {
      const r = await synchroniserMedias();
      if (r?.donnees?.dernier?.crees?.length) {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        return;
      }
      const bloc = document.createElement("div");
      bloc.innerHTML = rendreSynchro(r?.donnees);
      resume.replaceWith(bloc.querySelector("[data-synchro-resume]"));
    } catch (err) {
      resume.innerHTML = `<p role="alert">${e(err?.message || "La synchronisation n'a pas abouti.")}</p>`;
    }
    bouton.disabled = false;
    bouton.innerHTML = libelle;
  });
}

export function activerContenus(racine) {
  activerSynchro(racine);
  const form = racine?.querySelector("[data-filtres-contenus]");
  if (!form) return;
  const filtrer = () => {
    const q = form.elements.q.value.trim().toLocaleLowerCase("fr");
    const site = form.elements.site.value;
    const type = form.elements.type?.value || "";
    const etat = form.elements.etat.value;
    let n = 0;
    racine.querySelectorAll("[data-contenu]").forEach((tr) => {
      const ok = tr.dataset.titre.toLocaleLowerCase("fr").includes(q)
        && (!site || tr.dataset.sites.split("|").includes(site))
        && (!type || tr.dataset.type === type) && (!etat || tr.dataset.etat === etat);
      tr.hidden = !ok;
      if (ok) n++;
    });
    racine.querySelector("[data-contenus-compte]").textContent = String(n);
    racine.querySelector("[data-contenus-vide]").hidden = n > 0;
  };
  form.addEventListener("input", filtrer);
  form.addEventListener("submit", (ev) => { ev.preventDefault(); filtrer(); });
}
