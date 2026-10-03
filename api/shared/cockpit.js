"use strict";

/*
 * Vue cockpit d'un site, calculee cote serveur a partir de site-complet.
 * Aucune information technique (liste, colonne, Lookup, identifiant) n'est renvoyee :
 * uniquement des libelles d'interface, des etats et des resumes lisibles.
 */

const perimetre = require("./perimetre");
const FONCTIONS_COCKPIT = [
  "sites", "creer", "pages", "entete", "logo-medias", "menu",
  "footer", "seo", "domaine", "apercu", "suivi",
  "administration", "utilisateurs", "plateforme"
];

const ETATS = { termine: "termine", encours: "encours", afaire: "afaire", attention: "attention" };

const relationOui = (el, prefixe) => Object.entries(el?.relations || {})
  .some(([k, v]) => k.startsWith(prefixe) && !k.includes(":") && String(v?.id) === "1");
const publie = (el) => relationOui(el, "OBJ-ACTIF") && relationOui(el, "OBJ-VALIDE");

function liste(valeur) {
  if (Array.isArray(valeur)) return valeur;
  return valeur ? [valeur] : [];
}

function titreElement(el) {
  const conf = el?.configuration || {};
  const cle = Object.keys(conf).find((k) => /^titre/i.test(k) && typeof conf[k] === "string" && conf[k].trim());
  return cle ? conf[cle].trim() : null;
}

