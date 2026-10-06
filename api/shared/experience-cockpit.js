"use strict";

const dse = require("./dse");
const A = require("../auth/autorisations");
const ecriture = require("./ecriture");

const CONTENEURS = { entete: ["OBJ-ENTETE-SITE", "entetes"], footer: ["OBJ-FOOTER-SITE", "footers"],
  pages: ["OBJ-PAGES-SITE", "pages"], construction: ["OBJ-BUILDER-ELEMENT", "builderElements"] };
const TEXTE_ACCOMPAGNEMENT = "L’IA vous aide, l’humain reste présent.\nPasc ARA IA vous accompagne et vous conseille.\nPasc ARA, humain, reste toujours disponible lorsque l’intervention humaine est nécessaire.";
const champ = (l, nom, type) => {
  const cs = l.cols.filter((c) => c.displayName === nom);
  if (cs.length !== 1 || type && !cs[0][type]) throw new Error(`${l.nom} : ${nom} unique exploitable requis.`);
  return cs[0];
};
const valeur = (l, i, nom, type) => {
  const c = champ(l, nom, type);
  return i.fields[c.lookup ? `${c.name}LookupId` : c.name];
};

async function lireListe(g, nom) {
  const ls = g.listes.filter((l) => l.displayName === nom);
  if (ls.length > 1) throw new Error(`${nom} : liste officielle dupliquee.`);
  return ls.length ? A.lireListe(g.token, g.siteGraphId, { ...ls[0], nom },
    new Set(g.listes.map((l) => l.id.toLowerCase()))) : null;
}

function etatsDepuis(l) {
  if (!l) return null;
  return new Map(l.items.filter((i) => valeur(l, i, "ACTIF", "boolean") === true).map((i) => {
    const progression = valeur(l, i, "PROGRESSION", "number");
    const titre = String(i.fields.Title || "").trim();
    if (!titre || typeof progression !== "number" || !Number.isFinite(progression) || progression < 0 || progression > 100) {
      throw new Error("Etat de realisation invalide : libelle et progression 0-100 requis.");
    }
    const couleur = String(valeur(l, i, "COULEUR", "text") || "");
    if (couleur && !/^#[0-9a-f]{6}$/i.test(couleur)) throw new Error("Couleur d'etat de realisation invalide.");
    return [String(i.id), { titre, progression, couleur: couleur || null,
      libelleAction: String(valeur(l, i, "LIBELLE-ACTION", "text") || ""),
      operation: String(valeur(l, i, "OPERATION-TECHNIQUE", "text") || "") }];
  }));
}

async function chargerRealisations(g) {
  const l = await lireListe(g, "OBJ-REALISATION-ETAT");
  const etats = etatsDepuis(l);
  if (!l) return { etat: "absente", message: "Les états de réalisation ne sont pas encore configurés.", elements: {} };
  const elements = {};
  await Promise.all(Object.values(CONTENEURS).map(async ([nom, cle]) => {
    const liste = dse.trouverListe(g.listes, nom);
    if (!liste) return;
    const cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id);
    const cs = cols.filter((c) => c.displayName === "REALISATION-ETAT" && c.lookup &&
      !c.lookup.allowMultipleValues && c.lookup.listId.toLowerCase() === l.id.toLowerCase());
    if (!cs.length) return;
    if (cs.length !== 1) throw new Error(`${nom} : rattachement d'etat duplique.`);
    const c = cs[0];
    const xs = await ecriture.collecterFrais(g,
      `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields($select=${c.name}LookupId)&$top=200`);
    elements[cle] = Object.fromEntries(xs.map((i) => {
      const id = i.fields[`${c.name}LookupId`];
      if (id && !etats.has(String(id))) throw new Error(`${nom} : etat de realisation inactif ou inconnu.`);
      return [String(i.id), id ? etats.get(String(id)) : null];
    }));
  }));
  return { etat: etats.size ? "configuree" : "vide", elements,
    message: etats.size ? null : "Les états de réalisation attendent leur configuration officielle." };
}

