"use strict";

// Tests du catalogue multiplateforme : moteur pur (API) + rendu front pur. Aucun acces reseau.
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moteur = require("../shared/catalogue");
const source = require("../shared/catalogue-source");

let nombre = 0;
const test = (nom, fn) => { fn(); nombre++; console.log(`OK ${nom}`); };

/* ---------- Jeux de donnees (formes SharePoint, ID natifs) ---------- */

const oui = { id: "1", titre: "Oui" };
const rel = (...ids) => ids.map((id) => ({ id: String(id), titre: `ref-${id}` }));
const nommes = (liste) => liste.map(([id, titre]) => ({ id: String(id), titre }));

function el(id, configuration, relations = {}) {
  return {
    id: String(id),
    ordre: 999999,
    configuration,
    relations: { "OBJ-ACTIF": oui, "OBJ-VALIDE": oui, ...relations }
  };
}

const T1 = ["10", "Écologie"], T2 = ["11", "Numérique responsable"];
const C1 = ["20", "Guides"], K1 = ["30", "Collection Été"];

const donnees = {
  sites: [
    { id: "1", titre: "DemainSite", domaines: ["demainsite.fr"], actif: true, valide: true, portail: false },
    { id: "2", titre: "Editions PascLaure", domaines: ["pasclaure.fr"], actif: true, valide: true, portail: false },
    { id: "3", titre: "Blogs-Site", domaines: ["blogs-site.fr"], actif: true, valide: true, portail: false },
    { id: "4", titre: "DemainSite Ecosystème", domaines: ["dseco.fr"], actif: true, valide: true, portail: true },
    { id: "5", titre: "Inactif", domaines: ["inactif.fr"], actif: false, valide: true, portail: false }
  ],
  elements: {
    produit: [
      // Produit unique partage par 3 plateformes, sans prix.
      el(1, { Titre: "Guide Éco-Numérique", "NOTE-COURTE": "Un guide pratique", FORMAT: "Numérique", AGREGATION: true },
        { "OBJ-SITE-PUBLIC": nommes([[1, "DemainSite"], [2, "Editions PascLaure"], [3, "Blogs-Site"]]), THEME: nommes([T1]), CATEGORIE: nommes([C1]), COLLECTION: nommes([K1]), DISPONIBILITE: { id: "7", titre: "Disponible" } }),
      el(2, { Titre: "Carnet PascLaure", PRIX: 12.5, FORMAT: "Papier" },
        { "OBJ-SITE-PUBLIC": nommes([[2, "Editions PascLaure"]]), DEVISE: { id: "1", titre: "EUR" }, THEME: nommes([T2]), "OBJ-ARTICLE": rel(1) })
    ],
    article: [
      el(1, { Titre: "L'écologie au quotidien", RESUME: "<p>Conseils &amp; astuces</p>" },
        { "OBJ-SITE-PUBLIC": nommes([[1, "DemainSite"]]), THEME: nommes([T1]), "OBJ-CATALOGUE": rel(1) }),
      el(2, { Titre: "Actualité du réseau", AGREGATION: true, "OBJ-MEDIA": null },
        { "OBJ-SITE-PUBLIC": nommes([[3, "Blogs-Site"]]), THEME: nommes([T1]), "OBJ-MEDIA": { id: "9", titre: "m" } }),
      { ...el(3, { Titre: "Brouillon" }, { "OBJ-SITE-PUBLIC": nommes([[1, "DemainSite"]]) }), relations: { "OBJ-ACTIF": oui, "OBJ-VALIDE": { id: "2", titre: "Non" }, "OBJ-SITE-PUBLIC": nommes([[1, "DemainSite"]]) } },
      el(4, { Titre: "Article interne", VISIBILITE: "Privé" }, { "OBJ-SITE-PUBLIC": nommes([[1, "DemainSite"]]) }),
      el(5, { Titre: "Sans plateforme" })
    ],
    service: [
      el(1, { Titre: "Accompagnement" }, { "OBJ-SITE-PUBLIC": nommes([[1, "DemainSite"]]), "OBJ-ARTICLE": rel(1) })
    ]
  },
  referentiels: { theme: null, categorie: null, collection: null }
};

