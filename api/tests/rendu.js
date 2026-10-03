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
