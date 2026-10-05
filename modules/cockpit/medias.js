import { escapeHtml as e } from "../public/outils.js";
import { icon } from "../../components/icons.js";
import { badgeEtat } from "./constructeur.js";

export function imageMedia(type) {
  return /^(image|logo|favicon|affiche|photo)(?:$|[\s/-])/i.test(String(type || "").trim());
}

export function rendreMedias(d, { domaine, message = "", erreur = false } = {}) {
  const medias = d.medias || [];
  const types = [...new Set(medias.map((m) => m.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  return `<section class="cockpit cockpit-medias">
    <header class="cockpit-entete"><div><h1>Médias · ${e(d.site?.titre || domaine)}</h1><p class="muted">Logos, images, sons, vidéos, affiches, favicons et fichiers autorisés pour ce site.</p></div><a class="btn btn-secondary" href="#/cockpit/site/${encodeURIComponent(domaine)}">Retour au site</a></header>
    <div role="status" data-medias-message>${message ? `<p class="${erreur ? "cockpit-alerte" : ""}">${e(message)}</p>` : ""}</div>
    <article class="card"><h2>Logo du site</h2>${d.logo?.media ? `<figure class="constructeur-logo"><img src="${e(d.logo.media.url)}" alt="${e(d.logo.media.titre)}"><figcaption>${e(d.logo.media.titre)} ${badgeEtat(d.logo.etat)}</figcaption></figure>` : "<p class=\"muted\">Aucun logo associé à un média.</p>"}</article>
    <form class="card cockpit-filtres" data-filtres-medias role="search"><label class="cockpit-champ">Rechercher un média<input type="search" name="q"></label><label class="cockpit-champ">Type<select name="type"><option value="">Tous les types</option>${types.map((t) => `<option>${e(t)}</option>`).join("")}</select></label></form>
    <article class="card"><h2>Médias autorisés (${medias.length})</h2><div class="constructeur-medias">${medias.map((m) => `<figure class="constructeur-media" data-media-titre="${e(m.titre)}" data-media-type="${e(m.type || "")}">
      ${imageMedia(m.type) ? `<img src="${e(m.url)}" alt="${e(m.titre)}" loading="lazy">` : `<div class="cockpit-media-fichier">${icon("file")}<span>${e(m.type || "Type non renseigné")}</span><small>Aperçu non disponible</small></div>`}
      <figcaption>${e(m.titre)}<br><span class="muted">${e(m.type || "Type non renseigné")} · ${e(m.portee || "")}</span></figcaption>
      ${imageMedia(m.type) && d.droits?.["logo-medias"]?.ecriture ? `<button type="button" class="btn btn-secondary" data-media-logo="${e(m.ref)}">Choisir comme logo</button>` : ""}
    </figure>`).join("")}</div><p class="muted" data-medias-vide${medias.length ? " hidden" : ""}>Aucun média ne correspond à cette sélection.</p>
    <p class="muted">L'import reste disponible dans la bibliothèque SharePoint DSE - MEDIAS. Aucun fichier n'est supprimé lors d'un remplacement.</p></article>
  </section>`;
}
