"use strict";

// Articles construits avec DSE-CONSTRUCTION : rattachement au site (ID natif), activation conditionnee a la
// relation SharePoint OBJ-BUILDER-ELEMENT.OBJ-ARTICLE, droits Articles et interface (donnees simulees, aucun appel Graph).
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const C = require("../shared/constructeur");

const front = (f) => import(pathToFileURL(path.join(__dirname, "..", "..", "modules", f)).href);
const OUI = { id: "1", titre: "OUI" };
const lien = (id, titre = null) => ({ id: String(id), titre });
const el = (id, titre, relations = {}, configuration = {}) => ({
  id: String(id), _fields: { Title: titre }, configuration: { Title: titre, ...configuration },
  relations: { "OBJ-ACTIF": OUI, "OBJ-VALIDE": OUI, ...relations }
});
const colonnesBuilder = (avecArticle) => [{ name: "OBJ_x002d_SITE_x002d_PUBLIC", displayName: "OBJ-SITE-PUBLIC" },
  ...(avecArticle ? [{ name: "OBJ_x002d_ARTICLE", displayName: "OBJ-ARTICLE", lookup: { listId: "liste-articles" } }] : [])];

function donnees(avecArticle) {
  const racine = { id: "900", _fields: { Title: "Racine article" }, _colonnes: colonnesBuilder(avecArticle),
    configuration: { Title: "Racine article", ACTIF: true },
    relations: { "OBJ-SITE-PUBLIC": lien(4), "OBJ-BUILDER-TYPE": lien(1, "PAGE"), ...(avecArticle ? { "OBJ-ARTICLE": lien(20) } : {}) } };
  return {
    listeArticlesId: "liste-articles",
    articles: [
      el(20, "Article du site", { "OBJ-SITE-PUBLIC": [lien(4)] }, { URL: "/actualites/lancement", "NOTE-COURTE": "Résumé" }),
      el(21, "Article ciblé", { "OBJ-SITE-PUBLIC": [lien(4), lien(9)], "SITE-CIBLE": lien(4) }),
      el(22, "Article ambigu", { "OBJ-SITE-PUBLIC": [lien(4), lien(9)] }),
      el(23, "Article autre site", { "OBJ-SITE-PUBLIC": [lien(9)] })
    ],
    builderTypes: [{ id: "1", _fields: { Title: "PAGE" }, relations: {},
      configuration: { Title: "PAGE", ACTIF: true, "CLE-RENDU": "PAGE", "EST-RACINE": true, "EST-CONTENEUR": true } }],
    builderRegles: [],
    builderElements: [racine],
    pages: [], entetes: [], footers: [], sections: [], lignes: [], colonnes: [], modules: [], types: [], utilisations: [],
    contenus: {}, medias: [], logos: [], modeles: [], structures: [], typesSection: [], presets: [], responsifs: [], couleurs: [], polices: []
  };
}
const perimetre = { sites: new Set(["4"]), clients: new Set(), superAdmin: false, peut: () => true };

