// Constructeur DSE (En-tetes / Pages / Footer) : interface pilotee par les donnees SharePoint renvoyees par le serveur.
// Le navigateur ne manipule que des references opaques signees ; chaque action est recontrolee cote serveur.
import { escapeHtml as e } from "../public/outils.js";
import { rendreBuilder, STYLES_BUILDER } from "../builder/rendu.js";
import { getConstruire, actionConstruire } from "../../services/cockpit.service.js";
import { rendreEnteteCockpit } from "./cockpit.js";
import { panneauDesign, lireValeurs, cssApercu, APPAREILS_APERCU } from "./design.js";

export const ONGLETS = Object.freeze([
  { cle: "entetes", libelle: "En-têtes" },
  { cle: "pages", libelle: "Pages" },
  { cle: "footers", libelle: "Footer" },
  { cle: "bibliotheque", libelle: "Bibliothèque" },
  { cle: "catalogue", libelle: "Catalogue / Modèles" }
]);
const LIBELLES = { entete: "En-tête", footer: "Footer", page: "Page", section: "Section", ligne: "Ligne", colonne: "Colonne", module: "Module" };
const MESSAGE_IA = "Cette fonctionnalité est en cours de préparation. Revenez bientôt.";

export function badgeEtat(etat = {}) {
  if (etat.inactif) return `<span class="badge constructeur-badge constructeur-badge--inactif">Désactivé</span>`;
  if (etat.brouillon) return `<span class="badge constructeur-badge constructeur-badge--brouillon">Brouillon</span>`;
  if (etat.publiable) return `<span class="badge constructeur-badge constructeur-badge--actif">Actif et validé</span>`;
  return `<span class="badge constructeur-badge">${e(etat.actif || "")} · ${e(etat.valide || "")}</span>`;
}

const bouton = (libelle, action, attrs = "", classe = "btn btn-secondary") =>
  `<button type="button" class="${classe}" data-c-action="${e(action)}" ${attrs}>${libelle}</button>`;
const ecrit = (d, fonction) => Boolean(d.droits?.[fonction]?.ecriture);
const FONCTION = { entete: "entete", footer: "footer", page: "pages" };