const index = moteur.construireIndex(donnees);
const site = (domaine) => moteur.siteDuDomaine(index, domaine);
const cles = (resultat) => resultat.elements.map((e) => e.cle).sort();

/* ---------- Plateforme / domaine ---------- */

test("domaine -> site (actif et valide uniquement)", () => {
  assert.equal(site("demainsite.fr").id, "1");
  assert.equal(site("dseco.fr").portail, true);
  assert.equal(site("inactif.fr"), null);
  assert.equal(site("inconnu.fr"), null);
});

test("filtrage par plateforme : chaque site ne voit que ses contenus", () => {
  assert.deepEqual(cles(moteur.interroger(index, site("demainsite.fr"))), ["article-1", "produit-1", "service-1"]);
  assert.deepEqual(cles(moteur.interroger(index, site("pasclaure.fr"))), ["produit-1", "produit-2"]);
  assert.deepEqual(cles(moteur.interroger(index, site("blogs-site.fr"))), ["article-2", "produit-1"]);
});

test("contenu non valide, non public ou sans plateforme jamais expose", () => {
  const tout = Object.values(["demainsite.fr", "pasclaure.fr", "blogs-site.fr", "dseco.fr"])
    .flatMap((d) => cles(moteur.interroger(index, site(d))));

  for (const interdit of ["article-3", "article-4", "article-5"]) {
    assert.ok(!tout.includes(interdit), interdit);
  }
});

test("site inconnu : resultat vide, jamais de donnees", () => {
  const r = moteur.interroger(index, site("inconnu.fr"));
  assert.equal(r.total, 0);
  assert.equal(moteur.detail(index, null, "produit-1"), null);
});

test("protection entre domaines : detail refuse hors portee et plateformes masquees", () => {
  assert.equal(moteur.detail(index, site("pasclaure.fr"), "article-1"), null);
  assert.equal(moteur.detail(index, site("blogs-site.fr"), "service-1"), null);

  const produit = moteur.interroger(index, site("demainsite.fr")).elements.find((e) => e.cle === "produit-1");
  assert.deepEqual(produit.plateformes.map((p) => p.id), ["1"]);
  assert.ok(!JSON.stringify(produit).includes("pasclaure"));
});

/* ---------- Boutique commune ---------- */

test("boutique commune : un produit, plusieurs plateformes, sans copie", () => {
  assert.equal(index.items.filter((i) => i.cle === "produit-1").length, 1);

  for (const d of ["demainsite.fr", "pasclaure.fr", "blogs-site.fr"]) {
    const r = moteur.interroger(index, site(d), {}, { types: ["produit"] });
    assert.ok(cles(r).includes("produit-1"), d);
  }

  assert.deepEqual(cles(moteur.interroger(index, site("blogs-site.fr"), {}, { types: ["produit"] })), ["produit-1"]);
});

/* ---------- Agregation dseco.fr ---------- */

test("agregation dseco.fr : uniquement les contenus explicitement autorises", () => {
  const r = moteur.interroger(index, site("dseco.fr"));
  assert.deepEqual(cles(r), ["article-2", "produit-1"]);

  const produit = r.elements.find((e) => e.cle === "produit-1");
  assert.deepEqual(produit.plateformes.map((p) => p.domaine).sort(), ["blogs-site.fr", "demainsite.fr", "pasclaure.fr"]);
  assert.equal(r.elements.filter((e) => e.cle === "produit-1").length, 1);
});

test("l'agregation n'existe pas hors portail", () => {
  assert.ok(!cles(moteur.interroger(index, site("pasclaure.fr"))).includes("article-2"));
});