async function main() {
  // Site de l'article : SITE-CIBLE prioritaire, sinon un seul site ; plusieurs sites sans cible = ambigu (refuse).
  const [a20, a21, a22, a23] = donnees(true).articles;
  assert.equal(C.siteDuConteneur({ type: "article", el: a20 }), "4");
  assert.equal(C.siteDuConteneur({ type: "article", el: a21 }), "4");
  assert.equal(C.siteDuConteneur({ type: "article", el: a22 }), null);
  assert.equal(C.siteDuConteneur({ type: "article", el: a23 }), "9");

  // Vue : uniquement les articles du site selectionne, reference d'edition, chemin et etat de construction.
  const v = C.vue(donnees(true), perimetre);
  assert.deepEqual(v.articles.map((a) => a.titre).sort(), ["Article ciblé", "Article du site"]);
  const art = v.articles.find((a) => a.titre === "Article du site");
  assert.equal(art.chemin, "/actualites/lancement");
  assert.equal(art.construit, true);
  assert.match(art.edition, /^[0-9a-f]{24}$/);
  assert.equal(art.edition, require("../shared/edition").referenceElement("liste-articles", "20"));
  assert.equal(v.builder.articles, true);
  assert.equal(v.builder.messageArticles, null);
  assert.ok(!JSON.stringify(v.articles).includes("Article autre site"));

  // Relation SharePoint absente : construction desactivee avec message explicite, liste toujours visible.
  const sans = C.vue(donnees(false), perimetre);
  assert.equal(sans.builder.articles, false);
  assert.match(sans.builder.messageArticles, /OBJ-ARTICLE.*OBJ-BUILDER-ELEMENT/);
  assert.equal(sans.articles.find((a) => a.titre === "Article du site").construit, false);

  // Arbre : un article d'un autre site ou ambigu n'est jamais resolu dans ce site.
  const d = donnees(true);
  const r = C.resoudre(d, C.ref("article", "20"), ["article"]);
  assert.equal(r.type, "article");
  assert.equal(C.siteDe(d, r.type, r.el), "4");
  assert.equal(C.siteDe(d, "article", a23), "9");
  assert.equal(C.arbre(d, "article", r.el, perimetre).generique?.ref !== undefined, true);

  // Droits : correspondance stricte vers les operations Articles existantes, toute autre action refusee.
  assert.equal(C.operationArticle("builder.initialiser"), "articles.creer");
  assert.equal(C.operationArticle("builder.ajouter"), "articles.creer");
  assert.equal(C.operationArticle("builder.enregistrer"), "articles.modifier");
  assert.equal(C.operationArticle("design.enregistrer"), "articles.modifier");
  assert.equal(C.operationArticle("builder.publier"), "articles.publier");
  assert.equal(C.operationArticle("conteneur.publier"), "articles.publier");
  assert.equal(C.operationArticle("conteneur.dupliquer"), null);
  assert.equal(C.operationArticle("page.affecter"), null);
  assert.equal(C.operationArticle("conteneur.creer"), null);

  // Interface : onglet Articles, domaine principal automatique, actions selon droits et relation SharePoint.
  const ui = await front("cockpit/constructeur.js");
  assert.ok(ui.ONGLETS.some((o) => o.cle === "articles"));
  for (const action of ["builder.initialiser", "builder.publier", "design.enregistrer", "conteneur.dupliquer"]) {
    assert.equal(ui.operationArticle(action), action === "conteneur.dupliquer" ? null : C.operationArticle(action));
  }
  const base = { ...v, site: { titre: "DemainSite", domaine: "demainsite.fr" }, operations: ["articles.voir", "articles.creer", "articles.modifier"],
    operationsInterdites: [], droits: { articles: { lecture: true, ecriture: true } } };
  const html = ui.rendreConstructeur({}, base, { onglet: "articles", domaine: "demainsite.fr" });
  assert.match(html, /Articles de DemainSite/);
  assert.match(html, /https:\/\/demainsite\.fr\/actualites\/lancement/);
  assert.match(html, /modifier\/articles\?element=nouveau/);
  assert.match(html, new RegExp(`modifier/articles\\?element=${art.edition}`));
  assert.match(html, /data-c-action="ouvrir"/);
  assert.ok(!/name="url"|name="domaine"/i.test(html));
  assert.equal(ui.peutAction(base, "article", "builder.initialiser"), true);
  assert.equal(ui.peutAction(base, "article", "builder.publier"), false);
  assert.equal(ui.peutAction(base, "article", "conteneur.dupliquer"), false);
  assert.equal(ui.peutAction({ ...base, operationsInterdites: ["articles.creer"] }, "article", "builder.initialiser"), false);

  const sansHtml = ui.rendreConstructeur({}, { ...base, ...sans, site: base.site }, { onglet: "articles", domaine: "demainsite.fr" });
  assert.match(sansHtml, /OBJ-BUILDER-ELEMENT/);
  assert.ok(!/data-c-action="ouvrir"/.test(sansHtml));
  assert.equal(ui.peutAction({ ...base, builder: sans.builder }, "article", "builder.initialiser"), false);

  const lectureSeule = ui.rendreConstructeur({}, { ...base, operations: ["articles.voir"] }, { onglet: "articles", domaine: "demainsite.fr" });
  assert.ok(!/element=nouveau/.test(lectureSeule));
  const sansDroit = ui.rendreConstructeur({}, { ...base, droits: { articles: { lecture: false } } }, { onglet: "articles", domaine: "demainsite.fr" });
  assert.ok(!sansDroit.includes("Article du site"));

  // Menu : Articles regroupe sous « Construire le site ».
  const nav = await front("cockpit/navigation-site.js");
  const items = nav.navigationSite({ domaine: "demainsite.fr", fonctions: ["articles"] }, "ecriture");
  assert.ok(items.some((x) => /\/construire$/.test(x.url)));
  assert.equal(items.find((x) => x.libelle === "Articles").url, "/cockpit/site/demainsite.fr/construire?onglet=articles");

  console.log("Tests articles (constructeur) : OK");
}

main().catch((e) => { console.error(e); process.exit(1); });
