"use strict";

// Constructeur DSE : lecture, portee, references opaques, apercu et composition publique En-tete / Footer (donnees simulees, aucun appel Graph).
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const C = require("../shared/constructeur");
const B = require("../shared/builder");

const front = (f) => import(pathToFileURL(path.join(__dirname, "..", "..", "modules", f)).href);
const OUI = { id: "1", titre: "OUI" };
const NON = { id: "2", titre: "NON" };
const BROUILLON = { id: "3", titre: "BROUILLON" };
const el = (id, titre, relations = {}, configuration = {}, actif = OUI, valide = OUI) => ({
  id: String(id), _fields: { Title: titre }, configuration: { Title: titre, ...configuration },
  relations: { "OBJ-ACTIF": actif, "OBJ-VALIDE": valide, ...relations }
});
const lien = (id, titre = null) => ({ id: String(id), titre });

function donnees() {
  return {
    pages: [el(2, "Accueil", { "OBJ-SITE-PUBLIC": lien(4), "OBJ-ENTETE-SITE": lien(1), "OBJ-FOOTER-SITE": lien(5) }, { URL: "/" }),
      el(3, "Autre site", { "OBJ-SITE-PUBLIC": lien(9) })],
    entetes: [el(1, "En-tête principal", { "OBJ-SITE-PUBLIC": lien(4) }), el(8, "En-tête autre", { "OBJ-SITE-PUBLIC": lien(9) })],
    footers: [el(5, "Footer brouillon", { "OBJ-SITE-PUBLIC": lien(4) }, {}, BROUILLON, NON)],
    sections: [el(100, "Haut", { "OBJ-ENTETE-SITE": lien(1) }, { "ORDRE-AFFICHAGE": 10 }),
      el(101, "Bas", { "OBJ-FOOTER-SITE": lien(5) }, {}, BROUILLON, NON),
      el(102, "Désactivée", { "OBJ-ENTETE-SITE": lien(1) }, { "ORDRE-AFFICHAGE": 20 }, NON, OUI)],
    lignes: [el(1000, "L1", { "OBJ-SECTION-SITE": lien(100), "OBJ-LIGNE-STRUCTURE": lien(1, "100") }),
      el(1001, "L2", { "OBJ-SECTION-SITE": lien(101), "OBJ-LIGNE-STRUCTURE": lien(1, "100") }, {}, BROUILLON, NON)],
    colonnes: [el(5000, "C1", { "OBJ-LIGNE-SITE": lien(1000) }), el(5001, "C2", { "OBJ-LIGNE-SITE": lien(1001) }, {}, BROUILLON, NON)],
    types: [el(1, "TITRE"), el(2, "TEXTE")],
    modules: [el(7000, "Titre haut", { "OBJ-COLONNE-SITE": lien(5000), OBJMODULESITEPUBLICTYPE: lien(1, "TITRE") }),
      el(7001, "Texte bas", { "OBJ-COLONNE-SITE": lien(5001), OBJMODULESITEPUBLICTYPE: lien(2, "TEXTE") }, {}, BROUILLON, NON)],
    utilisations: [el(1, "U", { "OBJ-MODULE-SITE-PUBLIC": lien(7000), "OBJ-COLONNE-SITE": lien(5000) })],
    contenus: {
      "OBJ-MODULE-TITRE": [el(1, "T", { "OBJ-MODULE-SITE-PUBLIC": lien(7000) }, { TEXTE: "Bienvenue" })],
      "OBJ-MODULE-TEXTE": [el(2, "X", { "OBJ-MODULE-SITE-PUBLIC": lien(7001) }, { "TEXTE-ENRICHI": "<p>Mentions</p>" }, BROUILLON, NON)]
    },
    medias: [el(1, "Global", { "OBJ-MEDIA-PORTEE": lien(1, "GLOBAL") }), el(2, "Client A", { "OBJ-MEDIA-PORTEE": lien(2, "CLIENT"), "OBJ-CLIENT": lien("A") }),
      el(3, "Client B", { "OBJ-MEDIA-PORTEE": lien(2, "CLIENT"), "OBJ-CLIENT": lien("B") }), el(4, "Site 9", { "OBJ-MEDIA-PORTEE": lien(3, "SITE"), "OBJ-SITE-PUBLIC": lien(9) }),
      el(5, "Inactif", { "OBJ-MEDIA-PORTEE": lien(1, "GLOBAL") }, {}, NON, OUI)],
    logos: [el(1, "Logo", { "OBJ-SITE": lien(4), "OBJ-MEDIA": lien(1, "Global") })],
    modeles: [el(1, "Modèle non validé", {}, {}, OUI, NON)],
    structures: [el(1, "100", {}, { "NOMBRE-COLONNES": 1 }), el(2, "50-50", {}, { "NOMBRE-COLONNES": 2 })],
    typesSection: [el(1, "STANDARD")],
    presets: [], responsifs: [], couleurs: [], polices: []
  };
}
const perimetre = { sites: new Set(["4"]), clients: new Set(["A"]), superAdmin: false, peut: () => true };