test("filtre plateforme disponible uniquement sur le portail", () => {
  assert.equal(moteur.interroger(index, site("demainsite.fr")).facettes.plateforme.length, 0);

  const portail = moteur.interroger(index, site("dseco.fr"), { plateforme: "3" });
  assert.deepEqual(cles(portail), ["article-2", "produit-1"]);
  assert.deepEqual(cles(moteur.interroger(index, site("dseco.fr"), { plateforme: "1" })), ["produit-1"]);
});

/* ---------- Type / theme / filtres combines ---------- */

test("filtre par type", () => {
  assert.deepEqual(cles(moteur.interroger(index, site("demainsite.fr"), { type: "article" })), ["article-1"]);
  assert.deepEqual(cles(moteur.interroger(index, site("demainsite.fr"), { type: "article,service" })), ["article-1", "service-1"]);
});

test("filtre par theme (ID natif) et facettes issues des donnees", () => {
  const r = moteur.interroger(index, site("demainsite.fr"), { theme: "10" });
  assert.deepEqual(cles(r), ["article-1", "produit-1"]);

  const themes = moteur.interroger(index, site("pasclaure.fr")).facettes.theme.map((t) => t.libelle).sort();
  assert.deepEqual(themes, ["Numérique responsable", "Écologie"].sort());
});

test("filtres combines et facettes dynamiques", () => {
  const r = moteur.interroger(index, site("pasclaure.fr"), { theme: "10", format: "numerique" });
  assert.deepEqual(cles(r), ["produit-1"]);

  const combine = moteur.interroger(index, site("pasclaure.fr"), { theme: "10", format: "papier" });
  assert.equal(combine.total, 0);

  // La facette theme reste exploitable alors qu'un theme est deja choisi.
  assert.equal(moteur.interroger(index, site("pasclaure.fr"), { theme: "10" }).facettes.theme.length, 2);

  const complet = moteur.interroger(index, site("pasclaure.fr"), { categorie: "20", collection: "30", disponibilite: "disponible" });
  assert.deepEqual(cles(complet), ["produit-1"]);
});

test("visibilite et disponibilite sont des facettes", () => {
  const f = moteur.interroger(index, site("pasclaure.fr")).facettes;
  assert.deepEqual(f.visibilite.map((v) => v.libelle), ["Public"]);
  assert.deepEqual(f.disponibilite.map((v) => v.libelle), ["Disponible"]);
});

test("reinitialisation = aucun critere", () => {
  const filtre = moteur.interroger(index, site("demainsite.fr"), { type: "article" });
  const initial = moteur.interroger(index, site("demainsite.fr"), {});
  assert.ok(initial.total > filtre.total);
  assert.deepEqual(initial.appliques, {});
});

/* ---------- Recherche ---------- */

test("recherche : casse et accents ignores", () => {
  const d = site("demainsite.fr");
  assert.deepEqual(cles(moteur.interroger(index, d, { q: "ECOLOGIE" })), ["article-1", "produit-1"]);
  assert.deepEqual(cles(moteur.interroger(index, d, { q: "écologie" })), ["article-1", "produit-1"]);
  assert.deepEqual(cles(moteur.interroger(index, d, { q: "ECO-numerique" })), ["produit-1"]);
  assert.deepEqual(cles(moteur.interroger(index, d, { q: "guide eco" })), ["produit-1"]);
});

test("recherche : resume, theme, categorie, collection, plateforme", () => {
  const d = site("pasclaure.fr");
  assert.deepEqual(cles(moteur.interroger(index, d, { q: "pratique" })), ["produit-1"]);
  assert.ok(cles(moteur.interroger(index, d, { q: "responsable" })).includes("produit-2"));
  assert.deepEqual(cles(moteur.interroger(index, d, { q: "guides" })), ["produit-1"]);
  assert.deepEqual(cles(moteur.interroger(index, d, { q: "ete" })), ["produit-1"]);
  assert.deepEqual(cles(moteur.interroger(index, d, { q: "pasclaure" })), ["produit-1", "produit-2"]);
});

test("recherche : le HTML du resume est nettoye", () => {
  const a = moteur.interroger(index, site("demainsite.fr"), { type: "article" }).elements[0];
  assert.equal(a.resume, "Conseils & astuces");
});

