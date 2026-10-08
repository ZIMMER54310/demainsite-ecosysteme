// Constructeur DSE (En-tetes / Pages / Footer) : interface pilotee par les donnees SharePoint renvoyees par le serveur.
// Le navigateur ne manipule que des references opaques signees ; chaque action est recontrolee cote serveur.
import { escapeHtml as e, urlSure } from "../public/outils.js";
import { rendreBuilder, STYLES_BUILDER } from "../builder/rendu.js";
import { nettoyerHtml } from "../texte/nettoyer.js";
import { getConstruire, actionConstruire } from "../../services/cockpit.service.js";
import { rendreEnteteCockpit, rendreAccompagnement } from "./cockpit.js";
import { panneauDesign, lireValeurs, cssApercu, APPAREILS_APERCU } from "./design.js";
import { codeChamp, controleChamp, erreurValeur } from "../builder/proprietes.js";
import { confirmerApercuConstruction } from "./confirmation.js";
import { getState } from "../../js/state.js";

export const ONGLETS = Object.freeze([
  { cle: "entetes", libelle: "En-têtes" },
  { cle: "pages", libelle: "Pages" },
  { cle: "footers", libelle: "Pied de page" },
  { cle: "articles", libelle: "Articles" },
  { cle: "bibliotheque", libelle: "Bibliothèque" },
  { cle: "catalogue", libelle: "Catalogue / Modèles" }
]);
const LIBELLES = { entete: "En-tête", footer: "Pied de page", page: "Page", article: "Article", section: "Section", ligne: "Ligne", colonne: "Colonne", module: "Module" };
const MESSAGE_IA = "Cette fonctionnalité est en cours de préparation. Revenez bientôt.";

export function badgeEtat(etat = {}) {
  if (etat.inactif) return `<span class="badge constructeur-badge constructeur-badge--inactif">Désactivé</span>`;
  if (etat.brouillon) return `<span class="badge constructeur-badge constructeur-badge--brouillon">Brouillon</span>`;
  if (etat.publiable) return `<span class="badge constructeur-badge constructeur-badge--actif">Actif et validé</span>`;
  return `<span class="badge constructeur-badge">${e(etat.actif || "")} · ${e(etat.valide || "")}</span>`;
}
const cleEtat = (etat = {}) => etat.inactif ? "desactive" : etat.publiable ? "actif" : "brouillon";
const CLE_VUE = "dse.constructeur.vue";
const vueMemorisee = () => { try { return localStorage.getItem(CLE_VUE) === "liste" ? "liste" : "cartes"; } catch { return "cartes"; } };
function barreVue(etat) {
  const vue = etat.vue || "cartes";
  const filtre = etat.filtreEtat || "";
  const opt = (v, l) => `<option value="${v}"${filtre === v ? " selected" : ""}>${l}</option>`;
  return `<div class="constructeur-vue" role="toolbar" aria-label="Affichage">
    <input type="search" data-c-recherche placeholder="🔎 Rechercher par nom…" value="${e(etat.recherche || "")}" aria-label="Rechercher par nom">
    <select data-c-filtre-etat aria-label="Filtrer par état">${opt("", "Tous les états")}${opt("actif", "Actifs et validés")}${opt("brouillon", "Brouillons")}${opt("desactive", "Désactivés")}</select>
    <div class="constructeur-vue__choix">
      <button type="button" class="btn ${vue === "cartes" ? "btn-primary" : "btn-secondary"}" data-c-vue="cartes" aria-pressed="${vue === "cartes"}">▦ Cartes</button>
      <button type="button" class="btn ${vue === "liste" ? "btn-primary" : "btn-secondary"}" data-c-vue="liste" aria-pressed="${vue === "liste"}">☰ Liste</button>
    </div></div>`;
}
const realisation = (r) => r?.titre ? `<span class="badge constructeur-badge"${/^#[0-9a-f]{6}$/i.test(r.couleur || "")
  ? ` style="color:${e(r.couleur)}"` : ""}>${e(r.titre)}</span>` : "";

const bouton = (libelle, action, attrs = "", classe = "btn btn-secondary") =>
  `<button type="button" class="${classe}" data-c-action="${e(action)}" ${attrs}>${libelle}</button>`;
const FONCTION = { entete: "entete", footer: "footer", page: "pages", article: "articles" };
// Article : memes correspondances que le serveur (operations Articles existantes), le serveur recontrole chaque action.
const OPERATIONS_ARTICLE = {
  creer: ["builder.initialiser", "builder.ajouter", "builder.dupliquer"],
  modifier: ["conteneur.modifier", "builder.enregistrer", "builder.deplacer", "builder.restaurer", "design.lire", "design.preset",
    "design.enregistrer", "contenu.formulaire", "contenu.enregistrer"],
  publier: ["builder.publier", "builder.reactiver", "builder.desactiver", "conteneur.publier", "element.etat"]
};
export const operationArticle = (action) => {
  const suffixe = Object.keys(OPERATIONS_ARTICLE).find((k) => OPERATIONS_ARTICLE[k].includes(action));
  return suffixe ? `articles.${suffixe}` : null;
};
const operationDe = (type, action) => type === "article" ? operationArticle(action) : `constructeur.${type}.${action}`;
export const peutAction = (d, type, action) => {
  const operation = operationDe(type, action);
  if (!operation || d.operationsInterdites?.includes(operation)) return false;
  if (type === "article" && !d.builder?.articles) return false;
  return Array.isArray(d.operations) ? d.operations.includes(operation) : Boolean(d.droits?.[FONCTION[type]]?.ecriture);
};
const ecrit = (d, fonction) => {
  const type = Object.keys(FONCTION).find((t) => FONCTION[t] === fonction);
  return type ? peutAction(d, type, "conteneur.modifier") : Boolean(d.droits?.[fonction]?.ecriture);
};

function carteConteneur(d, type, c) {
  const peut = ecrit(d, FONCTION[type]);
  const pages = c.pages.length ? c.pages.map((p) => e(p.titre)).join(", ") : "Aucune page";
  return `<article class="card constructeur-carte" data-ref="${e(c.ref)}" data-etat="${cleEtat(c.etat)}" data-nom="${e(String(c.titre || "").toLowerCase())}">
    <header><h3>${e(c.titre)}</h3>${c.realisation ? realisation(c.realisation) : badgeEtat(c.etat)}</header>
    ${c.noteCourte ? `<p class="muted">${e(c.noteCourte)}</p>` : ""}
    <p class="muted">${c.sections} section(s) · Utilisé par : ${pages}</p>
    <div class="constructeur-boutons">
      ${bouton("🧱 Construire / aperçu", "ouvrir", `data-ref="${e(c.ref)}"`, "btn btn-primary")}
      ${peut ? bouton("✏️ Modifier", "proprietes", `data-ref="${e(c.ref)}"`) : ""}
      ${peutAction(d, type, "conteneur.dupliquer") ? bouton("⧉ Dupliquer", "dupliquer", `data-ref="${e(c.ref)}"`) : ""}
      ${type !== "page" && peutAction(d, type, "page.affecter") && peutAction(d, "page", "page.affecter") ? bouton("📄 Affecter aux pages", "affecter", `data-ref="${e(c.ref)}" data-type="${type}"`) : ""}
      ${peutAction(d, type, "conteneur.publier") && !c.etat.publiable ? bouton("✅ Valider et activer", "publier", `data-ref="${e(c.ref)}"`) : ""}
      ${peutAction(d, type, "conteneur.desactiver") && !c.etat.inactif ? bouton("⏸ Désactiver", "desactiver", `data-ref="${e(c.ref)}"`) : ""}
      ${bouton("🔎 Voir les utilisations", "utilisations", `data-ref="${e(c.ref)}"`)}
    </div>
    <div class="constructeur-utilisations" data-utilisations="${e(c.ref)}" hidden>
      ${c.pages.length ? `<ul>${c.pages.map((p) => `<li>${e(p.titre)}</li>`).join("")}</ul>` : `<p class="muted">Aucune page n'utilise cet élément.</p>`}
    </div>
  </article>`;
}

const STRUCTURE_BASE = {
  entete: "section En-tête avec logo et menu",
  footer: "3 colonnes (À propos, Liens utiles, Contact) + mentions et copyright",
  page: "Hero, Contenu (titre + texte) et Appel à l'action"
};
const caseStructureBase = (type) => `<label class="constructeur-structure-base"><input type="checkbox" name="structureBase" checked>
  Démarrer avec la structure de base <span class="muted">(${STRUCTURE_BASE[type]})</span></label>`;

function ongletConteneurs(d, type) {
  const liste = type === "entete" ? d.entetes : d.footers;
  const peut = peutAction(d, type, "conteneur.creer");
  return `${peut ? `<form class="card constructeur-creer" data-c-creer="${type}">
      <label>Créer un ${LIBELLES[type]} <input name="titre" required maxlength="255" placeholder="Nom"></label>
      ${caseStructureBase(type)}
      <button class="btn btn-primary" type="submit">➕ Créer</button>
    </form>` : ""}
    ${liste.length ? `<div class="constructeur-grille">${liste.map((c) => carteConteneur(d, type, c)).join("")}</div>`
      : `<p class="card muted">Aucun ${LIBELLES[type]} pour ce site dans SharePoint.</p>`}`;
}

function ongletArticles(d, domaine) {
  const articles = d.articles || [];
  const lecture = d.droits?.articles?.lecture;
  const peutEdition = (op) => Array.isArray(d.operations) ? d.operations.includes(op) && !d.operationsInterdites?.includes(op) : Boolean(d.droits?.articles?.ecriture);
  const edition = (element) => `#/cockpit/site/${encodeURIComponent(domaine || "")}/modifier/articles?element=${encodeURIComponent(element)}`;
  const adresse = (chemin) => d.site?.domaine && chemin ? `https://${d.site.domaine}${chemin.startsWith("/") ? "" : "/"}${chemin}` : "";
  if (!lecture) return `<p class="card muted">Les articles ne sont pas disponibles dans votre espace pour ce site.</p>`;
  return `<div class="card constructeur-articles-intro">
      <h3>📰 Articles de ${e(d.site?.titre || "ce site")}</h3>
      <p class="muted">Chaque article reste rattaché à ce site. Son adresse publique utilise automatiquement le domaine principal${d.site?.domaine ? ` <strong>${e(d.site.domaine)}</strong>` : ""} : vous ne saisissez que le chemin de l'article.</p>
      <ol class="constructeur-etapes"><li>Informations de l'article</li><li>Construction visuelle (sections, lignes, colonnes, modules, design)</li><li>Aperçu ordinateur / tablette / mobile</li><li>Valider et activer avec confirmation</li></ol>
      ${peutEdition("articles.creer") ? `<a class="btn btn-primary" href="${edition("nouveau")}">➕ Créer un article</a>` : ""}
    </div>
    ${d.builder?.articles ? "" : `<p class="alerte-info" role="status">${e(d.builder?.messageArticles || "La construction visuelle des articles n'est pas encore activée dans SharePoint.")}</p>`}
    ${articles.length ? `<div class="constructeur-grille">${articles.map((a) => `<article class="card constructeur-carte" data-ref="${e(a.ref)}">
      <header><h3>${e(a.titre)}</h3>${badgeEtat(a.etat)}</header>
      ${a.noteCourte ? `<p class="muted">${e(a.noteCourte)}</p>` : ""}
      <p class="muted">${adresse(a.chemin) ? `Adresse : ${e(adresse(a.chemin))}` : "Chemin de l'article non renseigné"}</p>
      <p class="muted">${a.construit ? `${a.sections} section(s) construite(s)` : "Pas encore construit"}</p>
      <div class="constructeur-boutons">
        ${d.builder?.articles ? bouton(a.construit ? "🧱 Construire / aperçu" : "🧱 Construire", "ouvrir", `data-ref="${e(a.ref)}"`, "btn btn-primary") : ""}
        ${peutEdition("articles.modifier") && a.edition ? `<a class="btn btn-secondary" href="${edition(a.edition)}">✏️ Modifier les informations</a>` : ""}
      </div></article>`).join("")}</div>`
      : `<p class="card muted">Aucun article pour ce site dans SharePoint.</p>`}`;
}

