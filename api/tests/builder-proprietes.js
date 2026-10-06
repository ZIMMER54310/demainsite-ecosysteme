"use strict";

const assert = require("node:assert/strict");

async function main() {
  const { erreurValeur, declarationsGeneriques, controleChamp } = await import("../../modules/builder/proprietes.js");
  const { rendreBuilder, STYLES_BUILDER } = await import("../../modules/builder/rendu.js");
  const { panneauGenerique, documentApercu } = await import("../../modules/cockpit/constructeur.js");
  const valeurs = [
    ["TITRE", "CONTENU", "TEXTE", "Recette technique"],
    ["TEXTE", "CONTENU", "TEXTE", "Vérification du constructeur"],
    ["IMAGE", "CONTENU", "MEDIA", "71"], ["MEDIA", "CONTENU", "MEDIA", "72"],
    ["LIEN", "CONTENU", "TEXTE", "/recette/"], ["LIBELLE-BOUTON", "CONTENU", "TEXTE", "Vérifier"],
    ["COULEUR-TEXTE", "DESIGN", "TEXTE", "#123456"], ["COULEUR-FOND", "DESIGN", "TEXTE", "#abcdef"],
    ["IMAGE-FOND", "DESIGN", "MEDIA", "71"], ["DEGRADE", "DESIGN", "TEXTE", "linear-gradient(90deg, #123456, #abcdef)"],
    ["POLICE", "DESIGN", "TEXTE", "Arial"], ["TAILLE-TEXTE", "DESIGN", "TEXTE", "32px"],
    ["GRAISSE", "DESIGN", "TEXTE", "600"], ["ALIGNEMENT", "DESIGN", "TEXTE", "CENTRE"],
    ["LARGEUR", "DESIGN", "TEXTE", "80%"], ["HAUTEUR", "DESIGN", "TEXTE", "auto"],
    ["MARGE", "DESIGN", "TEXTE", "1px 2px 3px 4px"], ["ESPACEMENT-INTERNE", "DESIGN", "TEXTE", "8px 9px 10px 11px"],
    ["BORDURE", "DESIGN", "TEXTE", "2px solid #123456"], ["RAYON", "DESIGN", "TEXTE", "12px"],
    ["OMBRE", "DESIGN", "TEXTE", "0px 4px 12px 0px #123456"], ["OPACITE", "DESIGN", "NOMBRE", 0.75],
    ["FLEX", "DESIGN", "TEXTE", "COLUMN"], ["GRID", "DESIGN", "TEXTE", "2"],
    ["GAP", "DESIGN", "TEXTE", "16px"], ["POSITION", "DESIGN", "TEXTE", "RELATIVE"],
    ["VISIBILITE", "AVANCE", "BOOLEEN", true], ["CLASSE-CSS", "AVANCE", "TEXTE", "recette-technique"],
    ["ID-CSS", "AVANCE", "TEXTE", "recette-technique-module"]
  ];
  assert.equal(valeurs.length, 29);
  const champs = valeurs.map(([cle, categorie, nature, valeur], i) => ({
    ref: `champ.${i + 1}`, cle, categorie, nature, valeur, libelle: cle, surcharges: {},
    mediaTypes: { "71": "IMAGE", "72": "AUDIO" }
  }));
  for (const c of champs) {
    assert.equal(erreurValeur(c, c.valeur), null, c.cle);
    assert.ok(controleChamp(c).type, c.cle);
  }
  const css = declarationsGeneriques(champs, "ORDINATEUR").join(";");
  for (const declaration of ["color:#123456", "background-color:#abcdef", "font-size:32px", "font-weight:600",
    "text-align:center", "width:80%", "height:auto", "margin:1px 2px 3px 4px", "padding:8px 9px 10px 11px",
    "border:2px solid #123456", "border-radius:12px", "box-shadow:0px 4px 12px 0px #123456",
    "opacity:0.75", "flex-direction:column", "grid-template-columns:repeat(2,minmax(0,1fr))", "gap:16px", "position:relative"]) {
    assert.ok(css.includes(declaration), declaration);
  }
  assert.match(css, /background-image:url\("\/api\/v1\/media\/71"\)/);
  const fond = champs.filter((c) => c.cle === "DEGRADE");
  assert.match(declarationsGeneriques(fond, "").join(";"), /linear-gradient/);
  const taille = champs.find((c) => c.cle === "TAILLE-TEXTE");
  taille.surcharges = { ORDINATEUR: "40px", TABLETTE: "24px", MOBILE: "18px" };
  const opacite = champs.find((c) => c.cle === "OPACITE");
  opacite.surcharges = { MOBILE: 0 };
  const visible = champs.find((c) => c.cle === "VISIBILITE");
  visible.surcharges = { TABLETTE: false };
  const noeud = { ref: "builderelement.recette", rendu: "MODULE", titre: "Module", champs, enfants: [] };
  const html = rendreBuilder({ mode: "builder", noeuds: [noeud] });
  assert.equal((html.match(/id="recette-technique-module"/g) || []).length, 1, "un seul ID physique pour les trois appareils");
  assert.match(html, /class="dse-b-module dse-b-recursif .*recette-technique/);
  assert.match(html, /<audio/);
  assert.match(html, /href="\/recette\/"/);
  assert.match(html, /font-size:40px/);
  assert.match(html, /font-size:24px/);
  assert.match(html, /font-size:18px/);
  assert.match(html, /opacity:0/);
  assert.match(html, /max-width:1024px.*display:none/);
  assert.ok(!html.includes("data-builder-canvas"), "aucun contrôle éditeur sur le public");
  assert.match(html, /loading="lazy"/);
  const apercu = documentApercu({ mode: "builder", noeuds: [{ ref: "builderelement.page", rendu: "PAGE", enfants: [noeud] }] });
  assert.match(apercu, /data-builder-canvas/);
  assert.match(apercu, /loading="eager"/);
  assert.match(panneauGenerique(noeud, []), /data-builder-onglet="DESIGN"/);
  assert.match(panneauGenerique(noeud, []), /data-builder-cote=/);
  assert.match(panneauGenerique(noeud, []), /type="color"/);
  assert.match(STYLES_BUILDER, /display:contents/);
  const invalides = [
    ["COULEUR-TEXTE", "red;display:none"], ["TAILLE-TEXTE", "calc(100% - 1px)"], ["BORDURE", "99px solid #fff"],
    ["DEGRADE", "url(https://example.invalid/x)"], ["OMBRE", "0 0 999 0 #fff"], ["GRID", "0"],
    ["POLICE", 'Arial";color:red'], ["MARGE", "-1px"], ["OPACITE", 2], ["POSITION", "url(x)"],
    ["ID-CSS", 'bad" onclick="x'], ["CLASSE-CSS", 'bad><script>'], ["LIEN", "javascript:alert(1)"]
  ];
  for (const [cle, valeur] of invalides) {
    const champ = champs.find((c) => c.cle === cle);
    assert.ok(erreurValeur(champ, valeur), cle);
  }
  console.log("29 propriétés Builder : contrat typé, CSS sûr, médias, catégories, contrôles et responsive OK.");
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
