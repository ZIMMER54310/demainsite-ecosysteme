"use strict";
// Tests du moteur public HERO/FOOTER (fonctions pures, sans reseau).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const url = (f) => require("url").pathToFileURL(path.join(__dirname, "..", "..", f)).href;

(async () => {
  const outils = await import(url("modules/public/outils.js"));
  const { rendreFooter } = await import(url("modules/footer/footer.js"));
  const ok = { relations: { "OBJ-ACTIF": { id: "1" }, "OBJ-VALIDE": { id: "1" } } };
  const non = { relations: { "OBJ-ACTIF": { id: "1" }, "OBJ-VALIDE": { id: "2" } } };
  const page = (hero, footer) => ({ modules: [{ ...ok, ordre: 1, contenus: { hero, footer } }] });

  // Aucun contenu configure : pas de plantage
  assert.strictEqual(outils.trouverContenuModule({}, "hero"), null);
  assert.strictEqual(outils.trouverContenuModule(null, "footer"), null);
  assert.strictEqual(outils.trouverContenuModule(page([], []), "footer"), null);
  // Contenu non valide ignore ; valide retenu
  assert.strictEqual(outils.trouverContenuModule(page([{ ...non, configuration: {} }], []), "hero"), null);
  const c = { ...ok, id: "7", configuration: { "TITRE-PRINCIPAL": "X" } };
  assert.strictEqual(outils.trouverContenuModule(page([c], [c]), "footer").contenu.id, "7");
  assert.strictEqual(outils.trouverContenuModule(page([c], []), "footer"), null);
  // Module actif non valide : le contenu valide est retenu ; module inactif : ignore
  assert.strictEqual(outils.trouverContenuModule({ modules: [{ ...non, contenus: { footer: [c] } }] }, "footer").contenu.id, "7");
  const inactif = { relations: { "OBJ-ACTIF": { id: "2" }, "OBJ-VALIDE": { id: "1" } } };
  assert.strictEqual(outils.trouverContenuModule({ modules: [{ ...inactif, contenus: { footer: [c] } }] }, "footer"), null);


  // En-tete generique SharePoint : entete/logo/menu publies uniquement, sinon nom du site
  const { rendreEntete } = await import(url("modules/entete/entete.js"));
  assert.strictEqual(rendreEntete({}), "");
  assert.ok(rendreEntete({ nomSite: "Site <x>" }).includes("Site &lt;x&gt;"));
  const e1 = rendreEntete({
    nomSite: "Repli",
    entete: [{ ...ok, configuration: { Titre: "Titre SP", "NOTE-COURTE": "Accroche SP" } }],
    logo: [{ ...ok, configuration: { Titre: "Logo" }, media: { url: "/api/v1/media/9" } }],
    menu: [
      { ...ok, configuration: { Titre: "Contact", URL: "/contact" } },
      { ...non, configuration: { Titre: "Brouillon", URL: "/b" } },
      { ...ok, configuration: { Titre: "Pirate", URL: "javascript:alert(1)" } },
      { ...ok, configuration: { Titre: "Sans URL" } }
    ]
  });
  assert.ok(e1.includes("Titre SP") && !e1.includes("Repli"), "titre SharePoint prioritaire");
  assert.ok(e1.includes("Accroche SP") && e1.includes('src="/api/v1/media/9"'));
  assert.ok(e1.includes('href="/contact"') && !/Brouillon|Pirate|Sans URL|javascript:/.test(e1));
  const arbre = rendreEntete({
    nomSite: "Site",
    menuArbre: { titre: "Titre interne concepteur", entrees: [
      { titre: "Accueil", url: "/", enfants: [] },
      { titre: "Services", url: "/services", enfants: [
        { titre: "Créations", url: "https://example.test/creations", enfants: [] }
      ] },
      { titre: "Dangereux", url: "javascript:alert(1)", enfants: [] }
    ] },
    pageUrl: "/"
  });
  assert.ok(arbre.includes('aria-label="Navigation principale"') && !arbre.includes("Titre interne concepteur") && arbre.includes('aria-current="page"'));
  assert.ok(arbre.includes("Créations") && !arbre.includes("javascript:"));
  const e2 = rendreEntete({ nomSite: "Repli", entete: [{ ...non, configuration: { Titre: "Inactif" } }] });
  assert.ok(e2.includes("Repli") && !e2.includes("Inactif"), "entete non valide ignore");


  // SEO generique : OBJ-SEO publie -> titre/description ; sinon nom du site, sans description
  const { donneesSeo } = await import(url("modules/seo/seo.js"));
  assert.deepStrictEqual(donneesSeo(null, { nomSite: "N" }), { titre: "N", description: "" });
  assert.deepStrictEqual(donneesSeo({ ...ok, configuration: { "Titre OBJ-SEO": "T", "NOTE-COURTE": "D" } }, { nomSite: "N" }), { titre: "T", description: "D" });
  assert.deepStrictEqual(donneesSeo({ ...non, configuration: { "Titre OBJ-SEO": "T" } }, { nomSite: "N" }), { titre: "N", description: "" });

  // Footer : fallback sans configuration
  assert.strictEqual(rendreFooter(null, {}), "");
  assert.ok(/Mon Site/.test(rendreFooter(null, { nomSite: "Mon Site" })));
  // Footer complet, liens surs uniquement, echappement, ND masque
  const cfg = {
    "TITRE-PRINCIPAL": "Marque <b>", MENTIONS: "© 2026", TEXTE: "ND",
    "LIEN-1-TEXTE": "Contact", "LIEN-1-URL": "mailto:a@b.fr",
    "LIEN-2-TEXTE": "Pirate", "LIEN-2-URL": "javascript:alert(1)",
    "LIEN-3-TEXTE": "Sans url",
    "BOUTIQUE-TEXTE": "Boutique", "BOUTIQUE-URL": "https://boutique.example/"
  };
  const h = rendreFooter({ contenu: { configuration: cfg } }, { nomSite: "N" });
  assert.ok(h.includes("&lt;b&gt;") && !h.includes("<b>"), "echappement");
  assert.ok(h.includes('href="mailto:a@b.fr"') && h.includes("https://boutique.example/"));
  assert.ok(!/javascript:|Pirate|Sans url|ND/.test(h), "liens dangereux/vides/ND exclus");
  assert.ok(h.includes('rel="noopener noreferrer"'));
  // Aucune info technique
  assert.ok(!/SharePoint|API|Azure|data-.*id/i.test(h));
  const cssPublic = fs.readFileSync(path.join(__dirname, "../../assets/css/public.css"), "utf8");
  assert.ok(cssPublic.includes(".dse-site-public-header"), "en-tete public");
  assert.ok(cssPublic.includes("body.dse-public .dse-site-public .dse-footer"), "footer Builder visible");
  assert.ok(cssPublic.includes("body.dse-public .dse-public-page > .dse-footer"), "footer statut visible");
  console.log("rendu OK");
})().catch((e) => { console.error(e); process.exit(1); });
