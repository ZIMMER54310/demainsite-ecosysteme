"use strict";

/*
 * Constructeur DSE : un seul moteur pour les En-tetes, Pages et Footers.
 * Conteneur (Page | En-tete | Footer) > Section > Ligne > Colonne > Module (+ OBJ-MODULE-UTILISATION).
 *
 * - SharePoint est la source : listes, colonnes et valeurs de referentiels sont resolues dynamiquement.
 * - Les references techniques sont les ID natifs SharePoint ; le navigateur ne recoit que des references
 *   opaques signees (HMAC) et le serveur recontrole le site de chaque element avant toute ecriture.
 * - Aucune suppression : desactivation logique (OBJ-ACTIF), duplication = nouvel element.
 */

const crypto = require("crypto");
const dse = require("./dse");
const ecriture = require("./ecriture");
const B = require("./builder");
const R = require("./builder-recursif");
const { champ, relations, cleChamp, vrai } = require("./catalogue");

const SEL = crypto.randomBytes(32);
const signer = (v) => crypto.createHmac("sha256", SEL).update(String(v)).digest("hex").slice(0, 24);

const CONTENEURS = {
  entete: { liste: "OBJ-ENTETE-SITE", cle: "entetes", fonction: "entete", relation: "OBJ-ENTETE-SITE", libelle: "En-tête" },
  footer: { liste: "OBJ-FOOTER-SITE", cle: "footers", fonction: "footer", relation: "OBJ-FOOTER-SITE", libelle: "Footer" },
  page: { liste: "OBJ-PAGES-SITE", cle: "pages", fonction: "pages", relation: "OBJ-PAGES-SITE", libelle: "Page" },
  // Article : uniquement compose avec DSE-CONSTRUCTION (racine OBJ-BUILDER-ELEMENT -> OBJ-ARTICLE), jamais en mode historique.
  article: { liste: "OBJ-ARTICLE", cle: "articles", fonction: "articles", relation: "OBJ-ARTICLE", libelle: "Article" }
};
const NIVEAUX = {
  section: { liste: "OBJ-SECTION-SITE", cle: "sections", enfant: "ligne", libelle: "Section" },
  ligne: { liste: "OBJ-LIGNE-SITE", cle: "lignes", parent: "OBJ-SECTION-SITE", parentType: "section", enfant: "colonne", libelle: "Ligne" },
  colonne: { liste: "OBJ-COLONNE-SITE", cle: "colonnes", parent: "OBJ-LIGNE-SITE", parentType: "ligne", enfant: "module", libelle: "Colonne" },
  module: { liste: "OBJ-MODULE-SITE-PUBLIC", cle: "modules", parent: "OBJ-COLONNE-SITE", parentType: "colonne", libelle: "Module" }
};
const TYPES = { ...CONTENEURS, ...NIVEAUX };
const ETATS = ["OBJ-ACTIF", "OBJ-VALIDE", "OBJ-VEROUILLE"];

const rel = (el, nom) => relations(el, [cleChamp(nom)])[0] || null;
const rels = (el, nom) => relations(el, [cleChamp(nom)]);
const titreDe = (el) => String(el?._fields?.Title ?? "").trim();
const ordreDe = (el) => { const v = Number(champ(el, ["ORDREAFFICHAGE"])); return Number.isFinite(v) ? v : 0; };
const parOrdre = (a, b) => ordreDe(a) - ordreDe(b) || Number(a.id) - Number(b.id);
const texte = (el, nom) => { const v = champ(el, [cleChamp(nom)]); return v === null ? "" : String(v); };
const inactif = (el) => /^(NON|ARCHIV|SUPPRIM)/.test(cleChamp(rel(el, "OBJ-ACTIF")?.titre));
const brouillon = (el) => /^BROUILLON/.test(cleChamp(rel(el, "OBJ-ACTIF")?.titre));
const visibleApercu = (el) => !inactif(el);

const ref = (type, id) => `${type}.${signer(`${type}:${id}`)}`;
const referenceBuilder = (id, sorte) => ref(sorte === "media" ? "media" : `builder${sorte}`, id);
function resoudre(d, reference, typesAutorises = Object.keys(TYPES)) {
  const [type] = String(reference || "").split(".");
  if (!typesAutorises.includes(type) || !TYPES[type]) return null;
  const el = (d[TYPES[type].cle] || []).find((x) => ref(type, x.id) === reference);
  return el ? { type, el } : null;
}

/* ---------------- Arborescence ---------------- */

function parent(d, type, el) {
  if (type === "section") {
    for (const [t, def] of Object.entries(CONTENEURS)) {
      const r = rel(el, def.relation);
      if (r) return { type: t, el: (d[def.cle] || []).find((x) => x.id === r.id) || null };
    }
    return null;
  }
  const def = NIVEAUX[type];
  if (!def?.parent) return null;
  const r = rel(el, def.parent);
  const p = r ? (d[NIVEAUX[def.parentType].cle] || []).find((x) => x.id === r.id) : null;
  return p ? { type: def.parentType, el: p } : null;
}

function racine(d, type, el) {
  let courant = { type, el };
  for (let i = 0; i < 6 && courant?.el; i++) {
    if (CONTENEURS[courant.type]) return courant;
    courant = parent(d, courant.type, courant.el);
  }
  return null;
}

// Article : SITE-CIBLE (site unique officiel) sinon relation historique OBJ-SITE-PUBLIC ; plusieurs sites = ambigu, refuse.
const sitesArticle = (el) => { const cible = rel(el, "SITE-CIBLE"); return cible ? [cible.id] : rels(el, "OBJ-SITE-PUBLIC").map((s) => s.id); };
const siteDuConteneur = (c) => {
  if (c?.type !== "article") return rel(c?.el, "OBJ-SITE-PUBLIC")?.id || null;
  const sites = [...new Set(sitesArticle(c.el))];
  return sites.length === 1 ? sites[0] : null;
};
// La construction d'articles exige la relation native OBJ-BUILDER-ELEMENT.OBJ-ARTICLE dans SharePoint.
const relationArticleBuilder = (d) => (d.builderElements || []).some((x) =>
  (x._colonnes || []).some((c) => cleChamp(c.displayName) === "OBJARTICLE" || cleChamp(c.name) === "OBJARTICLE"));
const siteDe = (d, type, el) => siteDuConteneur(racine(d, type, el));

function enfantsDe(d, type, el) {
  if (CONTENEURS[type]) return (d.sections || []).filter((s) => rel(s, CONTENEURS[type].relation)?.id === el.id).sort(parOrdre);
  const enfant = NIVEAUX[type]?.enfant;
  if (!enfant) return [];
  return (d[NIVEAUX[enfant].cle] || []).filter((x) => rel(x, NIVEAUX[enfant].parent)?.id === el.id).sort(parOrdre);
}

const etat = (el) => ({
  actif: rel(el, "OBJ-ACTIF")?.titre || "Non renseigné",
  valide: rel(el, "OBJ-VALIDE")?.titre || "Non renseigné",
  publiable: B.publiable(el), inactif: inactif(el), brouillon: brouillon(el)
});

function utilisationsDe(d, moduleId) {
  return (d.utilisations || []).filter((u) => rel(u, "OBJ-MODULE-SITE-PUBLIC")?.id === moduleId);
}

function contenuDe(d, module) {
  const type = String(rel(module, "OBJMODULESITEPUBLICTYPE")?.titre || "").toUpperCase();
  const liste = B.LISTES_CONTENU[type];
  if (!liste) return { type, liste: null, element: null };
  const element = (d.contenus?.[liste] || []).find((c) => rel(c, "OBJ-MODULE-SITE-PUBLIC")?.id === module.id) || null;
  return { type, liste, element };
}

const contenusItems = (d, liste, moduleId) => liste
  ? (d.contenus?.[liste] || []).filter((x) => rel(x, "OBJ-MODULE-SITE-PUBLIC")?.id === moduleId) : [];

/* Elements a supprimer, les plus profonds d'abord (contenus et utilisations avant leur module, enfants avant parent). */
function arbreASupprimer(d, type, el) {
  const sortie = [];
  for (const enfant of enfantsDe(d, type, el)) sortie.push(...arbreASupprimer(d, NIVEAUX[type].enfant, enfant));
  if (type === "module") {
    for (const liste of Object.keys(d.contenus || {})) for (const x of contenusItems(d, liste, el.id)) sortie.push({ liste, id: x.id, el: x });
    for (const u of utilisationsDe(d, el.id)) sortie.push({ liste: "OBJ-MODULE-UTILISATION", id: u.id, el: u });
  }
  sortie.push({ liste: NIVEAUX[type].liste, id: el.id, el });
  return sortie;
}

/* Conteneur complet : sections (et tout leur contenu), composition Builder (valeurs puis elements, du plus profond
   au plus haut), puis le conteneur lui-meme. */
function conteneurASupprimer(d, type, el) {
  const sortie = [];
  for (const s of enfantsDe(d, type, el)) sortie.push(...arbreASupprimer(d, "section", s));
  const tous = d.builderElements || [];
  const racines = new Set(tous.filter((x) => R.lien(x, R.CIBLES[type]) === String(el.id) && !R.lien(x, "ELEMENT-PARENT")).map((x) => x.id));
  const elements = tous.filter((x) => racines.has(x.id) || racines.has(R.lien(x, "ELEMENT-RACINE")));
  const ids = new Set(elements.map((x) => x.id));
  const profondeur = (x) => { let n = 0, p = R.lien(x, "ELEMENT-PARENT"); while (p && ids.has(p) && n < 64) { n++; p = R.lien(tous.find((y) => y.id === p), "ELEMENT-PARENT"); } return n; };
  for (const v of (d.builderValeurs || []).filter((x) => ids.has(R.lien(x, "OBJ-BUILDER-ELEMENT")))) sortie.push({ liste: "OBJ-BUILDER-VALEUR", id: v.id, el: v });
  for (const x of elements.sort((a, b) => profondeur(b) - profondeur(a))) sortie.push({ liste: "OBJ-BUILDER-ELEMENT", id: x.id, el: x });
  sortie.push({ liste: CONTENEURS[type].liste, id: el.id, el });
  return sortie;
}

function sauvegarderSuppression(siteId, c, items) {
  const fs = require("node:fs"), path = require("node:path");
  const dossier = process.env.DSE_DOSSIER_SUPPRESSIONS || path.join(__dirname, "..", ".sauvegardes", "suppressions");
  fs.mkdirSync(dossier, { recursive: true, mode: 0o700 });
  const fichier = path.join(dossier, `${new Date().toISOString().replace(/[:.]/g, "-")}-${c.type}-${c.el.id}.json`);
  fs.writeFileSync(fichier, JSON.stringify({ siteId: String(siteId), type: c.type, id: c.el.id, titre: titreDe(c.el),
    items: items.map((x) => ({ liste: x.liste, id: x.id, champs: x.el._fields || {} })) }, null, 1), { mode: 0o600, flag: "wx" });
  return fichier;
}

// Visibilite par appareil : masque responsive du style propre + (modules) colonnes VISIBLE-ORDINATEUR/TABLETTE/MOBILE.
function appareilsDe(d, type, el) {
  const presetId = rel(el, "OBJ-STYLE-PRESET")?.id;
  const resp = presetId ? B.responsiveDepuisPreset(presetId, d.responsifs, {}) : {};
  return Object.fromEntries(["ORDINATEUR", "TABLETTE", "MOBILE"].map((a) => {
    const v = type === "module" ? champ(el, [`VISIBLE-${a}`]) : null;
    return [a, !resp[a]?.masque && (v === null || v === undefined || v === "" || vrai(v))];
  }));
}

function noeud(d, type, el) {
  const base = { ref: ref(type, el.id), type, titre: titreDe(el) || `${TYPES[type].libelle} sans titre`, ordre: ordreDe(el), etat: etat(el),
    appareils: appareilsDe(d, type, el) };
  if (type === "ligne") base.structure = rel(el, "OBJ-LIGNE-STRUCTURE")?.titre || "100";
  if (type === "colonne") base.largeur = champ(el, ["LARGEUR"]);
  if (type === "section") base.typeSection = rel(el, "OBJ-SECTION-TYPE")?.titre || "STANDARD";
  if (type === "module") {
    const c = contenuDe(d, el);
    base.typeModule = c.type || "Non renseigné";
    base.formulaire = Boolean(c.liste);
    base.contenuRenseigne = Boolean(c.element);
    // Le public n'affiche que le contenu actif + valide : un module valide au contenu en brouillon est vide pour les visiteurs.
    const items = contenusItems(d, c.liste, el.id);
    base.contenuPublic = items.some(B.publiable);
    base.contenuBrouillon = items.filter((x) => !B.publiable(x) && !inactif(x)).length;
    base.utilisations = utilisationsDe(d, el.id).length;
    base.modele = rel(el, "OBJ-MODELE-BUILDER")?.titre || null;
    return base;
  }
  base.enfants = enfantsDe(d, type, el).map((x) => noeud(d, NIVEAUX[type].enfant, x));
  return base;
}

function arbre(d, type, el, perimetre) {
  const root = R.trouverRacine(d, siteDuConteneur({ type, el }), type, el.id);
  return { ref: ref(type, el.id), type, titre: titreDe(el), etat: etat(el),
    ...(type === "page" ? { bandeauChantier: vrai(champ(el, [cleChamp("AFFICHER-BANDEAU-CHANTIER")])) } : {}),
    ...(root ? { generique: R.arbre(d, root, { reference: referenceBuilder,
      mediaVisible: (m) => Boolean(perimetre && mediaAutorise(m, perimetreBuilder(perimetre, siteDuConteneur({ type, el })))) }) } : {}),
    sections: enfantsDe(d, type, el).map((s) => noeud(d, "section", s)) };
}

/* ---------------- Portee des medias / modeles ---------------- */

/*
 * Portee lue depuis OBJ-MEDIA-PORTEE (GLOBAL / CLIENT / SITE) :
 * GLOBAL = tous ; CLIENT = client du site courant ; SITE = site courant. Le Super Administrateur voit tout.
 */
function mediaAutorise(m, perimetre) {
  if (!B.publiable(m)) return false;
  if (perimetre.superAdmin) return true;
  const portee = cleChamp(rel(m, "OBJ-MEDIA-PORTEE")?.titre);
  if (portee === "GLOBAL") return true;
  if (portee === "CLIENT") return rels(m, "OBJ-CLIENT").some((c) => perimetre.clients.has(c.id));
  if (portee === "SITE") return rels(m, "OBJ-SITE-PUBLIC").some((s) => perimetre.sites.has(s.id));
  return false;
}

const perimetreBuilder = (p, siteId) => ({ ...p, superAdmin: false, sites: siteId ? new Set([String(siteId)]) : p.sites });

function modeleDisponible(m, perimetre) {
  if (!B.publiable(m)) return false;
  const sites = rels(m, "OBJ-SITE-PUBLIC").map((s) => s.id);
  return perimetre.superAdmin || sites.some((s) => perimetre.sites.has(s)) || Boolean(champ(m, ["GLOBAL"]) === true);
}

/* ---------------- Vue generale du constructeur ---------------- */