function urlsElement(el) {
  const sortie = [];
  for (const v of Object.values(el?.configuration || {})) {
    if (v && typeof v === "object" && typeof v.Url === "string") sortie.push(v.Url);
    else if (typeof v === "string" && /^https?:\/\//i.test(v)) sortie.push(v);
  }
  return sortie;
}

// Un lien public ne doit jamais renvoyer vers l'espace de travail interne.
const lienInterne = (url) => /\.sharepoint\.com/i.test(String(url || ""));

function etatElements(elements, { verifierLiens = false } = {}) {
  if (elements.length === 0) return { etat: ETATS.afaire, nombre: 0, resume: [] };
  const resume = elements.map(titreElement).filter(Boolean).slice(0, 5);
  if (verifierLiens && elements.some((el) => urlsElement(el).some(lienInterne))) {
    return { etat: ETATS.attention, nombre: elements.length, resume, alerte: "Un lien pointe vers un espace interne." };
  }
  const etat = elements.every(publie) ? ETATS.termine : ETATS.encours;
  return { etat, nombre: elements.length, resume };
}

function composant(sc, cle) {
  const c = sc?.[cle];
  return c && c.disponible !== false ? liste(c.donnees) : [];
}

function contenus(sc, filtre) {
  return Object.entries(sc?.contenus || {})
    .filter(([cle]) => filtre(cle))
    .flatMap(([, c]) => (c && c.disponible !== false ? liste(c.donnees) : []));
}

function etatDomaines(dom) {
  if (!dom.tous.length) return { etat: ETATS.afaire, nombre: 0, resume: [] };
  const resume = dom.principal ? [`${dom.principal} (principal)`, ...dom.alias] : dom.tous;
  if (dom.aPreciser) {
    return { etat: ETATS.attention, nombre: dom.tous.length, resume: resume.slice(0, 6), alerte: "Plusieurs domaines : le domaine principal reste à désigner." };
  }
  return { etat: ETATS.termine, nombre: dom.tous.length, resume: resume.slice(0, 6) };
}

function vueSite({ siteComplet, info, statut, fonctions = FONCTIONS_COCKPIT, domaineDemande = null }) {
  const sc = siteComplet || {};
  const dom = perimetre.domainesDuSite(info);
  const domaines = dom.tous;
  const nom = sc.site?.nom || info?.titre || null;
  const actif = String(statut?.code || "").toUpperCase() === "ACTIF";
  const logo = composant(sc, "logo");
  const medias = contenus(sc, (c) => c !== "footer").filter((el) => el.media);

  const etapes = [
    { cle: "informations", fonction: "sites", libelle: "Informations", ...(nom ? { etat: ETATS.termine, nombre: 1, resume: [nom] } : { etat: ETATS.afaire, nombre: 0, resume: [] }) },
    { cle: "domaine", fonction: "domaine", libelle: "Domaine", ...etatDomaines(dom) },
    { cle: "identite", fonction: "logo-medias", libelle: "Logo et médias", ...etatElements([...logo, ...medias]) },
    { cle: "entete", fonction: "entete", libelle: "En-tête", ...etatElements(composant(sc, "entete")) },
    { cle: "menu", fonction: "menu", libelle: "Menu", ...etatElements(composant(sc, "menu"), { verifierLiens: true }) },
    { cle: "pages", fonction: "pages", libelle: "Pages", ...etatElements(liste(sc.pages?.donnees)) },
    { cle: "contenus", fonction: "pages", libelle: "Contenus", ...etatElements(contenus(sc, (c) => c !== "footer"), { verifierLiens: true }) },
    { cle: "footer", fonction: "footer", libelle: "Footer", ...etatElements(contenus(sc, (c) => c === "footer"), { verifierLiens: true }) },
    { cle: "seo", fonction: "seo", libelle: "Référencement (SEO)", ...etatElements(composant(sc, "seo")) },
    { cle: "publication", fonction: "apercu", libelle: "Publication", etat: actif ? ETATS.termine : (statut ? ETATS.encours : ETATS.afaire), nombre: statut ? 1 : 0, resume: statut?.titre ? [statut.titre] : [] }
  ].filter((e) => fonctions.includes(e.fonction));

  const terminees = etapes.filter((e) => e.etat === ETATS.termine).length;
  return {
    nom,
    domaine: dom.principal,
    alias: dom.alias,
    domaines,
    domaineAPreciser: dom.aPreciser,
    acces: perimetre.domaineAcces(info, domaineDemande),
    statut: statut ? { titre: statut.titre || null, actif, message: statut.noteCourte || null } : null,
    progression: etapes.length ? Math.round((terminees / etapes.length) * 100) : 0,
    etapes: etapes.map(({ fonction, ...e }) => e),
    fonctions
  };
}

const NON_RENSEIGNE = "Non renseigné";
const TRANCHES_PROGRESSION = [
  { valeur: "0-49", libelle: "Moins de 50 %", min: 0, max: 49 },
  { valeur: "50-99", libelle: "De 50 à 99 %", min: 50, max: 99 },
  { valeur: "100", libelle: "Terminé (100 %)", min: 100, max: 100 }
];
const TRIS = ["nom", "domaine", "statut", "client", "progression"];

/*
 * Resume d'un site pour « Mes sites ». Si un resume de contenus est fourni, la progression
 * est calculee par vueSite : exactement le meme moteur que la fiche site.
 */
function resumeSite(info, statut, siteComplet = null) {
  const dom = perimetre.domainesDuSite(info);
  const resume = {
    nom: info?.titre || null,
    domaine: dom.principal,
    alias: dom.alias,
    domaineAPreciser: dom.aPreciser,
    acces: perimetre.domaineAcces(info),
    statut: statut ? { titre: statut.titre || null, actif: String(statut.code || "").toUpperCase() === "ACTIF" } : null,
    client: String(info?.client || "").trim() || null
  };
  if (siteComplet) {
    const vue = vueSite({ siteComplet, info, statut });
    resume.progression = vue.progression;
    resume.aCompleter = vue.etapes.filter((e) => e.etat !== ETATS.termine).map((e) => ({ cle: e.cle, libelle: e.libelle, etat: e.etat }));
  }
  return resume;
}

const sansAccent = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const statutTitre = (s) => s.statut?.titre || NON_RENSEIGNE;
const clientTitre = (s) => s.client || NON_RENSEIGNE;

function compter(elements, cle) {
  const m = new Map();
  for (const e of elements) m.set(cle(e), (m.get(cle(e)) || 0) + 1);
  return [...m.entries()].map(([valeur, nombre]) => ({ valeur, nombre }))
    .sort((a, b) => a.valeur.localeCompare(b.valeur, "fr"));
}

/*
 * Recherche, filtres, tri et pagination de « Mes sites », cote serveur.
 * Les choix de statut et de client sont produits a partir des donnees elles-memes.
 */
function filtrerSites(resumes, query = {}) {
  const q = sansAccent(query.q);
  const statut = String(query.statut || "").trim();
  const client = String(query.client || "").trim();
  const tranche = TRANCHES_PROGRESSION.find((t) => t.valeur === String(query.progression || ""));
  const aCompleter = String(query.aCompleter || "").trim();
  const tri = TRIS.includes(query.tri) ? query.tri : "nom";
  const sens = query.sens === "desc" ? -1 : 1;
  const parPage = Math.min(100, Math.max(1, parseInt(query.parPage, 10) || 25));

  const recherches = resumes.filter((s) => !q ||
    [s.nom, s.domaine, ...(s.alias || [])].some((v) => sansAccent(v).includes(q)));
  const etapesDispo = new Map();
  for (const s of resumes) for (const e of s.aCompleter || []) etapesDispo.set(e.cle, e.libelle);

  const filtres = recherches.filter((s) =>
    (!statut || statutTitre(s) === statut) &&
    (!client || clientTitre(s) === client) &&
    (!tranche || (typeof s.progression === "number" && s.progression >= tranche.min && s.progression <= tranche.max)) &&
    (!aCompleter || (aCompleter === "tout"
      ? (s.aCompleter || []).length > 0
      : (s.aCompleter || []).some((e) => e.cle === aCompleter))));

  const valeur = {
    nom: (s) => sansAccent(s.nom),
    domaine: (s) => sansAccent(s.domaine),
    statut: (s) => sansAccent(statutTitre(s)),
    client: (s) => sansAccent(clientTitre(s)),
    progression: (s) => s.progression ?? -1
  }[tri];
  filtres.sort((a, b) => {
    const va = valeur(a);
    const vb = valeur(b);
    const c = typeof va === "number" ? va - vb : va.localeCompare(vb, "fr");
    return c * sens || sansAccent(a.nom).localeCompare(sansAccent(b.nom), "fr");
  });

  const total = filtres.length;
  const pages = Math.max(1, Math.ceil(total / parPage));
  const page = Math.min(pages, Math.max(1, parseInt(query.page, 10) || 1));
  return {
    elements: filtres.slice((page - 1) * parPage, page * parPage),
    total,
    totalSites: resumes.length,
    page,
    pages,
    parPage,
    compteurs: compter(resumes, statutTitre),
    options: {
      statuts: compter(resumes, statutTitre).map((c) => c.valeur),
      clients: compter(resumes, clientTitre).map((c) => c.valeur),
      progressions: TRANCHES_PROGRESSION.map(({ valeur: v, libelle }) => ({ valeur: v, libelle })),
      aCompleter: [...etapesDispo.entries()].map(([v, libelle]) => ({ valeur: v, libelle })),
      tris: TRIS
    },
    criteres: { q: query.q || "", statut, client, progression: tranche?.valeur || "", aCompleter, tri, sens: sens < 0 ? "desc" : "asc" }
  };
}

module.exports = { FONCTIONS_COCKPIT, ETATS, vueSite, resumeSite, filtrerSites, _test: { publie, lienInterne, titreElement } };