function carteConteneur(d, type, c) {
  const peut = ecrit(d, FONCTION[type]);
  const pages = c.pages.length ? c.pages.map((p) => e(p.titre)).join(", ") : "Aucune page";
  return `<article class="card constructeur-carte" data-ref="${e(c.ref)}">
    <header><h3>${e(c.titre)}</h3>${badgeEtat(c.etat)}</header>
    ${c.noteCourte ? `<p class="muted">${e(c.noteCourte)}</p>` : ""}
    <p class="muted">${c.sections} section(s) · Utilisé par : ${pages}</p>
    <div class="constructeur-boutons">
      ${bouton("🧱 Construire / aperçu", "ouvrir", `data-ref="${e(c.ref)}"`, "btn btn-primary")}
      ${peut ? bouton("✏️ Modifier", "proprietes", `data-ref="${e(c.ref)}"`) : ""}
      ${peut ? bouton("⧉ Dupliquer", "dupliquer", `data-ref="${e(c.ref)}"`) : ""}
      ${peut && type !== "page" ? bouton("📄 Affecter aux pages", "affecter", `data-ref="${e(c.ref)}" data-type="${type}"`) : ""}
      ${peut && !c.etat.publiable ? bouton("✅ Valider et activer", "publier", `data-ref="${e(c.ref)}"`) : ""}
      ${peut && !c.etat.inactif ? bouton("⏸ Désactiver", "desactiver", `data-ref="${e(c.ref)}"`) : ""}
      ${bouton("🔎 Voir les utilisations", "utilisations", `data-ref="${e(c.ref)}"`)}
    </div>
    <div class="constructeur-utilisations" data-utilisations="${e(c.ref)}" hidden>
      ${c.pages.length ? `<ul>${c.pages.map((p) => `<li>${e(p.titre)}</li>`).join("")}</ul>` : `<p class="muted">Aucune page n'utilise cet élément.</p>`}
    </div>
  </article>`;
}

function ongletConteneurs(d, type) {
  const liste = type === "entete" ? d.entetes : d.footers;
  const peut = ecrit(d, FONCTION[type]);
  return `${peut ? `<form class="card constructeur-creer" data-c-creer="${type}">
      <label>Créer un ${LIBELLES[type]} <input name="titre" required maxlength="255" placeholder="Nom"></label>
      <button class="btn btn-primary" type="submit">➕ Créer</button>
    </form>` : ""}
    ${liste.length ? `<div class="constructeur-grille">${liste.map((c) => carteConteneur(d, type, c)).join("")}</div>`
      : `<p class="card muted">Aucun ${LIBELLES[type]} pour ce site dans SharePoint.</p>`}`;
}

function ongletPages(d) {
  const peut = (f) => ecrit(d, f);
  const options = (liste, actuel) => `<option value="">— Aucun —</option>${liste.filter((x) => x.etat.publiable)
    .map((x) => `<option value="${e(x.ref)}"${actuel?.ref === x.ref ? " selected" : ""}>${e(x.titre)}</option>`).join("")}`;
  const creer = peut("pages") ? `<form class="card constructeur-creer" data-c-creer="page">
    <label>Créer une page <input name="titre" required maxlength="255"></label>
    <label>Adresse <input name="url" required placeholder="/ma-page/" pattern="/[A-Za-z0-9/_-]*"></label>
    <button class="btn btn-primary">Créer en brouillon</button></form>` : "";
  return `${creer}<div class="constructeur-grille">${d.pages.map((p) => `<article class="card constructeur-carte">
    <header><h3>${e(p.titre)}</h3>${badgeEtat(p.etat)}</header>
    <p class="muted">${e(p.url)} · ${p.sections} section(s)</p>
    <label>En-tête ${peut("entete") ? `<select data-c-affecter="entete" data-page="${e(p.ref)}">${options(d.entetes, p.entete)}</select>` : `<strong>${e(p.entete?.titre || "Aucun")}</strong>`}</label>
    <label>Footer ${peut("footer") ? `<select data-c-affecter="footer" data-page="${e(p.ref)}">${options(d.footers, p.footer)}</select>` : `<strong>${e(p.footer?.titre || "Aucun")}</strong>`}</label>
    <div class="constructeur-boutons">${bouton("🧱 Construire / aperçu", "ouvrir", `data-ref="${e(p.ref)}"`, "btn btn-primary")}
      ${peut("pages") ? bouton("✏️ Modifier", "proprietes", `data-ref="${e(p.ref)}"`) : ""}</div>
  </article>`).join("") || '<p class="card muted">Aucune page pour ce site dans SharePoint.</p>'}</div>
  <p class="muted">Une page utilise au maximum un En-tête et un Footer actifs et validés ; choisir un autre élément remplace le précédent sans suppression.</p>`;
}

function ongletBibliotheque(d) {
  const peutLogo = ecrit(d, "logo-medias");
  const logo = d.logo;
  return `<div class="card">
      <h3>Logo du site</h3>
      ${logo?.media ? `<figure class="constructeur-logo"><img src="${e(logo.media.url)}" alt="${e(logo.media.titre)}" loading="lazy"><figcaption>${e(logo.media.titre)} ${badgeEtat(logo.etat)}</figcaption></figure>`
        : `<p class="muted">Aucun logo associé à un média.</p>`}
    </div>
    <div class="card">
      <h3>Médias autorisés (${d.medias.length})</h3>
      ${d.medias.length ? `<div class="constructeur-medias">${d.medias.map((m) => `<figure class="constructeur-media">
          <img src="${e(m.url)}" alt="${e(m.titre)}" loading="lazy">
          <figcaption>${e(m.titre)}<br><span class="muted">${e(m.type || "")} · ${e(m.portee || "")}</span></figcaption>
          ${peutLogo ? bouton("Choisir comme logo", "logo", `data-media="${e(m.ref)}"`) : ""}
        </figure>`).join("")}</div>` : `<p class="muted">Aucun média autorisé pour ce périmètre.</p>`}
      <p class="muted">L'import de nouveaux médias se fait dans la bibliothèque SharePoint DSE - MEDIAS ; un remplacement ne supprime jamais l'ancien média.</p>
    </div>`;
}

function ongletCatalogue(d) {
  const m = d.modeles;
  return `<div class="card"><h3>Modèles disponibles</h3>
      ${m.disponibles.length ? `<ul>${m.disponibles.map((x) => `<li>${e(x.titre)}${x.type ? ` <span class="muted">(${e(x.type)})</span>` : ""}</li>`).join("")}</ul>`
        : `<p class="muted">Aucun modèle actif et validé dans SharePoint pour ce périmètre${m.enAttente ? ` (${m.enAttente} en attente de validation)` : ""}. La construction libre reste disponible.</p>`}
    </div>
    <div class="card"><h3>Modules autorisés</h3>
      <ul class="constructeur-types">${d.typesModules.map((t) => `<li><strong>${e(t.code)}</strong>${t.formulaire ? "" : " <span class=\"muted\">(sans formulaire de contenu)</span>"}${t.description ? ` — ${e(t.description)}` : ""}</li>`).join("")}</ul>
    </div>
    <div class="card"><h3>Dispositions de colonnes</h3>
      <p>${d.structures.map((s) => `<span class="badge">${e(s.titre)}</span>`).join(" ") || `<span class="muted">Aucune disposition active.</span>`}</p>
    </div>`;
}

/* ---------------- Editeur d'arbre ---------------- */

function actionsNoeud(n, peut, colonnes) {
  if (!peut) return "";
  const r = `data-ref="${e(n.ref)}"`;
  return `<span class="constructeur-outils">
    ${bouton("▲", "monter", `${r} title="Monter" aria-label="Monter"`, "btn btn-mini")}
    ${bouton("▼", "descendre", `${r} title="Descendre" aria-label="Descendre"`, "btn btn-mini")}
    ${n.type === "module" && colonnes.length > 1 ? `<select data-c-deplacer="${e(n.ref)}" aria-label="Déplacer vers une colonne"><option value="">Déplacer vers…</option>${colonnes.map((c) => `<option value="${e(c.ref)}">${e(c.titre)}</option>`).join("")}</select>` : ""}
    ${n.type === "module" && n.formulaire ? bouton("✏️ Contenu", "contenu", r, "btn btn-mini") : ""}
    ${bouton("🎨", "design", `${r} title="Design" aria-label="Design"`, "btn btn-mini")}
    ${bouton("⧉", "dupliquer-element", `${r} title="Dupliquer / créer une variante" aria-label="Dupliquer"`, "btn btn-mini")}
    ${n.etat.inactif || n.etat.brouillon ? bouton("Activer", "activer", r, "btn btn-mini") : bouton("Désactiver", "desactiver-element", r, "btn btn-mini")}
  </span>`;
}

function noeudHtml(d, n, peut, colonnes) {
  const entete = `<div class="constructeur-noeud-entete"${peut ? ' draggable="true"' : ""} data-c-noeud="${e(n.ref)}" data-c-type="${e(n.type)}"><span class="constructeur-type">${LIBELLES[n.type]}</span>
    <strong>${e(n.titre)}</strong>${n.typeModule ? ` <span class="badge">${e(n.typeModule)}</span>` : ""}
    ${n.structure && n.type === "ligne" ? ` <span class="muted">${e(n.structure)}</span>` : ""}
    ${n.type === "colonne" && n.largeur ? ` <span class="muted">${e(n.largeur)} %</span>` : ""}
    ${badgeEtat(n.etat)}
    ${n.type === "module" ? ` <span class="muted">${n.utilisations} utilisation(s)${n.formulaire ? (n.contenuRenseigne ? " · contenu renseigné" : " · contenu à renseigner") : ""}${n.modele ? ` · modèle ${e(n.modele)}` : ""}</span>` : ""}
    ${actionsNoeud(n, peut, colonnes)}</div>`;
  if (n.type === "module") return `<li class="constructeur-noeud constructeur-noeud--module">${entete}</li>`;
  const enfants = (n.enfants || []).map((x) => noeudHtml(d, x, peut, colonnes)).join("");
  let ajout = "";
  if (peut && n.type === "section") {
    ajout = `<form class="constructeur-ajout" data-c-ajout="ligne" data-ref="${e(n.ref)}">
      <select name="structure" required aria-label="Disposition"><option value="">Disposition des colonnes…</option>${d.structures.map((s) => `<option value="${e(s.ref)}">${e(s.titre)}</option>`).join("")}</select>
      <button class="btn btn-mini" type="submit">➕ Ligne</button></form>`;
  }
  if (peut && n.type === "colonne") {
    ajout = `<form class="constructeur-ajout" data-c-ajout="module" data-ref="${e(n.ref)}">
      <select name="typeModule" required aria-label="Type de module"><option value="">Module…</option>${d.typesModules.map((t) => `<option value="${e(t.code)}">${e(t.code)}</option>`).join("")}</select>
      ${d.modeles.disponibles.length ? `<select name="modele" aria-label="Modèle (facultatif)"><option value="">Construction libre</option>${d.modeles.disponibles.map((m) => `<option value="${e(m.ref)}">${e(m.titre)}</option>`).join("")}</select>` : ""}
      <input name="titre" maxlength="255" placeholder="Nom (facultatif)" aria-label="Nom du module">
      <button class="btn btn-mini" type="submit">➕ Module</button></form>`;
  }
  return `<li class="constructeur-noeud constructeur-noeud--${n.type}">${entete}<ul>${enfants}</ul>${ajout}</li>`;
}

const colonnesDe = (sections) => sections.flatMap((s) => (s.enfants || []).flatMap((l) => (l.enfants || []).map((c) => ({ ref: c.ref, titre: `${s.titre} › ${c.titre}` }))));

const TYPE_CONTENEUR = { entete: "ENTETE", footer: "FOOTER", page: "PAGE" };
function arbreGeneriqueHtml(n, peut) {
  return `<li class="constructeur-noeud"><div class="constructeur-noeud-entete" data-c-noeud="${e(n.ref)}" data-c-type="builder"${peut && !n.verrouille ? ' draggable="true"' : ""}>
    <button type="button" class="btn btn-mini" data-c-action="design" data-ref="${e(n.ref)}">${e(n.titre)}</button>
    <span class="badge">${e(n.rendu)}</span>${n.verrouille ? "🔒" : ""}
    ${peut ? `<button type="button" class="btn btn-mini" data-c-action="builder-ajouter" data-ref="${e(n.ref)}">Ajouter dans</button>
      <button type="button" class="btn btn-mini" data-c-action="builder-retirer" data-ref="${e(n.ref)}">Retirer</button>` : ""}</div>
    <ul>${(n.enfants || []).map((x) => arbreGeneriqueHtml(x, peut)).join("")}</ul></li>`;
}

function panneauGenerique(n, medias) {
  const controle = (c) => {
    const nom = `name="${e(c.ref)}"`;
    const v = c.valeur ?? "";
    const input = c.nature === "NOMBRE" ? `<input type="number" ${nom} value="${e(v)}" step="any">` :
      c.nature === "BOOLEEN" ? `<select ${nom}><option value="">Hériter</option><option value="true"${v === true ? " selected" : ""}>Oui</option><option value="false"${v === false ? " selected" : ""}>Non</option></select>` :
      c.nature === "MEDIA" ? `<select ${nom}><option value="">Aucun média</option>${medias.map((m) => `<option value="${e(m.ref)}"${m.url === `/api/v1/media/${v}` ? " selected" : ""}>${e(m.titre)}</option>`).join("")}</select>` :
      `<textarea ${nom} rows="2">${e(v)}</textarea>`;
    return `<label>${e(c.libelle)}${c.obligatoire ? " *" : ""}${input}<small>${e(c.aide)}</small></label>`;
  };
  return `<form class="card design-panneau" data-builder-valeurs data-ref="${e(n.ref)}"><h3>${e(n.titre)}</h3>
    ${[["CONTENU", (c) => !/^(DESIGN|AVANCE)/i.test(c.cle)], ["DESIGN", (c) => /^DESIGN/i.test(c.cle)],
      ["AVANCÉ", (c) => /^AVANCE/i.test(c.cle)]].map(([libelle, filtre]) =>
      `<details open><summary>${libelle}</summary>${n.champs.filter(filtre).map(controle).join("") || '<p class="muted">Aucun champ déclaré dans SharePoint.</p>'}</details>`).join("")}
    <p class="muted">Les surcharges responsive par champ nécessitent les Lookups appareil et état, absents du schéma de valeurs actuel.</p>
    <button type="submit" class="btn btn-primary"${n.verrouille ? " disabled" : ""}>Enregistrer</button></form>`;
}

export function documentApercu(composition, type = "page") {
  const options = (prefixe, typeConteneur) => ({ apiBase: "/api/v1", adapteurs: {}, apercu: true, prefixe, typeConteneur });
  const zone = (z, balise, prefixe, t) => z?.sections?.length || z?.noeuds?.length ? `<${balise}>${rendreBuilder({ mode: "builder", sections: z.sections, noeuds: z.noeuds, style: z.style, responsive: z.responsive, _ref: z._ref, theme: composition.theme }, options(prefixe, t))}</${balise}>` : "";
  const corps = `${zone(composition?.entete, "header", "e", "ENTETE")}${rendreBuilder(composition || {}, options(type === "page" ? "p" : type[0], TYPE_CONTENEUR[type] || "PAGE"))}${zone(composition?.footer, "footer", "f", "FOOTER")}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{margin:0;font-family:system-ui,sans-serif}${STYLES_BUILDER}[data-dse-ref].dse-design-cible{outline:2px dashed #7c3aed;outline-offset:2px}</style></head>
    <body>${corps.trim() || `<p style="padding:24px;color:#667">Aperçu vide : ajoutez des modules actifs avec un contenu renseigné.</p>`}</body></html>`;
}

function editeur(d) {
  const a = d.arbre;
  const type = a.type;
  const peut = ecrit(d, FONCTION[type]);
  const colonnes = colonnesDe(a.sections);
  return `<header class="constructeur-barre-visuelle"><strong>${e(d.site?.titre || "")} · ${e(a.titre)}</strong>
    <div class="constructeur-boutons">${APPAREILS_APERCU.map((x) => `<button type="button" class="btn btn-mini" data-c-appareil="${x.cle}">${x.libelle}</button>`).join("")}
      <button type="button" class="btn btn-mini" data-c-action="annuler-design">↶ Annuler Design</button>
      <button type="button" class="btn btn-mini" data-c-action="retablir-design">↷ Rétablir Design</button>
      <button type="button" class="btn btn-mini" data-c-action="copier-style">Copier style</button>
      <button type="button" class="btn btn-mini" data-c-action="coller-style">Coller style</button>
      <button type="button" class="btn btn-mini" data-c-action="apercu-seul">Aperçu</button>
      <button type="button" class="btn btn-primary" data-c-action="enregistrer-design">Enregistrer</button>
      ${bouton("Fermer", "fermer")}</div></header>
    <div class="constructeur-espace-visuel"><aside class="card constructeur-editeur">
    <header class="constructeur-editeur-entete">
      <div><span class="constructeur-type">${LIBELLES[type]}</span><h3>${e(a.titre)}</h3>${badgeEtat(a.etat)}</div>
      <div class="constructeur-boutons">${bouton("← Retour à la liste", "fermer")}
        ${peut ? bouton(`🎨 Design · ${LIBELLES[type]}`, "design", `data-ref="${e(a.ref)}"`) : ""}
        ${peut && (!a.etat.publiable || a.generique) ? bouton("✅ Valider et activer", "publier", `data-ref="${e(a.ref)}"`, "btn btn-primary") : ""}
        ${bouton("✨ Demander à Pasc ARA IA", "ia")}</div>
    </header>
    <h3>Arborescence · Ajouter</h3>
    ${d.builder?.message ? `<p class="alerte-info">${e(d.builder.message)}</p>` : ""}
    ${peut && !a.generique && !a.sections.length && d.builder?.types?.some((x) => x.racine) ?
      bouton("Initialiser la racine générique", "builder-initialiser", `data-ref="${e(a.ref)}"`) : ""}
    <ul class="constructeur-arbre">${a.generique ? arbreGeneriqueHtml(a.generique, peut) :
      a.sections.map((s) => noeudHtml(d, s, peut, colonnes)).join("") || `<li class="muted">Aucune section : commencez par ajouter une section.</li>`}</ul>
    ${peut && !a.generique ? `<form class="constructeur-ajout" data-c-ajout="section" data-ref="${e(a.ref)}">
      <input name="titre" maxlength="255" placeholder="Nom de la section" aria-label="Nom de la section">
      ${d.typesSection.length ? `<select name="typeSection" aria-label="Type de section"><option value="">Type standard</option>${d.typesSection.map((t) => `<option value="${e(t.ref)}">${e(t.titre)}</option>`).join("")}</select>` : ""}
      <button class="btn btn-primary" type="submit">➕ Ajouter une section</button></form>` : ""}
    <p class="muted">Les nouveaux éléments sont créés en brouillon : visibles dans l'aperçu, publiés uniquement après « Valider et activer ».</p>
    <details><summary>Médias</summary>${(d.medias || []).map((m) => `<a href="${e(m.url)}" target="_blank" rel="noopener">${e(m.titre)}</a>`).join("<br>") || "Aucun média autorisé."}</details>
    <p class="muted">Glissez un élément de l'arbre ou du Canvas sur sa destination. Les retraits sont logiques, jamais destructifs.</p>
  </aside>
  <div class="constructeur-design-zone">
    <div data-c-panneau></div>
    <div class="card constructeur-apercus">
      <header class="constructeur-editeur-entete"><h3>Aperçu</h3>
        <div class="constructeur-boutons" role="group" aria-label="Appareil">${APPAREILS_APERCU.map((x) => `<button type="button" class="btn btn-mini ${x.cle === (d.appareil || "ORDINATEUR") ? "btn-primary" : "btn-secondary"}" data-c-appareil="${x.cle}" aria-pressed="${x.cle === (d.appareil || "ORDINATEUR")}">${x.libelle}</button>`).join("")}</div></header>
      <div class="constructeur-apercu-cadre" data-apercu-cadre><iframe class="constructeur-apercu" title="Aperçu" sandbox="allow-same-origin" data-apercu></iframe></div>
      ${peut ? `<p class="muted">Astuce : cliquez sur un élément de l'aperçu pour ouvrir son panneau Design.</p>` : ""}
    </div>
  </div></div>`;
}

export function rendreConstructeur(moi, d, etat = {}) {
  const onglet = ONGLETS.some((o) => o.cle === etat.onglet) ? etat.onglet : "entetes";
  const corps = d.arbre ? editeur(d)
    : onglet === "entetes" ? ongletConteneurs(d, "entete")
      : onglet === "footers" ? ongletConteneurs(d, "footer")
        : onglet === "pages" ? ongletPages(d)
          : onglet === "bibliotheque" ? ongletBibliotheque(d) : ongletCatalogue(d);
  return `<section class="cockpit constructeur${d.arbre ? " constructeur--plein-ecran" : ""}" data-constructeur>
    ${rendreEnteteCockpit(moi)}
    <div class="card cockpit-site-titre"><h2>🧱 Construire le site · ${e(d.site?.titre || "")}</h2>
      <p class="muted">${e(d.site?.domaine || "")} — données lues et enregistrées dans SharePoint.</p>
      <a class="btn btn-secondary" href="#/cockpit/site/${encodeURIComponent(etat.domaine || "")}">← Retour au site</a></div>
    ${d.arbre ? "" : `<nav class="constructeur-onglets" role="tablist">${ONGLETS.map((o) =>
      `<button type="button" role="tab" class="btn ${o.cle === onglet ? "btn-primary" : "btn-secondary"}" aria-selected="${o.cle === onglet}" data-c-onglet="${o.cle}">${o.libelle}</button>`).join("")}</nav>`}
    <div class="constructeur-message" role="status" aria-live="polite" data-c-message>${etat.message ? `<p class="${etat.erreur ? "alerte-erreur" : "alerte-succes"}">${e(etat.message)}</p>` : ""}</div>
    ${corps}
    <dialog class="cockpit-statut-dialogue constructeur-dialogue" data-c-dialogue></dialog>
  </section>`;
}

/* ---------------- Formulaires dynamiques (contenu / proprietes) ---------------- */

export function formulaireHtml(f, titre) {
  const textes = (f.textes || []).map((c) => `<label>${e(c.libelle)}${c.obligatoire ? " *" : ""}
    ${c.multiligne ? `<textarea name="${e(c.cle)}" rows="4"${c.max ? ` maxlength="${c.max}"` : ""}>${e(c.valeur)}</textarea>`
      : `<input name="${e(c.cle)}" value="${e(c.valeur)}"${c.max ? ` maxlength="${c.max}"` : ""}>`}</label>`).join("");
  const listes = (f.listes || []).map((l) => `<label>${e(l.libelle)}${l.obligatoire ? " *" : ""}
    <select name="${e(l.cle)}"><option value="">— Aucun —</option>${l.options.map((o) => `<option value="${e(o.ref)}"${o.ref === l.valeur ? " selected" : ""}>${e(o.titre)}</option>`).join("")}</select>
    ${l.options.some((o) => o.url) ? `<span class="constructeur-medias constructeur-medias--mini">${l.options.filter((o) => o.url).map((o) => `<img src="${e(o.url)}" alt="${e(o.titre)}" title="${e(o.titre)}" loading="lazy">`).join("")}</span>` : ""}
  </label>`).join("");
  return `<form method="dialog" data-c-formulaire><h3>${e(titre)}</h3>${textes}${listes || ""}
    ${textes || listes ? "" : `<p class="muted">Aucun champ modifiable.</p>`}
    <div class="constructeur-boutons"><button class="btn btn-primary" value="ok" type="submit">Enregistrer</button>
    <button class="btn btn-secondary" value="annuler" type="button" data-c-fermer>Annuler</button></div></form>`;
}

/* ---------------- Activation (evenements) ---------------- */

export function activerConstructeur(racine, { moi, domaine, donnees, onglet }) {
  const etat = { domaine, onglet: ONGLETS.some((o) => o.cle === onglet) ? onglet : "entetes", conteneur: "", message: "", erreur: false, appareil: "ORDINATEUR", design: null };
  let d = donnees;
  let copieStyle = null;
  let historique = [];
  let positionHistorique = -1;
  let brouillonGenerique = false;
  let glisse = null;
  const trouverNoeud = (reference) => {
    const chercher = (n, parent = null) => n?.ref === reference ? { n, parent } :
      (n?.enfants || n?.sections || []).map((x) => chercher(x, n)).find(Boolean);
    return chercher(d.arbre?.generique || d.arbre);
  };
  const valeursFormulaire = () => {
    const f = racine.querySelector("[data-design-form]");
    return f ? lireValeurs(f) : null;
  };
  const appliquerValeurs = (valeurs) => {
    const f = racine.querySelector("[data-design-form]");
    if (!f) return;
    for (const input of f.querySelectorAll("[name]")) {
      const [a, cle] = input.name.includes(".") ? input.name.split(".") : [null, input.name];
      const v = a ? valeurs.responsive?.[a]?.[cle] : valeurs[cle];
      input.value = v === true ? "OUI" : v === false ? "NON" : v ?? "";
    }
    apercuDesign();
  };
  const memoriser = () => {
    const v = valeursFormulaire();
    if (!v || JSON.stringify(v) === JSON.stringify(historique[positionHistorique])) return;
    historique = historique.slice(0, positionHistorique + 1);
    historique.push(v);
    if (historique.length > 100) historique.shift();
    positionHistorique = historique.length - 1;
  };
  const modificationsLocales = () => {
    const valeurs = valeursFormulaire();
    return brouillonGenerique || Boolean(valeurs && historique.length && JSON.stringify(valeurs) !== JSON.stringify(historique[0]));
  };
  const confirmerAbandon = () => !modificationsLocales() || confirm("Abandonner les réglages non enregistrés de cet élément ?");
  const iframe = () => racine.querySelector("[data-apercu]");
  const docApercu = () => { try { return iframe()?.contentDocument || null; } catch { return null; } };

  // Apercu a la largeur reelle de l'appareil (les media queries s'appliquent), reduit pour tenir dans la colonne.
  const dimensionner = () => {
    const cadre = racine.querySelector("[data-apercu-cadre]");
    const f = iframe();
    if (!cadre || !f) return;
    const largeur = (APPAREILS_APERCU.find((x) => x.cle === etat.appareil) || APPAREILS_APERCU[0]).largeur;
    const echelle = Math.min(1, (cadre.clientWidth || largeur) / largeur);
    const hauteur = Math.max(480, Math.min(4000, docApercu()?.documentElement?.scrollHeight || 640));
    Object.assign(f.style, { width: `${largeur}px`, height: `${hauteur}px`, transform: `scale(${echelle})`, transformOrigin: "top left" });
    cadre.style.height = `${Math.min(900, Math.ceil(hauteur * echelle))}px`;
  };
  const identifiantDe = (el) => [...(el?.classList || [])].find((c) => /^dse-b-[a-z]{0,3}[mclsr]\d+$/.test(c));
  const apercuDesign = () => {
    const doc = docApercu();
    if (!doc) return;
    for (const x of doc.querySelectorAll(".dse-design-cible")) x.classList.remove("dse-design-cible");
    doc.getElementById("dse-design-live")?.remove();
    const form = racine.querySelector("[data-design-form]");
    if (!etat.design?.data || !form) return;
    const el = doc.querySelector(`[data-dse-ref="${CSS.escape(etat.design.ref)}"]`);
    const id = identifiantDe(el);
    if (!id) return;
    el.classList.add("dse-design-cible");
    const style = doc.createElement("style");
    style.id = "dse-design-live";
    style.textContent = cssApercu(id, etat.design.data, lireValeurs(form));
    doc.head.appendChild(style);
    dimensionner();
  };
  const preparerApercu = () => {
    const f = iframe();
    if (!f) return;
    f.addEventListener("load", () => {
      dimensionner();
      apercuDesign();
      const doc = docApercu();
      doc?.addEventListener("click", (ev) => {
        const cibleRef = ev.target.closest?.("[data-dse-ref]");
        ev.preventDefault();
        if (cibleRef && d.arbre && ecrit(d, FONCTION[d.arbre.type])) ouvrirDesign(cibleRef.dataset.dseRef);
      });
      for (const el of doc?.querySelectorAll("[data-dse-ref]") || []) el.draggable = true;
      doc?.addEventListener("dragstart", demarrerGlisse);
      doc?.addEventListener("dragover", autoriserDepot);
      doc?.addEventListener("drop", deposer);
    });
    f.srcdoc = documentApercu(d.apercu, d.arbre?.type);
  };
  const contenuDesign = (ref) => {
    const trouver = (n) => n.ref === ref ? n : (n.enfants || n.sections || []).map(trouver).find(Boolean);
    const n = d.arbre ? trouver(d.arbre) : null;
    if (d.arbre?.ref === ref) return `<p>Titre, adresse et informations de ${e(d.arbre.titre)}.</p>${bouton("✏️ Modifier les informations", "proprietes", `data-ref="${e(ref)}"`)}`;
    if (n?.type === "module" && n.formulaire) return `<p>Textes, liens et médias du module.</p>${bouton("✏️ Modifier le contenu", "contenu", `data-ref="${e(ref)}"`)}`;
    return `<p class="muted">Cet élément organise les éléments qu'il contient ; utilisez l'arbre de construction pour ajouter, déplacer ou dupliquer.</p>`;
  };
  const afficherPanneau = () => {
    const zone = racine.querySelector("[data-c-panneau]");
    if (!zone) return;
    const generic = etat.design?.ref?.startsWith("builderelement.") ? trouverNoeud(etat.design.ref)?.n : null;
    zone.innerHTML = generic ? panneauGenerique(generic, d.medias || []) : etat.design?.data ? panneauDesign(etat.design.data, { ref: etat.design.ref, contenu: contenuDesign(etat.design.ref), onglet: etat.design.onglet, appareil: etat.design.appareil })
      : etat.design ? `<p class="card muted">Chargement des réglages…</p>` : "";
    zone.closest(".constructeur-design-zone")?.classList.toggle("constructeur-design-zone--ouverte", Boolean(etat.design));
    apercuDesign();
  };
  async function ouvrirDesign(ref, onglet = etat.design?.ref === ref ? etat.design.onglet : "design") {
    if (etat.design?.ref !== ref && modificationsLocales()) {
      if (!confirmerAbandon()) return;
      if (brouillonGenerique) { await charger(); brouillonGenerique = false; }
    }
    if (ref.startsWith("builderelement.")) {
      etat.design = { ref, onglet };
      afficherPanneau();
      historique = [];
      positionHistorique = -1;
      return;
    }
    etat.design = { ref, onglet, appareil: etat.design?.appareil || "TABLETTE", data: null };
    afficherPanneau();
    historique = [];
    positionHistorique = -1;
    memoriser();
    try {
      const r = await actionConstruire(domaine, "design.lire", { ref });
      if (etat.design?.ref !== ref) return;
      if (!r?.donnees?.design) throw new Error(r?.donnees?.refus || "Réglages de design indisponibles.");
      etat.design.data = r.donnees.design;
    } catch (err) {
      etat.design = null;
      message(err.message || "Réglages de design indisponibles.");
    }
    afficherPanneau();
    memoriser();
    racine.querySelector("[data-c-panneau]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const charger = async () => {
    const r = await getConstruire(domaine, etat.conteneur);
    d = r?.donnees || d;
    if (etat.conteneur && !d.arbre) etat.conteneur = "";
  };
  const afficher = () => {
    racine.innerHTML = rendreConstructeur(moi, { ...d, appareil: etat.appareil }, etat);
    preparerApercu();
    if (!d.arbre) etat.design = null;
    afficherPanneau();
  };
  const executer = async (action, params) => {
    if (!["design.enregistrer", "builder.enregistrer"].includes(action) && !confirmerAbandon()) return;
    const zone = racine.querySelector("[data-c-message]");
    if (zone) zone.innerHTML = `<p class="muted">Enregistrement dans SharePoint…</p>`;
    for (const b of racine.querySelectorAll("button")) b.disabled = true;
    try {
      const r = await actionConstruire(domaine, action, params);
      Object.assign(etat, { message: r?.donnees?.message || "Action enregistrée.", erreur: false });
      await charger();
      brouillonGenerique = false;
      if (etat.design) etat.design.data = null;
    } catch (err) {
      Object.assign(etat, { message: err.message || "L'action n'a pas abouti.", erreur: true });
      await charger().catch(() => {});
    }
    afficher();
    if (etat.design && !etat.design.data) await ouvrirDesign(etat.design.ref, etat.design.onglet);
  };
  const dialogue = () => racine.querySelector("[data-c-dialogue]");
  const ouvrirFormulaire = (f, titre, surValider) => {
    const dlg = dialogue();
    dlg.innerHTML = formulaireHtml(f, titre);
    dlg.querySelector("[data-c-fermer]")?.addEventListener("click", () => dlg.close());
    dlg.querySelector("form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const valeurs = Object.fromEntries(new FormData(ev.target).entries());
      dlg.close();
      surValider(valeurs);
    });
    dlg.showModal();
  };
  const message = (texte) => {
    const dlg = dialogue();
    dlg.innerHTML = `<form method="dialog"><p>${e(texte)}</p><div class="constructeur-boutons"><button class="btn btn-primary" value="ok">Fermer</button></div></form>`;
    dlg.showModal();
  };

  racine.addEventListener("click", async (ev) => {
    const d1 = ev.target.closest("[data-c-appareil],[data-design-onglet],[data-design-choix-appareil],[data-design-fermer],[data-design-reset],[data-design-media],[data-design-appliquer]");
    if (d1 && racine.contains(d1)) return actionDesign(d1);
    const cible = ev.target.closest("[data-c-onglet],[data-c-action]");
    if (!cible) {
      const n = ev.target.closest("[data-c-noeud]");
      if (n && !ev.target.closest("input,select,textarea,button,a")) return ouvrirDesign(n.dataset.cNoeud);
    }
    if (!cible || !racine.contains(cible)) return;
    if (cible.dataset.cOnglet) { Object.assign(etat, { onglet: cible.dataset.cOnglet, message: "" }); return afficher(); }
    const ref = cible.dataset.ref;
    switch (cible.dataset.cAction) {
      case "annuler-design": if (positionHistorique > 0) appliquerValeurs(historique[--positionHistorique]); return;
      case "retablir-design": if (positionHistorique + 1 < historique.length) appliquerValeurs(historique[++positionHistorique]); return;
      case "copier-style": copieStyle = valeursFormulaire(); if (!copieStyle) message("Sélectionnez un élément et ouvrez son Design."); return;
      case "coller-style": if (copieStyle && valeursFormulaire()) { appliquerValeurs(copieStyle); memoriser(); } else message("Copiez d'abord un style, puis sélectionnez une cible."); return;
      case "enregistrer-design": {
        const f = racine.querySelector("[data-design-form],[data-builder-valeurs]");
        if (f) f.requestSubmit(); else message("Sélectionnez un élément à modifier. Les actions structurelles sont déjà enregistrées dans SharePoint.");
        return;
      }
      case "apercu-seul": racine.querySelector("[data-constructeur]")?.classList.toggle("constructeur--apercu-seul"); dimensionner(); return;
      case "builder-ajouter": {
        const options = (d.builder?.types || []).filter((t) => !t.racine);
        if (!options.length) return message("Aucun type d'enfant actif n'est configuré dans SharePoint.");
        return ouvrirFormulaire({ textes: [], listes: [{ cle: "typeRef", libelle: "Type d'élément", options }] },
          "Ajouter un élément", (v) => executer("builder.ajouter", { ref, ...v }));
      }
      case "builder-initialiser": return ouvrirFormulaire({
        textes: [], listes: [{ cle: "typeRef", libelle: "Type de racine", options: (d.builder?.types || []).filter((t) => t.racine) }]
      }, "Initialiser ce conteneur vide", (v) => executer("builder.initialiser", { ref, ...v }));
      case "builder-retirer": if (confirm("Retirer logiquement cet élément et son sous-arbre ? Aucune donnée ne sera supprimée.")) return executer("builder.desactiver", { ref }); return;
      case "ouvrir": etat.conteneur = ref; etat.message = ""; await charger().catch((err) => Object.assign(etat, { message: err.message, erreur: true })); return afficher();
      case "fermer": if (!confirmerAbandon()) return; etat.conteneur = ""; delete d.arbre; delete d.apercu; await charger().catch(() => {}); brouillonGenerique = false; return afficher();
      case "ia": return message(MESSAGE_IA);
      case "design": return ouvrirDesign(ref);
      case "utilisations": { const z = racine.querySelector(`[data-utilisations="${CSS.escape(ref)}"]`); if (z) z.hidden = !z.hidden; return; }
      case "dupliquer": return executer("conteneur.dupliquer", { ref });
      case "publier": return executer("conteneur.publier", { ref });
      case "desactiver": if (confirm("Désactiver cet élément ? Il ne sera pas supprimé.")) return executer("conteneur.desactiver", { ref }); return;
      case "monter": return executer("element.deplacer", { ref, sens: "haut" });
      case "descendre": return executer("element.deplacer", { ref, sens: "bas" });
      case "dupliquer-element": return executer("element.dupliquer", { ref });
      case "activer": return executer("element.etat", { ref, etat: "actif" });
      case "desactiver-element": if (confirm("Désactiver cet élément ? Aucune donnée ne sera supprimée.")) return executer("element.etat", { ref, etat: "inactif" }); return;
      case "logo": if (confirm("Utiliser ce média comme logo du site ? L'ancien média reste dans la bibliothèque.")) return executer("logo.choisir", { media: cible.dataset.media }); return;
      case "affecter": {
        const pages = d.pages || [];
        if (!pages.length) return message("Aucune page disponible pour ce site.");
        const conteneur = [...d.entetes, ...d.footers].find((x) => x.ref === ref);
        if (!conteneur?.etat.publiable) return message("Validez et activez d'abord cet élément pour pouvoir l'affecter à une page.");
        const f = { textes: [], listes: [{ cle: "page", libelle: "Page", obligatoire: true, valeur: "", options: pages.map((p) => ({ ref: p.ref, titre: p.titre })) }] };
        return ouvrirFormulaire(f, `Affecter « ${conteneur.titre} » à une page`, (v) => v.page && executer("page.affecter", { page: v.page, type: cible.dataset.type, ref }));
      }
      case "proprietes":
      case "contenu": {
        const action = cible.dataset.cAction === "contenu" ? "contenu" : "conteneur";
        try {
          const r = await actionConstruire(domaine, action === "contenu" ? "contenu.formulaire" : "conteneur.modifier", { ref });
          const f = r?.donnees?.formulaire;
          if (!f) return message("Formulaire indisponible.");
          return ouvrirFormulaire(f, action === "contenu" ? `Contenu du module ${r.donnees.type || ""}` : "Modifier les informations",
            (valeurs) => executer(action === "contenu" ? "contenu.enregistrer" : "conteneur.modifier", { ref, valeurs }));
        } catch (err) { return message(err.message || "Formulaire indisponible."); }
      }
      default:
    }
  });

  function actionDesign(b) {
    const form = racine.querySelector("[data-design-form]");
    if (b.dataset.cAppareil) {
      etat.appareil = b.dataset.cAppareil;
      for (const x of racine.querySelectorAll("[data-c-appareil]")) {
        x.classList.toggle("btn-primary", x === b); x.classList.toggle("btn-secondary", x !== b); x.setAttribute("aria-pressed", String(x === b));
      }
      return dimensionner();
    }
    if (b.dataset.designOnglet) {
      etat.design.onglet = b.dataset.designOnglet;
      for (const x of form.querySelectorAll("[data-design-volet]")) x.hidden = x.dataset.designVolet !== etat.design.onglet;
      for (const x of form.querySelectorAll("[data-design-onglet]")) {
        const actif = x === b; x.classList.toggle("btn-primary", actif); x.classList.toggle("btn-secondary", !actif); x.setAttribute("aria-selected", String(actif));
      }
      if (etat.design.onglet === "responsive") racine.querySelector(`[data-c-appareil="${etat.design.appareil}"]`)?.click();
      return;
    }
    if (b.dataset.designChoixAppareil) {
      etat.design.appareil = b.dataset.designChoixAppareil;
      for (const x of form.querySelectorAll("[data-design-appareil]")) x.hidden = x.dataset.designAppareil !== etat.design.appareil;
      for (const x of form.querySelectorAll("[data-design-choix-appareil]")) { x.classList.toggle("btn-primary", x === b); x.classList.toggle("btn-secondary", x !== b); }
      racine.querySelector(`[data-c-appareil="${etat.design.appareil}"]`)?.click();
      return;
    }
    if (b.dataset.designFermer !== undefined) { if (!confirmerAbandon()) return; etat.design = null; return afficherPanneau(); }
    if (b.dataset.designReset) {
      const champ = form.querySelector(`[name="${CSS.escape(b.dataset.designReset)}"]`);
      if (champ) champ.value = "";
      memoriser();
      return apercuDesign();
    }
    if (b.dataset.designMedia) {
      const champ = form.querySelector(`[name="${CSS.escape(b.dataset.designCible)}"]`);
      if (champ) champ.value = b.dataset.designMedia;
      memoriser();
      return apercuDesign();
    }
    if (b.dataset.designAppliquer !== undefined) {
      const choix = form.querySelector("[data-design-preset]")?.value || "";
      return executer("design.preset", { ref: etat.design.ref, preset: choix });
    }
  }

  racine.addEventListener("input", (ev) => {
    const s = ev.target;
    const fg = s.closest?.("[data-builder-valeurs]");
    if (fg) {
      const node = trouverNoeud(fg.dataset.ref)?.n;
      const c = node?.champs.find((x) => x.ref === s.name);
      if (c) {
        brouillonGenerique = true;
        c.valeur = c.nature === "BOOLEEN" ? (s.value === "" ? null : s.value === "true") :
          c.nature === "MEDIA" ? /\/media\/(\d+)$/.exec(d.medias.find((m) => m.ref === s.value)?.url || "")?.[1] || null : s.value;
        const f = iframe();
        if (f) f.srcdoc = documentApercu({ ...d.apercu, noeuds: [d.arbre.generique] }, d.arbre.type);
      }
      return;
    }
    if (!s.closest?.("[data-design-form]")) return;
    if (s.dataset.designPipette) {
      const champ = s.form.querySelector(`[name="${CSS.escape(s.dataset.designPipette)}"]`);
      if (champ) champ.value = s.value;
    }
    apercuDesign();
    memoriser();
  });
  addEventListener("resize", dimensionner);

  racine.addEventListener("change", (ev) => {
    const s = ev.target;
    if (s.closest?.("[data-design-form]")) return apercuDesign();
    if (s.matches("[data-c-affecter]")) return executer("page.affecter", { page: s.dataset.page, type: s.dataset.cAffecter, ref: s.value });
    if (s.matches("[data-c-deplacer]") && s.value) return executer("element.deplacer", { ref: s.dataset.cDeplacer, colonne: s.value });
  });

  racine.addEventListener("submit", (ev) => {
    const f = ev.target;
    if (f.matches("[data-builder-valeurs]")) {
      ev.preventDefault();
      const node = trouverNoeud(f.dataset.ref)?.n;
      const valeurs = Object.fromEntries([...new FormData(f)].map(([key, value]) => {
        const c = node?.champs.find((x) => x.ref === key);
        return [key, c?.nature === "BOOLEEN" && value !== "" ? value === "true" : value];
      }));
      return executer("builder.enregistrer", { ref: f.dataset.ref, valeurs });
    }
    if (f.matches("[data-design-form]")) {
      ev.preventDefault();
      if (!f.reportValidity()) return;
      return executer("design.enregistrer", { ref: f.dataset.ref, valeurs: lireValeurs(f) });
    }
    if (f.matches("[data-c-creer]")) {
      ev.preventDefault();
      return executer("conteneur.creer", { type: f.dataset.cCreer, titre: f.titre.value.trim(), url: f.querySelector('[name="url"]')?.value.trim() });
    }
    if (f.matches("[data-c-ajout]")) {
      ev.preventDefault();
      const v = Object.fromEntries(new FormData(f).entries());
      const action = { section: "section.ajouter", ligne: "ligne.ajouter", module: "module.ajouter" }[f.dataset.cAjout];
      return executer(action, { ref: f.dataset.ref, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)) });
    }
  });

  function demarrerGlisse(ev) {
    const target = ev.target.closest?.("[data-c-noeud],[data-dse-ref]");
    const reference = target?.dataset.cNoeud || target?.dataset.dseRef;
    const source = trouverNoeud(reference);
    if (!source?.parent || !ecrit(d, FONCTION[d.arbre.type])) { ev.preventDefault(); return; }
    glisse = source;
    ev.dataTransfer.setData("text/plain", reference);
    ev.dataTransfer.effectAllowed = "move";
  }
  function autoriserDepot(ev) {
    if (glisse && ev.target.closest?.("[data-c-noeud],[data-dse-ref]")) ev.preventDefault();
  }
  function deposer(ev) {
    const target = ev.target.closest?.("[data-c-noeud],[data-dse-ref]");
    const dest = trouverNoeud(target?.dataset.cNoeud || target?.dataset.dseRef);
    if (!glisse || !dest || glisse.n.ref === dest.n.ref) return;
    ev.preventDefault();
    const source = glisse;
    glisse = null;
    const avant = source.n.type === dest.n.type && (source.n.type !== "builder" || source.n.typeRef === dest.n.typeRef);
    const parent = avant ? dest.parent : dest.n;
    if (!parent) return;
    return executer(source.n.type === "builder" ? "builder.deplacer" : "element.deplacer",
      { ref: source.n.ref, parent: parent.ref, ...(avant ? { avant: dest.n.ref } : {}) });
  }
  racine.addEventListener("dragstart", demarrerGlisse);
  racine.addEventListener("dragover", autoriserDepot);
  racine.addEventListener("drop", deposer);

  afficher();
}
