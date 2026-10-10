"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const B = require("../shared/builder");
const provisionneur = require("../tools/provision-dse-builder");
assert.equal(provisionneur.POLICES.length, 25);
assert.ok(provisionneur.POLICES.includes("Segoe UI"));
const schemaPreset = provisionneur.LISTES.find((l) => l.nom === "OBJ-STYLE-PRESET");
assert.ok(schemaPreset.colonnes.some((c) => c.name === "SOULIGNEMENT" && c.type === "bool"));

const front = (f) => import(pathToFileURL(path.join(__dirname, "..", "..", "modules", f)).href);
const OUI = { id: "1", titre: "OUI" };
const NON = { id: "2", titre: "NON" };
const el = (id, configuration = {}, relations = {}, etat = [1, 1]) => ({
  id: String(id), configuration, relations: { "OBJ-ACTIF": etat[0] === 1 ? OUI : NON, "OBJ-VALIDE": etat[1] === 1 ? OUI : NON, ...relations }
});
const lien = (id, titre = null) => ({ id: String(id), titre });

function donneesBase(extra = {}) {
  return {
    pages: [el(10, { URL: "/", "AFFICHER-BANDEAU-CHANTIER": true }, { "OBJ-SITE-PUBLIC": lien(1) }),
      el(20, { URL: "/", "AFFICHER-BANDEAU-CHANTIER": false }, { "OBJ-SITE-PUBLIC": lien(2) })],
    sections: [el(100, { "ORDRE-AFFICHAGE": 20 }, { "OBJ-PAGES-SITE": lien(10) }), el(101, { "ORDRE-AFFICHAGE": 10 }, { "OBJ-PAGES-SITE": lien(10) }),
      el(102, {}, { "OBJ-PAGES-SITE": lien(10) }, [1, 2]), el(200, {}, { "OBJ-PAGES-SITE": lien(20) })],
    lignes: [el(1000, {}, { "OBJ-SECTION-SITE": lien(100), "OBJ-LIGNE-STRUCTURE": lien(1, "50-50") }),
      el(1001, {}, { "OBJ-SECTION-SITE": lien(101), "OBJ-LIGNE-STRUCTURE": lien(1, "100") }),
      el(1002, {}, { "OBJ-SECTION-SITE": lien(101) }, [2, 1]), el(1200, {}, { "OBJ-SECTION-SITE": lien(200) })],
    colonnes: [el(5000, {}, { "OBJ-LIGNE-SITE": lien(1000) }), el(5001, {}, { "OBJ-LIGNE-SITE": lien(1000) }),
      el(5002, {}, { "OBJ-LIGNE-SITE": lien(1001) }), el(5003, {}, { "OBJ-LIGNE-SITE": lien(1001) }), el(5200, {}, { "OBJ-LIGNE-SITE": lien(1200) })],
    types: ["TITRE", "TEXTE", "HERO", "IMAGE", "CATALOGUE"].map((t, i) => el(i + 1, { Title: t })),
    modules: [
      el(7000, { "ORDRE-AFFICHAGE": 1 }, { "OBJ-COLONNE-SITE": lien(5002), OBJMODULESITEPUBLICTYPE: lien(1, "TITRE") }),
      el(7001, {}, { "OBJ-COLONNE-SITE": lien(5000), OBJMODULESITEPUBLICTYPE: lien(2, "TEXTE") }),
      el(7002, {}, { "OBJ-COLONNE-SITE": lien(5003), OBJMODULESITEPUBLICTYPE: lien(4, "IMAGE") }),
      el(7003, { "VISIBLE-MOBILE": false }, { "OBJ-COLONNE-SITE": lien(5001), OBJMODULESITEPUBLICTYPE: lien(1, "TITRE") }),
      el(7200, {}, { "OBJ-COLONNE-SITE": lien(5200), OBJMODULESITEPUBLICTYPE: lien(1, "TITRE") })
    ],
    modeles: [], presets: [], responsifs: [], medias: [], couleurs: [], polices: [],
    contenus: {
      "OBJ-MODULE-TITRE": [el(1, { TEXTE: "Bonjour", "ORDRE-AFFICHAGE": 1 }, { "OBJ-MODULE-SITE-PUBLIC": lien(7000) }),
        el(2, { TEXTE: "Mobile" }, { "OBJ-MODULE-SITE-PUBLIC": lien(7003) }), el(3, { TEXTE: "AUTRE SITE" }, { "OBJ-MODULE-SITE-PUBLIC": lien(7200) })],
      "OBJ-MODULE-TEXTE": [el(4, { "TEXTE-ENRICHI": '<p onclick="x()">Salut <script>alert(1)</script><a href="javascript:alert(1)">m</a></p>' }, { "OBJ-MODULE-SITE-PUBLIC": lien(7001) })],
      "OBJ-MODULE-HERO": [],
      "OBJ-MODULE-IMAGE": []
    },
    ...extra
  };
}
const site1 = { id: "1" };
const site2 = { id: "2" };
const aplatir = (c) => c.sections.flatMap((s) => s.lignes.flatMap((l) => l.colonnes.flatMap((k) => k.modules)));