async function main() {
  const d = donnees();
  const v = C.vue(d, perimetre);

  // Seuls les elements du site du perimetre sont visibles.
  assert.deepEqual(v.entetes.map((x) => x.titre), ["En-tête principal"]);
  assert.deepEqual(v.pages.map((x) => x.titre), ["Accueil"]);
  assert.equal(v.entetes[0].pages[0].titre, "Accueil", "pages utilisatrices de l'En-tete");
  assert.equal(v.footers[0].etat.brouillon, true);
  assert.equal(v.pages[0].entete.titre, "En-tête principal");

  // Portee des medias : GLOBAL + client du site ; jamais un autre client, un autre site ou un media inactif.
  assert.deepEqual(v.medias.map((m) => m.titre), ["Global", "Client A"]);
  assert.equal(C.vue(d, { ...perimetre, superAdmin: true }).medias.length, 4, "Super Administrateur : tous les medias publies");
  assert.equal(v.logo.media.titre, "Global");

  // Modeles : aucun modele valide => aucun disponible, le nombre en attente est signale.
  assert.deepEqual(v.modeles, { disponibles: [], enAttente: 1 });
  assert.deepEqual(v.structures.map((s) => s.colonnes), [1, 2]);
  assert.equal(JSON.stringify(v).includes('"id"'), false, "aucun ID SharePoint expose");

  // References opaques : resolution exacte, refus des references falsifiees ou d'un autre type.
  const r = C.resoudre(d, v.entetes[0].ref, ["entete"]);
  assert.equal(r.el.id, "1");
  assert.equal(C.resoudre(d, "entete.0000", ["entete"]), null);
  assert.equal(C.resoudre(d, v.entetes[0].ref, ["footer"]), null);
  assert.equal(C.siteDe(d, "module", d.modules[0]), "4", "remontee module -> colonne -> ligne -> section -> En-tete -> site");

  // Arbre : sections ordonnees, element desactive conserve (visible dans l'editeur) mais marque.
  const a = C.arbre(d, "entete", d.entetes[0]);
  assert.deepEqual(a.sections.map((s) => s.titre), ["Haut", "Désactivée"]);
  assert.equal(a.sections[1].etat.inactif, true);
  const m = a.sections[0].enfants[0].enfants[0].enfants[0];
  assert.equal(m.typeModule, "TITRE");
  assert.equal(m.utilisations, 1);
  assert.equal(m.contenuRenseigne, true);

  // Apercu : brouillons inclus, desactives exclus.
  const apEntete = C.apercu(d, "4", "entete", d.entetes[0]);
  assert.equal(apEntete.sections.length, 1);
  const apFooter = C.apercu(d, "4", "footer", d.footers[0]);
  assert.equal(apFooter.sections.length, 1, "le brouillon apparait dans l'apercu");

  // Composition publique : En-tete affecte et publie rendu ; Footer en brouillon jamais publie.
  const comp = B.composerPage({ ...d, pages: [d.pages[0]] }, { id: "4" });
  assert.equal(comp.mode, "builder");
  assert.equal(comp.entete.sections.length, 1);
  assert.equal(comp.footer, null, "Footer non valide jamais publie");
  const compAutre = B.composerPage({ ...d, pages: [d.pages[0]], entetes: [el(1, "x", { "OBJ-SITE-PUBLIC": lien(9) })] }, { id: "4" });
  assert.ok(!compAutre.entete && compAutre.mode === "historique", "En-tete d'un autre site jamais rendu");

  // Front : interface constructeur, aucune donnee technique, popup IA et apercu.
  const { rendreConstructeur, documentApercu, ONGLETS, badgeEtat } = await front("cockpit/constructeur.js");
  {
    const donneesFront = { ...v, site: { titre: "Site", domaine: "exemple.test" }, droits: { entete: { ecriture: true }, footer: { ecriture: true }, pages: { ecriture: false }, "logo-medias": { ecriture: true } } };
    const html = rendreConstructeur({ nom: "x", fonctions: [] }, donneesFront, { domaine: "exemple.test" });
    for (const o of ONGLETS) assert.ok(html.includes(o.libelle));
    assert.ok(html.includes("Dupliquer") && html.includes("Affecter aux pages") && html.includes("Voir les utilisations"));
    assert.equal(/HERO/i.test(html), false, "vocabulaire En-tete, jamais HERO");
    const editeur = rendreConstructeur({ fonctions: [] }, { ...donneesFront, arbre: a, apercu: apEntete }, {});
    assert.ok(editeur.includes("Pasc ARA IA") && editeur.includes("Ajouter une section") && editeur.includes("Aperçu mobile"));
    assert.ok(documentApercu({ mode: "builder", sections: [] }).includes("Aperçu vide"));
    assert.ok(badgeEtat({ brouillon: true }).includes("Brouillon"));
  }
  console.log("Constructeur : perimetre, medias, references opaques, arbre, apercu, En-tete/Footer publics et interface OK");
}

main().catch((e) => { console.error(e); process.exit(1); });