function appliquerProgression(vue, realisations, donnees, siteId, resolution) {
  if (realisations.etat !== "configuree") return vue;
  const C = require("./constructeur");
  for (const [fonction, [, cle]] of Object.entries(CONTENEURS)) {
    const etape = vue.etapes.find((e) => e.cle === fonction);
    if (!etape) continue;
    const elements = (donnees[cle] || []).filter((el) => String(C.siteDe(donnees, fonction === "pages" ? "page" : fonction, el)) === String(siteId));
    const details = elements.map((el) => ({ titre: el._fields?.Title || "", etat: realisations.elements[cle]?.[el.id] }));
    if (!details.length || details.some((d) => !d.etat)) continue;
    etape.realisations = details.map(({ titre, etat }) => ({ nom: titre, ...etat,
      actionAutorisee: !!etat.operation && A.autoriser(resolution, etat.operation).autorise }));
    etape.progression = details.reduce((s, d) => s + d.etat.progression, 0) / details.length;
    etape.etat = etape.progression === 100 ? "termine" : etape.progression === 0 ? "afaire" : "encours";
  }
  if (vue.etapes.length) vue.progression = Math.round(vue.etapes.reduce((s, e) =>
    s + (typeof e.progression === "number" ? e.progression : e.etat === "termine" ? 100 : 0), 0) / vue.etapes.length);
  return vue;
}

function decorerConstruction(vue, realisations) {
  const C = require("./constructeur");
  for (const [fonction, [, cle]] of Object.entries(CONTENEURS)) {
    const type = fonction === "pages" ? "page" : fonction === "construction" ? "builderelement" : fonction;
    const parRef = new Map(Object.entries(realisations.elements[cle] || {}).map(([id, etat]) => [C.ref(type, id), etat]));
    for (const c of vue[cle] || []) c.realisation = parRef.get(c.ref) || null;
    if (vue.arbre && vue.arbre.type === type) vue.arbre.realisation = parRef.get(vue.arbre.ref) || null;
    if (type === "builderelement") {
      const decorer = (n) => { n.realisation = parRef.get(n.ref) || null; for (const e of n.enfants || []) decorer(e); };
      if (vue.arbre?.generique) decorer(vue.arbre.generique);
    }
  }
  return vue;
}

async function accompagnement(g) {
  const l = await lireListe(g, "OBJ-ACCOMPAGNEMENT");
  if (!l) return { texte: TEXTE_ACCOMPAGNEMENT, etat: "absente", identites: [] };
  const medias = dse.trouverListe(g.listes, "OBJ-MEDIA");
  const utilisateurs = dse.trouverListe(g.listes, "OBJ-UTILISATEUR");
  const actives = l.items.filter((i) => valeur(l, i, "ACTIF", "boolean") === true);
  const identites = actives.map((i) => {
    const type = valeur(l, i, "TYPE-IDENTITE", "text");
    if (!["humain", "ia"].includes(type)) throw new Error("Type technique d'identite d'accompagnement inconnu.");
    const c = champ(l, "OBJ-MEDIA", "lookup");
    const u = champ(l, "OBJ-UTILISATEUR", "lookup");
    if (c.lookup.allowMultipleValues || c.lookup.listId.toLowerCase() !== medias?.id.toLowerCase() ||
      u.lookup.allowMultipleValues || u.lookup.listId.toLowerCase() !== utilisateurs?.id.toLowerCase()) {
      throw new Error("Relations natives d'accompagnement incoherentes.");
    }
    const mediaId = i.fields[`${c.name}LookupId`];
    if (type === "ia" && i.fields[`${u.name}LookupId`]) throw new Error("L'assistance IA ne doit pas etre liee a un compte humain.");
    return { type, libelle: i.fields.Title, description: valeur(l, i, "DESCRIPTION", "text"),
      avatar: mediaId ? `/api/v1/media/${encodeURIComponent(mediaId)}` : null };
  });
  if (new Set(identites.map((i) => i.type)).size !== identites.length ||
    identites.length === 2 && identites[0].avatar && identites[0].avatar === identites[1].avatar) {
    throw new Error("Les identites et avatars humain/IA doivent etre distincts.");
  }
  return { texte: TEXTE_ACCOMPAGNEMENT, etat: identites.length === 2 && identites.every((i) => i.avatar)
    ? "configuree" : "incomplete", identites };
}

async function lire() {
  const g = await ecriture.contexteGraph();
  const resultat = {};
  for (const [cle, fn] of [["realisations", chargerRealisations], ["accompagnement", accompagnement]]) {
    try { resultat[cle] = await fn(g); } catch (e) {
      console.error("[DemainSite Ecosysteme cockpit]", cle, e.message);
      resultat[cle] = { etat: "erreur", message: "Cette configuration nécessite une vérification par l'administration.",
        ...(cle === "accompagnement" ? { texte: TEXTE_ACCOMPAGNEMENT, identites: [] } : { elements: {} }) };
    }
  }
  return resultat;
}

module.exports = { lire, lireListe, champ, valeur, etatsDepuis, appliquerProgression, decorerConstruction, TEXTE_ACCOMPAGNEMENT };
