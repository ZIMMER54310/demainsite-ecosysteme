// Constructeur DSE (En-tetes / Pages / Footer) : interface pilotee par les donnees SharePoint renvoyees par le serveur.
// Le navigateur ne manipule que des references opaques signees ; chaque action est recontrolee cote serveur.
import { escapeHtml as e } from "../public/outils.js";
import { rendreBuilder, STYLES_BUILDER } from "../builder/rendu.js";
import { getConstruire, actionConstruire } from "../../services/cockpit.service.js";
import { rendreEnteteCockpit } from "./cockpit.js";

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
      <label>Créer un ${LIBELLES[type]} <input name="titre" required maxlength="255" placeholder="Nom du ${LIBELLES[type]}"></label>
      <button class="btn btn-primary" type="submit">➕ Créer</button>
    </form>` : ""}
    ${liste.length ? `<div class="constructeur-grille">${liste.map((c) => carteConteneur(d, type, c)).join("")}</div>`
      : `<p class="card muted">Aucun ${LIBELLES[type]} pour ce site dans SharePoint.</p>`}`;
}

function ongletPages(d) {
  const peut = (f) => ecrit(d, f);
  const options = (liste, actuel) => `<option value="">— Aucun —</option>${liste.filter((x) => x.etat.publiable)
    .map((x) => `<option value="${e(x.ref)}"${actuel?.ref === x.ref ? " selected" : ""}>${e(x.titre)}</option>`).join("")}`;
  if (!d.pages.length) return `<p class="card muted">Aucune page pour ce site dans SharePoint.</p>`;
  return `<div class="constructeur-grille">${d.pages.map((p) => `<article class="card constructeur-carte">
    <header><h3>${e(p.titre)}</h3>${badgeEtat(p.etat)}</header>
    <p class="muted">${e(p.url)} · ${p.sections} section(s)</p>
    <label>En-tête ${peut("entete") ? `<select data-c-affecter="entete" data-page="${e(p.ref)}">${options(d.entetes, p.entete)}</select>` : `<strong>${e(p.entete?.titre || "Aucun")}</strong>`}</label>
    <label>Footer ${peut("footer") ? `<select data-c-affecter="footer" data-page="${e(p.ref)}">${options(d.footers, p.footer)}</select>` : `<strong>${e(p.footer?.titre || "Aucun")}</strong>`}</label>
    <div class="constructeur-boutons">${bouton("🧱 Construire / aperçu", "ouvrir", `data-ref="${e(p.ref)}"`, "btn btn-primary")}
      ${peut("pages") ? bouton("✏️ Modifier", "proprietes", `data-ref="${e(p.ref)}"`) : ""}</div>
  </article>`).join("")}</div>
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
    ${bouton("⧉", "dupliquer-element", `${r} title="Dupliquer / créer une variante" aria-label="Dupliquer"`, "btn btn-mini")}
    ${n.etat.inactif || n.etat.brouillon ? bouton("Activer", "activer", r, "btn btn-mini") : bouton("Désactiver", "desactiver-element", r, "btn btn-mini")}
  </span>`;
}