function ongletPages(d) {
  const peut = (f) => ecrit(d, f);
  const options = (liste, actuel) => `<option value="">— Aucun —</option>${liste.filter((x) => x.etat.publiable)
    .map((x) => `<option value="${e(x.ref)}"${actuel?.ref === x.ref ? " selected" : ""}>${e(x.titre)}</option>`).join("")}`;
  const creer = peutAction(d, "page", "conteneur.creer") ? `<form class="card constructeur-creer" data-c-creer="page">
    <label>Créer une page <input name="titre" required maxlength="255"></label>
    <p class="muted">L’adresse est créée automatiquement à partir du nom (modifiable ensuite via « ✏️ Modifier »).</p>
    ${caseStructureBase("page")}
    <button class="btn btn-primary">Créer en brouillon</button></form>` : "";
  return `${creer}<div class="constructeur-grille">${d.pages.map((p) => `<article class="card constructeur-carte" data-etat="${cleEtat(p.etat)}" data-nom="${e(`${p.titre || ""} ${p.url || ""}`.toLowerCase())}">
    <header><h3>${e(p.titre)}</h3>${p.realisation ? realisation(p.realisation) : badgeEtat(p.etat)}</header>
    <p class="muted">${e(p.url)} · ${p.sections} section(s)</p>
    <label>En-tête ${peutAction(d, "page", "page.affecter") && peutAction(d, "entete", "page.affecter") ? `<select data-c-affecter="entete" data-page="${e(p.ref)}">${options(d.entetes, p.entete)}</select>` : `<strong>${e(p.entete?.titre || "Aucun")}</strong>`}</label>
    <label>Pied de page ${peutAction(d, "page", "page.affecter") && peutAction(d, "footer", "page.affecter") ? `<select data-c-affecter="footer" data-page="${e(p.ref)}">${options(d.footers, p.footer)}</select>` : `<strong>${e(p.footer?.titre || "Aucun")}</strong>`}</label>
    <div class="constructeur-boutons">${bouton("🧱 Construire / aperçu", "ouvrir", `data-ref="${e(p.ref)}"`, "btn btn-primary")}
      ${peut("pages") ? bouton("✏️ Modifier", "proprietes", `data-ref="${e(p.ref)}"`) : ""}
      ${peutAction(d, "page", "conteneur.dupliquer") ? bouton("Dupliquer", "dupliquer", `data-ref="${e(p.ref)}" data-type="page"`) : ""}</div>
  </article>`).join("") || '<p class="card muted">Aucune page pour ce site dans SharePoint.</p>'}</div>
  <p class="muted">Une page utilise au maximum un En-tête et un Pied de page actifs et validés ; choisir un autre élément remplace le précédent sans suppression.</p>`;
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
      <p class="muted">L'import de nouveaux médias se fait dans la médiathèque officielle de DemainSite Écosystème ; un remplacement ne supprime jamais l'ancien média.</p>
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

const REPLIER = '<button type="button" class="constructeur-replier" data-c-replier aria-label="Replier ou déplier" title="Replier / déplier">▾</button>';

function actionsNoeud(n, peut, colonnes, d) {
  if (!peut) return "";
  const action = (a) => peutAction(d, d.arbre.type, a);
  const r = `data-ref="${e(n.ref)}"`;
  return `<span class="constructeur-outils">
    ${action("element.deplacer") ? bouton("▲", "monter", `${r} title="Monter" aria-label="Monter"`, "btn btn-mini") +
      bouton("▼", "descendre", `${r} title="Descendre" aria-label="Descendre"`, "btn btn-mini") : ""}
    ${action("element.deplacer") && n.type === "module" && colonnes.length > 1 ? `<select data-c-deplacer="${e(n.ref)}" aria-label="Déplacer vers une colonne"><option value="">Déplacer vers…</option>${colonnes.map((c) => `<option value="${e(c.ref)}">${e(c.titre)}</option>`).join("")}</select>` : ""}
    ${action("contenu.enregistrer") && n.type === "module" && n.formulaire ? bouton("✏️ Contenu", "contenu", r, "btn btn-mini") : ""}
    ${action("design.enregistrer") ? bouton("🎨", "design", `${r} title="Design" aria-label="Design"`, "btn btn-mini") : ""}
    ${action("element.dupliquer") ? bouton("⧉", "dupliquer-element", `${r} title="Dupliquer / créer une variante" aria-label="Dupliquer"`, "btn btn-mini") : ""}
    ${action("element.etat") ? !n.etat.publiable
      ? action("conteneur.publier") ? bouton(n.etat.inactif || n.etat.brouillon ? "Activer" : "✅ Valider et activer", "activer", r, "btn btn-mini") +
        (n.etat.brouillon && !n.etat.inactif ? bouton("Désactiver", "desactiver-element", `${r} title="Désactiver sans supprimer"`, "btn btn-mini") : "") : ""
      : bouton("Désactiver", "desactiver-element", r, "btn btn-mini") : ""}
  </span>`;
}

function noeudHtml(d, n, peut, colonnes) {
  const entete = `<div class="constructeur-noeud-entete"${peut && peutAction(d, d.arbre.type, "element.deplacer") ? ' draggable="true"' : ""} data-c-noeud="${e(n.ref)}" data-c-type="${e(n.type)}">${n.type !== "module" ? REPLIER : ""}<span class="constructeur-type constructeur-type--${e(n.type)}">${LIBELLES[n.type]}</span>
    <strong>${e(n.titre)}</strong>${n.typeModule ? ` <span class="badge">${e(n.typeModule)}</span>` : ""}
    ${n.structure && n.type === "ligne" ? ` <span class="muted">${e(n.structure)}</span>` : ""}
    ${n.type === "colonne" && n.largeur ? ` <span class="muted">${e(n.largeur)} %</span>` : ""}
    ${badgeEtat(n.etat)}
    ${n.type === "module" ? ` <span class="muted constructeur-noeud-detail">${n.utilisations} utilisation(s)${n.formulaire ? (n.contenuRenseigne ? " · contenu renseigné" : " · contenu à renseigner") : ""}${n.modele ? ` · modèle ${e(n.modele)}` : ""}</span>` : ""}
    ${actionsNoeud(n, peut, colonnes, d)}</div>`;
  if (n.type === "module") return `<li class="constructeur-noeud constructeur-noeud--module">${entete}</li>`;
  const enfants = (n.enfants || []).map((x) => noeudHtml(d, x, peut, colonnes)).join("");
  let ajout = "";
  if (peut && n.type === "section" && peutAction(d, d.arbre.type, "ligne.ajouter")) {
    ajout = `<form class="constructeur-ajout" data-c-ajout="ligne" data-ref="${e(n.ref)}">
      <select name="structure" required aria-label="Disposition"><option value="">Disposition des colonnes…</option>${d.structures.map((s) => `<option value="${e(s.ref)}">${e(s.titre)}</option>`).join("")}</select>
      <button class="btn btn-mini" type="submit">➕ Ligne</button></form>`;
  }
  if (peut && n.type === "colonne" && peutAction(d, d.arbre.type, "module.ajouter")) {
    ajout = `<form class="constructeur-ajout" data-c-ajout="module" data-ref="${e(n.ref)}">
      <select name="typeModule" required aria-label="Type de module"><option value="">Module…</option>${d.typesModules.map((t) => `<option value="${e(t.code)}">${e(t.code)}</option>`).join("")}</select>
      ${d.modeles.disponibles.length ? `<select name="modele" aria-label="Modèle (facultatif)"><option value="">Construction libre</option>${d.modeles.disponibles.map((m) => `<option value="${e(m.ref)}">${e(m.titre)}</option>`).join("")}</select>` : ""}
      <input name="titre" maxlength="255" placeholder="Nom (facultatif)" aria-label="Nom du module">
      <button class="btn btn-mini" type="submit">➕ Module</button></form>`;
  }
  return `<li class="constructeur-noeud constructeur-noeud--${n.type}">${entete}<ul>${enfants}</ul>${ajout}</li>`;
}

const colonnesDe = (sections) => sections.flatMap((s) => (s.enfants || []).flatMap((l) => (l.enfants || []).map((c) => ({ ref: c.ref, titre: `${s.titre} › ${c.titre}` }))));
const contientBrouillon = (noeuds) => (noeuds || []).some((n) =>
  n.etat?.brouillon || contientBrouillon(n.enfants));

const TYPE_CONTENEUR = { entete: "ENTETE", footer: "FOOTER", page: "PAGE", article: "PAGE" };
function arbreGeneriqueHtml(n, peut, racine = true, d = {}) {
  const type = d.arbre?.type;
  return `<li class="constructeur-noeud"><div class="constructeur-noeud-entete" data-c-noeud="${e(n.ref)}" data-c-type="builder"${peut && !n.verrouille && peutAction(d, type, "builder.deplacer") ? ' draggable="true"' : ""}>
    ${(n.enfants || []).length ? REPLIER : ""}<button type="button" class="btn btn-mini" data-c-action="design" data-ref="${e(n.ref)}">${e(n.titre)}</button>
    <span class="badge">${e(n.rendu)}</span>${realisation(n.realisation)}${n.verrouille ? "🔒" : ""}
    ${peut && !n.verrouille ? `${n.ajouts?.length && peutAction(d, type, "builder.ajouter") ? bouton("Ajouter dans", "builder-ajouter", `data-ref="${e(n.ref)}"`, "btn btn-mini") : ""}
      ${!racine ? ["monter", "descendre", "deplacer", "dupliquer", "retirer"].filter((a) =>
        peutAction(d, type, `builder.${a === "retirer" ? "desactiver" : ["monter", "descendre"].includes(a) ? "deplacer" : a}`)).map((a) =>
        bouton({ monter: "↑", descendre: "↓", deplacer: "Déplacer", dupliquer: "Dupliquer", retirer: "Retirer" }[a],
          `builder-${a}`, `data-ref="${e(n.ref)}"`, "btn btn-mini")).join("") : ""}` : ""}</div>
    <ul>${(n.enfants || []).map((x) => arbreGeneriqueHtml(x, peut, false, d)).join("")}</ul></li>`;
}

export function panneauGenerique(n, medias, appareil = "", onglet = "CONTENU") {
  const controle = (c) => {
    const nom = `name="${e(c.ref)}"`;
    const v = (appareil ? c.surcharges?.[appareil] : c.valeur) ?? "";
    const t = controleChamp(c);
    const globalSeulement = c.categorie === "AVANCE" && ["IDCSS", "CLASSECSS"].includes(codeChamp(c.cle));
    if (appareil && globalSeulement) return `<p class="muted">${e(c.libelle)} : réglage général uniquement.</p>`;
    let input;
    if (t.type === "number") input = `<input type="number" ${nom} value="${e(v)}" step="any"${t.min !== undefined ? ` min="${t.min}" max="${t.max}"` : ""}>`;
    else if (t.type === "booleen") input = `<select ${nom}><option value="">Hériter</option><option value="true"${v === true ? " selected" : ""}>Oui</option><option value="false"${v === false ? " selected" : ""}>Non</option></select>`;
    else if (t.type === "media") input = `<select ${nom}><option value="">Aucun média / hériter</option>${medias.map((m) => `<option value="${e(m.ref)}"${m.url === `/api/v1/media/${v}` ? " selected" : ""}>${e(m.titre)}</option>`).join("")}</select>`;
    else if (t.type === "select") input = `<select ${nom}><option value="">Hériter</option>${t.options.map((x) => `<option value="${x}"${v === x ? " selected" : ""}>${x}</option>`).join("")}</select>`;
    else if (t.type === "couleur") input = `<span class="design-couleur"><input type="color" data-builder-couleur="${e(c.ref)}" value="${/^#[0-9a-f]{6}$/i.test(v) ? v : "#000000"}" aria-label="Choisir ${e(c.libelle)}"><input ${nom} value="${e(v)}" placeholder="Hériter"></span>`;
    else if (t.type === "cotes") {
      const x = String(v).trim().split(/\s+/);
      const valeurs = v ? [x[0], x[1] || x[0], x[2] || x[0], x[3] || x[1] || x[0]] : ["", "", "", ""];
      input = `<span class="constructeur-cotes">${["Haut", "Droite", "Bas", "Gauche"].map((cote, i) =>
        `<span>${cote}<input data-builder-cote="${e(c.ref)}" data-cote="${i}" value="${e(valeurs[i])}" placeholder="Unité / hériter"></span>`).join("")}</span><input type="hidden" ${nom} value="${e(v)}">`;
    } else input = t.type === "textarea" ? `<textarea ${nom} rows="4">${e(v)}</textarea>` :
      `<input ${nom} value="${e(v)}" placeholder="${e(t.aide || "Hériter")}">`;
    const herite = appareil && (v === "" || v === null) ? `<small>Valeur générale : ${e(c.valeur ?? "non configurée")}</small>` : "";
    return `<label class="design-champ">${e(c.libelle)}${c.obligatoire ? " *" : ""}${input}${herite}<small>${e(c.aide || t.aide || "")}</small></label>`;
  };
  return `<form class="card design-panneau" data-builder-valeurs data-appareil="${e(appareil)}" data-ref="${e(n.ref)}"><h3>${e(n.titre)}</h3>
    <label class="design-champ">Valeurs à modifier<select data-builder-appareil>${[["", "Général / par défaut"], ...APPAREILS_APERCU.map((x) => [x.cle, x.libelle])].map(([cle, libelle]) =>
      `<option value="${cle}"${appareil === cle ? " selected" : ""}>${e(libelle)}</option>`).join("")}</select></label>
    <div class="design-onglets" role="tablist" aria-label="Réglages">${["CONTENU", "DESIGN", "AVANCE"].map((c) =>
      `<button type="button" role="tab" data-builder-onglet="${c}" aria-selected="${c === onglet}" class="btn ${c === onglet ? "btn-primary" : "btn-secondary"}">${c === "AVANCE" ? "AVANCÉ" : c}</button>`).join("")}</div>
    ${["CONTENU", "DESIGN", "AVANCE"].map((categorie) =>
      `<div class="design-grille" data-builder-volet="${categorie}"${categorie !== onglet ? " hidden" : ""}>${n.champs.filter((c) => c.categorie === categorie).map(controle).join("") || '<p class="muted">Aucun champ déclaré dans SharePoint pour ce type.</p>'}</div>`).join("")}
    <p class="muted">Une surcharge vide hérite de la valeur générale. Les autres appareils ne sont pas modifiés.</p>
    <fieldset class="design-actions"${n.verrouille ? " disabled" : ""}><div class="constructeur-boutons">
      ${bouton("Copier réglages", "copier-reglages")}${bouton("Coller réglages", "coller-reglages")}
      ${bouton("Réinitialiser les valeurs", "builder-reset")}
      <button type="submit" class="btn btn-primary">Enregistrer</button></div></fieldset></form>`;
}

export function documentApercu(composition, type = "page") {
  const automatique = (texte) => () => `<span class="dse-b-vide">${texte}</span>`;
  const adapteursAuto = { HEADER: automatique("🔗 Logo et menu du site · affichés automatiquement"),
    FOOTER: automatique("🔗 Mentions et copyright du site · affichés automatiquement") };
  const options = (prefixe, typeConteneur) => ({ apiBase: "/api/v1", adapteurs: adapteursAuto, apercu: true, prefixe, typeConteneur });
  const zone = (z, balise, prefixe, t) => z?.sections?.length || z?.noeuds?.length ? `<${balise}>${rendreBuilder({ mode: "builder", sections: z.sections, noeuds: z.noeuds, style: z.style, responsive: z.responsive, _ref: z._ref, theme: composition.theme }, options(prefixe, t))}</${balise}>` : "";
  const heroApercu = (module) => {
    const contenu = module?.contenu?.find((x) => x?.champs || x?.media);
    if (!contenu) return "";
    const champs = contenu.champs || {};
    const cle = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const valeur = (...noms) => {
      const cible = new Set(noms.map(cle));
      const entree = Object.entries(champs).find(([nom]) => cible.has(cle(nom)));
      return entree?.[1] ?? "";
    };
    const texte = String(valeur("TEXTE") || "");
    const bouton1 = urlSure(valeur("BOUTON-1-URL"));
    const bouton2 = urlSure(valeur("BOUTON-2-URL"));
    // Même priorité que le site public : le média OBJ-MEDIA d'abord, IMAGE-URL seulement en repli.
    const imageUrl = (contenu.media || []).find((media) => /^\d{1,12}$/.test(String(media?.id || "")))?.id ||
      urlSure(valeur("IMAGE-URL"), { lien: false });
    const image = imageUrl
      ? `<img src="${e(/^\d+$/.test(imageUrl) ? `/api/v1/media/${imageUrl}` : imageUrl)}" alt="${e(valeur("IMAGE-ALT"))}">`
      : "";
    const bouton = (label, href) => label && href ? `<a href="${e(href)}">${e(label)}</a>` : "";
    return `<section class="dse-apercu-hero">${image}<div><p>${e(valeur("SOUS-TITRE"))}</p><h1>${e(valeur("TITRE-PRINCIPAL"))}</h1><div>${nettoyerHtml(texte)}</div><nav>${bouton(valeur("BOUTON-1-TEXTE"), bouton1)}${bouton(valeur("BOUTON-2-TEXTE"), bouton2)}</nav></div></section>`;
  };
  const optionsPage = (prefixe, typeConteneur) => ({ ...options(prefixe, typeConteneur), adapteurs: { ...adapteursAuto, HERO: heroApercu } });
  const principal = rendreBuilder(composition || {}, optionsPage(type === "page" ? "p" : type[0], TYPE_CONTENEUR[type] || "PAGE"));
  const vide = `<p class="dse-apercu-vide">Aperçu vide : ajoutez une section depuis la colonne Structure.</p>`;
  const contexte = composition?.contexte || {};
  // Squelette constant : en-tete en haut, contenu au centre, pied de page en bas, quel que soit le conteneur edite.
  const zoneContexte = (z, balise, prefixe, t, libelle) => z?.sections?.length || z?.noeuds?.length
    ? `<div class="dse-apercu-contexte" title="${e(libelle)} (lecture seule)">${zone(z, balise, prefixe, t)}</div>`
    : `<${balise} class="dse-apercu-repere">${e(libelle)} : non associé à une page de ce site</${balise}>`;
  const pageRepere = `<div class="dse-apercu-repere dse-apercu-repere--page">Contenu des pages${contexte.page ? ` · exemple : ${e(contexte.page)}` : ""}</div>`;
  const corps = type === "entete"
    ? `<header class="dse-apercu-edite">${principal || vide}</header><main class="dse-apercu-principal">${pageRepere}</main>${zoneContexte(contexte.footer, "footer", "f", "FOOTER", "Pied de page")}`
    : type === "footer"
      ? `${zoneContexte(contexte.entete, "header", "e", "ENTETE", "En-tête")}<main class="dse-apercu-principal">${pageRepere}</main><footer class="dse-apercu-edite">${principal || vide}</footer>`
      : `${zone(composition?.entete, "header", "e", "ENTETE")}<main class="dse-apercu-principal">${principal || vide}</main>${zone(composition?.footer, "footer", "f", "FOOTER")}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{margin:0;font-family:system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column}.dse-apercu-principal{flex:1 0 auto}${STYLES_BUILDER}.dse-apercu-hero{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center;padding:clamp(24px,6vw,80px);background:#f4f8fc}.dse-apercu-hero img{width:100%;height:auto;object-fit:cover}.dse-apercu-hero h1{font-size:clamp(2rem,5vw,4rem)}.dse-apercu-hero nav{display:flex;flex-wrap:wrap;gap:12px}.dse-apercu-hero nav a{padding:10px 16px;border-radius:6px;background:#0755a4;color:white;text-decoration:none}@media(max-width:640px){.dse-apercu-hero{grid-template-columns:1fr}}
    .dse-apercu-vide{padding:24px;color:#667}.dse-apercu-contexte{opacity:.55;pointer-events:none;filter:grayscale(.3)}.dse-apercu-contexte .dse-b-vide{display:none}
    .dse-apercu-repere{display:flex;align-items:center;justify-content:center;min-height:56px;margin:8px;border:2px dashed #cbd5e1;border-radius:8px;color:#64748b;font:13px system-ui;background:#f8fafc}.dse-apercu-repere--page{min-height:260px}
    .dse-b-vide{display:flex;align-items:center;justify-content:center;min-height:56px;padding:8px;border:1px dashed #94a3b8;border-radius:6px;background:repeating-linear-gradient(45deg,#f8fafc,#f8fafc 8px,#f1f5f9 8px,#f1f5f9 16px);color:#475569;font:13px system-ui}
    [data-dse-ref]{min-height:24px;position:relative;cursor:pointer}.dse-b-recursif{position:relative}
    [data-dse-ref].dse-survol{outline:2px solid var(--dse-c,#7c3aed);outline-offset:-2px}
    [data-dse-ref].dse-survol::before,[data-dse-ref].dse-design-cible::before{content:attr(data-dse-libelle);position:absolute;top:0;left:0;z-index:5;padding:2px 8px;font:600 11px/18px system-ui;color:#fff;background:var(--dse-c,#7c3aed);border-radius:0 0 6px 0;pointer-events:none;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}
    [data-dse-ref].dse-design-cible{outline:3px solid var(--dse-c,#7c3aed);outline-offset:-3px}
    [data-dse-type=section]{--dse-c:#2b87da}[data-dse-type=ligne]{--dse-c:#29c4a9}[data-dse-type=colonne]{--dse-c:#8f42ec}[data-dse-type=module],[data-dse-type=builder]{--dse-c:#4c5866}[data-dse-type=entete],[data-dse-type=footer],[data-dse-type=page],[data-dse-type=article]{--dse-c:#e09900}
    body:not(.dse-apercu-seul) :is(.dse-b-r-section,.dse-b-r-ligne,.dse-b-r-colonne)[data-dse-ref]:not(.dse-survol):not(.dse-design-cible){outline:1px dashed var(--dse-c);outline-offset:-1px}
    body:not(.dse-apercu-seul) .dse-b-r-section[data-dse-ref]{background:#2b87da08;padding:24px 10px 10px!important;margin:6px 0}
    body:not(.dse-apercu-seul) .dse-b-r-ligne[data-dse-ref]{background:#29c4a90a;padding:24px 8px 8px!important;margin:4px 0;gap:10px}
    body:not(.dse-apercu-seul) .dse-b-r-colonne[data-dse-ref]{background:#8f42ec0a;padding:24px 6px 6px!important}
    body:not(.dse-apercu-seul) :is(.dse-b-r-section,.dse-b-r-ligne,.dse-b-r-colonne)[data-dse-ref]:not(.dse-survol):not(.dse-design-cible)::before{content:attr(data-dse-libelle);position:absolute;top:0;left:0;z-index:4;max-width:calc(100% - 8px);overflow:hidden;text-overflow:ellipsis;padding:1px 7px;font:600 10px/16px system-ui;color:#fff;background:var(--dse-c);opacity:.8;border-radius:0 0 6px 0;pointer-events:none;white-space:nowrap}
    .dse-b-plus{display:flex;align-items:center;justify-content:center;width:28px;height:28px;margin:6px auto;border-radius:50%;border:1px dashed #2563eb;background:#eff6ff;color:#2563eb;font:600 18px system-ui;cursor:pointer;opacity:.55}
    .dse-b-recursif:not(.dse-design-cible):has(.dse-b-recursif .dse-b-plus)>.dse-b-plus{display:none}
    .dse-b-recursif:hover:not(:has(.dse-b-recursif:hover))>.dse-b-plus,.dse-design-cible>.dse-b-plus{display:flex;opacity:1}.dse-b-plus:hover{background:#2563eb;color:white}
    .dse-b-recursif:hover:not(:has(.dse-b-recursif:hover))>.dse-b-outils,body:not(:has(.dse-b-recursif:hover)) .dse-design-cible>.dse-b-outils{display:flex;gap:4px;background:white;color:#111;font:12px system-ui;position:absolute;top:2px;right:2px;z-index:6;padding:2px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.25)}
    .dse-builder-glisse .dse-b-depot{display:block;border:1px dashed #7c3aed;padding:5px;font:12px system-ui;color:#4c1d95;background:#f5f3ff}
    .dse-b-depot.dse-depot-actif{background:#ddd6fe;border-style:solid}body.dse-apercu-seul .dse-b-plus,body.dse-apercu-seul .dse-b-outils,body.dse-apercu-seul .dse-b-depot,body.dse-apercu-seul .dse-apercu-repere{display:none}
    body.dse-apercu-seul [data-dse-ref]{outline:none!important;cursor:auto}body.dse-apercu-seul [data-dse-ref]::before{display:none!important}
    </style></head>
    <body>${corps}</body></html>`;
}

export function historiqueStructure(avant, apres, racine) {
  const precedents = new Map((avant || []).map((n) => [n.ref, n]));
  const annuler = [], retablir = [];
  for (const n of apres || []) {
    const origine = precedents.get(n.ref) || { ...n, actif: false };
    if (n.ref === racine || JSON.stringify(origine) === JSON.stringify(n)) continue;
    annuler.push(origine);
    retablir.push(n);
  }
  return annuler.length ? { genre: "structure", annuler: { action: "builder.restaurer", params: { ref: racine, elements: annuler } },
    retablir: { action: "builder.restaurer", params: { ref: racine, elements: retablir } } } : null;
}

function editeur(d) {
  const a = d.arbre;
  const type = a.type;
  const peut = ecrit(d, FONCTION[type]);
  const colonnes = colonnesDe(a.sections);
  const publicationRequise = !a.etat.publiable || a.generique || contientBrouillon(a.sections);
  return `<header class="constructeur-barre-visuelle"><strong>${e(d.site?.titre || "")} · ${e(a.titre)}</strong>
    <div class="constructeur-boutons"><span class="constructeur-boutons" role="group" aria-label="Appareil">${APPAREILS_APERCU.map((x) => `<button type="button" class="btn btn-mini ${x.cle === (d.appareil || "ORDINATEUR") ? "btn-primary" : "btn-secondary"}" data-c-appareil="${x.cle}" aria-pressed="${x.cle === (d.appareil || "ORDINATEUR")}">${x.libelle}</button>`).join("")}</span>
      <button type="button" class="btn btn-mini" data-c-action="annuler-design">↶ Annuler</button>
      <button type="button" class="btn btn-mini" data-c-action="retablir-design">↷ Rétablir</button>
      <button type="button" class="btn btn-mini" data-c-action="copier-style">Copier style</button>
      <button type="button" class="btn btn-mini" data-c-action="coller-style">Coller style</button>
      <button type="button" class="btn btn-mini" data-c-action="apercu-seul">Aperçu</button>
      ${peutAction(d, type, a.generique ? "builder.enregistrer" : "design.enregistrer") ? '<button type="button" class="btn btn-primary" data-c-action="enregistrer-design">Enregistrer</button>' : ""}
      ${bouton("← Fermer", "fermer")}</div></header>
    <div class="constructeur-espace-visuel">
  <div class="constructeur-design-zone">
    <div class="card constructeur-apercus">
      <div class="constructeur-apercu-cadre" data-apercu-cadre><iframe class="constructeur-apercu" title="Aperçu" sandbox="allow-same-origin" data-apercu></iframe></div>
    </div>
  </div>
  <aside class="card constructeur-editeur" aria-label="Composition">
    <header class="constructeur-editeur-entete">
      <div><span class="constructeur-type">${LIBELLES[type]}</span><h3>${e(a.titre)}</h3>${a.realisation ? realisation(a.realisation) : badgeEtat(a.etat)}</div>
      <div class="constructeur-boutons constructeur-boutons--compacts">
        ${peut && type !== "article" ? bouton("🎨 Design", "design", `data-ref="${e(a.ref)}" title="Design · ${LIBELLES[type]}"`, "btn btn-mini") : ""}
        ${peutAction(d, type, "conteneur.dupliquer") ? bouton("⧉ Dupliquer", "dupliquer", `data-ref="${e(a.ref)}" data-type="${type}" title="Dupliquer le conteneur"`, "btn btn-mini") : ""}
        ${bouton("✨ Pasc ARA IA", "ia", 'title="Demander à Pasc ARA IA"', "btn btn-mini")}
        ${peutAction(d, type, "conteneur.publier") && publicationRequise ? bouton("✅ Valider et activer", "publier", `data-ref="${e(a.ref)}"`, "btn btn-mini btn-primary") : ""}</div>
    </header>
    <div data-c-panneau></div>
    <details class="constructeur-volet" data-c-volet="structure" open><summary>Structure <span class="muted">· ${a.generique ? "éléments" : `${a.sections.length} section(s)`}</span></summary>
      ${a.generique ? '<div data-builder-palette aria-label="Éléments autorisés"></div>' : ""}
      ${d.builder?.message ? `<p class="alerte-info">${e(d.builder.message)}</p>` : ""}
      ${peutAction(d, type, "builder.initialiser") && !a.generique && !a.sections.length && d.builder?.types?.some((x) => x.racine) ?
        bouton("Initialiser la racine générique", "builder-initialiser", `data-ref="${e(a.ref)}"`) : ""}
      ${peut && !a.generique ? '<p class="muted constructeur-noeud-detail">Cliquez sur une section, une ligne ou une colonne (ici ou dans l\'aperçu) pour la régler et y ajouter un élément.</p>' : ""}
      <ul class="constructeur-arbre">${a.generique ? arbreGeneriqueHtml(a.generique, peut, true, d) :
        a.sections.map((s) => noeudHtml(d, s, peut, colonnes)).join("") || `<li class="muted">Aucune section : commencez par ajouter une section.</li>`}</ul>
      ${peut && !a.generique && peutAction(d, type, "section.ajouter") ? `<form class="constructeur-ajout" data-c-ajout="section" data-ref="${e(a.ref)}">
        <input name="titre" maxlength="255" placeholder="Nom de la section" aria-label="Nom de la section">
        ${d.typesSection.length ? `<select name="typeSection" aria-label="Type de section"><option value="">Type standard</option>${d.typesSection.map((t) => `<option value="${e(t.ref)}">${e(t.titre)}</option>`).join("")}</select>` : ""}
        <button class="btn btn-primary btn-mini" type="submit">➕ Ajouter une section</button></form>` : ""}
    </details>
    <details class="constructeur-volet" data-c-volet="medias"><summary>Médias du site</summary>
      ${bouton("Parcourir les médias", "builder-medias", "", "btn btn-mini")}
      <p>${(d.medias || []).map((m) => `<a href="${e(m.url)}" target="_blank" rel="noopener">${e(m.titre)}</a>`).join("<br>") || "Aucun média autorisé."}</p>
    </details>
    <details class="constructeur-volet" data-c-volet="aide"><summary>Aide</summary>
      <p class="muted">Survolez l'aperçu pour repérer les sections (bleu), lignes (vert), colonnes (violet) et modules (gris) ; cliquez pour ouvrir leurs réglages ici.</p>
      <p class="muted">Les nouveaux éléments sont créés en brouillon : visibles dans l'aperçu, publiés uniquement après « Valider et activer ».</p>
      <p class="muted">Glissez un élément de l'arbre ou du Canvas sur sa destination. Les retraits sont logiques, jamais destructifs.</p>
    </details>
  </aside>
</div>`;
}

export function rendreConstructeur(moi, d, etat = {}) {
  const onglet = ONGLETS.some((o) => o.cle === etat.onglet) ? etat.onglet : "entetes";
  const fonctions = getState().user?.fonctions;
  const accesMenu = !Array.isArray(fonctions) || fonctions.includes("menu");
  const corps = d.arbre ? editeur(d)
    : onglet === "entetes" ? ongletConteneurs(d, "entete")
      : onglet === "footers" ? ongletConteneurs(d, "footer")
        : onglet === "pages" ? ongletPages(d)
          : onglet === "articles" ? ongletArticles(d, etat.domaine)
          : onglet === "bibliotheque" ? ongletBibliotheque(d) : ongletCatalogue(d);
  return `<section class="cockpit constructeur${d.arbre ? " constructeur--plein-ecran" : ""}" data-constructeur>
    ${rendreEnteteCockpit(moi)}
    ${d.arbre ? "" : rendreAccompagnement(d.accompagnement)}
    <div class="card cockpit-site-titre"><h2>🧱 Construire le site · ${e(d.site?.titre || "")}</h2>
      <p class="muted">${e(d.site?.domaine || "")} — données lues et enregistrées dans SharePoint.</p>
      <a class="btn btn-secondary" href="#/cockpit/site/${encodeURIComponent(etat.domaine || "")}">← Retour au site</a></div>
    ${d.arbre ? "" : `<nav class="constructeur-onglets" role="tablist">${ONGLETS.map((o) =>
      `<button type="button" role="tab" class="btn ${o.cle === onglet ? "btn-primary" : "btn-secondary"}" aria-selected="${o.cle === onglet}" data-c-onglet="${o.cle}">${o.libelle}</button>${o.cle === "footers" && accesMenu ? `<a class="btn btn-secondary" href="#/cockpit/site/${encodeURIComponent(etat.domaine || "")}/menu">Menu</a>` : ""}`).join("")}</nav>`}
    <div class="constructeur-message" role="status" aria-live="polite" data-c-message>${etat.message ? `<p class="${etat.erreur ? "alerte-erreur" : "alerte-succes"}">${e(etat.message)}</p>` : ""}</div>
    ${!d.arbre && ["entetes", "footers", "pages"].includes(onglet) ? barreVue(etat) : ""}
    <div class="constructeur-vue-zone${etat.vue === "liste" ? " constructeur-vue-zone--liste" : ""}">${corps}</div>
    <p class="muted" data-c-aucun-resultat hidden>Aucun élément ne correspond à la recherche.</p>
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
  const etat = { domaine, onglet: ONGLETS.some((o) => o.cle === onglet) ? onglet : "entetes", conteneur: "", message: "", erreur: false, appareil: "ORDINATEUR", design: null, vue: vueMemorisee(), recherche: "", filtreEtat: "" };
  let d = donnees;
  let copieStyle = null;
  let historique = [];
  let positionHistorique = -1;
  let brouillonGenerique = false;
  const brouillons = new Map();
  let historiqueBuilder = [], positionBuilder = -1, empreinteHistorique = "";
  let copieReglages = null;
  let enCours = false;
  let glisse = null;
  const replies = new Set();
  const volets = new Map();
  racine.addEventListener("toggle", (ev) => { if (ev.target.dataset?.cVolet) volets.set(ev.target.dataset.cVolet, ev.target.open); }, true);
  const trouverNoeud = (reference) => {
    const chercher = (n, parent = null) => n?.ref === reference ? { n, parent } :
      (n?.enfants || n?.sections || []).map((x) => chercher(x, n)).find(Boolean);
    return chercher(d.arbre?.generique || d.arbre);
  };
  const marquerBrouillon = (ref, appareil) => {
    if (!brouillons.has(ref)) brouillons.set(ref, new Set());
    brouillons.get(ref).add(appareil || "");
    brouillonGenerique = true;
  };
  const ajouterHistorique = (commande) => {
    historiqueBuilder = historiqueBuilder.slice(0, positionBuilder + 1);
    historiqueBuilder.push(commande);
    if (historiqueBuilder.length > 100) historiqueBuilder.shift();
    positionBuilder = historiqueBuilder.length - 1;
  };
  const actualiserCanvas = () => {
    const f = iframe();
    if (f) f.srcdoc = documentApercu({ ...d.apercu, noeuds: [d.arbre.generique] }, d.arbre.type);
  };
  const modifierChamps = (node, modifier) => {
    const avant = structuredClone(node.champs);
    modifier();
    const apres = structuredClone(node.champs);
    if (JSON.stringify(avant) === JSON.stringify(apres)) return;
    ajouterHistorique({ genre: "reglages", ref: node.ref, avant, apres });
    actualiserCanvas();
  };
  const changerAppareil = (appareil) => {
    etat.appareil = appareil;
    for (const b of racine.querySelectorAll("[data-c-appareil]")) {
      b.classList.toggle("btn-primary", b.dataset.cAppareil === appareil);
      b.classList.toggle("btn-secondary", b.dataset.cAppareil !== appareil);
      b.setAttribute("aria-pressed", String(b.dataset.cAppareil === appareil));
    }
    dimensionner();
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
    // Fenetre d'apercu a hauteur d'ecran : en-tete en haut, pied de page en bas, defilement interne comme un vrai site.
    const hauteurViewport = Math.max(360, (window.innerHeight || 800) - 150) / echelle;
    Object.assign(f.style, { width: `${largeur}px`, height: `${hauteurViewport}px`, transform: `scale(${echelle})`, transformOrigin: "top left" });
    cadre.style.height = `${Math.ceil(hauteurViewport * echelle)}px`;
  };
  const identifiantDe = (el) => [...(el?.classList || [])].find((c) => /^dse-b-[a-z]{0,3}[mclsr]\d+$/.test(c));
  const apercuDesign = () => {
    const doc = docApercu();
    if (!doc) return;
    for (const x of doc.querySelectorAll(".dse-design-cible")) x.classList.remove("dse-design-cible");
    doc.getElementById("dse-design-live")?.remove();
    const selection = etat.design?.ref;
    for (const n of racine.querySelectorAll("[data-c-noeud]")) {
      const choisi = n.dataset.cNoeud === selection;
      n.classList.toggle("constructeur-selection", choisi);
      if (!choisi) continue;
      // L'arbre se deplie jusqu'a l'element choisi dans l'apercu.
      for (let li = n.closest(".constructeur-noeud"); li; li = li.parentElement?.closest(".constructeur-noeud")) {
        li.classList.remove("constructeur-noeud--replie");
        replies.delete(li.querySelector(":scope > [data-c-noeud]")?.dataset.cNoeud);
      }
      n.closest("details.constructeur-volet")?.setAttribute("open", "");
      n.scrollIntoView({ block: "nearest" });
    }
    const choisi = selection ? doc.querySelector(`[data-dse-ref="${CSS.escape(selection)}"]`) : null;
    choisi?.classList.add("dse-design-cible");
    choisi?.scrollIntoView({ block: "nearest" });
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
        const commande = ev.target.closest?.("[data-builder-canvas]");
        const cibleRef = ev.target.closest?.("[data-dse-ref]");
        ev.preventDefault();
        if (commande && !enCours && commande.dataset.builderCanvas === "ajouter") return menuAjout(commande.dataset.ref);
        if (commande && !enCours) return racine.querySelector(`[data-c-action="builder-${CSS.escape(commande.dataset.builderCanvas)}"][data-ref="${CSS.escape(commande.dataset.ref)}"]`)?.click();
        if (cibleRef && d.arbre && ecrit(d, FONCTION[d.arbre.type])) ouvrirDesign(cibleRef.dataset.dseRef);
      });
      for (const el of doc?.querySelectorAll("[data-dse-ref]") || []) {
        const node = trouverNoeud(el.dataset.dseRef);
        el.draggable = Boolean(node?.parent && !node.n.verrouille && peutAction(d, d.arbre.type, "builder.deplacer"));
        const rendu = String(node?.n?.rendu || "").toUpperCase();
        const sorte = rendu ? ({ "EN-TETE": "entete", ARTICLES: "module" }[rendu] || rendu.toLowerCase()) : node?.n?.type || el.dataset.dseRef.split(".")[0];
        el.dataset.dseType = sorte;
        const freres = (node?.parent?.enfants || []).filter((x) => String(x.rendu || "").toUpperCase() === rendu);
        const detail = rendu === "LIGNE" ? ` · ${(node.n.enfants || []).filter((x) => String(x.rendu || "").toUpperCase() === "COLONNE").length || "0"} col.`
          : rendu === "COLONNE" && freres.length > 1 ? ` ${freres.indexOf(node.n) + 1}/${freres.length}` : "";
        el.dataset.dseLibelle = `${rendu || LIBELLES[sorte] || "Élément"}${detail}${node?.n?.titre ? ` · ${node.n.titre}` : ""}`;
      }
      let survol = null;
      doc?.addEventListener("mouseover", (ev) => {
        const el = ev.target.closest?.("[data-dse-ref]");
        if (el === survol) return;
        survol?.classList.remove("dse-survol");
        survol = el;
        el?.classList.add("dse-survol");
      });
      doc?.documentElement.addEventListener("mouseleave", () => { survol?.classList.remove("dse-survol"); survol = null; });
      doc?.addEventListener("dragstart", demarrerGlisse);
      doc?.addEventListener("dragover", autoriserDepot);
      doc?.addEventListener("drop", deposer);
      doc?.addEventListener("dragend", terminerGlisse);
      doc?.addEventListener("load", dimensionner, true);
      doc?.body.classList.toggle("dse-apercu-seul", Boolean(etat.apercuSeul));
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
    zone.innerHTML = generic ? panneauGenerique(generic, (d.medias || []).filter((m) => m.builderAutorise !== false), etat.design.appareilValeurs || "", etat.design.ongletGenerique || "CONTENU") : etat.design?.data ? panneauDesign(etat.design.data, { ref: etat.design.ref, contenu: contenuDesign(etat.design.ref), onglet: etat.design.onglet, appareil: etat.design.appareil })
      : etat.design ? `<p class="card muted">Chargement des réglages…</p>` : "";
    zone.closest(".constructeur-design-zone")?.classList.toggle("constructeur-design-zone--ouverte", Boolean(etat.design));
    if (generic?.verrouille) for (const champ of zone.querySelectorAll("input,select,textarea,button[type=submit]")) champ.disabled = true;
    const palette = racine.querySelector("[data-builder-palette]");
    const selection = generic || d.arbre?.generique;
    if (palette && selection) palette.innerHTML = `<p class="muted">Ajouter dans : ${e(selection.titre)}</p>${
      ecrit(d, FONCTION[d.arbre.type]) && !selection.verrouille && selection.ajouts?.length ?
        (raccourcis(selection).length ? raccourcis(selection).map((r, i) => bouton(e(r.libelle), "builder-rapide",
          `data-ref="${e(selection.ref)}" data-rapide="${i}"`, "btn btn-mini")).join("") :
        selection.ajouts.map((t) => bouton(`＋ ${e(t.titre)}`, "builder-ajout-direct",
          `data-ref="${e(selection.ref)}" data-type-ref="${e(t.ref)}"`, "btn btn-mini")).join("")) :
        '<p class="muted">Aucun ajout autorisé pour cette sélection.</p>'}`;
    apercuDesign();
  };
  async function ouvrirDesign(ref, onglet = etat.design?.ref === ref ? etat.design.onglet : "design") {
    if (!ref.startsWith("builderelement.") && etat.design?.ref !== ref && modificationsLocales()) {
      if (!confirmerAbandon()) return;
      if (brouillonGenerique) {
        await charger();
        brouillonGenerique = false;
        brouillons.clear();
        const f = iframe();
        if (f) f.srcdoc = documentApercu(d.apercu, d.arbre.type);
      }
    }
    if (ref.startsWith("builderelement.")) {
      etat.design = { ref, onglet, appareilValeurs: etat.design?.appareilValeurs || "",
        ongletGenerique: etat.design?.ongletGenerique || "CONTENU" };
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
  const filtrerCartes = () => {
    const q = (etat.recherche || "").trim().toLowerCase();
    const cartes = [...racine.querySelectorAll(".constructeur-vue-zone .constructeur-carte")];
    let visibles = 0;
    for (const c of cartes) {
      const ok = (!q || (c.dataset.nom || "").includes(q)) && (!etat.filtreEtat || c.dataset.etat === etat.filtreEtat);
      c.hidden = !ok;
      if (ok) visibles++;
    }
    const vide = racine.querySelector("[data-c-aucun-resultat]");
    if (vide) vide.hidden = !cartes.length || visibles > 0;
  };
  const afficher = () => {
    racine.innerHTML = rendreConstructeur(moi, { ...d, appareil: etat.appareil }, etat);
    for (const ref of replies) racine.querySelector(`[data-c-noeud="${CSS.escape(ref)}"]`)?.closest(".constructeur-noeud")?.classList.add("constructeur-noeud--replie");
    for (const v of racine.querySelectorAll("details[data-c-volet]")) if (volets.has(v.dataset.cVolet)) v.open = volets.get(v.dataset.cVolet);
    filtrerCartes();
    preparerApercu();
    if (!d.arbre) etat.design = null;
    afficherPanneau();
  };
  const executer = async (action, params, { historiqueCommande = false } = {}) => {
    if (enCours) return false;
    if (action.startsWith("builder.") && action !== "builder.enregistrer" && brouillons.size) {
      message("Enregistrez les réglages en attente avant de modifier la structure.");
      return false;
    }
    if (!action.startsWith("builder.") && !["design.enregistrer"].includes(action) && !confirmerAbandon()) return false;
    const structureAvant = d.arbre?.generique?.structure;
    if ((action.startsWith("builder.") || action === "conteneur.dupliquer" && params.ref === etat.conteneur) && d.arbre?.generique) params = { ...params,
      attendu: historiqueCommande ? empreinteHistorique : d.arbre.generique.empreinte };
    enCours = true;
    const zone = racine.querySelector("[data-c-message]");
    if (zone) zone.innerHTML = `<p class="muted">Enregistrement dans SharePoint…</p>`;
    for (const b of racine.querySelectorAll("button")) b.disabled = true;
    try {
      const confirmation = { cle: crypto.randomUUID() };
      if (["conteneur.publier", "conteneur.desactiver", "page.affecter", "element.etat"].includes(action)) {
        const apercu = (await actionConstruire(domaine, action, params, { ...confirmation, apercu: true })).donnees;
        if (!apercu?.jeton || !apercu.changements?.length) throw new Error("L'aperçu de cette modification est indisponible.");
        confirmation.jeton = await confirmerApercuConstruction(apercu);
        if (!confirmation.jeton) { enCours = false; afficher(); return false; }
      }
      const r = await actionConstruire(domaine, action, params, confirmation);
      if (!r?.donnees || r.donnees.refus || r.donnees.erreur) throw new Error(r?.donnees?.refus || r?.donnees?.erreur || "Réponse d'enregistrement invalide.");
      Object.assign(etat, { message: r?.donnees?.message || "Action enregistrée.", erreur: false });
      if ((action === "conteneur.dupliquer" && etat.conteneur || action === "conteneur.creer") && r.donnees.nouveau?.ref) {
        etat.conteneur = r.donnees.nouveau.ref;
        etat.design = null;
        historiqueBuilder = [];
        positionBuilder = -1;
      }
      await charger();
      brouillonGenerique = false;
      brouillons.clear();
      empreinteHistorique = d.arbre?.generique?.empreinte || "";
      if (!historiqueCommande) {
        const nouveau = r.donnees.nouveau?.ref;
        if (["builder.ajouter", "builder.dupliquer", "builder.deplacer", "builder.desactiver"].includes(action)) {
          const commande = historiqueStructure(structureAvant, d.arbre.generique.structure, d.arbre.generique.ref);
          if (commande) ajouterHistorique(commande);
        }
        if (["builder.ajouter", "builder.dupliquer"].includes(action) && nouveau) etat.design = { ref: nouveau };
        if (action === "builder.desactiver") etat.design = null;
        if (action === "builder.initialiser") { historiqueBuilder = []; positionBuilder = -1; }
      }
      if (etat.design) etat.design.data = null;
      if (etat.design?.ref.startsWith("builderelement.") && !trouverNoeud(etat.design.ref)) etat.design = { ref: d.arbre.generique.ref };
    } catch (err) {
      Object.assign(etat, { message: err.message || "L'action n'a pas abouti.", erreur: true });
      enCours = false;
      afficher();
      return false;
    }
    enCours = false;
    afficher();
    if (etat.design && !etat.design.data) await ouvrirDesign(etat.design.ref, etat.design.onglet);
    return true;
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
  // Ajout rapide : chemin le plus court de types (regles SharePoint) jusqu'a la ligne, la colonne ou le module voulu.
  const cheminVers = (typeRef, rendu) => {
    const types = new Map((d.builder?.types || []).map((t) => [t.ref, t]));
    const file = [[typeRef, []]], vus = new Set([typeRef]);
    while (file.length) {
      const [courant, chemin] = file.shift();
      for (const enfant of types.get(courant)?.enfants || []) {
        if (vus.has(enfant) || !types.has(enfant)) continue;
        const suite = [...chemin, types.get(enfant)];
        if (types.get(enfant).rendu === rendu) return suite;
        vus.add(enfant);
        file.push([enfant, suite]);
      }
    }
    return null;
  };
  const MODULES_RAPIDES = [["📝", "Texte"], ["🔠", "Titre"], ["🖼️", "Image"], ["📰", "Image + texte"], ["🔘", "Bouton"], ["🎬", "Vidéo"]];
  const raccourcis = (n) => {
    if (!n?.typeRef || n.verrouille || !peutAction(d, d.arbre?.type, "builder.ajouter")) return [];
    const liste = [];
    const ligne = n.rendu === "LIGNE" ? null : cheminVers(n.typeRef, "LIGNE");
    const colonneDansLigne = cheminVers((ligne || [])[ligne?.length - 1]?.ref, "COLONNE");
    if (ligne && colonneDansLigne?.length === 1) {
      for (const nb of [1, 2, 3]) liste.push({ groupe: "Lignes", libelle: `▭ Ligne ${nb} colonne${nb > 1 ? "s" : ""}`,
        etapes: [...ligne.map((t, i) => ({ type: t, titre: i === ligne.length - 1 ? `Ligne ${nb} col.` : t.titre }))],
        colonnes: { type: colonneDansLigne[0], nombre: nb } });
    } else if (ligne) liste.push({ groupe: "Lignes", libelle: "▭ Ligne", etapes: ligne.map((t) => ({ type: t, titre: t.titre })) });
    if (n.rendu === "LIGNE") {
      const col = cheminVers(n.typeRef, "COLONNE");
      if (col) liste.push({ groupe: "Lignes", libelle: "▯ Colonne", etapes: col.map((t) => ({ type: t, titre: t.titre })) });
    }
    const module = cheminVers(n.typeRef, "MODULE");
    if (module) for (const [icone, nom] of MODULES_RAPIDES) liste.push({ groupe: "Modules", libelle: `${icone} ${nom}`,
      etapes: module.map((t, i) => ({ type: t, titre: i === module.length - 1 ? nom : t.titre })) });
    const prevus = new Set(liste.flatMap((r) => r.etapes.map((x) => x.type.ref)));
    for (const a of n.ajouts || []) if (!prevus.has(a.ref)) liste.push({ groupe: "Autres", libelle: `＋ ${a.titre}`, etapes: [{ type: { ref: a.ref }, titre: a.titre }] });
    return liste;
  };
  const ajoutRapide = async (ref, r) => {
    let parent = r.parentRef || ref;
    const crees = [];
    for (const [i, etape] of r.etapes.entries()) {
      const params = { ref: parent, typeRef: etape.type.ref, titre: etape.titre };
      if (i === 0 && r.apres) params.apres = r.apres;
      if (!(await executer("builder.ajouter", params))) return;
      parent = etat.design?.ref;
      crees.push(parent);
    }
    const ligne = parent;
    for (let i = 0; r.colonnes && i < r.colonnes.nombre; i++) {
      if (!(await executer("builder.ajouter", { ref: ligne, typeRef: r.colonnes.type.ref, titre: `Colonne ${i + 1}` }))) return;
    }
    const ouvrir = r.ouvrirPremier ? crees[0] : r.colonnes ? ligne : null;
    if (ouvrir) { etat.design = { ref: ouvrir }; afficher(); await ouvrirDesign(ouvrir); }
  };
  // Assistant d'ajout : cherche ou placer l'element (dans le noeud, sinon juste apres lui chez le premier ancetre qui l'accepte).
  const cibleAjout = (ref, rendu) => {
    let courant = trouverNoeud(ref), apres = null;
    while (courant?.n) {
      const n = courant.n;
      const chemin = n.typeRef && !n.verrouille ? cheminVers(n.typeRef, rendu) : null;
      if (chemin) return { parent: n, chemin, apres };
      apres = n.ref;
      courant = courant.parent ? trouverNoeud(courant.parent.ref) : null;
    }
    return null;
  };
  const colonnesDirectes = (typeRef) => { const c = cheminVers(typeRef, "COLONNE"); return c?.length === 1 ? c[0] : null; };
  const BRANCHES = [
    { cle: "SECTION", icone: "🧱", libelle: "Section", aide: "Un grand bloc horizontal de la page" },
    { cle: "LIGNE", icone: "▭", libelle: "Ligne", aide: "Une rangée découpée en colonnes" },
    { cle: "COLONNE", icone: "▯", libelle: "Colonne", aide: "Une colonne de plus dans la ligne" },
    { cle: "MODULE", icone: "🧩", libelle: "Module", aide: "Texte, image, bouton, vidéo…" },
    { cle: "ARTICLES", icone: "📰", libelle: "Blog / articles", aide: "Liste automatique des articles publiés" }
  ];
  const MODULES_ASSISTANT = [...MODULES_RAPIDES, ["➕", "Module vide"]];
  const optionsBranche = (branche, cible) => {
    const dernier = cible.chemin[cible.chemin.length - 1];
    if (branche === "SECTION") {
      const ligne = cheminVers(dernier.ref, "LIGNE");
      const col = ligne && colonnesDirectes(ligne[ligne.length - 1].ref);
      return [{ icone: "▢", libelle: "Section vide", titre: "Section", nb: 0 },
        ...(col ? [1, 2, 3].map((nb) => ({ icone: "▥", libelle: `Avec une ligne de ${nb} colonne${nb > 1 ? "s" : ""}`, titre: "Section", nb, ligne, col })) : [])];
    }
    if (branche === "LIGNE") {
      const col = colonnesDirectes(dernier.ref);
      return col ? [1, 2, 3, 4].map((nb) => ({ icone: "▥", libelle: `${nb} colonne${nb > 1 ? "s" : ""}`, titre: `Ligne ${nb} col.`, nb, col }))
        : [{ icone: "▭", libelle: "Ligne simple", titre: "Ligne", nb: 0 }];
    }
    if (branche === "MODULE") return MODULES_ASSISTANT.map(([icone, nom]) => ({ icone, libelle: nom, titre: nom === "Module vide" ? dernier.titre : nom }));
    return [];
  };
  const planAssistant = (branche, cible, option, titre) => {
    const etapes = cible.chemin.map((t, i) => ({ type: t, titre: i === cible.chemin.length - 1 ? titre : t.titre }));
    const plan = { parentRef: cible.parent.ref, apres: cible.apres, etapes };
    if (branche === "SECTION") {
      plan.ouvrirPremier = true;
      if (option?.nb) { plan.etapes.push(...option.ligne.map((t, i) => ({ type: t, titre: i === option.ligne.length - 1 ? `Ligne ${option.nb} col.` : t.titre }))); plan.colonnes = { type: option.col, nombre: option.nb }; }
    }
    if (branche === "LIGNE" && option?.nb) plan.colonnes = { type: option.col, nombre: option.nb };
    return plan;
  };
  const menuAjout = (ref) => {
    const n = trouverNoeud(ref)?.n;
    if (!n || !peutAction(d, d.arbre?.type, "builder.ajouter")) return message("Aucun ajout autorisé ici.");
    const branches = BRANCHES.map((b) => ({ ...b, cible: cibleAjout(ref, b.cle) || (b.cle === "ARTICLES" ? cibleAjout(ref, "BLOG") : null) }))
      .filter((b) => b.cible && (b.cle !== "COLONNE" || b.cible.chemin.length === 1));
    const prevus = new Set(branches.flatMap((b) => b.cible.parent.ref === ref ? [b.cible.chemin[0].ref] : []));
    const autres = n.verrouille ? [] : (n.ajouts || []).filter((a) => !prevus.has(a.ref));
    if (!branches.length && !autres.length) return message("Aucun ajout autorisé ici.");
    const dlg = dialogue();
    const s = { etape: 1, branche: null, option: null, titre: "" };
    const ou = (c) => c.apres ? `après « ${e(trouverNoeud(c.apres)?.n?.titre || "")} » dans « ${e(c.parent.titre)} »` : `dans « ${e(c.parent.titre)} »`;
    const carte = (attr, icone, libelle, aide = "", actif = false) => `<button type="button" class="constructeur-assistant-carte${actif ? " actif" : ""}" ${attr}>
      <span class="constructeur-assistant-icone">${icone}</span><strong>${e(libelle)}</strong>${aide ? `<small>${e(aide)}</small>` : ""}</button>`;
    const etapes = () => `<ol class="constructeur-assistant-etapes">${["Quoi ?", "Lequel ?", "Confirmer"].map((x, i) =>
      `<li class="${i + 1 === s.etape ? "actif" : i + 1 < s.etape ? "fait" : ""}">${i + 1}. ${x}</li>`).join("")}</ol>`;
    const rendre = () => {
      const b = branches.find((x) => x.cle === s.branche);
      let corps = "", pied = "";
      if (s.etape === 1) {
        corps = `<p class="muted">Que voulez-vous ajouter ?</p><div class="constructeur-assistant-grille">
          ${branches.map((x) => carte(`data-branche="${x.cle}"`, x.icone, x.libelle, x.aide)).join("")}
          ${branches.some((x) => x.cle === "ARTICLES") ? "" : `<button type="button" class="constructeur-assistant-carte" disabled title="Créer un type Builder « ARTICLES » dans SharePoint pour l'activer">
            <span class="constructeur-assistant-icone">📰</span><strong>Blog / articles</strong><small>Bientôt : type à activer dans SharePoint</small></button>`}
          ${autres.length ? carte(`data-branche="AUTRE"`, "⋯", "Autre élément", "Types configurés dans SharePoint") : ""}</div>`;
      } else if (s.etape === 2) {
        const opts = s.branche === "AUTRE" ? autres.map((a) => ({ icone: "＋", libelle: a.titre })) : optionsBranche(s.branche, b.cible);
        corps = `<p class="muted">${s.branche === "MODULE" ? "Quel module ?" : s.branche === "AUTRE" ? "Quel élément ?" : "Quelle disposition ?"}
          ${b ? `<br><small>Sera ajouté ${ou(b.cible)}</small>` : ""}</p>
          <div class="constructeur-assistant-grille">${opts.map((o, i) => carte(`data-option="${i}"`, o.icone, o.libelle)).join("")}</div>`;
        pied = `<button type="button" class="btn btn-secondary" data-assistant-retour>← Retour</button>`;
      } else {
        const resume = s.branche === "AUTRE" ? s.option.libelle : `${b.libelle}${s.option ? ` · ${s.option.libelle}` : ""}`;
        corps = `<p><strong>${e(resume)}</strong><br><small class="muted">${s.branche === "AUTRE" ? `dans « ${e(n.titre)} »` : ou(b.cible)}</small></p>
          <label>Nom (visible seulement dans le constructeur)<input name="titre" value="${e(s.titre)}" maxlength="255" required></label>
          ${s.branche === "MODULE" ? `<p class="muted"><small>Le contenu (texte, image, lien…) se remplit ensuite dans l'onglet Contenu.</small></p>` : ""}`;
        pied = `<button type="button" class="btn btn-secondary" data-assistant-retour>← Retour</button>
          <button type="submit" class="btn btn-primary" data-assistant-valider>Ajouter</button>`;
      }
      dlg.innerHTML = `<form method="dialog" class="constructeur-ajout-rapide constructeur-assistant"><h3>＋ Ajouter</h3>${etapes()}${corps}
        <div class="constructeur-boutons">${pied}<button class="btn btn-secondary" type="button" data-c-fermer>Annuler</button></div></form>`;
      dlg.querySelector("[data-c-fermer]").addEventListener("click", () => dlg.close());
      dlg.querySelector("[data-assistant-retour]")?.addEventListener("click", () => {
        s.etape = s.etape === 3 && ["COLONNE", "ARTICLES"].includes(s.branche) ? 1 : s.etape - 1; rendre();
      });
      for (const x of dlg.querySelectorAll("[data-branche]")) x.addEventListener("click", () => {
        s.branche = x.dataset.branche; s.option = null;
        if (s.branche === "COLONNE") { s.titre = "Colonne"; s.etape = 3; }
        else if (s.branche === "ARTICLES") { s.titre = "Derniers articles"; s.etape = 3; } else s.etape = 2;
        rendre();
      });
      for (const x of dlg.querySelectorAll("[data-option]")) x.addEventListener("click", () => {
        const opts = s.branche === "AUTRE" ? autres.map((a) => ({ libelle: a.titre, titre: a.titre, ref: a.ref })) : optionsBranche(s.branche, b.cible);
        s.option = opts[Number(x.dataset.option)]; s.titre = s.option.titre; s.etape = 3; rendre();
        dlg.querySelector("input[name=titre]")?.select();
      });
      dlg.querySelector("form").addEventListener("submit", (ev) => {
        if (s.etape !== 3) return;
        ev.preventDefault();
        const titre = dlg.querySelector("input[name=titre]").value.trim() || s.titre;
        dlg.close();
        if (s.branche === "AUTRE") return ajoutRapide(ref, { etapes: [{ type: { ref: s.option.ref }, titre }] });
        return ajoutRapide(ref, planAssistant(s.branche, b.cible, s.option, titre));
      });
    };
    rendre();
    dlg.showModal();
  };
  const changerHistorique = async (retablir) => {
    const position = retablir ? positionBuilder + 1 : positionBuilder;
    const commande = historiqueBuilder[position];
    if (!commande) return message("Aucune action disponible dans cet historique temporaire.");
    if (commande.genre === "reglages") {
      const node = trouverNoeud(commande.ref)?.n;
      if (!node || node.verrouille) return message("La cible de ces réglages n'est plus disponible.");
      node.champs = structuredClone(retablir ? commande.apres : commande.avant);
      for (const appareil of ["", ...APPAREILS_APERCU.map((a) => a.cle)]) marquerBrouillon(node.ref, appareil);
      etat.design = { ref: node.ref };
      afficherPanneau();
      actualiserCanvas();
    } else {
      const c = retablir ? commande.retablir : commande.annuler;
      if (!await executer(c.action, c.params, { historiqueCommande: true })) return;
    }
    positionBuilder += retablir ? 1 : -1;
  };
  const copierGenerique = (styleSeulement) => {
    const node = trouverNoeud(etat.design?.ref)?.n;
    if (!node?.champs) return message("Sélectionnez un élément générique.");
    copieReglages = { typeRef: node.typeRef, champs: structuredClone(node.champs.filter((c) =>
      (!styleSeulement || c.categorie === "DESIGN") && codeChamp(c.cle) !== "IDCSS")) };
  };
  const collerGenerique = () => {
    const node = trouverNoeud(etat.design?.ref)?.n;
    if (!copieReglages || !node?.champs || node.verrouille) return message("Copiez les réglages puis sélectionnez une cible modifiable.");
    if (node.typeRef !== copieReglages.typeRef) return message("Copie incompatible : les types natifs SharePoint doivent correspondre.");
    const correspondances = copieReglages.champs.map((source) => ({ source, cible: node.champs.find((c) =>
      c.ref === source.ref && c.categorie === source.categorie && c.nature === source.nature) }));
    if (correspondances.some((c) => !c.cible)) return message("Les définitions SharePoint ont changé ; recopiez les réglages.");
    modifierChamps(node, () => {
      for (const { source, cible } of correspondances) {
        cible.valeur = source.valeur;
        cible.surcharges = structuredClone(source.surcharges);
        cible.mediaTypes = structuredClone(source.mediaTypes || {});
      }
      for (const appareil of ["", ...APPAREILS_APERCU.map((a) => a.cle)]) marquerBrouillon(node.ref, appareil);
    });
    afficherPanneau();
  };
  const enregistrerBrouillons = async () => {
    if (enCours || !brouillons.size) return;
    const recettes = [...brouillons].map(([ref, appareils]) => {
      const node = trouverNoeud(ref)?.n;
      if (!node) throw new Error("Élément en attente introuvable.");
      const lots = Object.fromEntries([...appareils].map((appareil) => [appareil, Object.fromEntries(node.champs.map((c) => {
        const v = (appareil ? c.surcharges?.[appareil] : c.valeur) ?? "";
        const erreur = erreurValeur(c, v);
        if (erreur) throw new Error(`${c.libelle} : ${erreur}`);
        const media = c.nature === "MEDIA" && v ? d.medias.find((m) => m.url === `/api/v1/media/${v}`)?.ref : v;
        if (c.nature === "MEDIA" && v && !media) throw new Error(`${c.libelle} : média hors périmètre.`);
        return [c.ref, media ?? ""];
      }))]));
      return { ref, appareil: "", valeurs: lots[""] || {}, surcharges: Object.fromEntries(Object.entries(lots).filter(([a]) => a)),
        champs: structuredClone(node.champs) };
    });
    enCours = true;
    for (const b of racine.querySelectorAll("button,input,textarea,select")) b.disabled = true;
    let frais = d;
    try {
      for (const { champs, ...params } of recettes) {
        const r = await actionConstruire(domaine, "builder.enregistrer", { ...params, attendu: frais.arbre.generique.empreinte });
        if (!r?.donnees || r.donnees.refus || r.donnees.erreur) throw new Error(r?.donnees?.refus || r?.donnees?.erreur || "Enregistrement non confirmé.");
        brouillons.delete(params.ref);
        frais = (await getConstruire(domaine, etat.conteneur))?.donnees;
        if (!frais?.arbre?.generique) throw new Error("Relecture de la composition indisponible.");
      }
      d = frais;
      empreinteHistorique = d.arbre.generique.empreinte;
      brouillonGenerique = false;
      Object.assign(etat, { message: "Tous les réglages configurés ont été enregistrés et relus dans SharePoint.", erreur: false });
    } catch (err) {
      Object.assign(etat, { message: err.message, erreur: true });
      try {
        const relecture = (await getConstruire(domaine, etat.conteneur))?.donnees;
        if (!relecture?.arbre?.generique) throw new Error("Composition relue introuvable.");
        frais = relecture;
      } catch (relectureErreur) {
        etat.message += ` Relecture impossible : ${relectureErreur.message}`;
      }
      d = frais;
      for (const recette of recettes.filter((r) => brouillons.has(r.ref))) {
        const node = trouverNoeud(recette.ref)?.n;
        if (node) node.champs = recette.champs;
      }
      brouillonGenerique = Boolean(brouillons.size);
    } finally {
      enCours = false;
      afficher();
    }
  };

  racine.addEventListener("click", async (ev) => {
    if (enCours) return;
    const ongletBuilder = ev.target.closest("[data-builder-onglet]");
    if (ongletBuilder && etat.design) {
      etat.design.ongletGenerique = ongletBuilder.dataset.builderOnglet;
      return afficherPanneau();
    }
    const d1 = ev.target.closest("[data-c-appareil],[data-design-onglet],[data-design-choix-appareil],[data-design-fermer],[data-design-reset],[data-design-media],[data-design-appliquer]");
    if (d1 && racine.contains(d1)) return actionDesign(d1);
    const replier = ev.target.closest("[data-c-replier]");
    if (replier && racine.contains(replier)) {
      const li = replier.closest(".constructeur-noeud");
      const refNoeud = li?.querySelector(":scope > [data-c-noeud]")?.dataset.cNoeud;
      const replie = li?.classList.toggle("constructeur-noeud--replie");
      if (refNoeud) replie ? replies.add(refNoeud) : replies.delete(refNoeud);
      return;
    }
    const choixVue = ev.target.closest("[data-c-vue]");
    if (choixVue && racine.contains(choixVue)) {
      etat.vue = choixVue.dataset.cVue === "liste" ? "liste" : "cartes";
      try { localStorage.setItem(CLE_VUE, etat.vue); } catch { /* stockage indisponible : choix limité à la session */ }
      return afficher();
    }
    const cible = ev.target.closest("[data-c-onglet],[data-c-action]");
    if (!cible) {
      const n = ev.target.closest("[data-c-noeud]");
      if (n && !ev.target.closest("input,select,textarea,button,a")) return ouvrirDesign(n.dataset.cNoeud);
    }
    if (!cible || !racine.contains(cible)) return;
    if (cible.dataset.cOnglet) {
      Object.assign(etat, { onglet: cible.dataset.cOnglet, message: "" });
      afficher();
      // Adresse et menu alignes sur l'onglet actif, sans relecture des donnees deja chargees.
      history.pushState(null, "", `#/cockpit/site/${encodeURIComponent(domaine)}/construire?onglet=${encodeURIComponent(etat.onglet)}`);
      document.dispatchEvent(new CustomEvent("dse:navigation-locale"));
      return;
    }
    const ref = cible.dataset.ref;
    switch (cible.dataset.cAction) {
      case "annuler-design": if (d.arbre?.generique) return changerHistorique(false); if (positionHistorique > 0) appliquerValeurs(historique[--positionHistorique]); return;
      case "retablir-design": if (d.arbre?.generique) return changerHistorique(true); if (positionHistorique + 1 < historique.length) appliquerValeurs(historique[++positionHistorique]); return;
      case "copier-reglages": return copierGenerique(false);
      case "coller-reglages": return collerGenerique();
      case "copier-style": if (d.arbre?.generique) return copierGenerique(true); copieStyle = valeursFormulaire(); if (!copieStyle) message("Sélectionnez un élément et ouvrez son Design."); return;
      case "coller-style": if (d.arbre?.generique) return collerGenerique(); if (copieStyle && valeursFormulaire()) { appliquerValeurs(copieStyle); memoriser(); } else message("Copiez d'abord un style, puis sélectionnez une cible."); return;
      case "builder-reset": {
        if (!confirm("Rétablir l'héritage pour les valeurs de cet appareil ? Enregistrez ensuite pour appliquer.")) return;
        const node = trouverNoeud(etat.design?.ref)?.n, appareil = etat.design?.appareilValeurs || "";
        if (!node || node.verrouille) return;
        modifierChamps(node, () => {
          for (const c of node.champs) { if (appareil) (c.surcharges ||= {})[appareil] = null; else c.valeur = null; }
          marquerBrouillon(node.ref, appareil);
        });
        return afficherPanneau();
      }
      case "enregistrer-design": {
        if (d.arbre?.generique) {
          try { await enregistrerBrouillons(); } catch (err) { message(err.message); }
          return;
        }
        const f = racine.querySelector("[data-design-form]");
        if (f) f.requestSubmit(); else message("Sélectionnez un élément à modifier. Les actions structurelles sont déjà enregistrées dans SharePoint.");
        return;
      }
      case "apercu-seul": etat.apercuSeul = !etat.apercuSeul; racine.querySelector("[data-constructeur]")?.classList.toggle("constructeur--apercu-seul", etat.apercuSeul); docApercu()?.body.classList.toggle("dse-apercu-seul", etat.apercuSeul); dimensionner(); return;
      case "builder-medias": return ouvrirFormulaire({ textes: [], listes: [{ cle: "media", libelle: "Médias SharePoint autorisés", options: d.medias || [] }] }, "Médias du site", () => {});
      case "builder-rapide": {
        const r = raccourcis(trouverNoeud(ref)?.n)[Number(cible.dataset.rapide)];
        return r ? ajoutRapide(ref, r) : undefined;
      }
      case "builder-ajout-direct": return executer("builder.ajouter", { ref, typeRef: cible.dataset.typeRef });
      case "builder-ajouter": {
        if (raccourcis(trouverNoeud(ref)?.n).length) return menuAjout(ref);
        const options = trouverNoeud(ref)?.n?.ajouts || [];
        if (!options.length) return message("Aucun type d'enfant actif n'est configuré dans SharePoint.");
        return ouvrirFormulaire({ textes: [], listes: [{ cle: "typeRef", libelle: "Type d'élément", options }] },
          "Ajouter un élément", (v) => executer("builder.ajouter", { ref, ...v }));
      }
      case "builder-dupliquer": return executer("builder.dupliquer", { ref });
      case "builder-monter":
      case "builder-descendre": {
        const source = trouverNoeud(ref);
        const freres = source?.parent?.enfants || [], i = freres.findIndex((n) => n.ref === ref);
        const haut = cible.dataset.cAction === "builder-monter", voisin = freres[i + (haut ? -1 : 1)];
        if (!source?.parent || !voisin) return;
        return executer("builder.deplacer", { ref, parent: source.parent.ref, [haut ? "avant" : "apres"]: voisin.ref });
      }
      case "builder-deplacer": {
        const source = trouverNoeud(ref), options = [];
        const parcourir = (n, chemin = "") => {
          if (n.ref === ref) return;
          const titre = `${chemin}${n.titre}`;
          if (!n.verrouille && n.ajouts?.some((t) => t.ref === source?.n.typeRef)) options.push({ ref: n.ref, titre });
          for (const x of n.enfants || []) parcourir(x, `${titre} › `);
        };
        parcourir(d.arbre.generique);
        if (!options.length) return message("Aucun parent autorisé dans cette composition.");
        return ouvrirFormulaire({ textes: [], listes: [{ cle: "parent", libelle: "Destination", obligatoire: true, options }] },
          "Déplacer l'élément", (v) => executer("builder.deplacer", { ref, ...v }));
      }
      case "builder-initialiser": return ouvrirFormulaire({
        textes: [], listes: [{ cle: "typeRef", libelle: "Type de racine", options: (d.builder?.types || []).filter((t) => t.racine) }]
      }, "Initialiser ce conteneur vide", (v) => executer("builder.initialiser", { ref, ...v }));
      case "builder-retirer": if (confirm("Retirer logiquement cet élément et son sous-arbre ? Aucune donnée ne sera supprimée.")) return executer("builder.desactiver", { ref }); return;
      case "ouvrir": if (!confirmerAbandon()) return; etat.conteneur = ref; etat.message = ""; historiqueBuilder = []; positionBuilder = -1; brouillons.clear(); brouillonGenerique = false; await charger().catch((err) => Object.assign(etat, { message: err.message, erreur: true })); empreinteHistorique = d.arbre?.generique?.empreinte || ""; return afficher();
      case "fermer": if (!confirmerAbandon()) return; etat.conteneur = ""; delete d.arbre; delete d.apercu; try { await charger(); } catch (err) { Object.assign(etat, { message: err.message, erreur: true }); } brouillonGenerique = false; brouillons.clear(); return afficher();
      case "ia": return message(MESSAGE_IA);
      case "design": return ouvrirDesign(ref);
      case "utilisations": { const z = racine.querySelector(`[data-utilisations="${CSS.escape(ref)}"]`); if (z) z.hidden = !z.hidden; return; }
      case "dupliquer": {
        const page = d.pages.find((p) => p.ref === ref);
        if (!page) return executer("conteneur.dupliquer", { ref });
        return ouvrirFormulaire({ textes: [{ cle: "url", libelle: "Adresse unique de la copie", valeur: "", max: 255 }], listes: [] },
          `Dupliquer « ${page.titre} » en brouillon`, (v) => executer("conteneur.dupliquer", { ref, url: v.url }));
      }
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
      if (d.arbre?.generique && etat.design) {
        etat.design.appareilValeurs = b.dataset.cAppareil;
        afficherPanneau();
      }
      return changerAppareil(b.dataset.cAppareil);
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
    if (s.matches?.("[data-c-recherche]")) { etat.recherche = s.value; return filtrerCartes(); }
    const fg = s.closest?.("[data-builder-valeurs]");
    if (fg) {
      if (enCours) return;
      if (s.matches("[data-builder-appareil]")) {
        etat.design.appareilValeurs = s.value;
        if (s.value) changerAppareil(s.value);
        afficherPanneau();
        return dimensionner();
      }
      const node = trouverNoeud(fg.dataset.ref)?.n;
      const c = node?.champs.find((x) => x.ref === (s.name || s.dataset.builderCouleur || s.dataset.builderCote));
      if (c && !node.verrouille) {
        const input = fg.elements.namedItem(c.ref);
        if (s.dataset.builderCouleur) input.value = s.value;
        if (s.dataset.builderCote) {
          const cotes = [...fg.querySelectorAll(`[data-builder-cote="${CSS.escape(c.ref)}"]`)].map((x) => x.value.trim());
          input.value = cotes.every((x) => !x) ? "" : cotes.join(" ");
        }
        const valeur = c.nature === "BOOLEEN" ? (s.value === "" ? null : s.value === "true") :
          c.nature === "MEDIA" ? /\/media\/(\d+)$/.exec(d.medias.find((m) => m.ref === s.value)?.url || "")?.[1] || null :
          c.nature === "NOMBRE" ? input.value === "" ? null : Number(input.value) : input.value || null;
        s.setCustomValidity?.(erreurValeur(c, valeur) || "");
        modifierChamps(node, () => {
          if (fg.dataset.appareil) (c.surcharges ||= {})[fg.dataset.appareil] = valeur;
          else c.valeur = valeur;
          if (c.nature === "MEDIA" && valeur) (c.mediaTypes ||= {})[valeur] = d.medias.find((m) => m.ref === s.value)?.type || "";
          marquerBrouillon(node.ref, fg.dataset.appareil);
        });
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
    if (s.matches?.("[data-c-filtre-etat]")) { etat.filtreEtat = s.value; return filtrerCartes(); }
    if (s.closest?.("[data-design-form]")) return apercuDesign();
    if (s.matches("[data-c-affecter]")) return executer("page.affecter", { page: s.dataset.page, type: s.dataset.cAffecter, ref: s.value });
    if (s.matches("[data-c-deplacer]") && s.value) return executer("element.deplacer", { ref: s.dataset.cDeplacer, colonne: s.value });
  });

  racine.addEventListener("submit", (ev) => {
    const f = ev.target;
    if (f.matches("[data-builder-valeurs]")) {
      ev.preventDefault();
      enregistrerBrouillons().catch((err) => message(err.message));
      return;
    }
    if (f.matches("[data-design-form]")) {
      ev.preventDefault();
      if (!f.reportValidity()) return;
      return executer("design.enregistrer", { ref: f.dataset.ref, valeurs: lireValeurs(f) });
    }
    if (f.matches("[data-c-creer]")) {
      ev.preventDefault();
      return executer("conteneur.creer", { type: f.dataset.cCreer, titre: f.titre.value.trim(), url: f.querySelector('[name="url"]')?.value.trim(),
        structureBase: f.querySelector('[name="structureBase"]')?.checked !== false });
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
    docApercu()?.body.classList.add("dse-builder-glisse");
  }
  function terminerGlisse() {
    glisse = null;
    docApercu()?.body.classList.remove("dse-builder-glisse");
    for (const x of docApercu()?.querySelectorAll(".dse-depot-actif") || []) x.classList.remove("dse-depot-actif");
  }
  function destinationDepot(ev) {
    const zone = ev.target.closest?.("[data-builder-depot]");
    const cible = zone || ev.target.closest?.("[data-c-noeud],[data-dse-ref]");
    const dest = trouverNoeud(cible?.dataset.ref || cible?.dataset.cNoeud || cible?.dataset.dseRef);
    if (!glisse || !dest || glisse.n.ref === dest.n.ref || dest.n.verrouille) return null;
    const position = zone?.dataset.builderDepot || (dest.n.typeRef === glisse.n.typeRef ? "avant" : "dans");
    const parent = position === "dans" ? dest.n : dest.parent;
    if (!parent || parent.verrouille) return null;
    if (glisse.n.type === "builder" && !parent.ajouts?.some((t) => t.ref === glisse.n.typeRef)) return null;
    let courant = trouverNoeud(parent.ref);
    while (courant) { if (courant.n.ref === glisse.n.ref) return null; courant = courant.parent ? trouverNoeud(courant.parent.ref) : null; }
    return { zone, parent, dest, position };
  }
  function autoriserDepot(ev) {
    for (const x of docApercu()?.querySelectorAll(".dse-depot-actif") || []) x.classList.remove("dse-depot-actif");
    const dest = destinationDepot(ev);
    if (!dest || enCours) return;
    ev.preventDefault();
    dest.zone?.classList.add("dse-depot-actif");
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
  }
  function deposer(ev) {
    const depot = destinationDepot(ev);
    if (!glisse || !depot || enCours) { terminerGlisse(); return; }
    ev.preventDefault();
    const source = glisse;
    terminerGlisse();
    return executer(source.n.type === "builder" ? "builder.deplacer" : "element.deplacer",
      { ref: source.n.ref, parent: depot.parent.ref, ...(depot.position !== "dans" ? { [depot.position]: depot.dest.n.ref } : {}) });
  }
  racine.addEventListener("dragstart", demarrerGlisse);
  racine.addEventListener("dragover", autoriserDepot);
  racine.addEventListener("drop", deposer);
  racine.addEventListener("dragend", terminerGlisse);

  // Changement d'onglet depuis le menu : sur place si aucun travail en cours, sinon navigation complete.
  racine.dseDomaine = domaine;
  racine.dseChangerOnglet = (onglet) => {
    if (d.arbre || enCours || brouillons.size || brouillonGenerique) return false;
    etat.onglet = ONGLETS.some((o) => o.cle === onglet) ? onglet : "entetes";
    etat.message = "";
    afficher();
    return true;
  };
  afficher();
}
