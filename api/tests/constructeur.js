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
  const uiConstructeur = await front("cockpit/constructeur.js");
  const mediasUI = await front("cockpit/medias.js");
  const mediasHtml = mediasUI.rendreMedias({ ...v, droits: { "logo-medias": { ecriture: true } },
    medias: [
      { ref: "image", titre: "Photo <b>", type: "IMAGE", url: "/api/v1/media/1", portee: "SITE" },
      { ref: "son", titre: "Son", type: "AUDIO", url: "/api/v1/media/2", portee: "SITE" },
      { ref: "video", titre: "Vidéo", type: "VIDEO", url: "/api/v1/media/3", portee: "SITE" }
    ] }, { domaine: "site.example.test" });
  assert.ok(!mediasHtml.includes("role=\"tab\"") && !mediasHtml.includes("data-c-creer"));
  assert.ok(!mediasHtml.includes("<b>"));
  assert.ok(mediasHtml.includes('data-media-logo="image"'));
  assert.ok(!mediasHtml.includes('data-media-logo="son"') && !mediasHtml.includes('src="/api/v1/media/2"'));
  assert.ok(mediasHtml.includes("AUDIO") && mediasHtml.includes("VIDEO") && mediasHtml.includes("data-filtres-medias"));
  assert.ok(!mediasUI.rendreMedias({ ...v, droits: {} }, { domaine: "site.example.test" }).includes("data-media-logo"));
  assert.equal(mediasUI.imageMedia("FAVICON"), true);

  // Seuls les elements du site du perimetre sont visibles.
  assert.deepEqual(v.entetes.map((x) => x.titre), ["En-tête principal"]);
  assert.deepEqual(v.pages.map((x) => x.titre), ["Accueil"]);
  assert.equal(v.entetes[0].pages[0].titre, "Accueil", "pages utilisatrices de l'En-tete");
  assert.equal(v.footers[0].etat.brouillon, true);
  assert.equal(v.pages[0].entete.titre, "En-tête principal");

  // Portee des medias : GLOBAL + client du site ; jamais un autre client, un autre site ou un media inactif.
  assert.deepEqual(v.medias.map((m) => m.titre), ["Global", "Client A"]);
  assert.equal(C.referenceBuilder("1", "media"), v.medias[0].ref, "le Builder réutilise la référence média signée du cockpit");
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

  const pageAvecBrouillons = donnees();
  pageAvecBrouillons.sections.push(el(200, "Section en brouillon", { "OBJ-PAGES-SITE": lien(2) }, {}, BROUILLON, NON));
  pageAvecBrouillons.lignes.push(el(2000, "Ligne", { "OBJ-SECTION-SITE": lien(200) }));
  pageAvecBrouillons.colonnes.push(el(2001, "Colonne", { "OBJ-LIGNE-SITE": lien(2000) }));
  pageAvecBrouillons.modules.push(
    el(7002, "Module en brouillon", { "OBJ-COLONNE-SITE": lien(2001), OBJMODULESITEPUBLICTYPE: lien(1, "TITRE") }, {}, BROUILLON, NON),
    el(7003, "Module actif non validé", { "OBJ-COLONNE-SITE": lien(2001), OBJMODULESITEPUBLICTYPE: lien(1, "TITRE") }, {}, OUI, NON)
  );
  const htmlConstructeur = uiConstructeur.rendreConstructeur({ nom: "Pascal" }, {
    site: { titre: "DemainSite Écosystème" },
    arbre: C.arbre(pageAvecBrouillons, "page", pageAvecBrouillons.pages[0]),
    operations: ["constructeur.page.conteneur.modifier", "constructeur.page.conteneur.publier",
      "constructeur.page.element.etat", "constructeur.page.element.deplacer"],
    modeles: { disponibles: [] }, structures: [], typesSection: [], typesModules: [], medias: []
  }, { domaine: "dseco.fr" });
  assert.ok(htmlConstructeur.includes("data-c-action=\"publier\""), "un conteneur publié propose de publier ses nouveaux brouillons");
  assert.ok(htmlConstructeur.includes("✅ Valider et activer"), "un élément actif mais non validé peut être validé depuis son nœud");
  assert.ok(htmlConstructeur.includes("Activer"), "un nouvel élément en brouillon peut être activé depuis son nœud");

  // Apercu : brouillons inclus, desactives exclus.
  const apEntete = C.apercu(d, "4", "entete", d.entetes[0]);
  assert.equal(apEntete.sections.length, 1);
  const apFooter = C.apercu(d, "4", "footer", d.footers[0]);
  assert.equal(apFooter.sections.length, 1, "le brouillon apparait dans l'apercu");
  const modApercu = apFooter.sections[0].lignes[0].colonnes[0].modules[0];
  assert.equal(modApercu.contenu.length, 1, "le contenu en brouillon apparait dans l'apercu");
  const structure = new Set(["101", "1001", "5001", "7001"]);
  const strict = B.composerSections(d, { id: "4" }, d.sections.slice(1, 2), { visible: (x) => structure.has(x.id) || B.publiable(x) });
  assert.equal(strict[0].lignes[0].colonnes[0].modules[0].contenu.length, 0, "regle publique : contenu en brouillon jamais publie");

  // Composition publique : En-tete affecte et publie rendu ; Footer en brouillon jamais publie.
  const comp = B.composerPage({ ...d, pages: [d.pages[0]] }, { id: "4" });
  assert.equal(comp.mode, "builder");
  assert.equal(comp.entete.sections.length, 1);
  assert.equal(comp.footer, null, "Footer non valide jamais publie");
  const compAutre = B.composerPage({ ...d, pages: [d.pages[0]], entetes: [el(1, "x", { "OBJ-SITE-PUBLIC": lien(9) })] }, { id: "4" });
  assert.ok(!compAutre.entete && compAutre.mode === "historique", "En-tete d'un autre site jamais rendu");

  const brouillonHero = el(7004, "Hero brouillon", { "OBJ-PAGES-SITE": lien(2), OBJMODULESITEPUBLICTYPE: lien(3, "HERO") }, {}, OUI, NON);
  const dHero = { ...d, modules: [...d.modules, brouillonHero], contenus: { ...d.contenus,
    "OBJ-MODULE-HERO": [el(14, "Hero brouillon", { "OBJ-MODULE-SITE-PUBLIC": lien(7004) }, { "TITRE-PRINCIPAL": "Aperçu authentifié" }, OUI, NON)] } };
  const apercuPage = C.apercu(dHero, 4, "page", dHero.pages[0], "ORDINATEUR", perimetre);
  const moduleHeroApercu = apercuPage.sections.flatMap((s) => s.lignes.flatMap((l) => l.colonnes.flatMap((c) => c.modules)))
    .find((m) => m.type === "HERO");
  assert.equal(moduleHeroApercu.contenu[0].champs.TITREPRINCIPAL, "Aperçu authentifié", "HERO historique visible en aperçu brouillon");
  assert.ok(moduleHeroApercu._ref && !moduleHeroApercu._id, "référence d'aperçu opaque, aucun ID natif exposé");
  const publicSansBrouillon = B.composerPage(dHero, { id: "4" });
  assert.equal(publicSansBrouillon.sections.flatMap((s) => s.lignes.flatMap((l) => l.colonnes.flatMap((c) => c.modules)))
    .some((m) => m.type === "HERO"), false, "brouillon jamais projeté vers le public");

  // Front : interface constructeur, aucune donnee technique, popup IA et apercu.
  const { rendreConstructeur, documentApercu, ONGLETS, badgeEtat } = await front("cockpit/constructeur.js");
  {
    const donneesFront = { ...v, site: { titre: "Site", domaine: "exemple.test" }, droits: { entete: { ecriture: true }, footer: { ecriture: true }, pages: { ecriture: false }, "logo-medias": { ecriture: true } } };
    const html = rendreConstructeur({ nom: "x", fonctions: [] }, donneesFront, { domaine: "exemple.test" });
    for (const o of ONGLETS) assert.ok(html.includes(o.libelle));
    assert.ok(html.includes("Dupliquer") && html.includes("Voir les utilisations"));
    assert.ok(!html.includes("Affecter aux pages"), "Affectation masquée sans droit de modification de la page.");
    assert.ok(rendreConstructeur({}, { ...donneesFront, droits: { ...donneesFront.droits, pages: { ecriture: true } } }, {})
      .includes("Affecter aux pages"));
    assert.equal(/HERO/i.test(html), false, "vocabulaire En-tete, jamais HERO");
    const editeur = rendreConstructeur({ fonctions: [] }, { ...donneesFront, arbre: a, apercu: apEntete }, {});
    assert.ok(editeur.includes("Pasc ARA IA") && editeur.includes("Ajouter une section") && editeur.includes("📱 Mobile") && editeur.includes("🎨 Design"));
    for (const classe of ["constructeur--plein-ecran", "constructeur-barre-visuelle", "constructeur-espace-visuel", "constructeur-design-zone"]) assert.ok(editeur.includes(classe), classe);
    for (const action of ["annuler-design", "retablir-design", "copier-style", "coller-style", "apercu-seul", "enregistrer-design"]) assert.ok(editeur.includes(`data-c-action="${action}"`), action);
    assert.ok(editeur.includes('draggable="true"') && editeur.includes('data-c-noeud='));
    assert.ok(documentApercu({ mode: "builder", sections: [] }).includes("Aperçu vide"));
    const apercuHero = documentApercu({ mode: "builder", sections: [{ type: "STANDARD", lignes: [{ colonnes: [{
      largeur: 100, modules: [{ type: "HERO", contenu: [{
        champs: { TITREPRINCIPAL: "Accueil réel", TEXTE: "<p>Contenu <script>alert(1)</script></p>", BOUTON1TEXTE: "Voir", BOUTON1URL: "javascript:alert(1)" },
        media: [{ id: "123" }]
      }] }]
    }] }] }] });
    assert.ok(apercuHero.includes("<h1>Accueil réel</h1>"));
    assert.ok(apercuHero.includes("/api/v1/media/123"));
    assert.ok(!apercuHero.includes("alert(1)") && !apercuHero.includes("javascript:"), "aperçu historique sûr");
    assert.ok(badgeEtat({ brouillon: true }).includes("Brouillon"));
  }
  // Import de medias : nom sur, signature du contenu, refus sans droit (aucun appel Graph), formulaire front.
  {
    const M = require("../shared/medias-televersement");
    assert.deepEqual(M._test.nomSur("../Été 2026 (1).PNG"), { base: "Ete-2026-1", ext: "png" });
    assert.equal(M._test.nomSur("..").base, "media");
    assert.equal(M._test.segment("../dseco.fr"), "dseco.fr");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
    assert.ok(M._test.SIGNATURES.PNG(png) && !M._test.SIGNATURES.JPG(png) && !M._test.SIGNATURES.PNG(Buffer.from("<html>")));
    const refus = await M.televerser({ perimetre: { peut: () => false }, contenu: png });
    assert.ok(refus.refus, "import refuse sans droit d'ecriture");
    const vide = await M.televerser({ perimetre: { peut: () => true }, contenu: Buffer.alloc(0) });
    assert.ok(vide.refus, "fichier vide refuse");
    const { rendreMedias } = await front("cockpit/medias.js");
    const base = { site: { titre: "Site" }, medias: [], droits: { "logo-medias": { ecriture: true } } };
    assert.equal(rendreMedias(base, { domaine: "exemple.test" }).includes("data-import-media"), false, "pas de formulaire sans options");
    const html = rendreMedias({ ...base, televersement: { types: [{ ref: "typeMedia.x", titre: "IMAGE" }], formats: ["PNG"], tailleMaxMo: 50 } }, { domaine: "exemple.test" });
    assert.ok(html.includes("data-import-media") && html.includes('accept=".png"') && html.includes("IMAGE"));
    assert.equal(/OBJ-|Graph|SharePoint/.test(html), false, "aucun terme technique");
  }
  // Moteur Design : aplatissement, liste blanche, panneau et apercu instantane.
  {
    const polices = [{ ref: "police.abc", titre: "SANS", famille: "SANS" }];
    const v = C.plat({ couleurTexte: "#112233", police: "SANS", marge: { haut: 10 }, padding: { gauche: 4 }, bordureRayon: 12,
      ombre: { x: 1, y: 2, flou: 3, etalement: 0, couleur: "#000000" }, survol: { couleurFond: "#ffffff" }, inconnu: "x" }, polices);
    assert.deepEqual(v, { couleurTexte: "#112233", bordureRayon: 12, police: "police.abc", margeHaut: 10, paddingGauche: 4,
      ombre: true, ombreX: 1, ombreY: 2, ombreFlou: 3, ombreEtalement: 0, couleurOmbre: "#000000", survolFond: "#ffffff" });
    for (const k of ["couleurTexte", "couleurFond", "bordureRayon", "margeHaut", "paddingGauche", "survolFond", "fondMedia"]) assert.ok(C.DESIGN[k], k);
    const design = await front("cockpit/design.js");
    const d = { type: "BOUTON", libelle: "Bouton", groupes: ["TYPO", "FOND", "BORDURE", "SURVOL"], valeurs: { couleurFond: "#112233" }, herite: { couleurTexte: "#ffffff" },
      responsive: { TABLETTE: {}, MOBILE: {} }, responsiveHerite: { TABLETTE: {}, MOBILE: {} }, champsResponsive: ["tailleTexte", "masque"],
      options: { polices, alignements: [], choix: B.CHOIX, presets: [], medias: [] }, partage: false };
    const html = design.panneauDesign(d, { ref: "noeud.x" });
    assert.ok(html.includes("data-design-form") && html.includes("CONTENU") && html.includes("DESIGN") && html.includes("RESPONSIVE") && html.includes("AVANCÉ"));
    assert.equal(/OBJ-|Graph|SharePoint|Lookup/.test(html), false, "aucun terme technique dans le panneau");
    assert.equal(html.includes('name="ombreX"'), false, "un bouton sans groupe OMBRE ne voit pas l'ombre");
    const css = design.cssApercu("dse-b-pm1", d, { couleurFond: "#445566", bordureRayon: 8, survolFond: "#000000", responsive: { MOBILE: { tailleTexte: 14 } } });
    assert.match(css, /\.dse-b-pm1 \.dse-b-bouton\{[^}]*background-color:#445566/);
    assert.match(css, /color:#ffffff/);
    assert.match(css, /border-radius:8px/);
    assert.match(css, /:focus-visible\{background-color:#000000\}/);
    assert.match(css, /@media \(max-width:640px\)\{\.dse-b-pm1 \.dse-b-bouton\{[^}]*font-size:14px/);
    assert.equal(design.cssApercu("dse-b-pm1", d, { couleurFond: "red;}body{x" }).includes("body{"), false, "injection CSS refusee");
  }
  {
    const ecriture = require("../shared/ecriture");
    const originalGraph = ecriture.contexteGraph, originalLecture = ecriture.lireItemFrais;
    const proto = C.Ecrivain.prototype;
    const methodes = ["copiables", "lookup", "simple", "etats", "liste", "creer", "maj"];
    const originaux = Object.fromEntries(methodes.map((k) => [k, proto[k]]));
    const copies = donnees(), writes = [], stores = new Map();
    copies.builderTypes = [el(41, "Racine", {}, { ACTIF: true, "EST-RACINE": true, "EST-CONTENEUR": true, "CLE-RENDU": "PAGE" })];
    copies.builderElements = [el(501, "Page source", {
      "OBJ-SITE-PUBLIC": lien(4), "OBJ-PAGES-SITE": lien(2),
      "OBJ-BUILDER-TYPE": lien(41), "ELEMENT-RACINE": lien(501)
    }, { ACTIF: true, PROFONDEUR: 0, ORDRE: 10 })];
    const executerCopie = (url) => C.executer({ d: copies, perimetre, siteId: "4",
      action: "conteneur.dupliquer", params: { ref: C.ref("page", 2), url } });
    try {
      ecriture.contexteGraph = async () => ({});
      ecriture.lireItemFrais = async (_g, liste, id) => stores.get(`${liste}/${id}`);
      proto.copiables = async () => ({});
      proto.lookup = async (_liste, nom) => `${nom.replace(/-/g, "")}LookupId`;
      proto.simple = async (_liste, nom) => nom.replace(/-/g, "");
      proto.etats = async () => ({ OBJACTIFLookupId: "3", OBJVALIDELookupId: "2" });
      proto.liste = (nom) => ({ id: nom });
      proto.creer = async function (liste, champs) {
        const id = String(700 + writes.length);
        writes.push({ liste, id, champs });
        stores.set(`${liste}/${id}`, champs);
        this.crees.push({ liste, id });
        return id;
      };
      proto.maj = async (liste, id, champs) => stores.set(`${liste}/${id}`, { ...stores.get(`${liste}/${id}`), ...champs });
      assert.ok((await executerCopie("")).refus);
      assert.ok((await executerCopie("/")).refus);
      assert.equal(writes.length, 0, "URL absente ou existante : aucune création");
      const resultat = await executerCopie("/copie-native");
      assert.equal(resultat.nouveau.ref, C.ref("page", 700));
      assert.equal(writes.length, 2, "conteneur puis racine, sans valeur de démonstration");
      assert.equal(writes[0].champs.URL, "/copie-native");
      assert.equal(writes[0].champs.OBJACTIFLookupId, "3");
      assert.equal(writes[1].champs.OBJPAGESSITELookupId, "700");
      assert.equal(stores.get("OBJ-BUILDER-ELEMENT/701").ELEMENTRACINELookupId, "701");
      assert.equal(copies.builderElements[0].relations["OBJ-PAGES-SITE"].id, "2");
      copies.builderTypes.push(el(42, "Section", {}, { ACTIF: true, "CLE-RENDU": "SECTION" }));
      copies.builderElements.push(el(502, "Section native", {
        "OBJ-SITE-PUBLIC": lien(4), "OBJ-BUILDER-TYPE": lien(42),
        "ELEMENT-RACINE": lien(501), "ELEMENT-PARENT": lien(501)
      }, { ACTIF: true }));
      assert.equal(C.vue(copies, perimetre).pages.find((p) => p.ref === C.ref("page", 2)).sections, 1);
    } finally {
      ecriture.contexteGraph = originalGraph;
      ecriture.lireItemFrais = originalLecture;
      for (const k of methodes) proto[k] = originaux[k];
    }
  }
  console.log("Constructeur : perimetre, medias, references opaques, arbre, apercu, En-tete/Footer, Design, duplication de page et interface OK");
}

main().catch((e) => { console.error(e); process.exit(1); });