function vue(d, perimetre) {
  const duSite = (el) => perimetre.sites.has(rel(el, "OBJ-SITE-PUBLIC")?.id);
  const pages = (d.pages || []).filter((p) => rels(p, "OBJ-SITE-PUBLIC").some((s) => perimetre.sites.has(s.id))).sort(parOrdre);
  const nombreSections = (type, el) => {
    const root = rels(el, "OBJ-SITE-PUBLIC").filter((s) => perimetre.sites.has(s.id))
      .map((s) => R.trouverRacine(d, s.id, type, el.id)).find(Boolean);
    if (!root) return enfantsDe(d, type, el).length;
    const types = R.index(d).types;
    return R.sousArbre(d, root).filter((x) => R.f(types.get(R.lien(x, "OBJ-BUILDER-TYPE")), "CLE-RENDU") === "SECTION").length;
  };
  const conteneur = (type) => (d[CONTENEURS[type].cle] || []).filter(duSite).sort(parOrdre).map((el) => ({
    ref: ref(type, el.id), titre: titreDe(el) || `${CONTENEURS[type].libelle} sans titre`, etat: etat(el),
    noteCourte: texte(el, "NOTE-COURTE"),
    sections: nombreSections(type, el),
    pages: pages.filter((p) => rel(p, CONTENEURS[type].relation)?.id === el.id).map((p) => ({ ref: ref("page", p.id), titre: titreDe(p) }))
  }));
  const parId = (cle, type) => (id) => { const el = (d[cle] || []).find((x) => x.id === id); return el ? { ref: ref(type, el.id), titre: titreDe(el) } : null; };
  const enteteDe = parId("entetes", "entete");
  const footerDe = parId("footers", "footer");
  const medias = (d.medias || []).filter((m) => mediaAutorise(m, perimetre));
  const logo = (d.logos || []).filter((l) => perimetre.sites.has(rel(l, "OBJ-SITE")?.id)).sort((a, b) => Number(B.publiable(b)) - Number(B.publiable(a)))[0] || null;
  const modeles = d.modeles || [];
  return {
    builder: {
      configure: Boolean((d.builderTypes || []).some(R.actif) && (d.builderRegles || []).some(R.actif)),
      types: (d.builderTypes || []).filter(R.actif).map((t) => ({
        ref: ref("buildertype", t.id), titre: R.titre(t), conteneur: R.f(t, "EST-CONTENEUR") === true,
        racine: R.f(t, "EST-RACINE") === true, rendu: String(R.f(t, "CLE-RENDU") || "").toUpperCase(),
        enfants: (d.builderTypes || []).filter((x) => R.actif(x) && (() => { try { return R.regleDe(d, t.id, x.id); } catch { return false; } })())
          .map((x) => ref("buildertype", x.id))
      })),
      articles: relationArticleBuilder(d),
      messageArticles: relationArticleBuilder(d) ? null : MESSAGE_RELATION_ARTICLE,
      message: (d.builderTypes || []).some(R.actif) ? null :
        "Les types, règles et champs génériques Builder sont encore vides dans SharePoint. Le constructeur existant reste disponible."
    },
    entetes: conteneur("entete"),
    footers: conteneur("footer"),
    articles: (d.articles || []).filter((a) => perimetre.sites.has(siteDuConteneur({ type: "article", el: a })))
      .sort((a, b) => ordreDe(a) - ordreDe(b) || Number(b.id) - Number(a.id)).map((a) => {
        const root = R.trouverRacine(d, siteDuConteneur({ type: "article", el: a }), "article", a.id);
        const types = R.index(d).types;
        return { ref: ref("article", a.id), titre: titreDe(a) || "Article sans titre", etat: etat(a),
          edition: d.listeArticlesId ? require("./edition").referenceElement(d.listeArticlesId, a.id) : null,
          chemin: texte(a, "URL"), noteCourte: texte(a, "NOTE-COURTE"), construit: Boolean(root),
          sections: root ? R.sousArbre(d, root).filter((x) => R.f(types.get(R.lien(x, "OBJ-BUILDER-TYPE")), "CLE-RENDU") === "SECTION").length : 0 };
      }),
    pages: pages.map((p) => ({
      ref: ref("page", p.id), titre: titreDe(p), url: texte(p, "URL") || "/", etat: etat(p),
      bandeauChantier: vrai(champ(p, [cleChamp("AFFICHER-BANDEAU-CHANTIER")])),
      sections: nombreSections("page", p),
      entete: rel(p, "OBJ-ENTETE-SITE") ? enteteDe(rel(p, "OBJ-ENTETE-SITE").id) : null,
      footer: rel(p, "OBJ-FOOTER-SITE") ? footerDe(rel(p, "OBJ-FOOTER-SITE").id) : null
    })),
    // Bulles Pasc ARA IA au survol des icones d'action (OBJ-AIDE-ACTION : Title = code de l'action).
    aidesActions: Object.fromEntries((d.aidesActions || []).filter(B.publiable).sort(parOrdre)
      .map((a) => [titreDe(a).toLowerCase(), { icone: texte(a, "ICONE"), libelle: texte(a, "LIBELLE"), aide: texte(a, "AIDE") }])),
    // Catalogue visuel : libelle, icone, ordre et categorie viennent de SharePoint (OBJ-MODULE-CATEGORIE).
    categoriesModules: (d.categoriesModules || []).filter(B.publiable).sort(parOrdre)
      .map((c) => ({ cle: `categorie.${signer(`categorie:${c.id}`)}`, titre: titreDe(c), icone: texte(c, "ICONE"), description: texte(c, "NOTE-COURTE") })),
    typesModules: (d.types || []).filter(B.publiable).sort(parOrdre).map((t) => {
      const code = titreDe(t).toUpperCase();
      const cat = rel(t, "OBJ-MODULE-CATEGORIE");
      const categorie = cat && (d.categoriesModules || []).some((c) => String(c.id) === String(cat.id) && B.publiable(c))
        ? `categorie.${signer(`categorie:${cat.id}`)}` : null;
      return { code, libelle: texte(t, "LIBELLE") || code, icone: texte(t, "ICONE"), categorie,
        formulaire: Boolean(B.LISTES_CONTENU[code]), description: texte(t, "NOTE-COURTE"),
        aide: texte(t, "AIDE-CONTENU"), aideDesign: texte(t, "AIDE-DESIGN") };
    }).filter((t) => t.code),
    structures: (d.structures || []).filter(B.publiable).sort(parOrdre)
      .map((s) => ({ ref: `structure.${signer(`structure:${s.id}`)}`, titre: titreDe(s), colonnes: Number(champ(s, ["NOMBRECOLONNES"])) || 1 })),
    typesSection: (d.typesSection || []).filter(B.publiable).sort(parOrdre)
      .map((s) => ({ ref: `typeSection.${signer(`typeSection:${s.id}`)}`, titre: titreDe(s) })),
    modeles: {
      disponibles: modeles.filter((m) => modeleDisponible(m, perimetre)).map((m) => ({
        ref: `modele.${signer(`modele:${m.id}`)}`, titre: titreDe(m), type: rel(m, "OBJ-MODELE-TYPE")?.titre || null,
        module: Boolean(rel(m, "OBJ-MODULE-SITE-PUBLIC"))
      })),
      enAttente: modeles.filter((m) => !B.publiable(m)).length
    },
    medias: medias.map((m) => ({
      ref: `media.${signer(`media:${m.id}`)}`, titre: titreDe(m), type: rel(m, "OBJ-MEDIA-TYPE")?.titre || null,
      portee: rel(m, "OBJ-MEDIA-PORTEE")?.titre || null, url: `/api/v1/media/${encodeURIComponent(m.id)}`,
      builderAutorise: mediaAutorise(m, perimetreBuilder(perimetre, perimetre.info?.id))
    })),
    logo: logo ? {
      titre: titreDe(logo), etat: etat(logo),
      media: rel(logo, "OBJ-MEDIA") ? { titre: rel(logo, "OBJ-MEDIA").titre, url: `/api/v1/media/${encodeURIComponent(rel(logo, "OBJ-MEDIA").id)}` } : null
    } : null
  };
}

/* Apercu (ordinateur / tablette / mobile) : meme moteur que le public, brouillons inclus, elements desactives exclus.
 * Chaque element recoit sa reference signee (_ref) pour le reperage du panneau Design ; aucun ID natif n'est expose. */
const TYPE_CONTENEUR = { entete: "ENTETE", footer: "FOOTER", page: "PAGE", article: "PAGE" };
function apercu(d, siteId, type, el, appareil, perimetre, { visiteur = false } = {}) {
  const site = { id: String(siteId) };
  const ctx = B.contexteComposition(d, site);
  // visiteur : meme regle que le site public (actif + valide), sinon brouillons inclus.
  const options = { appareil: B.APPAREILS.includes(String(appareil || "").toUpperCase()) ? String(appareil).toUpperCase() : null, visible: visiteur ? B.publiable : visibleApercu, ctx };
  const marquer = (t, { _id, ...x }) => _id ? { ...x, _ref: ref(t, _id) } : x;
  const marquerSections = (elements) => elements.map((s) => ({ ...marquer("section", s),
    lignes: s.lignes.map((l) => ({ ...marquer("ligne", l), colonnes: l.colonnes.map((c) => ({ ...marquer("colonne", c),
      modules: c.modules.map((m) => marquer("module", m)) })) })) }));
  const sections = (t, e) => marquerSections(B.composerSections(d, site, enfantsDe(d, t, e), options));
  const zone = (t, e, sectionsForce = null) => {
    const root = R.trouverRacine(d, siteId, t, e.id);
    return { sections: root ? [] : sectionsForce || sections(t, e),
      ...(root ? { noeuds: [R.arbre(d, root, { reference: referenceBuilder,
        mediaVisible: (m) => Boolean(perimetre && mediaAutorise(m, perimetreBuilder(perimetre, siteId))) })] } : {}),
      ...B.styleElement(ctx, TYPE_CONTENEUR[t], e), _ref: ref(t, e.id) };
  };
  const theme = B.themeGlobal(ctx);
  // Contexte en lecture seule : en-tete et pied de page affiches autour de l'element edite (jamais modifiables ici).
  const duSite = (x) => rels(x, "OBJ-SITE-PUBLIC").some((s) => String(s.id) === String(siteId));
  const pagesSite = (d.pages || []).filter((p) => !inactif(p) && duSite(p)).sort(parOrdre);
  const actifDe = (t, r) => r ? (d[CONTENEURS[t].cle] || []).find((x) => String(x.id) === String(r.id) && !inactif(x)) : null;
  const parDefaut = (t) => pagesSite.map((p) => actifDe(t, rel(p, CONTENEURS[t].relation))).find(Boolean)
    || (d[CONTENEURS[t].cle] || []).filter((x) => !inactif(x) && duSite(x)).sort(parOrdre)[0];
  const lecture = (t, c, origine) => c ? { ...zone(t, c), titre: titreDe(c), origine } : null;
  if (type === "entete" || type === "footer") {
    const autre = type === "entete" ? "footer" : "entete";
    const page = pagesSite.find((p) => String(rel(p, CONTENEURS[type].relation)?.id) === String(el.id));
    const lie = page && actifDe(autre, rel(page, CONTENEURS[autre].relation));
    return { mode: "builder", ...zone(type, el), theme, contexte: { [autre]: lecture(autre, lie || parDefaut(autre), lie ? "lie" : "site"), page: page ? titreDe(page) : "" } };
  }
  if (type !== "page") {
    // Article (ou autre conteneur) : en-tete et pied de page habituels du site, a titre d'exemple.
    return { mode: "builder", ...zone(type, el), theme,
      contexte: { entete: lecture("entete", parDefaut("entete"), "site"), footer: lecture("footer", parDefaut("footer"), "site") } };
  }
  const root = R.trouverRacine(d, siteId, "page", el.id);
  const pageSections = root ? null : marquerSections(B.composerModulesAdaptesPage(d, site, el,
    B.composerSections(d, site, enfantsDe(d, "page", el), options), options));
  const lie = (t) => { const c = actifDe(t, rel(el, CONTENEURS[t].relation)); return c ? lecture(t, c, "lie") : lecture(t, parDefaut(t), "site"); };
  return { mode: "builder", ...zone("page", el, pageSections), theme, contexte: { entete: lie("entete"), footer: lie("footer") } };
}

/* ======================================================================
   ACTIONS (ecriture Graph) — tout est recalcule cote serveur
   ====================================================================== */

class Ecrivain {
  constructor(g, { apercu = false, attendus = [] } = {}) {
    this.g = g; this.colonnes = new Map(); this.refs = new Map(); this.crees = [];
    this.apercu = apercu; this.modifications = [];
    this.attendus = new Map(attendus.map((x) => [`${x.listeId}:${x.itemId}`, x.etag]));
  }

  async version(listeId, id, noms) {
    const champs = [...new Set(["Title", ...noms])];
    let version = null;
    for (let i = 0; i < champs.length; i += 8) {
      const r = await dse.graphSansCache(this.g.token,
        `/sites/${this.g.siteGraphId}/lists/${listeId}/items/${encodeURIComponent(id)}?$expand=fields($select=${champs.slice(i, i + 8).join(",")})`);
      const etag = r.eTag || r["@odata.etag"] || r.fields?.["@odata.etag"];
      if (!etag || version && version.etag !== etag) throw Object.assign(new Error("Les données ont changé pendant leur lecture. Relisez l'aperçu."), { refus: true });
      version = { etag, fields: { ...version?.fields, ...r.fields } };
    }
    return version;
  }

  liste(nom) {
    const l = dse.trouverListe(this.g.listes, [nom]);
    if (!l) throw Object.assign(new Error(`Structure ${nom} indisponible.`), { refus: true });
    return l;
  }

  async cols(nom) {
    const l = this.liste(nom);
    if (!this.colonnes.has(l.id)) {
      this.colonnes.set(l.id, await dse.collecter(this.g.token, `/sites/${this.g.siteGraphId}/lists/${l.id}/columns` +
        "?$select=id,name,displayName,description,hidden,readOnly,required,lookup,boolean,text,number,dateTime,calculated,columnGroup,choice"));
    }
    return this.colonnes.get(l.id);
  }

  /* Colonne Lookup de `nom` dont le nom affiche correspond a `relation` (et pointe vers la liste `cible` si connue). */
  async lookup(nom, relation, cible = relation) {
    const cols = await this.cols(nom);
    const listeCible = dse.trouverListe(this.g.listes, [cible]);
    const c = cols.find((x) => x.lookup && !x.lookup.allowMultipleValues && cleChamp(x.displayName) === cleChamp(relation) &&
      (!listeCible || x.lookup.listId === listeCible.id));
    return c ? `${c.name}LookupId` : null;
  }

  async simple(nom, affiche) {
    const c = (await this.cols(nom)).find((x) => !x.lookup && !x.readOnly && cleChamp(x.displayName) === cleChamp(affiche));
    return c ? c.name : null;
  }