async function main() {
  {
    const P = require("../shared/provisionnement");
    const originaux = { contexteProvisionnement: P.contexteProvisionnement, lireEtat: P.lireEtat, afficherPlan: P.afficherPlan };
    let definitionsLues;
    try {
      P.contexteProvisionnement = async () => ({ token: "", site: { id: "test" }, large: false });
      P.lireEtat = async (_token, _site, definitions) => {
        definitionsLues = definitions;
        return { ids: {}, colonnes: {} };
      };
      P.afficherPlan = () => {};
      assert.equal(await provisionneur.typographieChantier("plan"), 0);
      assert.deepEqual(definitionsLues.map((d) => d.nom), ["OBJ-POLICE", "OBJ-STYLE-PRESET", "OBJ-PAGES-SITE"]);
      assert.deepEqual(definitionsLues.find((d) => d.nom === "OBJ-STYLE-PRESET").colonnes.map((c) => c.name),
        ["SOULIGNEMENT", "STYLE-POLICE", "TRANSFORMATION-TEXTE", "ESPACEMENT-LETTRES"]);
      await assert.rejects(provisionneur.typographieChantier("apply"), /Droit de provisionnement absent/);
    } finally {
      Object.assign(P, originaux);
    }
  }
  // Hierarchie, ordre, elements non valides ou inactifs, colonne vide, module sans contenu.
  const c = B.composerPage(donneesBase(), site1);
  assert.equal(c.mode, "builder");
  assert.equal(c.page.bandeauChantier, true, "l'option du bandeau est transmise au rendu public");
  assert.equal(c.sections.length, 2, "section non validee ignoree");
  assert.equal(c.sections[0].lignes.length, 1, "ligne inactive ignoree");
  assert.deepEqual(c.sections[1].lignes[0].colonnes.map((k) => k.largeur), [50, 50], "largeurs deduites de la structure");
  assert.equal(c.sections[0].lignes[0].colonnes[0].modules[0].contenu[0].champs.TEXTE, "Bonjour");
  assert.equal(c.sections[0].lignes[0].colonnes[1].modules.length, 1, "module sans contenu conserve cote donnees");

  // Isolation entre domaines.
  const autre = B.composerPage(donneesBase(), site2);
  assert.equal(autre.page.bandeauChantier, false, "bandeau désactivé par défaut sur l'autre page");
  assert.equal(aplatir(autre).every((m) => m.contenu.every((x) => x.champs.TEXTE !== "Bonjour")), true);
  assert.equal(B.composerPage(donneesBase(), site2, { pageId: "10" }).mode, "historique", "page d'un autre site refusee");
  assert.equal(B.composerPage(donneesBase(), { id: "99" }).mode, "historique");

  // Pont historique en lecture seule : un module adapté rattaché directement à la page
  // est projeté dans le rendu, sans créer de composition SharePoint ni dupliquer un module déjà imbriqué.
  const legacy = donneesBase();
  legacy.modules.push(el(7004, {}, { "OBJ-PAGES-SITE": lien(10), OBJMODULESITEPUBLICTYPE: lien(3, "HERO") }));
  legacy.contenus["OBJ-MODULE-HERO"] = [el(14, { "TITRE-PRINCIPAL": "Hero historique", "Titre OBJ-MODULE-HERO": "Interne",
    "ID-OBJ-MODULE-HERO": "999" }, { "OBJ-MODULE-SITE-PUBLIC": lien(7004) })];
  const avecHero = B.composerPage(legacy, site1);
  assert.equal(avecHero.mode, "builder");
  const heroes = avecHero.sections.flatMap((s) => s.lignes.flatMap((l) => l.colonnes.flatMap((c) => c.modules)))
    .filter((m) => m.type === "HERO");
  assert.equal(heroes.length, 1);
  assert.equal(heroes[0].contenu[0].champs.TITREPRINCIPAL, "Hero historique");
  assert.equal(heroes[0].contenu[0].champs.TITREOBJMODULEHERO, undefined);
  assert.equal(heroes[0].contenu[0].champs.IDOBJMODULEHERO, undefined);
  assert.equal(B.composerPage(legacy, site2).sections.flatMap((s) => s.lignes.flatMap((l) => l.colonnes.flatMap((c) => c.modules)))
    .some((m) => m.type === "HERO"), false, "module historique isolé au site de sa page");
  legacy.modules[5].relations["OBJ-COLONNE-SITE"] = lien(5002);
  const dejaImbrique = B.composerPage(legacy, site1);
  assert.equal(dejaImbrique.sections.flatMap((s) => s.lignes.flatMap((l) => l.colonnes.flatMap((c) => c.modules)))
    .filter((m) => m.type === "HERO").length, 1, "module déjà composé non dupliqué");
  legacy.lignes[1].relations["OBJ-ACTIF"] = NON;
  assert.equal(B.composerPage(legacy, site1).sections.flatMap((s) => s.lignes.flatMap((l) => l.colonnes.flatMap((c) => c.modules)))
    .filter((m) => m.type === "HERO").length, 0, "module placé dans une colonne : suit sa hiérarchie (masquée ou non validée = invisible)");
  legacy.lignes[1].relations["OBJ-ACTIF"] = OUI;
  legacy.modules[5].relations["OBJ-ACTIF"] = NON;
  assert.equal(B.composerPage(legacy, site1).sections.flatMap((s) => s.lignes.flatMap((l) => l.colonnes.flatMap((c) => c.modules)))
    .some((m) => m.type === "HERO"), false, "module historique inactif exclu");

  // Compatibilite ancien mode : composition non validee => historique.
  const d = donneesBase();
  d.sections.forEach((s) => { s.relations["OBJ-VALIDE"] = NON; });
  assert.equal(B.composerPage(d, site1).mode, "historique");
  const page = donneesBase();
  page.pages[0].relations["OBJ-VALIDE"] = NON;
  assert.equal(B.composerPage(page, site1).mode, "historique");

  // Visibilite par appareil.
  const mobile = B.composerPage(donneesBase(), site1, { appareil: "mobile" });
  assert.equal(aplatir(mobile).length, aplatir(c).length - 1);

  // Styles : liste blanche uniquement, couleur validee, jamais de CSS arbitraire.
  const presets = [el(300, { "TAILLE-TEXTE": 18, "PADDING-HAUT": 12, "MARGE-BAS": 9999, "POIDS-POLICE": 700 }, { "OBJ-COULEUR-TEXTE": lien(40), "OBJ-COULEUR-FOND": lien(41), "OBJ-POLICE": lien(50) })];
  const couleurs = [el(40, { "VALEUR-HEX": "#112233" }), el(41, { "VALEUR-HEX": "red;background:url(x)" })];
  const polices = [el(50, { FAMILLE: "SERIF" })];
  const dStyle = donneesBase({ presets, couleurs, polices });
  dStyle.modules[1].relations["OBJ-STYLE-PRESET"] = lien(300);
  const styleModule = aplatir(B.composerPage(dStyle, site1)).find((m) => m.style.tailleTexte);
  assert.equal(styleModule.style.couleurTexte, "#112233");
  assert.equal(styleModule.style.couleurFond, undefined, "couleur invalide refusee");
  assert.equal(styleModule.style.marge.bas, 400, "valeur bornee");
  assert.equal(styleModule.style.police, "SERIF");

  // Responsive.
  dStyle.responsifs = [el(400, { "TAILLE-TEXTE": 12, MASQUE: false }, { "OBJ-STYLE-PRESET": lien(300), "OBJ-APPAREIL": lien(3, "MOBILE") })];
  assert.equal(aplatir(B.composerPage(dStyle, site1)).find((m) => m.style.tailleTexte).responsive.MOBILE.tailleTexte, 12);

  // Modeles globaux : synchronisation selective, surcharge locale, modele non valide jamais applique.
  const modeles = [el(900, { "SYNCHRONISE-CONTENU": true, "SYNCHRONISE-DESIGN": false }, { "OBJ-MODULE-SITE-PUBLIC": lien(7000), "OBJ-SITE-PUBLIC": [lien(1)] })];
  const dMod = donneesBase({ modeles });
  dMod.modules[1].relations["OBJ-MODELE-BUILDER"] = lien(900);
  dMod.modules[1].configuration["SYNCHRONISE-CONTENU"] = true;
  dMod.modules[1].relations.OBJMODULESITEPUBLICTYPE = lien(1, "TITRE");
  const sync = aplatir(B.composerPage(dMod, site1)).find((m) => m.global);
  assert.ok(sync && sync.contenu[0].champs.TEXTE === "Bonjour", "contenu synchronise depuis le modele");
  dMod.modules[1].configuration["SYNCHRONISE-CONTENU"] = false;
  assert.equal(aplatir(B.composerPage(dMod, site1)).some((m) => m.global), false, "surcharge locale");
  dMod.modules[1].configuration["SYNCHRONISE-CONTENU"] = true;
  dMod.modeles[0].relations["OBJ-VALIDE"] = NON;
  assert.equal(aplatir(B.composerPage(dMod, site1)).some((m) => m.global), false, "modele non valide ignore");
  assert.equal(B.listerModeles(dMod, site1).length, 0);
  assert.deepEqual(B.listerTypes(donneesBase()).sort(), ["CATALOGUE", "HERO", "IMAGE", "TEXTE", "TITRE"]);

  // Media absent / invalide : aucun media expose.
  const dMedia = donneesBase({ medias: [el(60, { Title: "x" }, {}, [1, 2])] });
  dMedia.contenus["OBJ-MODULE-IMAGE"] = [el(9, {}, { "OBJ-MODULE-SITE-PUBLIC": lien(7002), "OBJ-MEDIA": lien(60) })];
  assert.deepEqual(aplatir(B.composerPage(dMedia, site1)).find((m) => m.type === "IMAGE").contenu[0].media, []);

  /* ---------- Front ---------- */
  const rendu = await front("builder/rendu.js");
  const styles = await front("builder/styles.js");
  const { nettoyerHtml } = await front("texte/nettoyer.js");

  const html = rendu.rendreBuilder(c, { apiBase: "/api/v1" });
  assert.match(html, /Bonjour/);
  assert.doesNotMatch(html, /<script|onclick|javascript:/i);
  assert.doesNotMatch(html, /OBJ-|SharePoint|data-id|7000/);

  assert.equal(rendu.rendreBuilder({ mode: "historique", sections: [] }), "", "fallback historique");
  assert.equal(rendu.rendreBuilder(null), "");
  assert.equal(rendu.rendreModule({ type: "IMAGE", contenu: [{ champs: {}, media: [] }] }), "", "image sans media");
  assert.equal(rendu.rendreModule({ type: "INCONNU" }), "");

  // Adaptateurs HERO / FOOTER / CATALOGUE.
  const mono = (type) => ({ mode: "builder", sections: [{ type: "STANDARD", lignes: [{ colonnes: [{ largeur: 100, modules: [{ type, contenu: [], visibilite: {}, responsive: {}, style: {}, avance: {} }] }] }] }] });
  const adapteurs = { HERO: () => "<section>HERO-X</section>", FOOTER: () => "<footer>FOOT-X</footer>" };
  assert.match(rendu.rendreBuilder(mono("HERO"), { adapteurs }), /HERO-X/);
  assert.match(rendu.rendreBuilder(mono("FOOTER"), { adapteurs }), /FOOT-X/);
  assert.equal(rendu.rendreBuilder(mono("HERO"), {}), "", "HERO sans donnees => rien");
  assert.match(rendu.rendreBuilder(mono("PRODUITS"), {}), /data-dse-catalogue-builder="produits"/);
  const blog = { ref: "builderelement.blog1", rendu: "ARTICLES", titre: "Derniers articles", champs: [], enfants: [] };
  assert.match(rendu.rendreNoeud(blog, {}), /data-dse-catalogue-builder="articles"/, "noeud generique ARTICLES => catalogue articles");
  assert.match(rendu.rendreNoeud(blog, { apercu: true }), /liste affichée automatiquement/);
  const ligne3 = { ref: "builderelement.lig1", rendu: "LIGNE", conteneur: true, champs: [], enfants: [1, 2, 3].map((i) =>
    ({ ref: `builderelement.col${i}`, rendu: "COLONNE", conteneur: true, champs: [], enfants: [{ ref: `builderelement.mod${i}`, rendu: "MODULE", champs: [{ cle: "TITRE", categorie: "CONTENU", nature: "TEXTE", valeur: "T" }] }] })) };
  const html3 = rendu.rendreNoeud(ligne3, {});
  assert.match(html3, /dse-b-r-ligne/); assert.equal((html3.match(/dse-b-r-colonne/g) || []).length, 3, "colonnes typees");
  assert.match(rendu.STYLES_BUILDER, /\.dse-b-r-ligne\{display:flex/, "colonnes cote a cote");
  ligne3.enfants[0].champs.push({ cle: "LARGEUR", categorie: "DESIGN", nature: "TEXTE", valeur: "25%" });
  const cssCol = [];
  const htmlCol = rendu.rendreNoeud(ligne3, { css: cssCol, apercu: true });
  const regles = cssCol.join("\n");
  assert.match(regles, /min-width:1025px\)\{\.dse-b-r-ligne>\.dse-b-r-colonne\.[\w-]+\{flex:25 25 0%\}/, "largeur colonne en % => poids flex");
  assert.doesNotMatch(regles, /max-width:640px\)\{\.dse-b-r-ligne>\.dse-b-r-colonne/, "mobile reste empile sans surcharge");
  assert.doesNotMatch(regles, /width:25%/, "pas de width brut sur une colonne");
  assert.match(htmlCol, /data-builder-canvas="modifier"/, "bouton Modifier dans la barre");
  assert.match(htmlCol, /class="dse-b-corbeille" data-builder-canvas="retirer"[^>]*>🗑</, "corbeille sur les elements enfants");

  // Securite : texte enrichi et liens.
  const propre = nettoyerHtml('<p>a<img src=x onerror=alert(1)></p><a href="javascript:alert(1)">l</a><a href="https://ok.fr/x">ok</a>');
  assert.doesNotMatch(propre, /img|onerror|javascript:/i);
  assert.match(propre, /href="https:\/\/ok\.fr\/x"/);
  const bouton = await front("bouton/bouton.js");
  assert.equal(bouton.rendreBouton([{ champs: { LIBELLE: "Go", URL: "javascript:alert(1)" } }]), "");
  assert.match(bouton.rendreBouton([{ champs: { LIBELLE: "Go", URL: "https://ok.fr" } }]), /href="https:\/\/ok\.fr"/);
  const titre = await front("titre/titre.js");
  assert.match(titre.rendreTitre([{ champs: { TEXTE: "<b>x</b>" } }]), /&lt;b&gt;/);

  // Styles autorises seulement.
  const decl = styles.declarations({ couleurTexte: "#fff", couleurFond: "url(x)", tailleTexte: 500, police: "EVIL", position: "fixed" });
  assert.deepEqual(decl, ["color:#fff", "font-size:96px"]);
  assert.equal(styles.attributStyle({}), "");

  // Hierarchie Design : THEME SITE -> PRESET (parent) -> PRESET ELEMENT -> RESPONSIVE ; un preset d'un autre site est ignore.
  {
    const couleur = (id, hex) => el(id, { "VALEUR-HEX": hex });
    const donnees = {
      couleurs: [couleur(1, "#111111"), couleur(2, "#222222"), couleur(3, "#333333")],
      styleTypes: [el(50, { CODE: "BOUTON" })],
      presets: [el(60, { "BORDURE-RAYON": 4, "TAILLE-TEXTE": 16 }, { "OBJ-COULEUR-TEXTE": lien(1) }),
        el(61, { "BORDURE-RAYON": 12 }, { "PRESET-PARENT": lien(60), "OBJ-COULEUR-FOND": lien(2) }),
        el(62, { "BORDURE-RAYON": 30 }, { "OBJ-SITE-PUBLIC": lien(2) })],
      responsifs: [el(70, { "TAILLE-TEXTE": 12 }, { "OBJ-STYLE-PRESET": lien(61), "OBJ-APPAREIL": lien(3, "MOBILE"), "OBJ-COULEUR-FOND": lien(3) })],
      themes: [el(80, {}, { "Titre OBJ-SITE-THEME": lien(1), "OBJ-STYLE-TYPE": lien(50), "OBJ-STYLE-PRESET": lien(60) })]
    };
    const ctx = B.contexteComposition(donnees, { id: "1" });
    const r = B.styleResolu(ctx, "bouton", "61");
    assert.equal(r.style.couleurTexte, "#111111", "theme herite");
    assert.equal(r.style.couleurFond, "#222222");
    assert.equal(r.style.bordureRayon, 12, "le preset de l'element gagne");
    assert.equal(r.style.tailleTexte, 16);
    assert.deepEqual([r.responsive.MOBILE.tailleTexte, r.responsive.MOBILE.couleurFond], [12, "#333333"]);
    assert.equal(B.styleResolu(ctx, "bouton", "62").style.bordureRayon, 4, "preset d'un autre site ignore");
    const css = styles.cssElement("dse-b-m1", "BOUTON", r.style, r.responsive, {});
    assert.match(css, /border-radius:12px/);
    assert.match(css, /@media \(max-width:640px\)/);
    const typo = styles.cssElement("dse-b-typo", "TITRE", { poidsPolice: 900, soulignement: true, stylePolice: "ITALIQUE" });
    assert.match(typo, /font-weight:900/);
    assert.match(typo, /font-style:italic/);
    assert.match(typo, /text-decoration:underline/);
    assert.match(styles.cssElement("dse-b-no-underline", "TITRE", { soulignement: false }), /text-decoration:none/);
  }

  console.log("OK tests builder");
}

main().catch((e) => { console.error(e); process.exit(1); });
