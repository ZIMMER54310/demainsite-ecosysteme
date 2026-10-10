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
  {
    const dc = donnees();
    dc.categoriesModules = [el(1, "Texte", {}, { ICONE: "📝", "ORDRE-AFFICHAGE": 2 }), el(2, "Média", {}, { ICONE: "🖼️", "ORDRE-AFFICHAGE": 1 }), el(3, "Off", {}, {}, NON, OUI)];
    dc.types = [el(1, "TITRE", { "OBJ-MODULE-CATEGORIE": lien(1, "Texte") }, { LIBELLE: "Titre", ICONE: "🔤", "AIDE-CONTENU": "Un titre court.", "AIDE-DESIGN": "Réglez la police." }), el(2, "TEXTE", { "OBJ-MODULE-CATEGORIE": lien(3, "Off") })];
    const vc = C.vue(dc, perimetre);
    assert.deepEqual(vc.categoriesModules.map((c) => c.titre), ["Média", "Texte"], "categories SharePoint publiees, triees par ORDRE-AFFICHAGE");
    const [titre, texte] = vc.typesModules;
    assert.equal(titre.libelle, "Titre"); assert.equal(titre.icone, "🔤");
    assert.equal(titre.categorie, vc.categoriesModules[1].cle, "type rattache a sa categorie");
    assert.equal(titre.aide, "Un titre court.", "aide au contenu lue dans SharePoint");
    assert.equal(titre.aideDesign, "Réglez la police.", "aide au design lue dans SharePoint");
    assert.equal(texte.aide, "", "aide vide sans valeur SharePoint");
    assert.equal(texte.libelle, "TEXTE", "libelle par defaut = code"); assert.equal(texte.categorie, null, "categorie inactive => Autres");
  }
  const uiConstructeur = await front("cockpit/constructeur.js");
  {
    const options = Array.from({ length: 500 }, (_, i) => ({ ref: `image.${i}`, titre: `Image ${i}`, url: `/api/v1/media/${i}` }));
    options[99].titre = "Été portrait";
    assert.equal(uiConstructeur.pageImages(options).images.length, 24);
    assert.equal(uiConstructeur.pageImages(options).pages, 21);
    assert.equal(uiConstructeur.pageImages(options, "", 20).images.length, 20);
    assert.equal(uiConstructeur.pageImages(options, "ete").images[0].ref, "image.99");
    assert.equal(uiConstructeur.pageImages(options, "absent").total, 0);
    const h = uiConstructeur.formulaireHtml({ textes: [{ cle: "t", libelle: "Titre public", aide: "Explication", affichage: "afficherTitreImage", valeur: "" }],
      visibiliteImage: { titre: false, texte: true }, listes: [{ cle: "m", choisirImage: true, options, valeur: "image.99" }] }, "Image");
    assert.equal((h.match(/<img /g) || []).length, 1, "500 medias : seule la selection est rendue avant ouverture");
    assert.ok(!h.includes("<option"), "aucune liste geante de medias");
    assert.ok(h.includes("data-c-image-recherche"));
    assert.ok(h.includes('name="afficherTitreImage" value="true">'), "visibilite initiale respectee");
    assert.ok(h.indexOf("Explication") > h.indexOf('name="t"'), "aide sous le champ");
  }
  {
    const h = uiConstructeur.formulaireHtml({ aide: "Aide type", textes: [{ cle: "c1", libelle: "Contenu", aide: "Aide champ", multiligne: true, valeur: "" }], listes: [] },
      "Étape", { valider: "Suivant", passer: "Passer", ia: true });
    for (const x of ["Aide type", "Aide champ", "data-c-ia=\"c1\"", "data-c-passer", ">Suivant<"]) assert.ok(h.includes(x), `formulaire guide : ${x}`);
    assert.ok(!uiConstructeur.formulaireHtml({ textes: [{ cle: "c1", libelle: "X", multiligne: true }] }, "T").includes("data-c-ia"), "pas d'IA par defaut");
  }
  const accueilPublic = await import(pathToFileURL(path.join(__dirname, "..", "..", "pages", "accueil.js")).href);
  assert.ok(accueilPublic.rendreBandeauChantier(true).includes("en cours de construction ou de modification"));
  assert.equal(accueilPublic.rendreBandeauChantier(false), "", "bandeau masqué par défaut");
  assert.ok(uiConstructeur.documentApercu({ mode: "builder", sections: [], bandeauChantier: true }, "page").includes("dse-bandeau-chantier"),
    "bandeau visible dans l'aperçu de la page");
  const apercuAvecBandeau = uiConstructeur.documentApercu({ mode: "builder", bandeauChantier: true, sections: [
    { type: "STANDARD", lignes: [{ colonnes: [{ modules: [{ type: "HERO", contenu: [{ champs: { "TITRE-PRINCIPAL": "Présentation" } }] }] }] }] },
    { type: "STANDARD", lignes: [{ colonnes: [{ modules: [{ type: "ARTICLES" }] }] }] }
  ] }, "page");
  const positionHero = apercuAvecBandeau.indexOf("dse-b-module--hero");
  const positionBandeau = apercuAvecBandeau.indexOf("dse-bandeau-chantier");
  const positionArticles = apercuAvecBandeau.indexOf("data-dse-catalogue-builder=\"articles\"");
  assert.ok(positionHero >= 0 && positionBandeau < positionHero && positionHero < positionArticles,
    "bandeau placé sous l'en-tête, avant le Hero et les Articles");
  assert.ok(apercuAvecBandeau.includes('dse-site-public-main"><aside class="dse-bandeau-chantier"'),
    "bandeau premier élément du contenu sous l'en-tête");
  const apercuBuilderRecursif = uiConstructeur.documentApercu({ mode: "builder", bandeauChantier: true, noeuds: [{
    rendu: "PAGE", enfants: [
      { rendu: "SECTION", titre: "Hero", enfants: [{ rendu: "LIGNE", enfants: [{ rendu: "COLONNE", enfants: [{ rendu: "TITRE", titre: "Présentation" }] }] }] },
      { rendu: "SECTION", titre: "Articles", enfants: [{ rendu: "LIGNE", enfants: [{ rendu: "COLONNE", enfants: [{
        rendu: "MODULE", champs: [{ cle: "TEXTE", categorie: "CONTENU", nature: "TEXTE", valeur: "Liste des articles" }]
      }] }] }] }
    ]
  }] }, "page");
  const positionSectionHero = apercuBuilderRecursif.indexOf("Hero");
  const positionBandeauRecursif = apercuBuilderRecursif.indexOf("dse-bandeau-chantier");
  const positionArticlesRecursif = apercuBuilderRecursif.indexOf("Liste des articles");
  assert.ok(positionSectionHero >= 0 && positionBandeauRecursif < positionSectionHero && positionSectionHero < positionArticlesRecursif,
    "bandeau avant la présentation dans la composition récursive du Builder");
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
  pageAvecBrouillons.pages[0]._fields["AFFICHER-BANDEAU-CHANTIER"] = true;
  pageAvecBrouillons.pages[0].configuration["AFFICHER-BANDEAU-CHANTIER"] = true;
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
  assert.ok(htmlConstructeur.includes('data-c-bandeau-chantier') && htmlConstructeur.includes("Page en chantier"),
    "case à cocher de mise en chantier visible dans le groupe Voir pour une page modifiable");
  assert.ok(htmlConstructeur.includes("✅ Valider et activer"), "un élément actif mais non validé peut être validé depuis son nœud");
  assert.ok(htmlConstructeur.includes("Activer"), "un nouvel élément en brouillon peut être activé depuis son nœud");
  assert.ok(htmlConstructeur.includes('data-c-bandeau-chantier checked') && htmlConstructeur.includes("Page en chantier"),
    "case de bandeau dans le groupe Voir du haut de l'éditeur");
  const htmlSansDroitBandeau = uiConstructeur.rendreConstructeur({ nom: "Pascal" }, {
    site: { titre: "DemainSite Écosystème" },
    arbre: C.arbre(pageAvecBrouillons, "page", pageAvecBrouillons.pages[0]),
    operations: [], modeles: { disponibles: [] }, structures: [], typesSection: [], typesModules: [], medias: []
  }, { domaine: "dseco.fr" });
  assert.ok(/data-c-bandeau-chantier[^>]*disabled/.test(htmlSansDroitBandeau) &&
    htmlSansDroitBandeau.includes("Votre profil ne dispose pas du droit de modifier cette page"),
  "case toujours visible, mais désactivée et expliquée sans autorisation de modification");
  const arbreAvecBrouillons = C.arbre(pageAvecBrouillons, "page", pageAvecBrouillons.pages[0]);
  const moduleEnBrouillon = arbreAvecBrouillons.sections.flatMap((s) => s.enfants.flatMap((l) =>
    l.enfants.flatMap((c) => c.enfants))).find((m) => m.titre === "Module en brouillon");
  assert.ok(moduleEnBrouillon, "le module brouillon est présent dans l'arbre");
  assert.ok(htmlConstructeur.includes(`data-c-action="desactiver-element" data-ref="${moduleEnBrouillon.ref}" title="Supprimer « `),
    "un élément en brouillon peut être désactivé sans suppression");

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
  const apercuVisiteur = C.apercu(dHero, 4, "page", dHero.pages[0], "ORDINATEUR", perimetre, { visiteur: true });
  assert.equal(apercuVisiteur.sections.flatMap((s) => s.lignes.flatMap((l) => l.colonnes.flatMap((c) => c.modules)))
    .some((m) => m.type === "HERO"), false, "rendu visiteur du constructeur : brouillon masqué comme sur le site public");
  const apFooterVisiteur = C.apercu(d, "4", "footer", d.footers[0], null, null, { visiteur: true });
  assert.equal(apFooterVisiteur.sections.length, 0, "rendu visiteur : section en brouillon masquée");
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
    const pageSansFooterBuilder = rendreConstructeur({}, {
      ...donneesFront,
      pages: [{ ref: "page.accueil", titre: "Accueil", url: "/", sections: 0, footer: null }],
      footers: []
    }, { onglet: "pages" });
    assert.ok(pageSansFooterBuilder.includes("Pied de page du site (automatique)"),
      "une page sans footer Builder indique le pied de page automatique du site au lieu de « Aucun »");
    assert.ok(pageSansFooterBuilder.includes('data-c-bandeau-chantier data-page="page.accueil" disabled'),
      "case sur la fiche de page visible et désactivée sans droit");
    const fichesBandeau = rendreConstructeur({}, {
      ...donneesFront, operations: ["constructeur.page.conteneur.modifier"],
      pages: [
        { ref: "page.accueil", titre: "Accueil", url: "/", sections: 0, bandeauChantier: true },
        { ref: "page.contact", titre: "Contact", url: "/contact", sections: 0, bandeauChantier: false }
      ], footers: []
    }, { onglet: "pages" });
    assert.ok(fichesBandeau.includes('data-c-bandeau-chantier data-page="page.accueil" checked'));
    assert.ok(fichesBandeau.includes('data-c-bandeau-chantier data-page="page.contact">'));
    assert.ok(fichesBandeau.includes("Bandeau affiché") && fichesBandeau.includes("Bandeau masqué"),
      "état indépendant de chaque page dans la liste");
    assert.equal(/HERO/i.test(html), false, "vocabulaire En-tete, jamais HERO");
    const editeur = rendreConstructeur({ fonctions: [] }, { ...donneesFront, arbre: a, apercu: apEntete }, {});
    assert.ok(editeur.includes("Pasc ARA IA") && editeur.includes("Ajouter une section") && editeur.includes("📱 Mobile") && editeur.includes("🎨 Design"));
    for (const classe of ["constructeur--plein-ecran", "constructeur-barre-visuelle", "constructeur-espace-visuel", "constructeur-design-zone"]) assert.ok(editeur.includes(classe), classe);
    for (const action of ["annuler-design", "retablir-design", "copier-style", "coller-style", "enregistrer-design"]) assert.ok(editeur.includes(`data-c-action="${action}"`), action);
    for (const vue of ["composition", "structure", "rendu"]) assert.ok(editeur.includes(`data-c-vue-apercu="${vue}"`), `vue ${vue}`);
    assert.ok(documentApercu({ mode: "builder", sections: [] }).includes("body.dse-vue-structure"), "vue structure seule");
    assert.ok(editeur.includes('draggable="true"') && editeur.includes('data-c-noeud='));
    assert.ok(documentApercu({ mode: "builder", sections: [] }).includes("Aperçu vide"));
    const apercuHero = documentApercu({ mode: "builder", sections: [{ type: "STANDARD", lignes: [{ colonnes: [{
      largeur: 100, modules: [{ type: "HERO", contenu: [{
        champs: { TITREPRINCIPAL: "Accueil réel", TEXTE: "<p>Contenu <script>alert(1)</script></p>", BOUTON1TEXTE: "Voir", BOUTON1URL: "javascript:alert(1)" },
        media: [{ id: "123" }]
      }] }]
    }] }] }] });
    assert.ok(/<h1 class="dse-hero-title">\s*Accueil réel\s*<\/h1>/.test(apercuHero), "HERO identique au site public");
    assert.ok(apercuHero.includes("/api/v1/media/123"));
    assert.ok(!apercuHero.includes("alert(1)") && !apercuHero.includes("javascript:"), "aperçu historique sûr");
    assert.ok(badgeEtat({ brouillon: true }).includes("Brouillon"));
    const rendus = { entete: '<div class="dse-site-public-header">Logo et navigation publics</div>',
      footer: '<div class="dse-footer">Mentions publiques</div>' };
    for (const [type, rendu] of [["entete", "HEADER"], ["footer", "FOOTER"]]) {
      const composition = { mode: "builder", sections: [{ lignes: [{ colonnes: [{ modules: [{ type: rendu, _ref: "module.auto" }] }] }] }] };
      const html = documentApercu(composition, type, rendus);
      assert.ok(html.includes(type === "entete" ? rendus.entete : rendus.footer), "bloc automatique identique au public");
      assert.ok(!html.includes("affichés automatiquement"), "pas de repere a la place du contenu");
      const videPublic = documentApercu({ mode: "builder", sections: [], visiteur: true }, type, rendus);
      assert.ok(videPublic.includes(rendus[type]), "zone vide publique : repli historique comme le site");
      assert.ok(documentApercu({ mode: "builder", sections: [] }, type, rendus).includes("Aperçu vide"), "composition vide reste editable");
      const autre = type === "entete" ? "footer" : "entete";
      const contexte = documentApercu({ ...composition, contexte: { [autre]: { origine: "site", sections: [{ lignes: [{ colonnes: [{ modules: [{ type: "TEXTE", contenu: [{ champs: { CONTENU: "Mauvais contexte" } }] }] }] }] }] } } }, type, rendus);
      assert.ok(contexte.includes(rendus[autre]) && !contexte.includes("Mauvais contexte"), "ne pas substituer une zone non associee au rendu du site");
    }
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
    const v = C.plat({ couleurTexte: "#112233", police: "SANS", soulignement: true, marge: { haut: 10 }, padding: { gauche: 4 }, bordureRayon: 12,
      ombre: { x: 1, y: 2, flou: 3, etalement: 0, couleur: "#000000" }, survol: { couleurFond: "#ffffff" }, inconnu: "x" }, polices);
    assert.deepEqual(v, { couleurTexte: "#112233", soulignement: true, bordureRayon: 12, police: "police.abc", margeHaut: 10, paddingGauche: 4,
      ombre: true, ombreX: 1, ombreY: 2, ombreFlou: 3, ombreEtalement: 0, couleurOmbre: "#000000", survolFond: "#ffffff" });
    for (const k of ["couleurTexte", "couleurFond", "bordureRayon", "margeHaut", "paddingGauche", "survolFond", "fondMedia", "poidsPolice", "soulignement"]) assert.ok(C.DESIGN[k], k);
    const design = await front("cockpit/design.js");
    const d = { type: "BOUTON", libelle: "Bouton", groupes: ["TYPO", "FOND", "BORDURE", "SURVOL"], valeurs: { couleurFond: "#112233", poidsPolice: 900 }, herite: { couleurTexte: "#ffffff", poidsPolice: 900, soulignement: true },
      responsive: { TABLETTE: {}, MOBILE: {} }, responsiveHerite: { TABLETTE: {}, MOBILE: {} }, champsResponsive: ["tailleTexte", "masque"],
      options: { polices, alignements: [], choix: B.CHOIX, presets: [], medias: [] }, partage: false };
    const html = design.panneauDesign(d, { ref: "noeud.x" });
    assert.ok(html.includes("data-design-form") && html.includes("CONTENU") && html.includes("DESIGN") && html.includes("RESPONSIVE") && html.includes("AVANCÉ"));
    assert.equal(/OBJ-|Graph|SharePoint|Lookup/.test(html), false, "aucun terme technique dans le panneau");
    assert.equal(html.includes('data-c-action="renommer"'), false, "stylo seulement si le renommage est permis");
    assert.ok(design.panneauDesign(d, { ref: "noeud.x", renommable: true }).includes('data-c-action="renommer" data-ref="noeud.x"'), "stylo pour renommer");
    assert.equal(html.includes('name="ombreX"'), false, "un bouton sans groupe OMBRE ne voit pas l'ombre");
    const css = design.cssApercu("dse-b-pm1", d, { couleurFond: "#445566", bordureRayon: 8, survolFond: "#000000", responsive: { MOBILE: { tailleTexte: 14 } } });
    assert.match(css, /\.dse-b-pm1 \.dse-b-bouton\{[^}]*background-color:#445566/);
    assert.match(css, /color:#ffffff/);
    assert.match(css, /font-weight:900/);
    assert.match(css, /border-radius:8px/);
    assert.match(css, /:focus-visible\{background-color:#000000\}/);
    assert.match(css, /@media \(max-width:640px\)\{\.dse-b-pm1 \.dse-b-bouton\{[^}]*font-size:14px/);
    assert.equal(design.cssApercu("dse-b-pm1", d, { couleurFond: "red;}body{x" }).includes("body{"), false, "injection CSS refusee");
    const typographie = design.panneauDesign(d, { ref: "noeud.x" });
    assert.match(typographie, /<option value="900" selected>Ultra gras<\/option>/);
    assert.match(typographie, /Soulignement/);
    const double = { ...d, type: "CARTE", typographieSeparee: true, valeurs: { typoTitre: { tailleTexte: 30 }, typoTexte: { tailleTexte: 16 } } };
    const panneau = design.panneauDesign(double, { ref: "module.x" });
    assert.match(panneau, /Typographie du titre/);
    assert.match(panneau, /Typographie du texte/);
    assert.match(panneau, /name="MOBILE.typoTitre.stylePolice"/);
    assert.match(panneau, /data-design-outil="typoTexte.alignement"/);
    assert.match(panneau, /Afficher le titre et le texte/);
    assert.match(panneau, /name="typoTitre.masque"/);
    assert.match(design.panneauDesign({ ...double, type: "FAQ" }, { ref: "module.x" }), /La question reste visible/);
    assert.ok(!design.panneauDesign({ ...double, type: "FAQ" }, { ref: "module.x" }).includes('name="typoTitre.masque"'));
    const conditionInputs = [{ name: "typoTitre.masque", value: "OUI" }, { name: "ombre", value: "NON" },
      { name: "typoTitre.soulignement", value: "" }, { name: "MOBILE.typoTitre.masque", value: "" }];
    const conditionBlocs = [
      { dataset: { designCondition: "typoTitre.masque", designActive: "false" } },
      { dataset: { designCondition: "ombre", designActive: "true" } },
      { dataset: { designCondition: "typoTitre.soulignement", designActive: "true" } },
      { dataset: { designCondition: "MOBILE.typoTitre.masque", designActive: "false" } }
    ];
    const conditionForm = { dataset: { designHeritage: JSON.stringify({ base: { typoTitre: { soulignement: true } }, responsive: {} }) },
      querySelectorAll: (sel) => sel === "[name]" ? conditionInputs : conditionBlocs };
    design.actualiserConditions(conditionForm);
    assert.deepEqual(conditionBlocs.map((x) => x.hidden), [true, true, false, true]);
    conditionInputs[0].value = "NON"; conditionInputs[1].value = "OUI"; conditionInputs[2].value = "NON";
    design.actualiserConditions(conditionForm);
    assert.deepEqual(conditionBlocs.map((x) => x.hidden), [false, false, true, false], "changement immediat, responsive herite");
    assert.equal(conditionInputs[2].value, "NON", "masquer un bloc ne modifie pas sa valeur");
    assert.match(panneau, /aria-label="Initiales en majuscules"/);
    assert.ok(!panneau.includes('name="tailleTexte"'), "pas de typographie unique pour les cartes");
    const valeurs = design.lireValeurs({ querySelectorAll: () => [
      { name: "typoTitre.tailleTexte", value: "30" }, { name: "typoTexte.soulignement", value: "NON" },
      { name: "MOBILE.typoTexte.tailleTexte", value: "12" }, { name: "typoTitre.inconnu", value: "x" }
    ] });
    assert.deepEqual(valeurs.typoTitre, { tailleTexte: "30" });
    assert.equal(valeurs.typoTexte.soulignement, false);
    assert.equal(valeurs.responsive.MOBILE.typoTexte.tailleTexte, "12");
    const inputs = [{ name: "typoTitre.tailleTexte", value: "" }, { name: "MOBILE.typoTexte.tailleTexte", value: "" }, { name: "typoTexte.soulignement", value: "" }];
    const outil = { dataset: { designOutil: "typoTexte.soulignement", designValeur: "NON" }, setAttribute: (_cle, v) => { outil.pressed = v; } };
    design.appliquerValeursDesign({ querySelectorAll: (sel) => sel === "[name]" ? inputs : sel === "[data-design-outil]" ? [outil] : [] }, valeurs);
    assert.deepEqual(inputs.map((x) => x.value), ["30", "12", "NON"], "annuler/coller conserve les deux typographies");
    assert.equal(outil.pressed, "true");
    {
      const noms = ["bordureRayon", "bordureLargeur", "couleurBordure", "bordureStyle",
        ...["HautGauche", "HautDroite", "BasDroite", "BasGauche"].map((c) => `bordureRayon${c}`),
        ...["Haut", "Droite", "Bas", "Gauche"].flatMap((c) => [`bordureEpaisseur${c}`, `bordureCouleur${c}`, `bordureStyle${c}`])];
      const champs = Object.fromEntries(noms.map((name) => [name, { name, value: "", placeholder: "", matches: () => false }]));
      const lies = { checked: false, matches: (s) => s === "[data-design-coins-lies]" };
      const global = {}, details = {};
      const zone = { dataset: { designBordure: "" }, querySelector: (s) => s === "[data-design-coins-lies]" ? lies : s === "[data-design-coins-global]" ? global : details,
        querySelectorAll: () => [] };
      for (const c of [...Object.values(champs), lies]) { c.closest = () => zone; c.dataset = {}; }
      const form = { elements: { namedItem: (n) => champs[n] }, querySelectorAll: () => [zone] };
      champs.bordureRayon.value = "10";
      champs.bordureRayonHautGauche.value = "4";
      champs.bordureRayonHautDroite.value = "12";
      champs.bordureRayonBasDroite.value = "20";
      champs.bordureRayonBasGauche.value = "28";
      design.actualiserBordures(form, true);
      assert.equal(lies.checked, false);
      assert.equal(details.hidden, false);
      assert.equal(champs.bordureRayonBasGauche.value, "28", "ouvrir ne modifie aucun coin");
      lies.checked = true;
      design.actionBordure(lies, form);
      assert.equal(champs.bordureRayon.value, "4");
      assert.equal(champs.bordureRayonBasGauche.value, "4");
      lies.checked = false;
      design.actionBordure(lies, form);
      assert.equal(champs.bordureRayonBasGauche.value, "4", "decocher ne modifie pas les valeurs");
      champs.couleurBordure.value = "#123456";
      champs.bordureCouleurHaut.placeholder = "#abcdef";
      champs.bordureEpaisseurHaut.value = "3";
      design.actionBordure(champs.couleurBordure, form);
      assert.equal(champs.bordureCouleurHaut.value, "#123456", "Tous remplace aussi la valeur heritee du cote");
      assert.equal(champs.bordureEpaisseurHaut.value, "3", "changer couleur ne change pas epaisseur");
      champs.bordureEpaisseurDroite.value = "5";
      design.actionBordure(champs.bordureEpaisseurDroite, form);
      assert.equal(champs.bordureEpaisseurHaut.value, "3", "changer un cote ne change pas les autres");
    }
    assert.match(panneau, /name="typoTitre.soulignementCouleur"/);
    assert.match(panneau, /name="MOBILE.typoTexte.soulignementDistance"/);
    assert.match(panneau, /<option value="ONDULE">Ondule<\/option>/);
    const soulignement = design.cssApercu("dse-b-underline", double, { typoTitre: {
      soulignement: true, soulignementCouleur: "#abcdef", soulignementStyle: "DOUBLE", soulignementEpaisseur: "2.5", soulignementDistance: "4"
    }, typoTexte: { soulignement: false }, responsive: { MOBILE: { typoTitre: { soulignementDistance: "3" } } } });
    assert.match(soulignement, /h3\{[^}]*text-decoration-color:#abcdef;[^}]*text-decoration-style:double/);
    assert.match(soulignement, /text-decoration-thickness:2.5px/);
    assert.match(soulignement, /text-underline-offset:3px !important/);
    assert.match(soulignement, /p\{[^}]*text-decoration-line:none/);
    const cssDouble = design.cssApercu("dse-b-separe", { ...double, herite: { typoTitre: { poidsPolice: 700 } } }, { ...valeurs, typoTexte: { tailleTexte: "16", soulignement: false } });
    assert.match(cssDouble, /h3\{[^}]*font-size:30px;[^}]*font-weight:700/);
    assert.match(cssDouble, /p\{[^}]*font-size:16px/);
    assert.match(cssDouble, /@media[^}]*p\{[^}]*font-size:12px !important/);
    assert.deepEqual(C.plat({ typoTitre: { tailleTexte: 30 }, typoTexte: { soulignement: false } }), { typoTitre: { tailleTexte: 30 }, typoTexte: { soulignement: false } });
  }
  {
    const ecriture = require("../shared/ecriture");
    const originalGraph = ecriture.contexteGraph, originalLecture = ecriture.lireItemFrais;
    const proto = C.Ecrivain.prototype;
    const methodes = ["copiables", "lookup", "simple", "etats", "liste", "cols", "creer", "maj"];
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
      proto.cols = async () => [
        { name: "Title", displayName: "Title", text: { maxLength: 255 } },
        { name: "URL", displayName: "URL", text: { maxLength: 255 } },
        { name: "AFFICHER_x002d_BANDEAU_x002d_CHANTIER", displayName: "AFFICHER-BANDEAU-CHANTIER", boolean: {} }
      ];
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
      copies.pages.find((x) => x.id === "2")._fields.AFFICHER_x002d_BANDEAU_x002d_CHANTIER = true;
      const propsPage = await C.executer({ d: copies, perimetre, siteId: "4", action: "conteneur.modifier",
        params: { ref: C.ref("page", 2) } });
      assert.ok(propsPage.formulaire.textes, "le formulaire standard de propriétés reste disponible");
      const modifBandeau = await C.executer({ d: copies, perimetre, siteId: "4", action: "conteneur.modifier",
        params: { ref: C.ref("page", 2), valeurs: { bandeauChantier: false } } });
      assert.equal(modifBandeau.message, "Page enregistré.");
      assert.equal(stores.get("OBJ-PAGES-SITE/2").AFFICHER_x002d_BANDEAU_x002d_CHANTIER, false, "désactivation enregistrée");
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
      writes.length = 0;
      const creation = await C.executer({ d: copies, perimetre, siteId: "4", action: "conteneur.creer",
        params: { type: "page", titre: "Contact" } });
      assert.match(creation.message, /structure de base/);
      const parListe = (l) => writes.filter((x) => x.liste === l);
      assert.equal(writes[0].champs.URL, "/contact/");
      assert.deepEqual(parListe("OBJ-SECTION-SITE").map((x) => x.champs.Title), ["Bandeau (Hero)", "Contenu", "Appel à l'action"]);
      assert.ok(parListe("OBJ-SECTION-SITE").every((x) => x.champs.OBJPAGESSITELookupId === writes[0].id));
      assert.equal(parListe("OBJ-LIGNE-SITE").length, 3);
      assert.equal(parListe("OBJ-COLONNE-SITE").length, 3);
      assert.deepEqual(parListe("OBJ-MODULE-SITE-PUBLIC").map((x) => x.champs.Title), ["Titre", "Texte"], "types absents (HERO, CTA) ignorés");
      assert.equal(parListe("OBJ-MODULE-UTILISATION").length, 2);
      const renommage = await C.executer({ d: copies, perimetre, siteId: "4", action: "element.renommer",
        params: { ref: C.ref("section", 100), titre: "  Bandeau principal " } });
      assert.match(renommage.message, /Section renommée/);
      assert.equal(stores.get("OBJ-SECTION-SITE/100").Title, "Bandeau principal");
      assert.equal((await C.executer({ d: copies, perimetre, siteId: "4", action: "element.renommer",
        params: { ref: C.ref("section", 100), titre: " " } })).status, 400, "nom obligatoire");
      assert.equal(C.actionDroit("element.renommer"), "element.deplacer", "droit « modifier » existant");
      // Suppression definitive : confirmation exigee, enfants/utilisations avant le parent, sauvegarde JSON prealable.
      const dossierSup = require("node:fs").mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "dse-sup-"));
      process.env.DSE_DOSSIER_SUPPRESSIONS = dossierSup;
      const effaces = [];
      proto.supprimer = async (liste, id) => { effaces.push(`${liste}/${id}`); };
      assert.equal((await C.executer({ d: copies, perimetre, siteId: "4", action: "element.supprimer",
        params: { ref: C.ref("ligne", 1000) } })).status, 400, "confirmation obligatoire");
      assert.equal(effaces.length, 0);
      const sup = await C.executer({ d: copies, perimetre, siteId: "4", action: "element.supprimer",
        params: { ref: C.ref("ligne", 1000), confirmation: "SUPPRIMER" } });
      assert.match(sup.message, /supprimée définitivement/);
      assert.equal(effaces.at(-1), "OBJ-LIGNE-SITE/1000", "parent supprimé en dernier");
      assert.ok(effaces.indexOf("OBJ-MODULE-SITE-PUBLIC/7000") < effaces.indexOf("OBJ-COLONNE-SITE/5000"), "module avant sa colonne");
      assert.equal(require("node:fs").readdirSync(dossierSup).length, 1, "sauvegarde avant suppression");
      assert.equal(C.actionDroit("element.supprimer"), "element.etat", "droit ADMINISTRER existant");
      // Suppression definitive d'une page : accueil protege, sections avant la page, sauvegarde.
      assert.match((await C.executer({ d: copies, perimetre, siteId: "4", action: "conteneur.supprimer",
        params: { ref: C.ref("page", 2), confirmation: "SUPPRIMER" } })).refus, /accueil/, "page d'accueil protégée");
      copies.pages.push(el(30, "A jeter", { "OBJ-SITE-PUBLIC": lien(4) }, { URL: "/a-jeter" }));
      copies.sections.push(el(300, "Section a jeter", { "OBJ-PAGES-SITE": lien(30) }));
      effaces.length = 0;
      assert.equal((await C.executer({ d: copies, perimetre, siteId: "4", action: "conteneur.supprimer",
        params: { ref: C.ref("page", 30) } })).status, 400, "confirmation obligatoire (page)");
      const supPage = await C.executer({ d: copies, perimetre, siteId: "4", action: "conteneur.supprimer",
        params: { ref: C.ref("page", 30), confirmation: "SUPPRIMER" } });
      assert.match(supPage.message, /Page « A jeter » supprimée définitivement avec 1 élément/);
      assert.deepEqual(effaces, ["OBJ-SECTION-SITE/300", "OBJ-PAGES-SITE/30"], "section puis page");
      assert.equal(C.actionDroit("conteneur.supprimer"), "conteneur.desactiver", "droit ADMINISTRER des pages");
      copies.pages.pop(); copies.sections.pop();
      delete process.env.DSE_DOSSIER_SUPPRESSIONS;
      require("node:fs").rmSync(dossierSup, { recursive: true });
      copies.colonnes.push(el(5002, "C3", { "OBJ-LIGNE-SITE": lien(1000) }));
      copies.modules.push(el(7002, "Voisin", { "OBJ-COLONNE-SITE": lien(5002), OBJMODULESITEPUBLICTYPE: lien(2, "TEXTE") }, { "ORDRE-AFFICHAGE": 10 }));
      const glisser = (params) => C.executer({ d: copies, perimetre, siteId: "4", action: "element.deplacer",
        params: { ref: C.ref("module", 7000), parent: C.ref("colonne", 5002), ...params } });
      assert.ok((await glisser({ apres: C.ref("module", 9999) })).refus, "repère inconnu refusé");
      const glisse = await glisser({ apres: C.ref("module", 7002) });
      assert.match(glisse.message, /Module déplacé dans « C3 »/);
      assert.equal(stores.get("OBJ-MODULE-SITE-PUBLIC/7000").OBJCOLONNESITELookupId, "5002", "module glissé dans une autre colonne");
      assert.equal(stores.get("OBJ-MODULE-SITE-PUBLIC/7000").ORDREAFFICHAGE, 20, "déposé après le voisin");
      assert.equal(stores.get("OBJ-MODULE-SITE-PUBLIC/7002").ORDREAFFICHAGE, 10);
      const decouper = (reference, largeurs) => C.executer({ d: copies, perimetre, siteId: "4", action: "ligne.colonnes", params: { ref: reference, largeurs } });
      assert.equal((await decouper(C.ref("ligne", 1000), [50, 40])).status, 400, "total différent de 100 % refusé");
      assert.equal((await decouper(C.ref("ligne", 1000), [10, 10, 10, 10, 10, 10, 40])).status, 400, "7 colonnes refusées");
      writes.length = 0;
      const trois = await decouper(C.ref("colonne", 5000), [25, 50, 25]);
      assert.match(trois.message, /3 colonne\(s\).*1 colonne\(s\) ajoutée/, "depuis une colonne : sa ligne est découpée");
      assert.equal(stores.get("OBJ-COLONNE-SITE/5000").LARGEUR, 25);
      assert.equal(stores.get("OBJ-COLONNE-SITE/5002").LARGEUR, 50);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].champs.LARGEUR, 25);
      assert.equal(writes[0].champs.OBJLIGNESITELookupId, "1000");
      const une = await decouper(C.ref("ligne", 1000), [100]);
      assert.match(une.message, /1 colonne\(s\) désactivée\(s\), 1 module\(s\) déplacé/);
      assert.equal(stores.get("OBJ-MODULE-SITE-PUBLIC/7002").OBJCOLONNESITELookupId, "5000", "modules regroupés, rien d'effacé");
      assert.equal(stores.get("OBJ-COLONNE-SITE/5002").OBJACTIFLookupId, "3", "colonne en trop désactivée");
      assert.equal(C.actionDroit("ligne.colonnes"), "ligne.ajouter");
      writes.length = 0;
      await C.executer({ d: copies, perimetre, siteId: "4", action: "conteneur.creer",
        params: { type: "footer", titre: "Pied vide", structureBase: false } });
      assert.equal(writes.length, 1, "structure de base désactivable");
      const lot = (refs, etatCible = "inactif") => C.executer({ d: copies, perimetre, siteId: "4", action: "element.etat", params: { refs, etat: etatCible } });
      stores.delete("OBJ-COLONNE-SITE/5000");
      stores.delete("OBJ-MODULE-SITE-PUBLIC/7002");
      const groupe = await lot([C.ref("colonne", 5000), C.ref("module", 7002)]);
      assert.match(groupe.message, /2 éléments désactivés/, "désactivation groupée, natures mélangées");
      assert.equal(stores.get("OBJ-COLONNE-SITE/5000").OBJACTIFLookupId, "3");
      assert.equal(stores.get("OBJ-MODULE-SITE-PUBLIC/7002").OBJACTIFLookupId, "3");
      assert.ok((await lot([C.ref("colonne", 5000), C.ref("module", 99999)])).refus, "élément inconnu : tout le lot est refusé");
      assert.equal((await lot(Array.from({ length: 51 }, (_, i) => C.ref("module", i)))).status, 400, "lot plafonné à 50");
      copies.types.push(el(3, "CARTE"));
      copies.modules[0].relations.OBJMODULESITEPUBLICTYPE = lien(3, "CARTE");
      copies.builderElements = [];
      const enregistrerTypo = (valeurs) => C.executer({ d: copies, perimetre, siteId: "4", action: "design.enregistrer",
        params: { ref: C.ref("module", 7000), valeurs } });
      const avantTypo = writes.length;
      const absent = await enregistrerTypo({ typoTitre: { tailleTexte: 30 } });
      assert.equal(absent.status, 400);
      assert.match(absent.erreur, /TYPO-TITRE/);
      assert.equal(writes.length, avantTypo, "aucune ecriture si schema absent");
      proto.cols = async () => ["TYPOTITRE", "TYPOTEXTE"].map((name) => ({ name, text: { allowMultipleLines: true, textType: "plain" } }));
      const invalide = await enregistrerTypo({ typoTitre: { tailleTexte: 999 } });
      assert.equal(invalide.status, 400);
      assert.equal(writes.length, avantTypo, "aucune creation si valeur invalide");
      const ok = await enregistrerTypo({ typoTitre: { tailleTexte: 30, poidsPolice: "700", masque: true }, typoTexte: { tailleTexte: 16, soulignement: false, masque: false },
        responsive: { MOBILE: { typoTitre: { tailleTexte: 20, masque: false } } } });
      assert.match(ok.message, /Design enregistré/);
      const dernier = writes.at(-1);
      assert.equal(dernier.liste, "OBJ-STYLE-PRESET");
      assert.equal(JSON.parse(dernier.champs.TYPOTITRE).responsive.MOBILE.tailleTexte, 20);
      const preset = el(dernier.id, "Style", {}, { "TYPO-TITRE": dernier.champs.TYPOTITRE, "TYPO-TEXTE": dernier.champs.TYPOTEXTE });
      copies.presets.push(preset);
      copies.modules[0].relations["OBJ-STYLE-PRESET"] = lien(dernier.id);
      const relu = await C.executer({ d: copies, perimetre, siteId: "4", action: "design.lire", params: { ref: C.ref("module", 7000) } });
      assert.equal(relu.design.typographieSeparee, true);
      assert.equal(relu.design.valeurs.typoTitre.tailleTexte, 30);
      assert.equal(relu.design.valeurs.typoTitre.masque, true);
      assert.equal(relu.design.valeurs.typoTexte.masque, false);
      assert.equal(relu.design.responsive.MOBILE.typoTitre.masque, false);
      assert.equal(relu.design.valeurs.typoTexte.tailleTexte, 16);
      assert.equal(relu.design.responsive.MOBILE.typoTitre.tailleTexte, 20);
      await enregistrerTypo({ responsive: { MOBILE: { typoTitre: { tailleTexte: 18 } } } });
      const partiel = JSON.parse(stores.get(`OBJ-STYLE-PRESET/${dernier.id}`).TYPOTITRE);
      assert.equal(partiel.tailleTexte, 30, "une surcharge seule conserve le general");
      assert.equal(partiel.responsive.MOBILE.tailleTexte, 18);
      const underline = { soulignement: true, soulignementCouleur: "#abcdef", soulignementStyle: "DOUBLE", soulignementEpaisseur: "2.5", soulignementDistance: "4" };
      await enregistrerTypo({ typoTitre: underline, typoTexte: { soulignement: false } });
      const sauvegarde = JSON.parse(stores.get(`OBJ-STYLE-PRESET/${dernier.id}`).TYPOTITRE);
      assert.equal(sauvegarde.soulignementEpaisseur, 2.5);
      assert.equal(sauvegarde.soulignementCouleur, "#abcdef");
      copies.types.push(el(4, "FAQ"));
      copies.modules[0].relations.OBJMODULESITEPUBLICTYPE = lien(4, "FAQ");
      const avantFaq = writes.length;
      assert.equal((await enregistrerTypo({ typoTitre: { masque: true } })).status, 400);
      assert.equal((await enregistrerTypo({ responsive: { MOBILE: { typoTitre: { masque: true } } } })).status, 400);
      assert.equal(writes.length, avantFaq, "question masquee refusee sans ecriture");
      copies.modules[0].relations.OBJMODULESITEPUBLICTYPE = lien(1, "TITRE");
      assert.equal((await enregistrerTypo(underline)).status, 400, "colonnes uniques absentes : erreur explicite");
      proto.cols = async () => [
        { name: "SOULIGNEMENT", boolean: {} },
        { name: "SOULIGNEMENTCOULEUR", text: {} },
        { name: "SOULIGNEMENTSTYLE", choice: { choices: B.CHOIX.soulignementStyle, allowTextEntry: false } },
        { name: "SOULIGNEMENTEPAISSEUR", number: {} }, { name: "SOULIGNEMENTDISTANCE", number: {} }
      ];
      assert.match((await enregistrerTypo(underline)).message, /Design enregistré/);
      const platSauve = stores.get(`OBJ-STYLE-PRESET/${dernier.id}`);
      assert.equal(platSauve.SOULIGNEMENTCOULEUR, "#abcdef");
      assert.equal(platSauve.SOULIGNEMENTSTYLE, "DOUBLE");
      assert.equal(platSauve.SOULIGNEMENTEPAISSEUR, 2.5);
      assert.equal(platSauve.SOULIGNEMENTDISTANCE, 4);
      copies.types.push(el(4, "IMAGE"));
      copies.modules[0].relations.OBJMODULESITEPUBLICTYPE = lien(4, "IMAGE");
      assert.equal((await enregistrerTypo({ imageTitreMode: "SUPERPOSE" })).status, 400, "disposition refusee sans colonne");
      proto.cols = async () => ["TYPOTITRE", "TYPOTEXTE", "IMAGEDISPOSITION", "BORDURESDETAIL"].map((name) => ({ name, text: { allowMultipleLines: true, textType: "plain" } }));
      const detail = await enregistrerTypo({ imageTitreMode: "SUPERPOSE", imageTitrePosition: "DROITE", imageTexteMasque: true,
        bordureRayonHautGauche: 12, bordureEpaisseurHaut: 2.5, bordureCouleurHaut: "#123456",
        responsive: { MOBILE: { imageTitreMode: "AUTOUR", bordureRayonHautGauche: 5 } } });
      assert.match(detail.message, /Design enregistré/);
      const detailSauve = stores.get(`OBJ-STYLE-PRESET/${dernier.id}`);
      preset.configuration["IMAGE-DISPOSITION"] = detailSauve.IMAGEDISPOSITION;
      preset.configuration["BORDURES-DETAIL"] = detailSauve.BORDURESDETAIL;
      const detailRelu = await C.executer({ d: copies, perimetre, siteId: "4", action: "design.lire", params: { ref: C.ref("module", 7000) } });
      assert.equal(detailRelu.design.type, "IMAGE");
      assert.equal(detailRelu.design.typographieSeparee, true);
      assert.equal(detailRelu.design.valeurs.imageTitrePosition, "DROITE");
      assert.equal(detailRelu.design.valeurs.bordureEpaisseurHaut, 2.5);
      assert.equal(detailRelu.design.responsive.MOBILE.imageTitreMode, "AUTOUR");
      assert.equal(detailRelu.design.responsive.MOBILE.bordureRayonHautGauche, 5);
      assert.ok(detailRelu.design.champsResponsive.includes("imageTexteMasque"));
      const designUi = await front("cockpit/design.js");
      const imagePanneau = designUi.panneauDesign(detailRelu.design, { ref: "module.x" });
      assert.equal((imagePanneau.match(/data-design-groupe="BORDURE"/g) || []).length, 3, "une rubrique bordure par appareil");
      for (const ancien of ["COINS", "BORDURE_HAUT", "BORDURE_DROITE", "BORDURE_BAS", "BORDURE_GAUCHE", "ALIGNEMENT"]) assert.ok(!imagePanneau.includes(`data-design-groupe="${ancien}"`));
      assert.ok(imagePanneau.includes("Même arrondi pour les quatre coins"));
      assert.ok(imagePanneau.includes('data-design-cote="Tous"'));
      assert.ok(imagePanneau.includes('data-design-curseur="bordureLargeur"'));
      assert.ok(imagePanneau.includes('name="imagePosition"'));
      for (const nom of ["imageTitreMode", "imageTexteMasque", "bordureRayonBasGauche", "bordureCouleurDroite", "MOBILE.bordureEpaisseurBas"]) assert.ok(imagePanneau.includes(`name="${nom}"`), nom);
      await enregistrerTypo({ bordureRayonHautGauche: "" });
      const resetDetails = JSON.parse(stores.get(`OBJ-STYLE-PRESET/${dernier.id}`).BORDURESDETAIL);
      assert.equal(resetDetails.bordureRayonHautGauche, undefined);
      assert.equal(resetDetails.bordureEpaisseurHaut, 2.5, "modification partielle conserve les autres cotes");
      assert.equal((await enregistrerTypo({ imageTitrePosition: "invalide" })).status, 400);
      ecriture.contexteGraph = async () => ({ listes: [{ id: "media", displayName: "OBJ-MEDIA" }, { id: "align", displayName: "OBJ-ALIGNEMENT" }] });
      const contenuImage = el(8000, "Repere interne", { "OBJ-MODULE-SITE-PUBLIC": lien(7000) });
      contenuImage._fields = { Title: "Repere interne", LEGENDE: "Ancien titre public", TITREIMAGE: "", TEXTE: "Description", MEDIALookupId: "1" };
      copies.contenus["OBJ-MODULE-IMAGE"] = [contenuImage];
      const colsStyle = ["TYPOTITRE", "TYPOTEXTE", "IMAGEDISPOSITION", "BORDURESDETAIL"].map((name) => ({ name, text: { allowMultipleLines: true, textType: "plain" } }));
      proto.cols = async (liste) => liste === "OBJ-MODULE-IMAGE" ? [
        { name: "Title", displayName: "Titre", required: true, text: { maxLength: 255 } },
        { name: "TITREIMAGE", displayName: "TITRE-IMAGE", text: { maxLength: 255 } },
        { name: "TEXTE", displayName: "TEXTE", text: { allowMultipleLines: true, textType: "plain" } },
        { name: "LEGENDE", displayName: "LEGENDE", text: {} },
        { name: "MEDIA", displayName: "MEDIA", lookup: { listId: "media" } },
        { name: "OBJALIGNEMENT", displayName: "OBJ-ALIGNEMENT", lookup: { listId: "align" } }
      ] : colsStyle;
      const contenu = (action, valeurs) => C.executer({ d: copies, perimetre, siteId: "4", action, params: { ref: C.ref("module", 7000), valeurs } });
      const f = (await contenu("contenu.formulaire")).formulaire;
      assert.ok(!f.textes.some((x) => x.libelle === "LEGENDE"));
      assert.ok(!f.listes.some((x) => x.libelle === "ALIGNEMENT"));
      assert.equal(f.listes.length, 1, "relation OBJ-ALIGNEMENT masquee elle aussi");
      const titrePublic = f.textes.find((x) => x.affichage === "afficherTitreImage");
      assert.equal(titrePublic.valeur, "Ancien titre public");
      assert.match(titrePublic.aide, /Design/);
      assert.equal(f.visibiliteImage.texte, false, "masquage Design relu dans le contenu");
      assert.equal(f.listes[0].choisirImage, true);
      const invalid = await contenu("contenu.enregistrer", { [titrePublic.cle]: "Titre", afficherTexteImage: "invalid" });
      assert.equal(invalid.status, 400);
      const saveImage = await contenu("contenu.enregistrer", { [titrePublic.cle]: "Titre public", afficherTitreImage: "false", afficherTexteImage: "true" });
      assert.match(saveImage.message, /Contenu du module enregistré/);
      assert.equal(stores.get("OBJ-MODULE-IMAGE/8000").TITREIMAGE, "Titre public");
      assert.equal(stores.get("OBJ-MODULE-IMAGE/8000").LEGENDE, "");
      assert.equal(stores.get("OBJ-MODULE-IMAGE/8000").Title, undefined, "nom de repere non modifie");
      const disposition = JSON.parse(stores.get(`OBJ-STYLE-PRESET/${dernier.id}`).IMAGEDISPOSITION);
      assert.equal(disposition.imageTitreMasque, true);
      assert.equal(disposition.imageTexteMasque, false);
      assert.equal(disposition.imageTitrePosition, "DROITE", "autres reglages conserves");
      assert.equal(disposition.responsive.MOBILE.imageTitreMode, "AUTOUR", "responsive conserve");
      await enregistrerTypo({ imagePosition: "DROITE", responsive: { MOBILE: { imagePosition: "CENTRE" } } });
      const position = JSON.parse(stores.get(`OBJ-STYLE-PRESET/${dernier.id}`).IMAGEDISPOSITION);
      assert.equal(position.imagePosition, "DROITE");
      assert.equal(position.responsive.MOBILE.imagePosition, "CENTRE");
      assert.equal((await enregistrerTypo({ imagePosition: "JUSTIFIE" })).status, 400);
      const retirer = await contenu("contenu.enregistrer", { [f.listes[0].cle]: "" });
      assert.match(retirer.message, /enregistré/);
      assert.equal(stores.get("OBJ-MODULE-IMAGE/8000").MEDIALookupId, null);
    } finally {
      ecriture.contexteGraph = originalGraph;
      ecriture.lireItemFrais = originalLecture;
      for (const k of methodes) proto[k] = originaux[k];
    }
  }
  console.log("Constructeur : perimetre, medias, references opaques, arbre, apercu, En-tete/Footer, Design, duplication de page et interface OK");
}

main().catch((e) => { console.error(e); process.exit(1); });