  /* Valeur de referentiel resolue par libelle (jamais par ID code en dur). */
  async valeur(liste, motif) {
    const cle = `${liste}:${motif}`;
    if (!this.refs.has(cle)) {
      const l = this.liste(liste);
      const items = await ecriture.collecterFrais(this.g, `/sites/${this.g.siteGraphId}/lists/${l.id}/items?$expand=fields($select=Title)&$top=200`);
      const it = items.find((i) => motif.test(cleChamp(i.fields?.Title)));
      this.refs.set(cle, it ? String(it.id) : null);
    }
    return this.refs.get(cle);
  }

  async etats(nom, mode) {
    const champs = {};
    const actif = mode === "actif" ? await this.valeur("OBJ-ACTIF", /^OUI/)
      : mode === "inactif" ? await this.valeur("OBJ-ACTIF", /^NON/)
        : (await this.valeur("OBJ-ACTIF", /^BROUILLON/)) || (await this.valeur("OBJ-ACTIF", /^NON/));
    const valide = mode === "actif" ? await this.valeur("OBJ-VALIDE", /^OUI/) : mode === "brouillon" ? await this.valeur("OBJ-VALIDE", /^NON/) : null;
    const verrou = mode === "brouillon" ? await this.valeur("OBJ-VEROUILLE", /^NON/) : null;
    for (const [relation, v] of [["OBJ-ACTIF", actif], ["OBJ-VALIDE", valide], ["OBJ-VEROUILLE", verrou]]) {
      if (!v) continue;
      const n = await this.lookup(nom, relation);
      if (n) champs[n] = v;
    }
    if (mode !== "inactif" && !Object.keys(champs).length) throw Object.assign(new Error("Référentiel d'état indisponible."), { refus: true });
    return champs;
  }

  async creer(nom, champs) {
    if (this.apercu || this.attendus.size) throw Object.assign(new Error("Cette opération de création ne peut pas être préparée dans cet aperçu."), { refus: true });
    const l = this.liste(nom);
    const r = await dse.graphEcriture(this.g.token, "POST", `/sites/${this.g.siteGraphId}/lists/${l.id}/items`, { fields: champs });
    const id = String(r?.id || "");
    if (!id) throw new Error("Création non confirmée par SharePoint.");
    this.crees.push({ liste: nom, id });
    const relu = await this.version(l.id, id, Object.keys(champs));
    if (ecriture.hash(ecriture.valeursDe(relu.fields, Object.keys(champs))) !==
      ecriture.hash(ecriture.valeursDe(champs, Object.keys(champs)))) throw new Error("La création doit être vérifiée : sa relecture diffère.");
    this.modifications.push({ listeId: l.id, itemId: id, titre: relu.fields.Title, avant: {}, apres: champs, etag: relu.etag });
    return id;
  }

  async maj(nom, id, champs) {
    if (!Object.keys(champs).length) return;
    const l = this.liste(nom);
    const noms = Object.keys(champs);
    const version = await this.version(l.id, id, noms);
    const cle = `${l.id}:${id}`;
    if (this.attendus.size && !this.attendus.has(cle)) throw Object.assign(
      new Error("Un nouvel élément doit être modifié. Relisez l'aperçu complet avant confirmation."), { refus: true });
    if (this.attendus.has(cle) && this.attendus.get(cle) !== version.etag) {
      throw Object.assign(new Error("Les données ont changé depuis l'aperçu. Aucune nouvelle modification de cet élément n'a été faite."), { refus: true });
    }
    this.modifications.push({ listeId: l.id, itemId: String(id), titre: version.fields.Title,
      etag: version.etag, avant: ecriture.valeursDe(version.fields, noms), apres: champs });
    if (this.apercu) return;
    await dse.graphEcriture(this.g.token, "PATCH", `/sites/${this.g.siteGraphId}/lists/${l.id}/items/${encodeURIComponent(id)}/fields`, champs, version.etag);
    const relu = await this.version(l.id, id, noms);
    if (ecriture.hash(ecriture.valeursDe(relu.fields, noms)) !== ecriture.hash(ecriture.valeursDe(champs, noms))) {
      throw new Error("La modification est enregistrée mais sa relecture diffère. Vérifiez avant de recommencer.");
    }
    if (this.attendus.has(cle)) this.attendus.set(cle, relu.etag);
  }

  /* Suppression definitive d'un element (jamais en apercu ni sur confirmation preparee). */
  async supprimer(nom, id) {
    if (this.apercu || this.attendus.size) throw Object.assign(new Error("Cette suppression ne peut pas être préparée dans cet aperçu."), { refus: true });
    const l = this.liste(nom);
    const version = await this.version(l.id, id, ["Title"]);
    await dse.graphEcriture(this.g.token, "DELETE", `/sites/${this.g.siteGraphId}/lists/${l.id}/items/${encodeURIComponent(id)}`, null, version.etag);
    this.modifications.push({ listeId: l.id, itemId: String(id), titre: version.fields.Title, etag: version.etag,
      avant: { Title: version.fields.Title }, apres: { SUPPRIME: true } });
  }

  /* Champs copiables d'un element (duplication) : valeurs simples et Lookups simples, hors etats et parent. */
  async copiables(nom, el, exclure = []) {
    const cols = await this.cols(nom);
    const f = el._fields || {};
    const exclus = new Set([...ETATS, ...exclure].map(cleChamp));
    const champs = {};
    for (const c of cols) {
      if (c.readOnly || c.hidden || c.calculated || String(c.name).startsWith("_") || c.name === "Title" || /^(ContentType|Attachments|ComplianceAssetId)$/.test(c.name)) continue;
      if (exclus.has(cleChamp(c.displayName))) continue;
      if (c.lookup) {
        if (c.lookup.allowMultipleValues) continue;
        const v = f[`${c.name}LookupId`];
        if (v !== undefined && v !== null && v !== "") champs[`${c.name}LookupId`] = String(v);
      } else if (f[c.name] !== undefined && f[c.name] !== null) {
        champs[c.name] = f[c.name];
      }
    }
    return champs;
  }
}

/* Formulaire dynamique d'un contenu de module : colonnes texte + Lookups simples (medias filtres par portee). */
async function formulaireContenu(w, nomListe, perimetre, d) {
  const cols = await w.cols(nomListe);
  // Aide sous chaque champ : description de la colonne SharePoint.
  const aideDe = (nom) => String(cols.find((c) => c.name === nom)?.description || "").trim();
  const image = nomListe === "OBJ-MODULE-IMAGE";
  const textes = ecriture.champsModifiables(cols).filter((c) => !/^ORDRE/i.test(c.nom) && !(image && ["LEGENDE", "ALIGNEMENT"].includes(cleChamp(c.nom))))
    .map((c) => ({ ...c, aide: aideDe(c.nom) }));
  // Colonne Title + colonne TITRE affichee : la premiere devient le nom de repere pour eviter deux champs « Titre ».
  if (nomListe === "OBJ-MODULE-IMAGE") for (const c of textes) {
    if (c.nom === "Title") {
      c.libelle = "Nom de repère";
      c.aide = "Ce nom sert uniquement à retrouver ce contenu dans le cockpit. Il n’est pas affiché au public.";
    } else if (cleChamp(c.nom) === "TITREIMAGE") {
      c.libelle = "Titre de l’image pour le public";
      c.aide = "Ce titre accompagne l’image sur le site. Cochez « Afficher le titre au public » pour le rendre visible ; sa position et sa typographie se règlent dans Design.";
    } else if (cleChamp(c.nom) === "TEXTE") {
      c.libelle = "Texte de l’image pour le public";
      c.aide = "Ce texte décrit ou complète l’image sur le site. Cochez « Afficher le texte au public » pour le rendre visible ; sa position et sa typographie se règlent dans Design.";
    }
  }
  if (textes.filter((c) => c.libelle === "Titre").length > 1) for (const c of textes) if (c.nom === "Title") c.libelle = "Nom de repère";
  const libre = (c) => !c.readOnly && !c.hidden && !String(c.name).startsWith("_");
  // Texte riche : saisi en texte simple puis converti en HTML minimal sur (paragraphes).
  for (const c of cols) {
    if (!libre(c) || c.text?.textType !== "richText") continue;
    textes.push({ cle: ecriture.cleChamp(c.name), nom: c.name, libelle: ecriture.libelleChamp(c), obligatoire: !!c.required,
      multiligne: true, max: 8000, type: "riche", aide: aideDe(c.name) });
  }
  // Colonnes Lien SharePoint (Graph n'expose aucune facette de type) : reconnues par leur nom affiche *URL.
  for (const c of cols) {
    if (!libre(c) || c.lookup || c.text || c.number || c.boolean || c.dateTime || c.calculated || c.choice) continue;
    if (!/URL$/i.test(String(c.displayName || ""))) continue;
    textes.push({ cle: ecriture.cleChamp(c.name), nom: c.name, libelle: ecriture.libelleChamp(c).replace(/ url$/i, " (lien)"),
      obligatoire: !!c.required, multiligne: false, max: 255, type: "lien", aide: aideDe(c.name) });
  }
  const exclus = new Set([...ETATS, "OBJ-MODULE-SITE-PUBLIC"].map(cleChamp));
  const listes = [];
  for (const c of cols) {
    if (!c.lookup || c.lookup.allowMultipleValues || c.readOnly || c.hidden || exclus.has(cleChamp(c.displayName)) || image && cleChamp(c.displayName) === "ALIGNEMENT") continue;
    const cible = w.g.listes.find((l) => l.id === c.lookup.listId);
    if (!cible) continue;
    if (image && cleChamp(cible.displayName) === cleChamp("OBJ-ALIGNEMENT")) continue;
    let options;
    if (cleChamp(cible.displayName) === cleChamp("OBJ-MEDIA")) {
      options = (d.medias || []).filter((m) => mediaAutorise(m, perimetre) &&
        (!image || /IMAGE|PHOTO|FOND|BANNI|LOGO|FAVICON|AFFICHE/i.test(cleChamp(rel(m, "OBJ-MEDIA-TYPE")?.titre) || "IMAGE")))
        .map((m) => ({ id: m.id, titre: titreDe(m), media: true }));
    } else {
      const items = await ecriture.collecterFrais(w.g, `/sites/${w.g.siteGraphId}/lists/${cible.id}/items?$expand=fields($select=Title)&$top=200`);
      options = items.map((i) => ({ id: String(i.id), titre: String(i.fields?.Title || "") })).filter((o) => o.titre);
    }
    listes.push({ cle: `l${signer(`champ:${c.name}`).slice(0, 10)}`, nom: `${c.name}LookupId`, libelle: String(c.displayName || "").replace(/^OBJ[-_ ]?/i, "").replace(/[-_]+/g, " "),
      obligatoire: Boolean(c.required), aide: aideDe(c.name), choisirImage: image && cleChamp(cible.displayName) === cleChamp("OBJ-MEDIA"), options });
  }
  return { textes, listes, image, titreImage: textes.find((c) => cleChamp(c.nom) === "TITREIMAGE")?.nom,
    legende: image ? cols.find((c) => cleChamp(c.displayName) === "LEGENDE" && !c.readOnly)?.name : undefined };
}

function adresseLibre(titre, prises) {
  const base = String(titre).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "page";
  let url = `/${base}/`;
  for (let i = 2; prises.has(url); i++) url = `/${base}-${i}/`;
  return url;
}

function formulairePublic(form, valeurs = {}) {
  return {
    textes: form.textes.map((c) => ({ cle: c.cle, libelle: c.libelle, aide: c.aide || "", obligatoire: c.obligatoire, multiligne: c.multiligne, max: c.max,
      affichage: form.image ? ({ TITREIMAGE: "afficherTitreImage", TEXTE: "afficherTexteImage" })[cleChamp(c.nom)] : undefined,
      valeur: c.type === "lien" ? String(valeurs[c.nom]?.Url ?? "") : c.type === "riche" ? ecriture.htmlVersTexte(valeurs[c.nom]) :
        String((form.image && c.nom === form.titreImage ? valeurs[c.nom] || valeurs[form.legende] : valeurs[c.nom]) ?? "") })),
    listes: form.listes.map((l) => ({ cle: l.cle, libelle: l.libelle, aide: l.aide || "", obligatoire: l.obligatoire,
      choisirImage: Boolean(l.choisirImage),
      options: l.options.map((o) => ({ ref: signer(`opt:${l.nom}:${o.id}`), titre: o.titre, url: o.media ? `/api/v1/media/${encodeURIComponent(o.id)}` : null })),
      valeur: valeurs[l.nom] ? signer(`opt:${l.nom}:${valeurs[l.nom]}`) : "" }))
  };
}

function validerFormulaire(form, valeurs) {
  const textesSaisis = Object.fromEntries(Object.entries(valeurs || {}).filter(([k]) => form.textes.some((c) => c.cle === k)));
  const { erreurs, propres } = ecriture.validerValeurs(form.textes, textesSaisis);
  for (const c of form.textes) {
    if (!Object.hasOwn(propres, c.nom)) continue;
    const v = propres[c.nom];
    if (c.type === "riche") propres[c.nom] = ecriture.texteVersHtml(v);
    if (c.type !== "lien") continue;
    if (!v) { propres[c.nom] = null; continue; }
    // Lien accepte : https absolu uniquement, sans espace.
    if (/\s/.test(v) || !/^https:\/\/[^/\s]+/i.test(v)) {
      erreurs.push(`${c.libelle} : lien invalide (adresse https://… attendue).`); delete propres[c.nom]; continue;
    }
    propres[c.nom] = { Url: v, Description: v };
  }
  for (const l of form.listes) {
    if (!Object.hasOwn(valeurs || {}, l.cle)) continue;
    const brut = String(valeurs[l.cle] || "");
    if (!brut) {
      if (l.obligatoire) erreurs.push(`${l.libelle} : valeur obligatoire.`);
      else if (l.choisirImage) propres[l.nom] = null;
      continue;
    }
    const o = l.options.find((x) => signer(`opt:${l.nom}:${x.id}`) === brut);
    if (!o) { erreurs.push(`${l.libelle} : choix non autorisé.`); continue; }
    propres[l.nom] = o.id;
  }
  for (const c of form.cases || []) {
    if (!Object.hasOwn(valeurs || {}, c.cle)) continue;
    if (typeof valeurs[c.cle] !== "boolean") { erreurs.push(`${c.libelle} : valeur invalide.`); continue; }
    propres[c.nom] = valeurs[c.cle];
  }
  const connues = new Set([...form.textes.map((c) => c.cle), ...form.listes.map((l) => l.cle), ...(form.cases || []).map((c) => c.cle)]);
  if (form.image) for (const cle of ["afficherTitreImage", "afficherTexteImage"]) connues.add(cle);
  if (Object.keys(valeurs || {}).some((k) => !connues.has(k))) erreurs.push("Un champ inconnu a été transmis.");
  return { erreurs: [...new Set(erreurs)], propres };
}

/* ---------------- Helpers d'ecriture structurelle ---------------- */

async function prochainOrdre(freres) {
  return (freres.reduce((m, x) => Math.max(m, ordreDe(x)), 0) || 0) + 10;
}

