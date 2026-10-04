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
const { champ, relations, cleChamp } = require("./catalogue");

const SEL = crypto.randomBytes(32);
const signer = (v) => crypto.createHmac("sha256", SEL).update(String(v)).digest("hex").slice(0, 24);

const CONTENEURS = {
  entete: { liste: "OBJ-ENTETE-SITE", cle: "entetes", fonction: "entete", relation: "OBJ-ENTETE-SITE", libelle: "En-tête" },
  footer: { liste: "OBJ-FOOTER-SITE", cle: "footers", fonction: "footer", relation: "OBJ-FOOTER-SITE", libelle: "Footer" },
  page: { liste: "OBJ-PAGES-SITE", cle: "pages", fonction: "pages", relation: "OBJ-PAGES-SITE", libelle: "Page" }
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

const siteDuConteneur = (c) => rel(c?.el, "OBJ-SITE-PUBLIC")?.id || null;
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

function noeud(d, type, el) {
  const base = { ref: ref(type, el.id), type, titre: titreDe(el) || `${TYPES[type].libelle} sans titre`, ordre: ordreDe(el), etat: etat(el) };
  if (type === "ligne") base.structure = rel(el, "OBJ-LIGNE-STRUCTURE")?.titre || "100";
  if (type === "colonne") base.largeur = champ(el, ["LARGEUR"]);
  if (type === "section") base.typeSection = rel(el, "OBJ-SECTION-TYPE")?.titre || "STANDARD";
  if (type === "module") {
    const c = contenuDe(d, el);
    base.typeModule = c.type || "Non renseigné";
    base.formulaire = Boolean(c.liste);
    base.contenuRenseigne = Boolean(c.element);
    base.utilisations = utilisationsDe(d, el.id).length;
    base.modele = rel(el, "OBJ-MODELE-BUILDER")?.titre || null;
    return base;
  }
  base.enfants = enfantsDe(d, type, el).map((x) => noeud(d, NIVEAUX[type].enfant, x));
  return base;
}

function arbre(d, type, el) {
  return { ref: ref(type, el.id), type, titre: titreDe(el), etat: etat(el),
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

function modeleDisponible(m, perimetre) {
  if (!B.publiable(m)) return false;
  const sites = rels(m, "OBJ-SITE-PUBLIC").map((s) => s.id);
  return perimetre.superAdmin || sites.some((s) => perimetre.sites.has(s)) || Boolean(champ(m, ["GLOBAL"]) === true);
}

/* ---------------- Vue generale du constructeur ---------------- */

function vue(d, perimetre) {
  const duSite = (el) => perimetre.sites.has(rel(el, "OBJ-SITE-PUBLIC")?.id);
  const pages = (d.pages || []).filter((p) => rels(p, "OBJ-SITE-PUBLIC").some((s) => perimetre.sites.has(s.id))).sort(parOrdre);
  const conteneur = (type) => (d[CONTENEURS[type].cle] || []).filter(duSite).sort(parOrdre).map((el) => ({
    ref: ref(type, el.id), titre: titreDe(el) || `${CONTENEURS[type].libelle} sans titre`, etat: etat(el),
    noteCourte: texte(el, "NOTE-COURTE"),
    sections: enfantsDe(d, type, el).length,
    pages: pages.filter((p) => rel(p, CONTENEURS[type].relation)?.id === el.id).map((p) => ({ ref: ref("page", p.id), titre: titreDe(p) }))
  }));
  const parId = (cle, type) => (id) => { const el = (d[cle] || []).find((x) => x.id === id); return el ? { ref: ref(type, el.id), titre: titreDe(el) } : null; };
  const enteteDe = parId("entetes", "entete");
  const footerDe = parId("footers", "footer");
  const medias = (d.medias || []).filter((m) => mediaAutorise(m, perimetre));
  const logo = (d.logos || []).filter((l) => perimetre.sites.has(rel(l, "OBJ-SITE")?.id)).sort((a, b) => Number(B.publiable(b)) - Number(B.publiable(a)))[0] || null;
  const modeles = d.modeles || [];
  return {
    entetes: conteneur("entete"),
    footers: conteneur("footer"),
    pages: pages.map((p) => ({
      ref: ref("page", p.id), titre: titreDe(p), url: texte(p, "URL") || "/", etat: etat(p),
      sections: enfantsDe(d, "page", p).length,
      entete: rel(p, "OBJ-ENTETE-SITE") ? enteteDe(rel(p, "OBJ-ENTETE-SITE").id) : null,
      footer: rel(p, "OBJ-FOOTER-SITE") ? footerDe(rel(p, "OBJ-FOOTER-SITE").id) : null
    })),
    typesModules: (d.types || []).filter(B.publiable).sort(parOrdre).map((t) => {
      const code = titreDe(t).toUpperCase();
      return { code, formulaire: Boolean(B.LISTES_CONTENU[code]), description: texte(t, "NOTE-COURTE") };
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
      portee: rel(m, "OBJ-MEDIA-PORTEE")?.titre || null, url: `/api/v1/media/${encodeURIComponent(m.id)}`
    })),
    logo: logo ? {
      titre: titreDe(logo), etat: etat(logo),
      media: rel(logo, "OBJ-MEDIA") ? { titre: rel(logo, "OBJ-MEDIA").titre, url: `/api/v1/media/${encodeURIComponent(rel(logo, "OBJ-MEDIA").id)}` } : null
    } : null
  };
}

/* Apercu (ordinateur / mobile) : meme moteur que le public, brouillons inclus, elements desactives exclus. */
function apercu(d, siteId, type, el, appareil) {
  const site = { id: String(siteId) };
  const options = { appareil: B.APPAREILS.includes(String(appareil || "").toUpperCase()) ? String(appareil).toUpperCase() : null, visible: visibleApercu };
  const sections = (t, e) => B.composerSections(d, site, enfantsDe(d, t, e), options);
  if (type !== "page") return { mode: "builder", sections: sections(type, el) };
  const lie = (t) => {
    const r = rel(el, CONTENEURS[t].relation);
    const c = r ? (d[CONTENEURS[t].cle] || []).find((x) => x.id === r.id) : null;
    return c && !inactif(c) ? { sections: sections(t, c) } : null;
  };
  return { mode: "builder", sections: sections("page", el), entete: lie("entete"), footer: lie("footer") };
}

/* ======================================================================
   ACTIONS (ecriture Graph) — tout est recalcule cote serveur
   ====================================================================== */

class Ecrivain {
  constructor(g) { this.g = g; this.colonnes = new Map(); this.refs = new Map(); this.crees = []; }

  liste(nom) {
    const l = dse.trouverListe(this.g.listes, [nom]);
    if (!l) throw Object.assign(new Error(`Structure ${nom} indisponible.`), { refus: true });
    return l;
  }

  async cols(nom) {
    const l = this.liste(nom);
    if (!this.colonnes.has(l.id)) {
      this.colonnes.set(l.id, await dse.collecter(this.g.token, `/sites/${this.g.siteGraphId}/lists/${l.id}/columns` +
        "?$select=id,name,displayName,hidden,readOnly,required,lookup,boolean,text,number,dateTime,calculated,columnGroup"));
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
    const l = this.liste(nom);
    const r = await dse.graphEcriture(this.g.token, "POST", `/sites/${this.g.siteGraphId}/lists/${l.id}/items`, { fields: champs });
    const id = String(r?.id || "");
    if (!id) throw new Error("Création non confirmée par SharePoint.");
    this.crees.push({ liste: nom, id });
    return id;
  }

  async maj(nom, id, champs) {
    if (!Object.keys(champs).length) return;
    const l = this.liste(nom);
    await dse.graphEcriture(this.g.token, "PATCH", `/sites/${this.g.siteGraphId}/lists/${l.id}/items/${encodeURIComponent(id)}/fields`, champs);
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
  const textes = ecriture.champsModifiables(cols).filter((c) => !/^ORDRE/i.test(c.nom));
  const exclus = new Set([...ETATS, "OBJ-MODULE-SITE-PUBLIC"].map(cleChamp));
  const listes = [];
  for (const c of cols) {
    if (!c.lookup || c.lookup.allowMultipleValues || c.readOnly || c.hidden || exclus.has(cleChamp(c.displayName))) continue;
    const cible = w.g.listes.find((l) => l.id === c.lookup.listId);
    if (!cible) continue;
    let options;
    if (cleChamp(cible.displayName) === cleChamp("OBJ-MEDIA")) {
      options = (d.medias || []).filter((m) => mediaAutorise(m, perimetre)).map((m) => ({ id: m.id, titre: titreDe(m), media: true }));
    } else {
      const items = await ecriture.collecterFrais(w.g, `/sites/${w.g.siteGraphId}/lists/${cible.id}/items?$expand=fields($select=Title)&$top=200`);
      options = items.map((i) => ({ id: String(i.id), titre: String(i.fields?.Title || "") })).filter((o) => o.titre);
    }
    listes.push({ cle: `l${signer(`champ:${c.name}`).slice(0, 10)}`, nom: `${c.name}LookupId`, libelle: String(c.displayName || "").replace(/^OBJ[-_ ]?/i, "").replace(/[-_]+/g, " "),
      obligatoire: Boolean(c.required), options });
  }
  return { textes, listes };
}

function formulairePublic(form, valeurs = {}) {
  return {
    textes: form.textes.map((c) => ({ cle: c.cle, libelle: c.libelle, obligatoire: c.obligatoire, multiligne: c.multiligne, max: c.max, valeur: String(valeurs[c.nom] ?? "") })),
    listes: form.listes.map((l) => ({ cle: l.cle, libelle: l.libelle, obligatoire: l.obligatoire,
      options: l.options.map((o) => ({ ref: signer(`opt:${l.nom}:${o.id}`), titre: o.titre, url: o.media ? `/api/v1/media/${encodeURIComponent(o.id)}` : null })),
      valeur: valeurs[l.nom] ? signer(`opt:${l.nom}:${valeurs[l.nom]}`) : "" }))
  };
}

function validerFormulaire(form, valeurs) {
  const textesSaisis = Object.fromEntries(Object.entries(valeurs || {}).filter(([k]) => form.textes.some((c) => c.cle === k)));
  const { erreurs, propres } = ecriture.validerValeurs(form.textes, textesSaisis);
  for (const l of form.listes) {
    if (!Object.hasOwn(valeurs || {}, l.cle)) continue;
    const brut = String(valeurs[l.cle] || "");
    if (!brut) { if (l.obligatoire) erreurs.push(`${l.libelle} : valeur obligatoire.`); continue; }
    const o = l.options.find((x) => signer(`opt:${l.nom}:${x.id}`) === brut);
    if (!o) { erreurs.push(`${l.libelle} : choix non autorisé.`); continue; }
    propres[l.nom] = o.id;
  }
  const connues = new Set([...form.textes.map((c) => c.cle), ...form.listes.map((l) => l.cle)]);
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

/* ---------------- Execution d'une action ---------------- */

const FONCTION_PAR_RACINE = { entete: "entete", footer: "footer", page: "pages" };

/*
 * perimetre : { sites:Set(ID natifs du groupe), clients:Set, superAdmin, peut(fonction) }.
 * Retour : { refus } | { erreur, status } | { message, journal, cree? }.
 */
async function executer({ d, perimetre, siteId, action, params = {} }) {
  const p = params && typeof params === "object" ? params : {};
  const g = await ecriture.contexteGraph();
  const w = new Ecrivain(g);
  const journalOk = await ecriture.etatStructureJournal(g);
  if (!journalOk.disponible) return { refus: journalOk.raison };

  // Element cible + controle de site (le site de l'element doit appartenir au perimetre demande).
  const cible = (types, reference) => {
    const r = resoudre(d, reference, types);
    if (!r) return { refus: "Élément introuvable dans ce site." };
    const rac = racine(d, r.type, r.el);
    if (!rac || !perimetre.sites.has(siteDuConteneur(rac))) return { refus: "Élément hors de votre périmètre." };
    if (!perimetre.peut(FONCTION_PAR_RACINE[rac.type])) return { refus: "Action non autorisée pour votre profil." };
    return { ...r, racine: rac };
  };
  const res = (message, details = {}) => ({ message, nouveau: details, crees: w.crees });

  switch (action) {
    case "conteneur.creer": {
      const type = String(p.type || "");
      if (!["entete", "footer"].includes(type)) return { refus: "Type de conteneur non autorisé." };
      if (!perimetre.peut(CONTENEURS[type].fonction)) return { refus: "Action non autorisée pour votre profil." };
      const titre = String(p.titre || "").trim().slice(0, 255);
      if (!titre) return { erreur: "Le titre est obligatoire.", status: 400 };
      const def = CONTENEURS[type];
      const nSite = await w.lookup(def.liste, "OBJ-SITE-PUBLIC");
      if (!nSite) return { refus: "Relation au site indisponible." };
      const champs = { Title: titre, [nSite]: String(siteId), ...(await w.etats(def.liste, "brouillon")) };
      const nNote = await w.simple(def.liste, "NOTE-COURTE");
      if (nNote && p.noteCourte) champs[nNote] = String(p.noteCourte).slice(0, 255);
      const id = await w.creer(def.liste, champs);
      return res(`${def.libelle} créé en brouillon.`, { ref: ref(type, id), titre });
    }

    case "conteneur.modifier": {
      const c = cible(["entete", "footer", "page"], p.ref);
      if (c.refus) return c;
      const def = CONTENEURS[c.type];
      const form = { textes: ecriture.champsModifiables(await w.cols(def.liste)).filter((x) => !/^URL$/i.test(x.nom)), listes: [] };
      if (!p.valeurs) return { formulaire: formulairePublic(form, c.el._fields) };
      const { erreurs, propres } = validerFormulaire(form, p.valeurs);
      if (erreurs.length) return { erreur: erreurs.join(" "), status: 400 };
      await w.maj(def.liste, c.el.id, propres);
      return res(`${def.libelle} enregistré.`, { champs: Object.keys(propres).length });
    }

    case "conteneur.dupliquer": {
      const c = cible(["entete", "footer"], p.ref);
      if (c.refus) return c;
      const def = CONTENEURS[c.type];
      const extra = await w.copiables(def.liste, c.el, ["OBJ-SITE-PUBLIC"]);
      const nSite = await w.lookup(def.liste, "OBJ-SITE-PUBLIC");
      const id = await w.creer(def.liste, { Title: `${titreDe(c.el)} (variante)`.slice(0, 255), ...extra, [nSite]: String(siteDuConteneur(c.racine)), ...(await w.etats(def.liste, "brouillon")) });
      for (const s of enfantsDe(d, c.type, c.el)) await copierArbre(w, d, "section", s, c.type, id, ordreDe(s), "");
      return res(`Variante créée en brouillon ; l'original n'a pas été modifié.`, { ref: ref(c.type, id), origine: titreDe(c.el) });
    }

    case "conteneur.publier":
    case "conteneur.desactiver": {
      const c = cible(["entete", "footer", "page"], p.ref);
      if (c.refus) return c;
      const def = CONTENEURS[c.type];
      if (action === "conteneur.desactiver") {
        await w.maj(def.liste, c.el.id, await w.etats(def.liste, "inactif"));
        return res(`${def.libelle} désactivé (aucune suppression).`);
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

    case "element.dupliquer": {
      const c = cible(["section", "ligne", "colonne", "module"], p.ref);
      if (c.refus) return c;
      const pere = parent(d, c.type, c.el);
      const ordre = await prochainOrdre(enfantsDe(d, pere.type, pere.el));
      const id = await copierArbre(w, d, c.type, c.el, pere.type, pere.el.id, ordre, " (variante)");
      return res(`${NIVEAUX[c.type].libelle} dupliqué en brouillon ; l'original est inchangé.`, { ref: ref(c.type, id) });
    }

    case "element.etat": {
      const c = cible(["section", "ligne", "colonne", "module"], p.ref);
      if (c.refus) return c;
      const mode = p.etat === "actif" ? "actif" : p.etat === "inactif" ? "inactif" : null;
      if (!mode) return { erreur: "État non autorisé.", status: 400 };
      const def = NIVEAUX[c.type];
      const champs = await w.etats(def.liste, mode);
      await w.maj(def.liste, c.el.id, champs);
      let n = 0;
      if (c.type === "module") {
        for (const u of utilisationsDe(d, c.el.id)) { await w.maj("OBJ-MODULE-UTILISATION", u.id, await w.etats("OBJ-MODULE-UTILISATION", mode)); n++; }
      }
      return res(`${def.libelle} ${mode === "actif" ? "validé et activé" : "désactivé (aucune suppression)"}${c.type === "module" ? ` — ${n} utilisation(s) synchronisée(s)` : ""}.`);
    }

    case "contenu.formulaire":
    case "contenu.enregistrer": {
      const c = cible(["module"], p.ref);
      if (c.refus) return c;
      const ct = contenuDe(d, c.el);
      if (!ct.liste) return { erreur: "Ce type de module n'a pas de formulaire de contenu.", status: 400 };
      const form = await formulaireContenu(w, ct.liste, perimetre, d);
      if (action === "contenu.formulaire") return { formulaire: formulairePublic(form, ct.element?._fields || {}), type: ct.type };
      const { erreurs, propres } = validerFormulaire(form, p.valeurs);
      if (erreurs.length) return { erreur: erreurs.join(" "), status: 400 };
      if (ct.element) {
        await w.maj(ct.liste, ct.element.id, propres);
        return res("Contenu du module enregistré.");
      }
      const nMod = await w.lookup(ct.liste, "OBJ-MODULE-SITE-PUBLIC");
      if (!nMod) return { refus: "Relation du contenu au module indisponible." };
      const etats = await w.etats(ct.liste, B.publiable(c.el) ? "actif" : "brouillon");
      await w.creer(ct.liste, { Title: titreDe(c.el) || ct.type, ...propres, ...etats, [nMod]: String(c.el.id) });
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

    default:
      return { refus: "Action inconnue." };
  }
}

module.exports = { siteDe, CONTENEURS, NIVEAUX, vue, arbre, apercu, racine, resoudre, executer, ref, mediaAutorise, modeleDisponible, visibleApercu, inactif, brouillon, Ecrivain };
