"use strict";

/*
 * Edition des composants d'un site depuis le cockpit (pilote : En-tete, SEO).
 * Le composant est resolu cote serveur : site (ID natif) -> liste du composant -> element
 * rattache au site par Lookup. Exactement un element est exige : sinon rien n'est modifiable.
 */

const dse = require("./dse");
const ecriture = require("./ecriture");

const COMPOSANTS_EDITABLES = {
  entete: { fonction: "entete", libelle: "En-tête", listes: ["OBJ-ENTETE-SITE"] },
  seo: { fonction: "seo", libelle: "Référencement SEO", listes: ["OBJ-SEO"], creation: true },
  footer: { fonction: "footer", libelle: "Footer", listes: ["OBJ-FOOTER-SITE", "OBJ-FOOTER"] },
  menu: { fonction: "menu", libelle: "Menu", listes: ["OBJ-MENU-SITE"], collection: true },
  pages: { fonction: "pages", libelle: "Pages", listes: ["OBJ-PAGES-SITE"], collection: true },
  articles: { fonction: "articles", libelle: "Articles", listes: ["OBJ-ARTICLE"], collection: true, creation: true }
};

const referenceElement = (listeId, id) => ecriture.hash([listeId, String(id)]).slice(0, 24);
function elementsLies(items, colonnes, siteId, listeSiteId, composant) {
  if (composant !== "seo") return items.filter((i) => dse.correspondAuSite(i.fields || {}, colonnes, siteId, listeSiteId));
  const officiel = colonnes.find((c) => c.name === "OBJSITEPUBLIC" && c.lookup?.listId === listeSiteId);
  return items.filter((i) => {
    const f = i.fields || {};
    if (f.OBJSITEPUBLICLookupId) return !!officiel && String(f.OBJSITEPUBLICLookupId) === String(siteId);
    return dse.correspondAuSite(f, colonnes.filter((c) => c.name !== "OBJSITEPUBLIC"), siteId, listeSiteId);
  });
}

async function relireLies(g, listId, colonnes, siteId, listeSiteId, composant) {
  const items = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${listId}/items?$expand=fields&$top=500`);
  return elementsLies(items, colonnes, siteId, listeSiteId, composant);
}

/* Resolution serveur de l'unique element du composant rattache au site. */
async function resoudre(g, composant, siteId, element = "") {
  const def = COMPOSANTS_EDITABLES[composant];
  if (!def) return { indisponible: "Ce réglage n'est pas modifiable depuis le cockpit." };
  const liste = dse.trouverListe(g.listes, def.listes);
  const listeSite = dse.trouverListe(g.listes, ["OBJ-SITE-PUBLIC"]);
  if (!liste || !listeSite) return { indisponible: `${def.libelle} : données non disponibles.` };
  const [colonnes, items] = await Promise.all([
    dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id),
    dse.chargerItemsListe(g.token, g.siteGraphId, liste.id)
  ]);
  const champs = ecriture.champsModifiables(colonnes);
  if (!champs.length) return { indisponible: `${def.libelle} : aucun champ modifiable.` };
  const lies = elementsLies(items, colonnes, siteId, listeSite.id, composant);
  if (lies.length === 0 || def.creation && element === "nouveau") {
    const candidats = colonnes.filter((c) => c.lookup?.listId === listeSite.id && !c.lookup.allowMultipleValues);
    const lookup = candidats.length === 1 ? candidats[0] : candidats.find((c) => c.name === "OBJSITEPUBLIC");
    if (def.creation && lookup) {
      const nonPrisEnCharge = colonnes.filter((c) => c.required && !c.readOnly && !c.hidden &&
        c.name !== lookup.name && !champs.some((x) => x.nom === c.name) &&
        !["OBJ_x002d_ACTIF", "OBJ_x002d_VALIDE"].includes(c.name));
      if (nonPrisEnCharge.length) return { indisponible: "La création exige des informations non disponibles dans ce formulaire." };
      return { def, listId: liste.id, itemId: null, champs, actuel: {}, lookup, colonnes, listeSiteId: listeSite.id };
    }
    return { indisponible: `${def.libelle} : aucun élément n'est encore rattaché à ce site. Le rattachement doit être complété avant modification.` };
  }
  if (def.collection && !element) {
    return { selection: true, def, elements: lies.map((i) => ({ ref: referenceElement(liste.id, i.id), titre: i.fields?.Title || def.libelle })) };
  }
  const cible = def.collection ? lies.find((i) => referenceElement(liste.id, i.id) === element) : lies[0];
  if (def.collection && !cible) return { indisponible: "Élément introuvable dans ce site." };
  if (!def.collection && lies.length > 1) {
    return { indisponible: `${def.libelle} : plusieurs éléments sont rattachés à ce site. Modification bloquée pour éviter toute erreur.` };
  }
  const itemId = String(cible.id);
  const actuel = ecriture.valeursDe(await ecriture.lireItemFrais(g, liste.id, itemId), champs.map((c) => c.nom));
  return { def, listId: liste.id, itemId, champs, actuel, colonnes, listeSiteId: listeSite.id };
}

const formulaire = (r) => ({
  libelle: r.def.libelle,
  champs: r.champs.map((c) => ({ cle: c.cle, libelle: c.libelle, multiligne: c.multiligne, max: c.max, valeur: r.actuel[c.nom] ?? "" }))
});