function noeudHtml(d, n, peut, colonnes) {
  const entete = `<div class="constructeur-noeud-entete"><span class="constructeur-type">${LIBELLES[n.type]}</span>
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

export function documentApercu(composition) {
  const zone = (z, balise) => z?.sections?.length ? `<${balise}>${rendreBuilder({ mode: "builder", sections: z.sections }, { apiBase: "/api/v1", adapteurs: {} })}</${balise}>` : "";
  const corps = `${zone(composition?.entete, "header")}${rendreBuilder(composition, { apiBase: "/api/v1", adapteurs: {} })}${zone(composition?.footer, "footer")}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{margin:0;font-family:system-ui,sans-serif}${STYLES_BUILDER}</style></head>
    <body>${corps.trim() || `<p style="padding:24px;color:#667">Aperçu vide : ajoutez des modules actifs avec un contenu renseigné.</p>`}</body></html>`;
}

function editeur(d) {
  const a = d.arbre;
  const type = a.type;
  const peut = ecrit(d, FONCTION[type]);
  const colonnes = colonnesDe(a.sections);
  return `<div class="card constructeur-editeur">
    <header class="constructeur-editeur-entete">
      <div><span class="constructeur-type">${LIBELLES[type]}</span><h3>${e(a.titre)}</h3>${badgeEtat(a.etat)}</div>
      <div class="constructeur-boutons">${bouton("← Retour à la liste", "fermer")}
        ${peut && !a.etat.publiable ? bouton("✅ Valider et activer", "publier", `data-ref="${e(a.ref)}"`, "btn btn-primary") : ""}
        ${bouton("✨ Demander à Pasc ARA IA", "ia")}</div>
    </header>
    <ul class="constructeur-arbre">${a.sections.map((s) => noeudHtml(d, s, peut, colonnes)).join("") || `<li class="muted">Aucune section : commencez par ajouter une section.</li>`}</ul>
    ${peut ? `<form class="constructeur-ajout" data-c-ajout="section" data-ref="${e(a.ref)}">
      <input name="titre" maxlength="255" placeholder="Nom de la section" aria-label="Nom de la section">
      ${d.typesSection.length ? `<select name="typeSection" aria-label="Type de section"><option value="">Type standard</option>${d.typesSection.map((t) => `<option value="${e(t.ref)}">${e(t.titre)}</option>`).join("")}</select>` : ""}
      <button class="btn btn-primary" type="submit">➕ Ajouter une section</button></form>` : ""}
    <p class="muted">Les nouveaux éléments sont créés en brouillon : visibles dans l'aperçu, publiés uniquement après « Valider et activer ».</p>
  </div>
  <div class="card constructeur-apercus">
    <h3>Aperçu</h3>
    <div class="constructeur-apercus-cadres">
      <figure><figcaption>🖥 Ordinateur</figcaption><iframe class="constructeur-apercu constructeur-apercu--ordinateur" title="Aperçu ordinateur" sandbox="allow-same-origin" data-apercu></iframe></figure>
      <figure><figcaption>📱 Mobile</figcaption><iframe class="constructeur-apercu constructeur-apercu--mobile" title="Aperçu mobile" sandbox="allow-same-origin" data-apercu></iframe></figure>
    </div>
  </div>`;
}

export function rendreConstructeur(moi, d, etat = {}) {
  const onglet = ONGLETS.some((o) => o.cle === etat.onglet) ? etat.onglet : "entetes";
  const corps = d.arbre ? editeur(d)
    : onglet === "entetes" ? ongletConteneurs(d, "entete")
      : onglet === "footers" ? ongletConteneurs(d, "footer")
        : onglet === "pages" ? ongletPages(d)
          : onglet === "bibliotheque" ? ongletBibliotheque(d) : ongletCatalogue(d);
  return `<section class="cockpit constructeur" data-constructeur>
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

export function activerConstructeur(racine, { moi, domaine, donnees }) {
  const etat = { domaine, onglet: "entetes", conteneur: "", message: "", erreur: false };
  let d = donnees;

  const charger = async () => {
    const r = await getConstruire(domaine, etat.conteneur);
    d = r?.donnees || d;
    if (etat.conteneur && !d.arbre) etat.conteneur = "";
  };
  const afficher = () => {
    racine.innerHTML = rendreConstructeur(moi, d, etat);
    for (const cadre of racine.querySelectorAll("[data-apercu]")) cadre.srcdoc = documentApercu(d.apercu);
  };
  const executer = async (action, params) => {
    const zone = racine.querySelector("[data-c-message]");
    if (zone) zone.innerHTML = `<p class="muted">Enregistrement dans SharePoint…</p>`;
    for (const b of racine.querySelectorAll("button")) b.disabled = true;
    try {
      const r = await actionConstruire(domaine, action, params);
      Object.assign(etat, { message: `${r?.donnees?.message || "Action enregistrée."}${r?.donnees?.journal?.enregistre === false ? " (journal OBJ-JRN non confirmé)" : ""}`, erreur: false });
      await charger();
    } catch (err) {
      Object.assign(etat, { message: err.message || "L'action n'a pas abouti.", erreur: true });
      await charger().catch(() => {});
    }
    afficher();
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
    const cible = ev.target.closest("[data-c-onglet],[data-c-action]");
    if (!cible || !racine.contains(cible)) return;
    if (cible.dataset.cOnglet) { Object.assign(etat, { onglet: cible.dataset.cOnglet, message: "" }); return afficher(); }
    const ref = cible.dataset.ref;
    switch (cible.dataset.cAction) {
      case "ouvrir": etat.conteneur = ref; etat.message = ""; await charger().catch((err) => Object.assign(etat, { message: err.message, erreur: true })); return afficher();
      case "fermer": etat.conteneur = ""; delete d.arbre; delete d.apercu; await charger().catch(() => {}); return afficher();
      case "ia": return message(MESSAGE_IA);
      case "utilisations": { const z = racine.querySelector(`[data-utilisations="${CSS.escape(ref)}"]`); if (z) z.hidden = !z.hidden; return; }
      case "dupliquer": return executer("conteneur.dupliquer", { ref });
      case "publier": return executer("conteneur.publier", { ref });
      case "desactiver": if (confirm("Désactiver cet élément ? Il ne sera pas supprimé.")) return executer("conteneur.desactiver", { ref }); return;
      case "monter": return executer("element.deplacer", { ref, sens: "haut" });
      case "descendre": return executer("element.deplacer", { ref, sens: "bas" });
      case "dupliquer-element": return executer("element.dupliquer", { ref });
      case "activer": return executer("element.etat", { ref, etat: "actif" });
      case "desactiver-element": return executer("element.etat", { ref, etat: "inactif" });
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

  racine.addEventListener("change", (ev) => {
    const s = ev.target;
    if (s.matches("[data-c-affecter]")) return executer("page.affecter", { page: s.dataset.page, type: s.dataset.cAffecter, ref: s.value });
    if (s.matches("[data-c-deplacer]") && s.value) return executer("element.deplacer", { ref: s.dataset.cDeplacer, colonne: s.value });
  });

  racine.addEventListener("submit", (ev) => {
    const f = ev.target;
    if (f.matches("[data-c-creer]")) {
      ev.preventDefault();
      return executer("conteneur.creer", { type: f.dataset.cCreer, titre: f.titre.value.trim() });
    }
    if (f.matches("[data-c-ajout]")) {
      ev.preventDefault();
      const v = Object.fromEntries(new FormData(f).entries());
      const action = { section: "section.ajouter", ligne: "ligne.ajouter", module: "module.ajouter" }[f.dataset.cAjout];
      return executer(action, { ref: f.dataset.ref, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)) });
    }
  });

  afficher();
}