async function creerNiveau(w, type, parentType, parentId, { titre, ordre, extra = {}, mode = "brouillon" }) {
  const def = NIVEAUX[type];
  const champs = { Title: titre, ...(await w.etats(def.liste, mode)), ...extra };
  const relationParent = type === "section" ? CONTENEURS[parentType].relation : def.parent;
  const nomParent = await w.lookup(def.liste, relationParent);
  if (!nomParent) throw Object.assign(new Error(`Relation ${relationParent} indisponible sur ${def.liste}.`), { refus: true });
  champs[nomParent] = String(parentId);
  const nomOrdre = await w.simple(def.liste, "ORDRE-AFFICHAGE");
  if (nomOrdre && ordre !== undefined) champs[nomOrdre] = ordre;
  return w.creer(def.liste, champs);
}

async function creerUtilisation(w, moduleId, colonneId, ordre, titre, mode = "brouillon") {
  const L = "OBJ-MODULE-UTILISATION";
  const nMod = await w.lookup(L, "OBJ-MODULE-SITE-PUBLIC");
  const nCol = await w.lookup(L, "OBJ-COLONNE-SITE");
  if (!nMod || !nCol) throw Object.assign(new Error("Structure OBJ-MODULE-UTILISATION incomplète."), { refus: true });
  const champs = { Title: titre, [nMod]: String(moduleId), [nCol]: String(colonneId), ...(await w.etats(L, mode)) };
  const nOrdre = await w.simple(L, "ORDRE-AFFICHAGE");
  if (nOrdre) champs[nOrdre] = ordre;
  return w.creer(L, champs);
}

// Structure de base creee d'office (en brouillon) a la creation d'un conteneur : section -> lignes (grille) -> modules.
const STRUCTURES_BASE = {
  entete: [{ titre: "En-tête", typeSection: "HEADER", lignes: [{ grille: "100", modules: [["HEADER", "Logo et menu"]] }] }],
  footer: [{ titre: "Pied de page", typeSection: "FOOTER", lignes: [
    { grille: "33-33-33", modules: [["TEXTE", "À propos"], ["TEXTE", "Liens utiles"], ["TEXTE", "Contact"]] },
    { grille: "100", modules: [["FOOTER", "Mentions et copyright"]] }] }],
  page: [
    { titre: "Bandeau (Hero)", typeSection: "PLEINE-LARGEUR", lignes: [{ grille: "100", modules: [["HERO", "Hero"]] }] },
    { titre: "Contenu", typeSection: "STANDARD", lignes: [{ grille: "100", modules: [["TITRE", "Titre"], ["TEXTE", "Texte"]], memeColonne: true }] },
    { titre: "Appel à l'action", typeSection: "STANDARD", lignes: [{ grille: "100", modules: [["CTA", "Appel à l'action"]] }] }]
};

async function creerStructureBase(w, d, type, conteneurId) {
  const modele = STRUCTURES_BASE[type];
  if (!modele) return 0;
  const code = (x) => String(champ(x, ["CODE"]) || titreDe(x) || "").toUpperCase();
  const typesSection = (d.typesSection || []).filter(B.publiable);
  const structures = (d.structures || []).filter(B.publiable);
  const typesModule = (d.types || []).filter(B.publiable);
  const nTypeSection = typesSection.length ? await w.lookup("OBJ-SECTION-SITE", "OBJ-SECTION-TYPE") : null;
  const nStruct = await w.lookup("OBJ-LIGNE-SITE", "OBJ-LIGNE-STRUCTURE");
  const nLarg = await w.simple("OBJ-COLONNE-SITE", "LARGEUR");
  const nTypeModule = await w.lookup("OBJ-MODULE-SITE-PUBLIC", "OBJ-MODULE-SITE-PUBLIC-TYPE");
  const nPage = type === "page" ? await w.lookup("OBJ-MODULE-SITE-PUBLIC", "OBJ-PAGES-SITE") : null;
  let n = 0;
  for (const [iS, s] of modele.entries()) {
    const ts = typesSection.find((x) => code(x) === s.typeSection);
    const idS = await creerNiveau(w, "section", type, conteneurId, { titre: s.titre, ordre: (iS + 1) * 10,
      extra: nTypeSection && ts ? { [nTypeSection]: String(ts.id) } : {} });
    n++;
    for (const [iL, l] of s.lignes.entries()) {
      const st = structures.find((x) => code(x) === l.grille);
      const titreL = `${s.titre} · ${l.grille}`;
      const idL = await creerNiveau(w, "ligne", "section", idS, { titre: titreL, ordre: (iL + 1) * 10,
        extra: nStruct && st ? { [nStruct]: String(st.id) } : {} });
      const largeurs = l.grille.split("-").map(Number);
      const colonnes = [];
      for (const [iC, largeur] of largeurs.entries()) {
        colonnes.push(await creerNiveau(w, "colonne", "ligne", idL, { titre: `${titreL} · colonne ${iC + 1}`, ordre: (iC + 1) * 10,
          extra: nLarg ? { [nLarg]: largeur } : {} }));
      }
      for (const [iM, [typeModule, titreM]] of l.modules.entries()) {
        const tm = typesModule.find((t) => titreDe(t).toUpperCase() === typeModule);
        if (!tm || !nTypeModule) continue;
        const colonne = l.memeColonne ? colonnes[0] : colonnes[iM % colonnes.length];
        const ordre = l.memeColonne ? (iM + 1) * 10 : 10;
        const extra = { [nTypeModule]: String(tm.id), ...(nPage ? { [nPage]: String(conteneurId) } : {}) };
        const idM = await creerNiveau(w, "module", "colonne", colonne, { titre: titreM, ordre, extra });
        await creerUtilisation(w, idM, colonne, ordre, titreM);
        n++;
      }
    }
  }
  return n;
}

async function synchroniserUtilisations(w, d, moduleId, champsModule) {
  const L = "OBJ-MODULE-UTILISATION";
  const utils = utilisationsDe(d, moduleId);
  for (const u of utils) {
    const champs = {};
    for (const [relation, valeur] of Object.entries(champsModule)) {
      const n = relation === "ORDRE-AFFICHAGE" ? await w.simple(L, relation) : await w.lookup(L, relation);
      if (n) champs[n] = valeur;
    }
    await w.maj(L, u.id, champs);
  }
  return utils.length;
}

/* Copie profonde d'un sous-arbre (section, ligne, colonne ou module) : nouveaux elements en brouillon. */
async function copierArbre(w, d, type, el, parentType, parentId, ordre, suffixe) {
  const def = NIVEAUX[type];
  const exclure = type === "section" ? Object.values(CONTENEURS).map((c) => c.relation) : [def.parent];
  const extra = await w.copiables(def.liste, el, [...exclure, "ORDRE-AFFICHAGE"]);
  const nouveau = await creerNiveau(w, type, parentType, parentId, { titre: `${titreDe(el) || def.libelle}${suffixe}`, ordre, extra });
  if (type === "module") {
    await creerUtilisation(w, nouveau, parentId, ordre, `${titreDe(el) || "Module"}${suffixe}`);
    const c = contenuDe(d, el);
    if (c.element) {
      const champs = await w.copiables(c.liste, c.element, ["OBJ-MODULE-SITE-PUBLIC"]);
      const nMod = await w.lookup(c.liste, "OBJ-MODULE-SITE-PUBLIC");
      if (nMod) await w.creer(c.liste, { Title: titreDe(c.element) || titreDe(el) || "Contenu", ...champs, ...(await w.etats(c.liste, "brouillon")), [nMod]: nouveau });
    }
    return nouveau;
  }
  for (const enfant of enfantsDe(d, type, el)) {
    await copierArbre(w, d, def.enfant, enfant, type, nouveau, ordreDe(enfant), "");
  }
  return nouveau;
}

/* Elements d'un sous-arbre (pour activation en cascade des brouillons). */
function descendants(d, type, el) {
  const out = [];
  for (const enfant of enfantsDe(d, type, el)) {
    const t = CONTENEURS[type] ? "section" : NIVEAUX[type].enfant;
    out.push({ type: t, el: enfant }, ...descendants(d, t, enfant));
  }
  return out;
}

/* ---------------- Design (OBJ-STYLE-PRESET / OBJ-STYLE-RESPONSIVE) ---------------- */

/*
 * Reglages Design autorises (liste blanche) : cle d'interface -> [groupe, colonne du preset, nature, bornes].
 * Les libelles de colonnes sont resolus dynamiquement (nom affiche) ; aucune valeur metier n'est fixee ici.
 */
const COTES = [["Haut", "HAUT"], ["Droite", "DROITE"], ["Bas", "BAS"], ["Gauche", "GAUCHE"]];
const DESIGN = {
  couleurTexte: ["TYPO", "OBJ-COULEUR-TEXTE", "couleur"], police: ["TYPO", "OBJ-POLICE", "police"],
  tailleTexte: ["TYPO", "TAILLE-TEXTE", "nombre", 8, 96], poidsPolice: ["TYPO", "POIDS-POLICE", "poids"],
  soulignement: ["TYPO", "SOULIGNEMENT", "ouinon"],
  soulignementCouleur: ["TYPO", "SOULIGNEMENT-COULEUR", "hex"],
  soulignementStyle: ["TYPO", "SOULIGNEMENT-STYLE", "choix"],
  soulignementEpaisseur: ["TYPO", "SOULIGNEMENT-EPAISSEUR", "nombre", 0, 10],
  soulignementDistance: ["TYPO", "SOULIGNEMENT-DISTANCE", "nombre", 0, 20],
  stylePolice: ["TYPO", "STYLE-POLICE", "choix"], hauteurLigne: ["TYPO", "HAUTEUR-LIGNE", "nombre", 1, 3],
  espacementLettres: ["TYPO", "ESPACEMENT-LETTRES", "nombre", -5, 20], transformation: ["TYPO", "TRANSFORMATION-TEXTE", "choix"],
  alignement: ["TYPO", "ALIGNEMENT", "alignement"],
  couleurFond: ["FOND", "OBJ-COULEUR-FOND", "couleur"], fondMedia: ["FOND", "OBJ-MEDIA-ARRIERE-PLAN", "media"],
  fondPosition: ["FOND", "FOND-POSITION", "choix"], fondTaille: ["FOND", "FOND-TAILLE", "choix"], fondRepetition: ["FOND", "FOND-REPETITION", "choix"],
  fondOpacite: ["FOND", "FOND-OPACITE", "nombre", 0, 100], couleurDegrade: ["FOND", "OBJ-COULEUR-DEGRADE", "couleur"],
  degradeAngle: ["FOND", "DEGRADE-ANGLE", "nombre", 0, 360],
  largeur: ["DIMENSIONS", "LARGEUR", "nombre", 0, 100], largeurMinimale: ["DIMENSIONS", "LARGEUR-MINIMALE", "nombre", 0, 2400],
  largeurMaximale: ["DIMENSIONS", "LARGEUR-MAXIMALE", "nombre", 0, 2400], hauteur: ["DIMENSIONS", "HAUTEUR", "nombre", 0, 4000],
  hauteurMinimale: ["DIMENSIONS", "HAUTEUR-MINIMALE", "nombre", 0, 4000], hauteurMaximale: ["DIMENSIONS", "HAUTEUR-MAXIMALE", "nombre", 0, 4000],
  ...Object.fromEntries(COTES.flatMap(([k, c]) => [[`marge${k}`, ["ESPACEMENT", `MARGE-${c}`, "nombre", 0, 400]], [`padding${k}`, ["ESPACEMENT", `PADDING-${c}`, "nombre", 0, 400]]])),
  bordureLargeur: ["BORDURE", "BORDURE-LARGEUR", "nombre", 0, 20], bordureStyle: ["BORDURE", "BORDURE-STYLE", "choix"],
  couleurBordure: ["BORDURE", "OBJ-COULEUR-BORDURE", "couleur"], bordureRayon: ["BORDURE", "BORDURE-RAYON", "nombre", 0, 200],
  ombre: ["OMBRE", "OMBRE", "ouinon"], ombreX: ["OMBRE", "OMBRE-X", "nombre", -100, 100], ombreY: ["OMBRE", "OMBRE-Y", "nombre", -100, 100],
  ombreFlou: ["OMBRE", "OMBRE-FLOU", "nombre", 0, 200], ombreEtalement: ["OMBRE", "OMBRE-ETALEMENT", "nombre", -100, 100],
  couleurOmbre: ["OMBRE", "OBJ-COULEUR-OMBRE", "couleur"], justification: ["ALIGNEMENT", "JUSTIFICATION", "choix"],
  survolTexte: ["SURVOL", "OBJ-COULEUR-TEXTE-SURVOL", "couleur"], survolFond: ["SURVOL", "OBJ-COULEUR-FOND-SURVOL", "couleur"],
  survolBordure: ["SURVOL", "OBJ-COULEUR-BORDURE-SURVOL", "couleur"]
};
// Surcharges responsive disponibles (colonnes de OBJ-STYLE-RESPONSIVE).
const RESPONSIVE = ["largeur", "largeurMaximale", "hauteurMinimale", "tailleTexte", "alignement", "couleurTexte", "couleurFond", "bordureRayon",
  ...COTES.flatMap(([k]) => [`marge${k}`, `padding${k}`]), "masque"];
const DESIGN_RESPONSIVE = { ...DESIGN, masque: ["", "MASQUE", "ouinon"] };
const APPAREILS_SURCHARGE = ["TABLETTE", "MOBILE"];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const TYPES_DESIGN = ["entete", "footer", "page", "section", "ligne", "colonne", "module"];

function typeStyleDe(d, type, el) {
  if (TYPE_CONTENEUR[type]) return TYPE_CONTENEUR[type];
  if (type === "module") return B.typeStyle(contenuDe(d, el).type);
  return type.toUpperCase();
}

/* Style imbrique (moteur) -> valeurs plates (formulaire). */
function plat(style = {}, polices = []) {
  const v = {};
  for (const cle of Object.keys(B.DETAILS_DESIGN)) if (style[cle] !== undefined && style[cle] !== null) v[cle] = style[cle];
  for (const cle of ["soulignementCouleur", "soulignementStyle", "soulignementEpaisseur", "soulignementDistance"]) if (style[cle] !== undefined && style[cle] !== null) v[cle] = style[cle];
  for (const cle of ["typoTitre", "typoTexte"]) if (style[cle]) v[cle] = plat(style[cle], polices);
  for (const k of ["couleurTexte", "couleurFond", "couleurBordure", "couleurDegrade", "tailleTexte", "poidsPolice", "soulignement", "stylePolice", "hauteurLigne",
    "espacementLettres", "transformation", "alignement", "fondPosition", "fondTaille", "fondRepetition", "fondOpacite", "degradeAngle", "largeur",
    "largeurMinimale", "largeurMaximale", "hauteur", "hauteurMinimale", "hauteurMaximale", "bordureLargeur", "bordureStyle", "bordureRayon", "justification", "masque"]) {
    if (style[k] !== undefined && style[k] !== null) v[k] = style[k];
  }
  const police = style.police || style.policeFamille;
  if (police) v.police = (polices.find((p) => p.famille.toUpperCase() === String(police).toUpperCase()) || {}).ref || "";
  for (const [k, c] of COTES) {
    if (style.marge?.[c.toLowerCase()] !== undefined) v[`marge${k}`] = style.marge[c.toLowerCase()];
    if (style.padding?.[c.toLowerCase()] !== undefined) v[`padding${k}`] = style.padding[c.toLowerCase()];
  }
  if (style.ombre) Object.assign(v, { ombre: true, ombreX: style.ombre.x, ombreY: style.ombre.y, ombreFlou: style.ombre.flou, ombreEtalement: style.ombre.etalement, couleurOmbre: style.ombre.couleur });
  if (style.survol) Object.assign(v, { survolTexte: style.survol.couleurTexte, survolFond: style.survol.couleurFond, survolBordure: style.survol.couleurBordure });
  if (style.fondMedia) v.fondMedia = `media.${signer(`media:${style.fondMedia}`)}`;
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== null));
}