test("recherche combinee a un filtre", () => {
  assert.deepEqual(cles(moteur.interroger(index, site("demainsite.fr"), { q: "ecologie", type: "produit" })), ["produit-1"]);
});

test("resultat vide propre", () => {
  const r = moteur.interroger(index, site("demainsite.fr"), { q: "zzzinexistant" });
  assert.equal(r.total, 0);
  assert.deepEqual(r.elements, []);
  assert.equal(r.pages, 1);
});

/* ---------- Donnees incompletes ---------- */

test("article sans media et produit sans prix", () => {
  const demain = moteur.interroger(index, site("demainsite.fr"), {});
  assert.equal(demain.elements.find((e) => e.cle === "article-1").media, null);
  assert.equal(demain.elements.find((e) => e.cle === "produit-1").prix, null);

  const blogs = moteur.interroger(index, site("blogs-site.fr"), {});
  assert.equal(blogs.elements.find((e) => e.cle === "article-2").media.url, "/api/v1/media/9");

  const prix = moteur.interroger(index, site("pasclaure.fr"), {}).elements.find((e) => e.cle === "produit-2").prix;
  assert.deepEqual(prix, { montant: 12.5, devise: "EUR" });
});

test("referentiel : theme non valide masque", () => {
  const filtre = moteur.construireIndex({ ...donnees, referentiels: { theme: new Set(["10"]), categorie: null, collection: null } });
  const r = moteur.interroger(filtre, moteur.siteDuDomaine(filtre, "pasclaure.fr"));
  assert.deepEqual(r.elements.find((e) => e.cle === "produit-2").themes, []);
});

test("sans aucune liste : catalogue vide sans erreur", () => {
  const vide = moteur.construireIndex({ sites: donnees.sites, elements: {}, referentiels: {} });
  assert.equal(moteur.interroger(vide, moteur.siteDuDomaine(vide, "dseco.fr")).total, 0);
});

/* ---------- Relations transversales ---------- */

test("liens Article <-> Produit <-> Service <-> Media, dans la portee du site", () => {
  const d = site("demainsite.fr");
  const article = moteur.detail(index, d, "article-1");
  assert.deepEqual(article.lies.map((l) => l.cle).sort(), ["produit-1", "service-1"]);

  const produit = moteur.detail(index, d, "produit-1");
  assert.deepEqual(produit.lies.map((l) => l.cle), ["article-1"]);

  // Produit-2 cite article-1 (autre plateforme) : jamais visible depuis demainsite.fr.
  assert.ok(!article.lies.some((l) => l.cle === "produit-2"));
  assert.ok(moteur.detail(index, site("pasclaure.fr"), "produit-2").lies.length === 0);
});

/* ---------- Sources SharePoint ---------- */

test("lecture des sites : domaines et portail par variable de repli", () => {
  process.env.DSE_CATALOGUE_PORTAIL_SITE_IDS = "4";

  const sites = source.lireSites([{
    id: "4",
    configuration: { "Titre OBJ-SITE-PUBLIC": "DemainSite Ecosystème" },
    relations: { "OBJ-ACTIF": oui, "OBJ-VALIDE": oui },
    _colonnes: [{ name: "OBJ_x002d_NOM", displayName: "OBJ-NOM DE DOMAINE", lookup: {} }],
    _fields: { OBJ_x002d_NOM: [{ LookupId: 9, LookupValue: "dseco.fr" }] }
  }]);

  delete process.env.DSE_CATALOGUE_PORTAIL_SITE_IDS;

  assert.deepEqual(sites[0], { id: "4", titre: "DemainSite Ecosystème", domaines: ["dseco.fr"], actif: true, valide: true, portail: true });
});

/* ---------- Rendu front (modules purs) ---------- */