async function lire({ composant, siteId, element }) {
  const g = await ecriture.contexteGraph();
  const r = await resoudre(g, composant, siteId, element);
  if (r.selection) return { disponible: true, selection: true, libelle: r.def.libelle, elements: r.elements };
  if (r.indisponible) return { disponible: false, raison: r.indisponible, libelle: COMPOSANTS_EDITABLES[composant]?.libelle || null };
  return { disponible: true, creation: !r.itemId, ...formulaire(r) };
}

async function preparer({ identite, composant, siteId, siteNom, valeurs, element }) {
  const g = await ecriture.contexteGraph();
  const r = await resoudre(g, composant, siteId, element);
  if (r.selection) return { status: 422, erreur: "Choisissez un élément à modifier." };
  if (r.indisponible) return { status: 409, erreur: r.indisponible };
  const listeVerrou = dse.trouverListe(g.listes, "OBJ-VEROUILLE");
  const colonneVerrou = r.colonnes.find((c) => c.boolean && /VER[R]?OUILLE/i.test(c.displayName)) ||
    r.colonnes.find((c) => listeVerrou && c.lookup?.listId === listeVerrou.id && !c.lookup.allowMultipleValues);
  let verrouOui = null;
  if (colonneVerrou?.lookup) {
    const xs = (await dse.chargerItemsListe(g.token, g.siteGraphId, listeVerrou.id))
      .filter((i) => /^oui\b/i.test(i.fields.Title || ""));
    if (xs.length !== 1) return { status: 409, erreur: "État de verrouillage indisponible." };
    verrouOui = String(xs[0].id);
  }
  const estVerrouille = (f) => colonneVerrou && (colonneVerrou.boolean
    ? f[colonneVerrou.name] === true : String(f[`${colonneVerrou.name}LookupId`]) === verrouOui);
  if (r.itemId && estVerrouille(await ecriture.lireItemFrais(g, r.listId, r.itemId))) {
    return { status: 403, erreur: "Cet élément est verrouillé et protégé contre les modifications." };
  }
  const { erreurs, propres } = ecriture.validerValeurs(r.champs, valeurs);
  if (!r.itemId && !String(propres.Title || "").trim()) erreurs.push("Un titre est nécessaire pour créer ce réglage.");
  if (erreurs.length) return { status: 422, erreur: erreurs.join(" "), erreurs };
  const diff = ecriture.differences(r.champs, r.actuel, propres);
  if (!diff.length) return { status: 200, aucunChangement: true, changements: [] };
  const nouveaux = Object.fromEntries(diff.map((d) => [d.nom, d.apres]));
  if (!r.itemId) {
    nouveaux[`${r.lookup.name}LookupId`] = String(siteId);
    for (const nom of ["OBJ-ACTIF", "OBJ-VALIDE"]) {
      const l = dse.trouverListe(g.listes, [nom]);
      const c = l && r.colonnes.find((col) => col.lookup?.listId === l.id);
      if (!c) continue;
      const oui = (await dse.chargerItemsListe(g.token, g.siteGraphId, l.id))
        .filter((i) => /^oui\b/i.test(String(i.fields?.Title || "").trim()));
      if (oui.length !== 1) return { status: 409, erreur: "La valeur d'activation n'est pas disponible." };
      nouveaux[`${c.name}LookupId`] = String(oui[0].id);
    }
  }
  const avant = Object.fromEntries(diff.map((d) => [d.nom, r.actuel[d.nom]]));
  const { jeton } = ecriture.emettreJeton(identite, {
    type: r.itemId ? "modifier" : "ajouter", portee: "site", composant, fonction: r.def.fonction, siteId: String(siteId),
    operation: `${r.def.fonction}.${r.itemId ? "modifier" : "creer"}`,
    journalComptes: composant === "articles",
    listId: r.listId, itemId: r.itemId, champs: nouveaux, avant: ecriture.hash(avant),
    cleDoublon: `${composant}:${siteId}`,
    verifierVersion: (fields) => estVerrouille(fields) ? "Cet élément est maintenant verrouillé."
      : elementsLies([{ fields }], r.colonnes, siteId, r.listeSiteId, composant).length
        ? null : "L'élément n'est plus rattaché au site autorisé.",
    verifierCible: async (frais) => {
      const lies = await relireLies(frais, r.listId, r.colonnes, siteId, r.listeSiteId, composant);
      if (r.def.collection && r.itemId) return lies.some((i) => String(i.id) === r.itemId) ? null : "L'élément n'est plus lié à ce site.";
      if (r.def.collection && !r.itemId) {
        return lies.some((i) => String(i.fields.Title || "").trim() === String(nouveaux.Title || "").trim())
          ? "Un article avec ce titre existe déjà dans ce site." : null;
      }
      return r.itemId
        ? (lies.length === 1 && String(lies[0].id) === r.itemId ? null : "Le rattachement a changé ou plusieurs réglages existent. Écriture bloquée.")
        : (lies.length ? "Un réglage existe déjà pour ce site. Merci de le relire." : null);
    },
    action: `Cockpit : modification ${r.def.libelle}`,
    nom: `${r.def.libelle} — ${siteNom || "site"}`,
    notes: `Site ${siteId} (${siteNom || "-"}) | Composant ${composant}`
  });
  return { status: 200, jeton, changements: diff.map(({ libelle, avant: a, apres }) => ({ libelle, avant: a, apres })) };
}

module.exports = { COMPOSANTS_EDITABLES, lire, preparer, resoudre, elementsLies };