const policesDe = (d) => (d.polices || []).filter((p) => !inactif(p)).sort(parOrdre).map((p) => ({
  ref: `police.${signer(`police:${p.id}`)}`, id: p.id, titre: titreDe(p), famille: String(champ(p, ["FAMILLE"]) || champ(p, ["CODE"]) || "").trim()
})).filter((p) => p.famille);

// Le preset est-il propre a l'element ? (sinon une variante est creee : l'original n'est jamais modifie)
function presetPropre(d, preset, type, el) {
  if (!preset || !B.publiable(preset)) return false;
  const utilisateurs = Object.values(TYPES).flatMap((t) => (d[t.cle] || []).filter((x) => rel(x, "OBJ-STYLE-PRESET")?.id === preset.id).map((x) => `${t.cle}:${x.id}`));
  if (utilisateurs.some((u) => u !== `${TYPES[type].cle}:${el.id}`)) return false;
  if ((d.themes || []).some((t) => rel(t, "OBJ-STYLE-PRESET")?.id === preset.id)) return false;
  if ((d.presets || []).some((p) => rel(p, "PRESET-PARENT")?.id === preset.id)) return false;
  return true;
}

/* ---------------- Execution d'une action ---------------- */

const FONCTION_PAR_RACINE = { entete: "entete", footer: "footer", page: "pages", article: "articles" };
const MESSAGE_RELATION_ARTICLE = "La construction des articles nécessite la colonne de recherche « OBJ-ARTICLE » (liste OBJ-ARTICLE) dans OBJ-BUILDER-ELEMENT. Elle n'existe pas encore dans SharePoint.";
// Droits dynamiques : une action du constructeur sur un article correspond aux operations Articles existantes.
const OPERATIONS_ARTICLE = {
  creer: ["builder.initialiser", "builder.ajouter", "builder.dupliquer"],
  modifier: ["builder.enregistrer", "builder.deplacer", "builder.restaurer", "design.lire", "design.preset",
    "design.enregistrer", "contenu.formulaire", "contenu.enregistrer"],
  publier: ["builder.publier", "builder.reactiver", "builder.desactiver", "conteneur.publier", "element.etat"]
};
// Le renommage reutilise les droits « modifier » existants ; la suppression definitive exige le droit ADMINISTRER (element.etat).
const ACTION_DROIT = { "element.renommer": "element.deplacer", "builder.renommer": "builder.enregistrer", "ligne.colonnes": "ligne.ajouter",
  "element.supprimer": "element.etat", "conteneur.supprimer": "conteneur.desactiver" };
const actionDroit = (action) => ACTION_DROIT[action] || action;
const operationArticle = (action) => {
  action = actionDroit(action);
  const suffixe = Object.keys(OPERATIONS_ARTICLE).find((k) => OPERATIONS_ARTICLE[k].includes(action));
  return suffixe ? `articles.${suffixe}` : null;
};

/*
 * perimetre : { sites:Set(ID natifs du groupe), clients:Set, superAdmin, peut(fonction) }.
 * Retour : { refus } | { erreur, status } | { message, journal, cree? }.
 */
