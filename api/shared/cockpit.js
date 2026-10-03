"use strict";

/*
 * Vue cockpit d'un site, calculee cote serveur a partir de site-complet.
 * Aucune information technique (liste, colonne, Lookup, identifiant) n'est renvoyee :
 * uniquement des libelles d'interface, des etats et des resumes lisibles.
 */

const FONCTIONS_COCKPIT = [
  "sites", "creer", "pages", "entete", "logo-medias", "menu",
  "footer", "seo", "domaine", "apercu", "suivi"
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

function vueSite({ siteComplet, info, statut, fonctions = FONCTIONS_COCKPIT }) {
  const sc = siteComplet || {};
  const domaines = Array.isArray(info?.domaines) ? info.domaines : [];
  const nom = sc.site?.nom || info?.titre || null;
  const actif = String(statut?.code || "").toUpperCase() === "ACTIF";
  const logo = composant(sc, "logo");
  const medias = contenus(sc, (c) => c !== "footer").filter((el) => el.media);

  const etapes = [
    { cle: "informations", fonction: "sites", libelle: "Informations", ...(nom ? { etat: ETATS.termine, nombre: 1, resume: [nom] } : { etat: ETATS.afaire, nombre: 0, resume: [] }) },
    { cle: "domaine", fonction: "domaine", libelle: "Domaine", ...(domaines.length ? { etat: ETATS.termine, nombre: domaines.length, resume: domaines.slice(0, 5) } : { etat: ETATS.afaire, nombre: 0, resume: [] }) },
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
    domaine: domaines[0] || null,
    domaines,
    statut: statut ? { titre: statut.titre || null, actif, message: statut.noteCourte || null } : null,
    progression: etapes.length ? Math.round((terminees / etapes.length) * 100) : 0,
    etapes: etapes.map(({ fonction, ...e }) => e),
    fonctions
  };
}

function resumeSite(info, statut) {
  const domaines = Array.isArray(info?.domaines) ? info.domaines : [];
  return {
    nom: info?.titre || null,
    domaine: domaines[0] || null,
    statut: statut ? { titre: statut.titre || null, actif: String(statut.code || "").toUpperCase() === "ACTIF" } : null
  };
}

module.exports = { FONCTIONS_COCKPIT, ETATS, vueSite, resumeSite, _test: { publie, lienInterne, titreElement } };