(async () => {
  const racine = path.resolve(__dirname, "..", "..", "modules");
  const charger = (f) => import(pathToFileURL(path.join(racine, f)).href);

  const catalogue = await charger("catalogue/catalogue.js");
  const filtres = await charger("filtres/filtres.js");
  const recherche = await charger("recherche/recherche.js");

  const base = { cle: "article-1", type: "article", id: "1", titre: "Titre <b>x</b>", resume: "", url: null, themes: [], categories: [], collections: [], plateformes: [], format: null, disponibilite: null, prix: null, media: null };

  test("front : article sans image, produit sans prix, echappement", () => {
    const article = catalogue.rendreCarte(base);
    assert.ok(!article.includes("<img"));
    assert.ok(article.includes("Titre &lt;b&gt;x&lt;/b&gt;"));

    const produit = catalogue.rendreCarte({ ...base, type: "produit", cle: "produit-1" });
    assert.ok(!produit.includes("dse-carte-prix"));

    const avecPrix = catalogue.rendreCarte({ ...base, type: "produit", prix: { montant: 12.5, devise: "EUR" } });
    assert.ok(avecPrix.includes("dse-carte-prix"));
    assert.ok(avecPrix.includes("12,50"));
  });

  test("front : liens non surs ignores, aucune information technique", () => {
    const html = catalogue.rendreCarte({ ...base, url: "javascript:alert(1)" });
    assert.ok(!html.includes("javascript:"));
    assert.ok(!/SharePoint|OBJ-|API|graph/i.test(catalogue.rendreCatalogue({ elements: [base], total: 1, facettes: {} })));
  });

  test("front : portail = lien sortant controle vers la plateforme", () => {
    const html = catalogue.rendreCarte({ ...base, plateformes: [{ id: "1", titre: "DemainSite", domaine: "demainsite.fr" }] }, { portail: true });
    assert.ok(html.includes('href="https://demainsite.fr"'));

    const piege = catalogue.rendreCarte({ ...base, plateformes: [{ id: "1", titre: "x", domaine: "evil.fr/\"><script>" }] }, { portail: true });
    assert.ok(!piege.includes("<script>"));
  });

  test("front : resultat vide et chargement accessibles", () => {
    assert.ok(catalogue.rendreVide(true).includes("Aucun résultat"));
    assert.ok(catalogue.rendreChargement().includes('role="status"'));
    assert.equal(catalogue.resumeResultats(0), "Aucun résultat");
    assert.equal(catalogue.resumeResultats(1), "1 résultat");
  });

  test("front : filtres generes depuis les donnees, combinables, reinitialisables", () => {
    const facettes = {
      type: [{ valeur: "article", libelle: "article", nombre: 2 }, { valeur: "produit", libelle: "produit", nombre: 1 }],
      theme: [{ valeur: "10", libelle: "Écologie", nombre: 3 }],
      format: []
    };

    const html = filtres.rendreFiltres(facettes, {});
    assert.ok(html.includes("Articles") && html.includes("Type de contenu"));
    assert.ok(!html.includes("dse-filtre-theme"), "une seule option : pas de filtre");
    assert.ok(html.includes("disabled"), "reinitialisation inactive sans selection");

    let selection = filtres.modifierSelection(filtres.selectionVide(), "type", "article");
    selection = filtres.modifierSelection(selection, "theme", "10");
    assert.deepEqual(filtres.parametresRequete(selection, "demainsite.fr", 12), { domaine: "demainsite.fr", limite: 12, type: "article", theme: "10" });
    assert.ok(filtres.selectionActive(selection));
    assert.ok(filtres.rendreFiltres(facettes, selection).includes("dse-filtre-theme"));
    assert.ok(!filtres.selectionActive(filtres.selectionVide()));
  });

  test("front : recherche ignore casse/accents et saisies trop courtes", () => {
    assert.equal(recherche.normaliserTexte("  ÉCOLOGie  "), "ecologie");
    assert.equal(recherche.requeteRecherche("é"), "");
    assert.equal(recherche.requeteRecherche("  Éco "), "Éco");
    assert.ok(recherche.rendreRecherche({ valeur: '"><x' }).includes("&quot;&gt;&lt;x"));
  });

  console.log(`\ncatalogue : ${nombre} tests OK`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