async function executer({ d, perimetre, siteId, action, params = {}, apercu = false, attendus = [], ecrivain }) {
  const p = params && typeof params === "object" ? params : {};
  const g = await ecriture.contexteGraph();
  const w = ecrivain || new Ecrivain(g, { apercu, attendus });

  // Element cible + controle de site (le site de l'element doit appartenir au perimetre demande).
  const cible = (types, reference) => {
    const r = resoudre(d, reference, types);
    if (!r) return { refus: "Élément introuvable dans ce site." };
    const rac = racine(d, r.type, r.el);
    if (!rac || !perimetre.sites.has(siteDuConteneur(rac))) return { refus: "Élément hors de votre périmètre." };
    if (!perimetre.peut(FONCTION_PAR_RACINE[rac.type])) return { refus: "Action non autorisée pour votre profil." };
    if (!["design.lire", "contenu.formulaire"].includes(action)) {
      let courant = r;
      while (courant?.el) {
        if (/^OUI/.test(cleChamp(rel(courant.el, "OBJ-VEROUILLE")?.titre))) return { refus: "Élément ou parent verrouillé." };
        courant = parent(d, courant.type, courant.el);
      }
    }
    return { ...r, racine: rac };
  };
  const res = (message, details = {}) => ({ message, nouveau: details, crees: w.crees, modifications: w.modifications });

  if (action.startsWith("builder.")) {
    let parametres = p;
    if (action === "builder.initialiser") {
      const c = cible(["page", "entete", "footer", "article"], p.ref);
      if (c.refus) return c;
      if (c.type === "article" && !relationArticleBuilder(d)) return { refus: MESSAGE_RELATION_ARTICLE };
      if (enfantsDe(d, c.type, c.el).length) return { refus: "Le conteneur possède une composition existante : aucune migration automatique." };
      parametres = { ...p, type: c.type, id: c.el.id, titre: titreDe(c.el) };
    }
    const resultat = await require("./builder-recursif-ecriture").executer({
      d, w, p: parametres, action, siteId,
      reference: referenceBuilder,
      autoriser: (type, id) => {
        const c = cible([type], ref(type, id));
        return !c.refus;
      },
      mediaAutorise: (m) => mediaAutorise(m, perimetreBuilder(perimetre, siteId))
    });
    return { ...resultat, modifications: w.modifications };
  }

  switch (action) {
    case "conteneur.creer": {
      const type = String(p.type || "");
      if (!["entete", "footer", "page"].includes(type)) return { refus: "Type de conteneur non autorisé." };
      if (!perimetre.peut(CONTENEURS[type].fonction)) return { refus: "Action non autorisée pour votre profil." };
      const titre = String(p.titre || "").trim().slice(0, 255);
      if (!titre) return { erreur: "Le titre est obligatoire.", status: 400 };
      const def = CONTENEURS[type];
      const nSite = await w.lookup(def.liste, "OBJ-SITE-PUBLIC");
      if (!nSite) return { refus: "Relation au site indisponible." };
      const champs = { Title: titre, [nSite]: String(siteId), ...(await w.etats(def.liste, "brouillon")) };
      if (type === "page") {
        const prises = new Set((d.pages || []).filter((x) => rels(x, "OBJ-SITE-PUBLIC").some((s) => s.id === String(siteId))).map((x) => texte(x, "URL")));
        const url = String(p.url || "").trim() || adresseLibre(titre, prises);
        if (!/^\/[A-Za-z0-9/_-]*$/.test(url) || prises.has(url)) {
          return { erreur: "Adresse de page invalide ou déjà utilisée sur ce site.", status: 400 };
        }
        const nUrl = await w.simple(def.liste, "URL");
        if (!nUrl) return { refus: "Colonne URL indisponible." };
        champs[nUrl] = url;
      }
      const nNote = await w.simple(def.liste, "NOTE-COURTE");
      if (nNote && p.noteCourte) champs[nNote] = String(p.noteCourte).slice(0, 255);
      const id = await w.creer(def.liste, champs);
      if (p.structureBase === false) return res(`${def.libelle} créé en brouillon.`, { ref: ref(type, id), titre });
      try {
        const n = await creerStructureBase(w, d, type, id);
        return res(`${def.libelle} créé en brouillon avec sa structure de base (${n} élément(s)).`, { ref: ref(type, id), titre });
      } catch (e) {
        return res(`${def.libelle} créé en brouillon, structure de base incomplète : ${e.message}`, { ref: ref(type, id), titre });
      }
    }

    case "conteneur.modifier": {
      const c = cible(["entete", "footer", "page"], p.ref);
      if (c.refus) return c;
      const def = CONTENEURS[c.type];
      const colonnes = await w.cols(def.liste);
      const champBandeau = c.type === "page" ? colonnes.find((x) => x.boolean && !x.hidden && !x.readOnly &&
        (cleChamp(x.displayName) === cleChamp("AFFICHER-BANDEAU-CHANTIER") || cleChamp(x.name) === cleChamp("AFFICHER-BANDEAU-CHANTIER"))) : null;
      if (c.type === "page" && p.valeurs && Object.hasOwn(p.valeurs, "bandeauChantier") && !champBandeau) {
        return { erreur: "Le réglage du bandeau n'est pas installé sur ce site. Appliquez le schéma du constructeur puis réessayez.", status: 400 };
      }
      const form = {
        textes: ecriture.champsModifiables(colonnes).filter((x) => c.type === "page" || !/^URL$/i.test(x.nom)),
        listes: [],
        cases: champBandeau ? [{ cle: "bandeauChantier", nom: champBandeau.name, libelle: "Afficher le bandeau « Page en cours de construction ou de modification »" }] : []
      };
      if (!p.valeurs) return { formulaire: formulairePublic(form, c.el._fields) };
      const { erreurs, propres } = validerFormulaire(form, p.valeurs);
      if (erreurs.length) return { erreur: erreurs.join(" "), status: 400 };
      const colUrl = c.type === "page" && form.textes.find((x) => /^URL$/i.test(x.nom));
      if (colUrl && Object.hasOwn(propres, colUrl.nom)) {
        const url = String(propres[colUrl.nom] || "").trim();
        const siteSource = siteDuConteneur(c.racine);
        if (!/^\/[A-Za-z0-9/_-]*$/.test(url) || (d.pages || []).some((x) => String(x.id) !== String(c.el.id) &&
          rels(x, "OBJ-SITE-PUBLIC").some((s) => s.id === siteSource) && texte(x, "URL") === url)) {
          return { erreur: "Adresse de page invalide (format /ma-page/) ou déjà utilisée sur ce site.", status: 400 };
        }
        propres[colUrl.nom] = url;
      }
      await w.maj(def.liste, c.el.id, propres);
      return res(`${def.libelle} enregistré.`, { champs: Object.keys(propres).length });
    }

    case "conteneur.dupliquer": {
      const c = cible(["entete", "footer", "page"], p.ref);
      if (c.refus) return c;
      const def = CONTENEURS[c.type];
      const extra = await w.copiables(def.liste, c.el, ["OBJ-SITE-PUBLIC", ...(c.type === "page" ? ["URL"] : [])]);
      const siteSource = siteDuConteneur(c.racine);
      const nSite = await w.lookup(def.liste, "OBJ-SITE-PUBLIC");
      if (!nSite) return { refus: "Relation au site indisponible." };
      if (c.type === "page") {
        const url = String(p.url || "").trim();
        if (!/^\/[A-Za-z0-9/_-]*$/.test(url) || (d.pages || []).some((x) =>
          rels(x, "OBJ-SITE-PUBLIC").some((s) => s.id === siteSource) && texte(x, "URL") === url)) {
          return { refus: "Choisissez une adresse de page unique pour cette copie." };
        }
        const nUrl = await w.simple(def.liste, "URL");
        if (!nUrl) return { refus: "Colonne URL indisponible." };
        extra[nUrl] = url;
      }
      const champs = { Title: `${titreDe(c.el)} (variante)`.slice(0, 255), ...extra,
        [nSite]: String(siteDuConteneur(c.racine)), ...(await w.etats(def.liste, "brouillon")) };
      const root = R.trouverRacine(d, siteSource, c.type, c.el.id);
      if (root) {
        let nouveau;
        const resultat = await require("./builder-recursif-ecriture").executer({
          d, w, p: { ref: referenceBuilder(root.id, "element"), attendu: p.attendu }, action: "builder.dupliquer", siteId: siteSource,
          reference: referenceBuilder,
          autoriser: (t, id) => !cible([t], ref(t, id)).refus,
          mediaAutorise: (m) => mediaAutorise(m, perimetreBuilder(perimetre, siteSource)),
          dupliquerRacine: async () => {
            const id = await w.creer(def.liste, champs);
            const frais = await ecriture.lireItemFrais(w.g, w.liste(def.liste).id, id);
            if (!Object.entries(champs).every(([k, v]) => v === null ? frais[k] == null || frais[k] === "" : String(frais[k]) === String(v))) throw new Error("Relecture du conteneur dupliqué non conforme.");
            nouveau = { id, type: c.type };
            return nouveau;
          }
        });
        if (resultat.refus) return resultat;
        return res("Conteneur et composition générique dupliqués en brouillon ; original inchangé.",
          { ref: ref(c.type, nouveau.id), origine: titreDe(c.el) });
      }
      const id = await w.creer(def.liste, champs);
      for (const s of enfantsDe(d, c.type, c.el)) await copierArbre(w, d, "section", s, c.type, id, ordreDe(s), "");
      return res(`Variante créée en brouillon ; l'original n'a pas été modifié.`, { ref: ref(c.type, id), origine: titreDe(c.el) });
    }

    case "conteneur.publier":
    case "conteneur.desactiver": {
      const c = cible(action === "conteneur.publier" ? ["entete", "footer", "page", "article"] : ["entete", "footer", "page"], p.ref);
      if (c.refus) return c;
      const def = CONTENEURS[c.type];
      if (action === "conteneur.desactiver") {
        await w.maj(def.liste, c.el.id, await w.etats(def.liste, "inactif"));
        return res(`${def.libelle} désactivé (aucune suppression).`);
      }
      const root = R.trouverRacine(d, siteId, c.type, c.el.id);
      if (root) {
        const resultat = await require("./builder-recursif-ecriture").executer({
          d, w, p: { ref: ref("builderelement", root.id) }, action: "builder.publier", siteId,
          reference: referenceBuilder,
          autoriser: (t, id) => !cible([t], ref(t, id)).refus,
          mediaAutorise: (m) => mediaAutorise(m, perimetreBuilder(perimetre, siteId))
        });
        if (resultat.refus) return resultat;
      }
      // Valider et activer : le conteneur et ses elements encore en brouillon (les elements desactives restent desactives).
      await w.maj(def.liste, c.el.id, await w.etats(def.liste, "actif"));
      let n = 0;
      for (const x of descendants(d, c.type, c.el)) {
        if (!brouillon(x.el)) continue;
        await w.maj(NIVEAUX[x.type].liste, x.el.id, await w.etats(NIVEAUX[x.type].liste, "actif"));
        if (x.type === "module") {
          for (const u of utilisationsDe(d, x.el.id)) if (brouillon(u)) await w.maj("OBJ-MODULE-UTILISATION", u.id, await w.etats("OBJ-MODULE-UTILISATION", "actif"));
          const ct = contenuDe(d, x.el);
          if (ct.element && brouillon(ct.element)) await w.maj(ct.liste, ct.element.id, await w.etats(ct.liste, "actif"));
        }
        n++;
      }
      return res(`${def.libelle} validé et activé (${n} élément(s) en brouillon activé(s)).`);
    }

    case "page.affecter": {
      const page = cible(["page"], p.page);
      if (page.refus) return page;
      const type = String(p.type || "");
      if (!["entete", "footer"].includes(type)) return { refus: "Type non autorisé." };
      if (!perimetre.peut(CONTENEURS[type].fonction)) return { refus: "Action non autorisée pour votre profil." };
      const nom = await w.lookup("OBJ-PAGES-SITE", CONTENEURS[type].relation);
      if (!nom) return { refus: "Relation de la page indisponible." };
      if (!p.ref) {
        await w.maj("OBJ-PAGES-SITE", page.el.id, { [nom]: null });
        return res(`${CONTENEURS[type].libelle} retiré de la page (l'élément reste disponible).`);
      }
      const c = cible([type], p.ref);
      if (c.refus) return c;
      if (siteDuConteneur(c.racine) !== siteDuConteneur(page.racine)) return { refus: "Le conteneur et la page doivent appartenir au même site." };
      if (!B.publiable(c.el)) return { erreur: `Seul un ${CONTENEURS[type].libelle} actif et validé peut être affecté à une page.`, status: 409 };
      await w.maj("OBJ-PAGES-SITE", page.el.id, { [nom]: String(c.el.id) });
      return res(`${CONTENEURS[type].libelle} « ${titreDe(c.el)} » affecté à la page « ${titreDe(page.el)} » (remplace le précédent).`);
    }

    case "section.ajouter": {
      const c = cible(["entete", "footer", "page"], p.ref);
      if (c.refus) return c;
      const extra = {};
      if (p.typeSection) {
        const t = (d.typesSection || []).filter(B.publiable).find((x) => `typeSection.${signer(`typeSection:${x.id}`)}` === p.typeSection);
        if (!t) return { erreur: "Type de section indisponible.", status: 400 };
        const n = await w.lookup("OBJ-SECTION-SITE", "OBJ-SECTION-TYPE");
        if (n) extra[n] = String(t.id);
      }
      const ordre = await prochainOrdre(enfantsDe(d, c.type, c.el));
      const id = await creerNiveau(w, "section", c.type, c.el.id, { titre: String(p.titre || "Nouvelle section").slice(0, 255), ordre, extra });
      return res("Section ajoutée en brouillon.", { ref: ref("section", id) });
    }

    case "ligne.ajouter": {
      const s = cible(["section"], p.ref);
      if (s.refus) return s;
      const st = (d.structures || []).filter(B.publiable).find((x) => `structure.${signer(`structure:${x.id}`)}` === p.structure);
      if (!st) return { erreur: "Disposition de colonnes indisponible.", status: 400 };
      const nStruct = await w.lookup("OBJ-LIGNE-SITE", "OBJ-LIGNE-STRUCTURE");
      const ordre = await prochainOrdre(enfantsDe(d, "section", s.el));
      const titre = String(p.titre || `Ligne ${titreDe(st)}`).slice(0, 255);
      const id = await creerNiveau(w, "ligne", "section", s.el.id, { titre, ordre, extra: nStruct ? { [nStruct]: String(st.id) } : {} });
      const grille = String(champ(st, ["DEFINITIONGRILLE"]) || titreDe(st));
      const largeurs = /^\d+(?:-\d+)*$/.test(grille) ? grille.split("-").map(Number) : [];
      const nombre = Number(champ(st, ["NOMBRECOLONNES"])) || largeurs.length || 1;
      const nLarg = await w.simple("OBJ-COLONNE-SITE", "LARGEUR");
      for (let i = 0; i < nombre; i++) {
        await creerNiveau(w, "colonne", "ligne", id, { titre: `${titre} · colonne ${i + 1}`, ordre: (i + 1) * 10,
          extra: nLarg && largeurs[i] ? { [nLarg]: largeurs[i] } : {} });
      }
      return res(`Ligne ajoutée avec ${nombre} colonne(s), en brouillon.`, { ref: ref("ligne", id) });
    }

    // Decoupage d'une ligne : nombre et largeurs (%) des colonnes. Rien n'est efface :
    // les colonnes en trop sont desactivees et leurs modules rejoignent la derniere colonne conservee.
    case "ligne.colonnes": {
      let l = cible(["ligne", "colonne"], p.ref);
      if (l.refus) return l;
      if (l.type === "colonne") {
        const pere = parent(d, "colonne", l.el);
        if (!pere?.el) return { erreur: "Ligne introuvable pour cette colonne.", status: 400 };
        l = cible(["ligne"], ref("ligne", pere.el.id));
        if (l.refus) return l;
      }
      const largeurs = Array.isArray(p.largeurs) ? p.largeurs.map((x) => Math.round(Number(x))) : [];
      if (largeurs.length < 1 || largeurs.length > 6 || largeurs.some((x) => !Number.isFinite(x) || x < 1 || x > 100))
        return { erreur: "Indiquez de 1 à 6 colonnes, chacune entre 1 et 100 %.", status: 400 };
      const total = largeurs.reduce((a, b) => a + b, 0);
      if (Math.abs(total - 100) > 1) return { erreur: `Le total des largeurs doit faire 100 % (actuellement ${total} %).`, status: 400 };
      const nLarg = await w.simple("OBJ-COLONNE-SITE", "LARGEUR");
      if (!nLarg) return { refus: "Colonne LARGEUR indisponible sur OBJ-COLONNE-SITE." };
      const actuelles = enfantsDe(d, "ligne", l.el).filter((x) => !inactif(x));
      const titreLigne = titreDe(l.el) || "Ligne";
      const gardees = [];
      for (const [i, x] of largeurs.entries()) {
        const col = actuelles[i];
        if (col) {
          if (Number(champ(col, ["LARGEUR"])) !== x) await w.maj("OBJ-COLONNE-SITE", col.id, { [nLarg]: x });
          gardees.push(col.id);
        } else {
          gardees.push(await creerNiveau(w, "colonne", "ligne", l.el.id, { titre: `${titreLigne} · colonne ${i + 1}`,
            ordre: (actuelles.length ? ordreDe(actuelles[actuelles.length - 1]) : 0) + (i - actuelles.length + 1) * 10, extra: { [nLarg]: x } }));
        }
      }
      let deplaces = 0;
      const surplus = actuelles.slice(largeurs.length);
      if (surplus.length) {
        const dest = gardees[gardees.length - 1];
        const destEl = actuelles[largeurs.length - 1];
        const nCol = await w.lookup("OBJ-MODULE-SITE-PUBLIC", "OBJ-COLONNE-SITE");
        const nOrdre = await w.simple("OBJ-MODULE-SITE-PUBLIC", "ORDRE-AFFICHAGE");
        let ordre = await prochainOrdre(destEl ? enfantsDe(d, "colonne", destEl) : []);
        for (const col of surplus) {
          for (const m of enfantsDe(d, "colonne", col)) {
            if (!nCol) break;
            await w.maj("OBJ-MODULE-SITE-PUBLIC", m.id, { [nCol]: String(dest), ...(nOrdre ? { [nOrdre]: ordre } : {}) });
            await synchroniserUtilisations(w, d, m.id, { "OBJ-COLONNE-SITE": String(dest), "ORDRE-AFFICHAGE": ordre });
            ordre += 10; deplaces++;
          }
          await w.maj("OBJ-COLONNE-SITE", col.id, await w.etats("OBJ-COLONNE-SITE", "inactif"));
        }
      }
      // Disposition SharePoint correspondante (si elle existe) pour garder l'arbre coherent.
      const grille = largeurs.join("-");
      const st = (d.structures || []).filter(B.publiable).find((s) => String(champ(s, ["DEFINITIONGRILLE"]) || titreDe(s)) === grille);
      const nStruct = st ? await w.lookup("OBJ-LIGNE-SITE", "OBJ-LIGNE-STRUCTURE") : null;
      if (nStruct && rel(l.el, "OBJ-LIGNE-STRUCTURE")?.id !== st.id) await w.maj("OBJ-LIGNE-SITE", l.el.id, { [nStruct]: String(st.id) });
      const ajoutees = Math.max(0, largeurs.length - actuelles.length);
      return res(`Ligne découpée en ${largeurs.length} colonne(s) (${largeurs.join(" / ")} %)`
        + `${ajoutees ? ` — ${ajoutees} colonne(s) ajoutée(s) en brouillon` : ""}`
        + `${surplus.length ? ` — ${surplus.length} colonne(s) désactivée(s), ${deplaces} module(s) déplacé(s)` : ""}.`, { ref: ref("ligne", l.el.id) });
    }

    case "module.ajouter": {
      const col = cible(["colonne"], p.ref);
      if (col.refus) return col;
      const code = String(p.typeModule || "").toUpperCase();
      const type = (d.types || []).filter(B.publiable).find((t) => titreDe(t).toUpperCase() === code);
      if (!type) return { erreur: "Type de module indisponible.", status: 400 };
      const nType = await w.lookup("OBJ-MODULE-SITE-PUBLIC", "OBJ-MODULE-SITE-PUBLIC-TYPE");
      if (!nType) return { refus: "Relation au type de module indisponible." };
      const extra = { [nType]: String(type.id) };
      if (col.racine.type === "page") {
        const nPage = await w.lookup("OBJ-MODULE-SITE-PUBLIC", "OBJ-PAGES-SITE");
        if (nPage) extra[nPage] = String(col.racine.el.id);
      }
      let modele = null;
      if (p.modele) {
        modele = (d.modeles || []).find((m) => `modele.${signer(`modele:${m.id}`)}` === p.modele && modeleDisponible(m, perimetre));
        if (!modele) return { erreur: "Modèle indisponible.", status: 400 };
        const nMod = await w.lookup("OBJ-MODULE-SITE-PUBLIC", "OBJ-MODELE-BUILDER");
        if (nMod) extra[nMod] = String(modele.id);
      }
      const ordre = await prochainOrdre(enfantsDe(d, "colonne", col.el));
      const titre = String(p.titre || `Module ${code}`).slice(0, 255);
      const id = await creerNiveau(w, "module", "colonne", col.el.id, { titre, ordre, extra });
      await creerUtilisation(w, id, col.el.id, ordre, titre);
      if (modele) {
        const L = "OBJ-MODELE-INSTANCE";
        const champs = { Title: `${titreDe(modele)} · ${titre}`.slice(0, 255), ...(await w.etats(L, "brouillon")) };
        for (const [relation, v] of [["OBJ-MODELE-BUILDER", modele.id], ["OBJ-MODULE-SITE-PUBLIC", id],
          ["OBJ-PAGES-SITE", col.racine.type === "page" ? col.racine.el.id : null]]) {
          const n = v ? await w.lookup(L, relation) : null;
          if (n) champs[n] = String(v);
        }
        await w.creer(L, champs);
      }
      return res(`Module ${code} inséré en brouillon et utilisation enregistrée.`, { ref: ref("module", id) });
    }

    case "element.deplacer": {
      const c = cible(["section", "ligne", "colonne", "module"], p.ref);
      if (c.refus) return c;
      const def = NIVEAUX[c.type];
      const nOrdre = await w.simple(def.liste, "ORDRE-AFFICHAGE");
      if (!nOrdre) return { refus: "Ordre d'affichage indisponible." };
      if (p.parent) {
        const typeParent = c.type === "section" ? c.racine.type : def.parentType;
        const dest = cible([typeParent], p.parent);
        if (dest.refus) return dest;
        if (dest.racine.type !== c.racine.type || dest.racine.el.id !== c.racine.el.id) return { refus: "Déplacement limité à la même racine." };
        const typeDef = (code) => (d.builderTypes || []).find((x) => R.actif(x) && String(R.f(x, "CLE-RENDU") || "").toUpperCase() === code);
        const pt = typeDef(typeParent.toUpperCase());
        const et = typeDef(c.type.toUpperCase());
        if (pt && et && !R.regleDe(d, pt.id, et.id)) return { refus: "Imbrication interdite par SharePoint." };
        const freres = enfantsDe(d, dest.type, dest.el).filter((x) => x.id !== c.el.id);
        const repere = p.avant || p.apres;
        const indexRepere = repere ? freres.findIndex((x) => ref(c.type, x.id) === repere) : freres.length;
        if (indexRepere < 0) return { refus: "Position de destination inconnue." };
        const position = indexRepere + (repere && !p.avant ? 1 : 0);
        const nParent = await w.lookup(def.liste, c.type === "section" ? CONTENEURS[dest.type].relation : def.parent);
        if (!nParent) return { refus: "Relation au parent indisponible." };
        freres.splice(position, 0, c.el);
        await w.maj(def.liste, c.el.id, { [nParent]: String(dest.el.id) });
        for (const [i, el] of freres.entries()) {
          await w.maj(def.liste, el.id, { [nOrdre]: (i + 1) * 10 });
          if (c.type === "module") await synchroniserUtilisations(w, d, el.id, {
            "OBJ-COLONNE-SITE": String(dest.el.id), "ORDRE-AFFICHAGE": (i + 1) * 10 });
        }
        return res(`${def.libelle} déplacé${c.type === "module" ? "" : "e"} dans « ${titreDe(dest.el)} ».`);
      }
      if (c.type === "module" && p.colonne) {
        const dest = cible(["colonne"], p.colonne);
        if (dest.refus) return dest;
        if (dest.racine.el.id !== c.racine.el.id || dest.racine.type !== c.racine.type) return { refus: "Déplacement limité au même conteneur." };
        const ordre = await prochainOrdre(enfantsDe(d, "colonne", dest.el));
        const nCol = await w.lookup(def.liste, "OBJ-COLONNE-SITE");
        await w.maj(def.liste, c.el.id, { [nCol]: String(dest.el.id), [nOrdre]: ordre });
        const n = await synchroniserUtilisations(w, d, c.el.id, { "OBJ-COLONNE-SITE": String(dest.el.id), "ORDRE-AFFICHAGE": ordre });
        return res(`Module déplacé dans « ${titreDe(dest.el)} » (${n} utilisation(s) mise(s) à jour).`);
      }
      const pere = parent(d, c.type, c.el);
      const freres = enfantsDe(d, pere.type, pere.el);
      const i = freres.findIndex((x) => x.id === c.el.id);
      const j = p.sens === "haut" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= freres.length) return { erreur: "Déplacement impossible dans ce sens.", status: 400 };
      [freres[i], freres[j]] = [freres[j], freres[i]];
      for (const [k, x] of freres.entries()) {
        const ordre = (k + 1) * 10;
        if (ordreDe(x) === ordre) continue;
        await w.maj(def.liste, x.id, { [nOrdre]: ordre });
        if (c.type === "module") await synchroniserUtilisations(w, d, x.id, { "ORDRE-AFFICHAGE": ordre });
      }
      return res(`${def.libelle} déplacé${p.sens === "haut" ? " vers le haut" : " vers le bas"}.`);
    }

    case "element.renommer": {
      const c = cible(["section", "ligne", "colonne", "module"], p.ref);
      if (c.refus) return c;
      const titre = String(p.titre || "").trim().slice(0, 255);
      if (!titre) return { erreur: "Le nom est obligatoire.", status: 400 };
      await w.maj(NIVEAUX[c.type].liste, c.el.id, { Title: titre });
      return res(`${NIVEAUX[c.type].libelle} renommé${c.type === "module" ? "" : "e"}.`);
    }

    case "element.dupliquer": {
      const c = cible(["section", "ligne", "colonne", "module"], p.ref);
      if (c.refus) return c;
      const pere = parent(d, c.type, c.el);
      const ordre = await prochainOrdre(enfantsDe(d, pere.type, pere.el));
      const id = await copierArbre(w, d, c.type, c.el, pere.type, pere.el.id, ordre, " (variante)");
      return res(`${NIVEAUX[c.type].libelle} dupliqué en brouillon ; l'original est inchangé.`, { ref: ref(c.type, id) });
    }

    case "element.supprimer": {
      // Suppression definitive : element + descendants + contenus + utilisations, sauvegarde JSON prealable.
      const c = cible(["section", "ligne", "colonne", "module"], p.ref);
      if (c.refus) return c;
      if (p.confirmation !== "SUPPRIMER") return { erreur: "Confirmation de suppression manquante.", status: 400 };
      const items = arbreASupprimer(d, c.type, c.el);
      sauvegarderSuppression(siteId, c, items);
      for (const x of items) await w.supprimer(x.liste, x.id);
      const autres = items.length - 1;
      return res(`${NIVEAUX[c.type].libelle} « ${titreDe(c.el)} » supprimé${c.type === "module" ? "" : "e"} définitivement${autres ? ` avec ${autres} élément(s) contenu(s)` : ""}.`);
    }

    case "conteneur.supprimer": {
      // Suppression definitive d'une page : sections, contenus, composition Builder ; sauvegarde JSON prealable.
      const c = cible(["page"], p.ref);
      if (c.refus) return c;
      if (p.confirmation !== "SUPPRIMER") return { erreur: "Confirmation de suppression manquante.", status: 400 };
      if (texte(c.el, "URL") === "/") return { refus: "La page d'accueil (adresse « / ») ne peut pas être supprimée : donnez d'abord l'adresse « / » à une autre page." };
      const items = conteneurASupprimer(d, c.type, c.el);
      sauvegarderSuppression(siteId, c, items);
      for (const x of items) await w.supprimer(x.liste, x.id);
      const autres = items.length - 1;
      return res(`Page « ${titreDe(c.el)} » supprimée définitivement${autres ? ` avec ${autres} élément(s) contenu(s)` : ""}.`);
    }

    case "element.etat": {
      // Un element (ref) ou plusieurs a la fois (refs, 50 maximum), toutes natures confondues.
      const refs = Array.isArray(p.refs) ? [...new Set(p.refs.map(String))] : [p.ref];
      if (!refs.length || refs.length > 50) return { erreur: "Sélection invalide (1 à 50 éléments).", status: 400 };
      const mode = p.etat === "actif" ? "actif" : p.etat === "inactif" ? "inactif" : null;
      if (!mode) return { erreur: "État non autorisé.", status: 400 };
      const cibles = [];
      for (const x of refs) { const c = cible(["section", "ligne", "colonne", "module"], x); if (c.refus) return c; cibles.push(c); }
      let n = 0, m = 0;
      for (const c of cibles) {
        const def = NIVEAUX[c.type];
        await w.maj(def.liste, c.el.id, await w.etats(def.liste, mode));
        if (c.type === "module") {
          for (const u of utilisationsDe(d, c.el.id)) { await w.maj("OBJ-MODULE-UTILISATION", u.id, await w.etats("OBJ-MODULE-UTILISATION", mode)); n++; }
          // Valider un module valide aussi son contenu en brouillon (sinon il resterait vide pour les visiteurs).
          const ct = contenuDe(d, c.el);
          if (mode === "actif") for (const x of contenusItems(d, ct.liste, c.el.id).filter((x) => !B.publiable(x) && !inactif(x))) {
            await w.maj(ct.liste, x.id, await w.etats(ct.liste, "actif")); m++;
          }
        }
      }
      const quoi = cibles.length > 1 ? `${cibles.length} éléments` : NIVEAUX[cibles[0].type].libelle;
      return res(`${quoi} ${mode === "actif" ? `validé${cibles.length > 1 ? "s" : ""} et activé${cibles.length > 1 ? "s" : ""}` : `désactivé${cibles.length > 1 ? "s" : ""} (aucune suppression)`}${n ? ` — ${n} utilisation(s) synchronisée(s)` : ""}${m ? ` — ${m} contenu(s) en brouillon validé(s)` : ""}.`);
    }

    case "contenu.formulaire":
    case "contenu.enregistrer": {
      const c = cible(["module"], p.ref);
      if (c.refus) return c;
      const ct = contenuDe(d, c.el);
      if (!ct.liste) return { erreur: "Ce type de module n'a pas de formulaire de contenu.", status: 400 };
      const form = await formulaireContenu(w, ct.liste, perimetre, d);
      if (action === "contenu.formulaire") {
        const formulaire = formulairePublic(form, ct.element?._fields || {});
        if (form.image) {
          const style = B.styleResolu(B.contexteComposition(d, { id: String(siteId) }), typeStyleDe(d, c.type, c.el), rel(c.el, "OBJ-STYLE-PRESET")?.id).style;
          formulaire.visibiliteImage = { titre: style.imageTitreMasque !== true, texte: style.imageTexteMasque !== true };
          formulaire.aide = "Choisissez une image, renseignez son titre et son texte pour le public. Le nom de repère reste interne ; le texte alternatif aide les personnes utilisant un lecteur d’écran.";
        }
        return { formulaire, type: ct.type };
      }
      const { erreurs, propres } = validerFormulaire(form, p.valeurs);
      if (erreurs.length) return { erreur: erreurs.join(" "), status: 400 };
      let visibiliteModifiee = false;
      if (p.valeurs && (Object.hasOwn(p.valeurs, "afficherTitreImage") || Object.hasOwn(p.valeurs, "afficherTexteImage"))) {
        if (!form.image) return { erreur: "Visibilité réservée aux images.", status: 400 };
        const style = B.styleResolu(B.contexteComposition(d, { id: String(siteId) }), typeStyleDe(d, c.type, c.el), rel(c.el, "OBJ-STYLE-PRESET")?.id).style;
        const valeurs = {};
        for (const [cle, masque] of [["afficherTitreImage", "imageTitreMasque"], ["afficherTexteImage", "imageTexteMasque"]]) {
          if (!Object.hasOwn(p.valeurs, cle)) continue;
          if (!["true", "false"].includes(p.valeurs[cle])) return { erreur: "Visibilité de l’image invalide.", status: 400 };
          const cacher = p.valeurs[cle] === "false";
          if (cacher !== (style[masque] === true)) valeurs[masque] = cacher;
        }
        if (Object.keys(valeurs).length) {
          const resultat = await executer({ d, perimetre, siteId, action: "design.enregistrer", params: { ref: p.ref, valeurs }, apercu, attendus, ecrivain: w });
          if (resultat.erreur || resultat.refus) return resultat;
          visibiliteModifiee = true;
        }
      }
      if (form.image && form.legende && form.titreImage && Object.hasOwn(propres, form.titreImage)) propres[form.legende] = "";
      const enregistrerContenu = async (operation) => {
        try { await operation(); }
        catch (err) {
          if (visibiliteModifiee) err.message = `La visibilité a été enregistrée, mais le contenu n’a pas pu être enregistré. Réouvrez le formulaire pour vérifier les valeurs. ${err.message}`;
          throw err;
        }
      };
      if (ct.element) {
        // Seuls les champs reellement modifies sont ecrits (preserve la mise en forme riche non retouchee).
        const avant = ecriture.valeursDe(ct.element._fields || {}, Object.keys(propres));
        const nouveaux = ecriture.valeursDe(propres, Object.keys(propres));
        for (const n of Object.keys(propres)) if (avant[n] === nouveaux[n]) delete propres[n];
        if (!Object.keys(propres).length) return res(visibiliteModifiee ? "Contenu du module enregistré." : "Aucune modification à enregistrer.");
        await enregistrerContenu(() => w.maj(ct.liste, ct.element.id, propres));
        return res("Contenu du module enregistré.");
      }
      const nMod = await w.lookup(ct.liste, "OBJ-MODULE-SITE-PUBLIC");
      if (!nMod) return { refus: "Relation du contenu au module indisponible." };
      const etats = await w.etats(ct.liste, B.publiable(c.el) ? "actif" : "brouillon");
      await enregistrerContenu(() => w.creer(ct.liste, { Title: titreDe(c.el) || ct.type, ...propres, ...etats, [nMod]: String(c.el.id) }));
      return res("Contenu du module créé.");
    }

    case "logo.choisir": {
      if (!perimetre.peut("logo-medias")) return { refus: "Action non autorisée pour votre profil." };
      const m = (d.medias || []).find((x) => `media.${signer(`media:${x.id}`)}` === p.media && mediaAutorise(x, perimetre));
      if (!m) return { refus: "Média hors de votre périmètre." };
      const logos = (d.logos || []).filter((l) => perimetre.sites.has(rel(l, "OBJ-SITE")?.id));
      const logo = logos.find(B.publiable) || logos[0];
      const nMedia = await w.lookup("OBJ-LOGO-SITE", "OBJ-MEDIA");
      if (!nMedia) return { refus: "Relation du logo au média indisponible." };
      if (logo) {
        await w.maj("OBJ-LOGO-SITE", logo.id, { [nMedia]: String(m.id) });
        return res(`Logo mis à jour avec « ${titreDe(m)} » (l'ancien média est conservé dans la bibliothèque).`);
      }
      const nSite = await w.lookup("OBJ-LOGO-SITE", "OBJ-SITE", "OBJ-SITE-PUBLIC");
      const champs = { Title: `Logo · ${titreDe(m)}`.slice(0, 255), [nSite]: String(siteId), [nMedia]: String(m.id), ...(await w.etats("OBJ-LOGO-SITE", "brouillon")) };
      for (const n of ["NOTE-COURTE", "NOTE-LONGUE"]) { const c = await w.simple("OBJ-LOGO-SITE", n); if (c) champs[c] = `Logo choisi depuis la bibliothèque : ${titreDe(m)}`; }
      await w.creer("OBJ-LOGO-SITE", champs);
      return res("Logo créé en brouillon.");
    }

    case "design.lire": {
      const c = cible(TYPES_DESIGN, p.ref);
      if (c.refus) return c;
      const ctx = B.contexteComposition(d, { id: String(siteId) });
      const code = typeStyleDe(d, c.type, c.el);
      const preset = (d.presets || []).find((x) => x.id === rel(c.el, "OBJ-STYLE-PRESET")?.id) || null;
      const presetOk = preset && B.presetDuSite(preset, ctx.site);
      const polices = policesDe(d);
      const herite = B.styleResolu(ctx, code, presetOk ? rel(preset, "PRESET-PARENT")?.id : null);
      const propre = presetOk ? B.styleDepuisPreset(preset, ctx.referentiels) : {};
      const propreResp = presetOk ? B.responsiveDepuisPreset(preset.id, d.responsifs, ctx.referentiels) : {};
      if (presetOk) for (const [a, v] of Object.entries(B.typographiesDepuisPreset(preset, ctx.referentiels).responsive)) Object.assign(propreResp[a] ||= {}, v);
      if (presetOk) for (const [a, v] of Object.entries(B.detailsDepuisPreset(preset).responsive)) Object.assign(propreResp[a] ||= {}, v);
      const typeModule = c.type === "module" ? contenuDe(d, c.el).type : "";
      const typographieSeparee = B.TYPES_TYPO_SEPAREE.includes(typeModule);
      const choix = B.CHOIX;
      const alignements = (d.alignements || []).filter((a) => !inactif(a)).sort(parOrdre).map((a) => titreDe(a).toUpperCase()).filter((a) => B.ALIGNS.includes(a));
      const presets = (d.presets || []).filter((x) => B.presetDuSite(x, ctx.site)).sort(parOrdre)
        .map((x) => ({ ref: `preset.${signer(`preset:${x.id}`)}`, titre: titreDe(x), actuel: x.id === preset?.id }));
      return {
        design: {
          type: typeModule || code, typographieSeparee, libelle: TYPES[c.type].libelle, titre: titreDe(c.el) || "", groupes: B.groupesDesign(d, code),
          valeurs: plat(propre, polices), herite: plat(herite.style, polices),
          responsive: Object.fromEntries(APPAREILS_SURCHARGE.map((a) => [a, plat(propreResp[a] || {}, polices)])),
          responsiveHerite: Object.fromEntries(APPAREILS_SURCHARGE.map((a) => [a, plat(herite.responsive[a] || {}, polices)])),
          champsResponsive: [...RESPONSIVE, ...Object.keys(B.DETAILS_DESIGN)],
          options: {
            polices: polices.map(({ ref: r, titre, famille }) => ({ ref: r, titre: titre || famille, famille })), alignements, choix, presets,
            medias: (d.medias || []).filter((m) => mediaAutorise(m, perimetre) && /IMAGE|PHOTO|FOND|BANNI/i.test(cleChamp(rel(m, "OBJ-MEDIA-TYPE")?.titre) || "IMAGE"))
              .map((m) => ({ ref: `media.${signer(`media:${m.id}`)}`, titre: titreDe(m), url: `/api/v1/media/${encodeURIComponent(m.id)}` }))
          },
          partage: Boolean(preset) && !presetPropre(d, preset, c.type, c.el)
        }
      };
    }

    case "design.preset": {
      const c = cible(TYPES_DESIGN, p.ref);
      if (c.refus) return c;
      const site = { id: String(siteId) };
      const preset = p.preset ? (d.presets || []).find((x) => `preset.${signer(`preset:${x.id}`)}` === p.preset) : null;
      if (p.preset && (!preset || !B.presetDuSite(preset, site))) return { refus: "Style hors de votre périmètre." };
      const def = TYPES[c.type];
      const n = await w.lookup(def.liste, "OBJ-STYLE-PRESET");
      if (!n) return { refus: "Relation au style indisponible." };
      await w.maj(def.liste, c.el.id, { [n]: preset ? String(preset.id) : null });
      return res(preset ? `Style « ${titreDe(preset)} » appliqué (le style partagé n'est pas modifié).` : "Style retiré : l'élément suit le thème du site.", { preset: preset?.id || null });
    }

    case "design.enregistrer": {
      const c = cible(TYPES_DESIGN, p.ref);
      if (c.refus) return c;
      const code = typeStyleDe(d, c.type, c.el);
      const groupes = new Set(B.groupesDesign(d, code));
      const v = p.valeurs && typeof p.valeurs === "object" ? p.valeurs : {};
      const resp = v.responsive && typeof v.responsive === "object" ? v.responsive : {};
      const polices = policesDe(d);
      const couleurs = new Map();
      const erreurs = [];
      const champsTypo = {};
      const typeModule = c.type === "module" ? contenuDe(d, c.el).type : "";
      for (const colonne of ["IMAGE-DISPOSITION", "BORDURES-DETAIL"]) {
        const cles = Object.keys(B.DETAILS_DESIGN).filter((k) => B.DETAILS_DESIGN[k][0] === colonne);
        const present = (o) => cles.some((k) => Object.hasOwn(o, k));
        if (!present(v) && !APPAREILS_SURCHARGE.some((a) => present(resp[a] || {}))) continue;
        if (colonne === "IMAGE-DISPOSITION" && !["IMAGE", "IMAGE-TEXTE"].includes(typeModule)) return { erreur: "Disposition réservée aux images.", status: 400 };
        if (colonne === "BORDURES-DETAIL" && !groupes.has("BORDURE")) return { erreur: "Bordures non disponibles pour cet élément.", status: 400 };
        const nom = await w.simple("OBJ-STYLE-PRESET", colonne);
        const col = (await w.cols("OBJ-STYLE-PRESET")).find((x) => x.name === nom);
        if (!nom || !col?.text?.allowMultipleLines || col.text.textType !== "plain" || col.text.appendChangesToExistingText) return { erreur: `${colonne} : colonne de texte brut multiligne requise, sans ajout des modifications.`, status: 400 };
        try {
          const presetActuel = (d.presets || []).find((x) => x.id === rel(c.el, "OBJ-STYLE-PRESET")?.id);
          const brut = presetActuel && champ(presetActuel, [cleChamp(colonne)]);
          const precedent = brut ? JSON.parse(brut) : {};
          if (brut) B.detailsDepuisPreset(presetActuel);
          const { responsive: anciens = {}, ...base } = precedent;
          const extraire = (o, avant) => B.normaliserDetails({ ...avant, ...Object.fromEntries(cles.filter((k) => Object.hasOwn(o, k)).map((k) => [k, o[k]])) }, colonne);
          const objet = present(v) ? extraire(v, base) : base;
          objet.responsive = Object.fromEntries(APPAREILS_SURCHARGE.map((a) => [a, present(resp[a] || {}) ? extraire(resp[a], anciens[a] || {}) : anciens[a] || {}]));
          champsTypo[nom] = JSON.stringify(objet);
        } catch (err) { erreurs.push(`${colonne} : ${err.message}`); }
      }
      for (const [cle, colonne] of [["typoTitre", "TYPO-TITRE"], ["typoTexte", "TYPO-TEXTE"]]) {
        if (!(cle in v) && !APPAREILS_SURCHARGE.some((a) => cle in (resp[a] || {}))) continue;
        if (!B.TYPES_TYPO_SEPAREE.includes(typeModule)) return { erreur: "Cet élément ne possède pas de titre et de texte séparés.", status: 400 };
        const nom = await w.simple("OBJ-STYLE-PRESET", colonne);
        const col = (await w.cols("OBJ-STYLE-PRESET")).find((x) => x.name === nom);
        if (!nom || !col?.text?.allowMultipleLines || col.text.textType === "richText") return { erreur: `Ajoutez ${colonne} dans OBJ-STYLE-PRESET : plusieurs lignes de texte brut, non obligatoire.`, status: 400 };
        const convertirTypo = (brut) => {
          if (!brut || typeof brut !== "object" || Array.isArray(brut)) throw new Error("Typographie invalide.");
          const valeurs = { ...brut };
          if (valeurs.police) {
            const p = polices.find((x) => x.ref === valeurs.police);
            if (!p) throw new Error("Police inconnue.");
            valeurs.police = String(p.id);
          }
          return B.normaliserTypographie(valeurs);
        };
        try {
          const presetActuel = (d.presets || []).find((x) => x.id === rel(c.el, "OBJ-STYLE-PRESET")?.id);
          let precedent = {};
          const brut = presetActuel && champ(presetActuel, [cleChamp(colonne)]);
          if (brut) {
            B.typographiesDepuisPreset(presetActuel, B.contexteComposition(d, { id: String(siteId) }).referentiels);
            precedent = JSON.parse(brut);
          }
          const { responsive: anciensAppareils = {}, ...ancienneBase } = precedent;
          const objet = cle in v ? convertirTypo(v[cle]) : ancienneBase;
          objet.responsive = Object.fromEntries(APPAREILS_SURCHARGE.map((a) => [a, cle in (resp[a] || {}) ? convertirTypo(resp[a][cle]) : anciensAppareils[a] || {}]));
          champsTypo[nom] = JSON.stringify(objet);
        } catch (err) { erreurs.push(`${colonne} : ${err.message}`); }
      }

      const colonneDe = async (liste, colonne, nature) => (["couleur", "police", "alignement", "media"].includes(nature)
        ? w.lookup(liste, colonne, { couleur: "OBJ-COULEUR", police: "OBJ-POLICE", alignement: "OBJ-ALIGNEMENT", media: "OBJ-MEDIA" }[nature])
        : w.simple(liste, colonne));
      const couleurId = async (hex) => {
        const h = hex.toLowerCase();
        if (couleurs.has(h)) return couleurs.get(h);
        const ex = (d.couleurs || []).find((x) => !inactif(x) && String(champ(x, ["VALEURHEX"]) || "").trim().toLowerCase() === h);
        let id = ex?.id;
        if (!id) {
          const champs = { Title: h, ...(await w.etats("OBJ-COULEUR", "actif")) };
          for (const [n, val] of [["CODE", h], ["VALEUR-HEX", h]]) { const col = await w.simple("OBJ-COULEUR", n); if (col) champs[col] = val; }
          id = await w.creer("OBJ-COULEUR", champs);
        }
        couleurs.set(h, id);
        return id;
      };
      /* Valeur saisie -> champ SharePoint ; "" ou null = retour a la valeur heritee (champ vide). */
      const convertir = async (liste, table, cle, brut, libelle) => {
        const [, colonne, nature, min, max] = table[cle];
        const nom = await colonneDe(liste, colonne, nature);
        if (!nom) {
          if (cle.startsWith("soulignement") && brut !== "" && brut !== null && brut !== undefined) erreurs.push(`Soulignement : colonne ${colonne} manquante dans ${liste}.`);
          return null;
        }
        const vide = brut === "" || brut === null || brut === undefined;
        if (vide) return [nom, null];
        if (cle.startsWith("soulignement") && cle !== "soulignement") {
          const col = (await w.cols(liste)).find((x) => x.name === nom);
          if ((nature === "hex" && (!col?.text || col.text.allowMultipleLines)) || (nature === "nombre" && !col?.number) || (nature === "choix" && (!col?.choice || col.choice.allowTextEntry))) {
            erreurs.push(`Soulignement : type de colonne incorrect pour ${colonne}.`);
            return null;
          }
        }
        if (nature === "hex") {
          if (!HEX.test(String(brut))) { erreurs.push(`${libelle} : couleur invalide.`); return null; }
          return [nom, String(brut).toLowerCase()];
        }
        if (nature === "nombre") {
          const n = Number(String(brut).replace(",", "."));
          if (!Number.isFinite(n) || n < min || n > max) { erreurs.push(`${libelle} : valeur entre ${min} et ${max}.`); return null; }
          return [nom, n];
        }
        if (nature === "poids") {
          const val = String(brut);
          if (!B.CHOIX.poidsPolice.includes(val)) { erreurs.push(`${libelle} : graisse non autorisée.`); return null; }
          return [nom, Number(val)];
        }
        if (nature === "couleur") {
          if (!HEX.test(String(brut))) { erreurs.push(`${libelle} : couleur invalide.`); return null; }
          return [nom, String(await couleurId(String(brut)))];
        }
        if (nature === "choix") {
          const val = String(brut).toUpperCase();
          if (!(B.CHOIX[cle] || []).includes(val)) { erreurs.push(`${libelle} : choix non autorisé.`); return null; }
          const col = (await w.cols(liste)).find((x) => x.name === nom);
          if (col?.choice?.choices?.length && !col.choice.choices.map((x) => String(x).toUpperCase()).includes(val)) { erreurs.push(`${libelle} : choix non disponible.`); return null; }
          return [nom, col?.choice?.choices?.find((x) => String(x).toUpperCase() === val) || val];
        }
        if (nature === "ouinon") {
          const col = (await w.cols(liste)).find((x) => x.name === nom);
          const oui = brut === true || /^(OUI|TRUE|1)$/i.test(String(brut));
          return [nom, col?.boolean ? oui : oui ? "OUI" : "NON"];
        }
        if (nature === "police") {
          const pol = polices.find((x) => x.ref === brut);
          if (!pol) { erreurs.push(`${libelle} : police inconnue.`); return null; }
          return [nom, String(pol.id)];
        }
        if (nature === "alignement") {
          const id = await w.valeur("OBJ-ALIGNEMENT", new RegExp(`^${cleChamp(brut)}$`));
          if (!id) { erreurs.push(`${libelle} : alignement inconnu.`); return null; }
          return [nom, id];
        }
        if (nature === "media") {
          const m = (d.medias || []).find((x) => `media.${signer(`media:${x.id}`)}` === brut && mediaAutorise(x, perimetre));
          if (!m) { erreurs.push(`${libelle} : média hors de votre périmètre.`); return null; }
          return [nom, String(m.id)];
        }
        return null;
      };

      const champsPreset = { ...champsTypo };
      for (const [cle, brut] of Object.entries(v)) {
        if (cle === "responsive" || !DESIGN[cle] || !groupes.has(DESIGN[cle][0])) continue;
        const r = await convertir("OBJ-STYLE-PRESET", DESIGN, cle, brut, cle);
        if (r) champsPreset[r[0]] = r[1];
      }
      const champsResp = {};
      const champsModule = {};
      // ORDINATEUR n'accepte que le masquage (le style de base reste celui de l'ordinateur).
      for (const a of ["ORDINATEUR", ...APPAREILS_SURCHARGE]) {
        if (!resp[a] || typeof resp[a] !== "object") continue;
        champsResp[a] = {};
        for (const [cle, brut] of Object.entries(resp[a])) {
          if (a === "ORDINATEUR" && cle !== "masque") continue;
          if (!RESPONSIVE.includes(cle) || (cle !== "masque" && !groupes.has(DESIGN[cle][0]))) continue;
          if (cle === "masque" && c.type === "module") {
            const nVis = await w.simple(TYPES[c.type].liste, `VISIBLE-${a}`);
            if (nVis) {
              const col = (await w.cols(TYPES[c.type].liste)).find((x) => x.name === nVis);
              const visible = !(brut === true || /^(OUI|TRUE|1)$/i.test(String(brut)));
              champsModule[nVis] = col?.boolean ? visible : visible ? "OUI" : "NON";
            }
          }
          const r = await convertir("OBJ-STYLE-RESPONSIVE", DESIGN_RESPONSIVE, cle, brut, `${a.toLowerCase()} · ${cle}`);
          if (r) champsResp[a][r[0]] = r[1];
        }
      }
      if (erreurs.length) return { erreur: erreurs.slice(0, 5).join(" "), status: 400 };

      const def = TYPES[c.type];
      const nLien = await w.lookup(def.liste, "OBJ-STYLE-PRESET");
      if (!nLien) return { refus: "Relation au style indisponible." };
      let preset = (d.presets || []).find((x) => x.id === rel(c.el, "OBJ-STYLE-PRESET")?.id) || null;
      let presetId = preset && presetPropre(d, preset, c.type, c.el) ? preset.id : null;
      let variante = false;
      if (presetId) {
        await w.maj("OBJ-STYLE-PRESET", presetId, champsPreset);
      } else {
        // Nouveau style propre a l'element ; l'ancien (partage) devient son parent et reste intact.
        const titre = `Style · ${def.libelle} · ${titreDe(c.el) || code}`.slice(0, 255);
        const champs = { Title: titre, ...champsPreset, ...(await w.etats("OBJ-STYLE-PRESET", "actif")) };
        const nCode = await w.simple("OBJ-STYLE-PRESET", "CODE-STYLE");
        if (nCode) champs[nCode] = `${code}-${c.type.toUpperCase()}-${c.el.id}`.slice(0, 255);
        const nSite = await w.lookup("OBJ-STYLE-PRESET", "OBJ-SITE-PUBLIC");
        if (nSite) champs[nSite] = String(siteDuConteneur(c.racine));
        const typeEl = (d.styleTypes || []).find((x) => String(champ(x, ["CODE"]) || titreDe(x)).toUpperCase() === code);
        const nType = await w.lookup("OBJ-STYLE-PRESET", "OBJ-STYLE-TYPE");
        if (typeEl && nType) champs[nType] = String(typeEl.id);
        const nParent = await w.lookup("OBJ-STYLE-PRESET", "PRESET-PARENT", "OBJ-STYLE-PRESET");
        if (preset && B.publiable(preset) && nParent) champs[nParent] = String(preset.id);
        for (const k of Object.keys(champs)) if (champs[k] === null) delete champs[k];
        presetId = await w.creer("OBJ-STYLE-PRESET", champs);
        await w.maj(def.liste, c.el.id, { [nLien]: String(presetId) });
        variante = Boolean(preset);
      }

      if (Object.keys(champsModule).length) await w.maj(def.liste, c.el.id, champsModule);
      let surcharges = 0;
      for (const [a, champs] of Object.entries(champsResp)) {
        const existant = (d.responsifs || []).find((r) => rel(r, "OBJ-STYLE-PRESET")?.id === presetId && !inactif(r) &&
          String(rel(r, "OBJ-APPAREIL")?.titre || "").toUpperCase() === a);
        if (existant) { await w.maj("OBJ-STYLE-RESPONSIVE", existant.id, champs); surcharges++; continue; }
        const remplis = Object.fromEntries(Object.entries(champs).filter(([, x]) => x !== null));
        if (!Object.keys(remplis).length) continue;
        const nPreset = await w.lookup("OBJ-STYLE-RESPONSIVE", "OBJ-STYLE-PRESET");
        const nApp = await w.lookup("OBJ-STYLE-RESPONSIVE", "OBJ-APPAREIL");
        const app = await w.valeur("OBJ-APPAREIL", new RegExp(`^${a}`));
        if (!nPreset || !nApp || !app) return { refus: "Référentiel d'appareil indisponible." };
        await w.creer("OBJ-STYLE-RESPONSIVE", { Title: `Style ${presetId} · ${a.toLowerCase()}`, ...remplis, [nPreset]: String(presetId), [nApp]: app,
          ...(await w.etats("OBJ-STYLE-RESPONSIVE", "actif")) });
        surcharges++;
      }
      return res(`Design enregistré${variante ? " (style propre créé : le style partagé d'origine est inchangé)" : ""}${surcharges ? ` — ${surcharges} surcharge(s) responsive` : ""}.`,
        { preset: presetId, champs: Object.keys(champsPreset).length, surcharges });
    }

    default:
      return { refus: "Action inconnue." };
  }
}

module.exports = { actionDroit, plat, DESIGN, policesDe, siteDe, CONTENEURS, NIVEAUX, vue, arbre, apercu, racine, resoudre, executer, ref, referenceBuilder, mediaAutorise, modeleDisponible, visibleApercu, inactif, brouillon, Ecrivain, signer,
  siteDuConteneur, relationArticleBuilder, operationArticle, MESSAGE_RELATION_ARTICLE };
