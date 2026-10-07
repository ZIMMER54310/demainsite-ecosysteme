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
  logo: { fonction: "logo-medias", libelle: "Logo", listes: ["OBJ-LOGO-SITE"], collection: true },
  pages: { fonction: "pages", libelle: "Pages", listes: ["OBJ-PAGES-SITE"], collection: true },
  articles: { fonction: "articles", libelle: "Articles", listes: ["OBJ-ARTICLE"], collection: true, creation: true }
};

const referenceElement = (listeId, id) => ecriture.hash([listeId, String(id)]).slice(0, 24);
const cleNormalisee = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]/g, "");

async function configurationEtatActif(g, r) {
  const listeEtat = dse.trouverListe(g.listes, ["OBJ-ACTIF"]);
  const colonnes = r.colonnes.filter((c) => cleNormalisee(c.displayName) === "OBJACTIF" &&
    c.lookup && !c.lookup.allowMultipleValues && listeEtat && c.lookup.listId.toLowerCase() === listeEtat.id.toLowerCase());
  if (colonnes.length !== 1) return { erreur: "Le statut actif de cet élément n'est pas configuré de manière unique." };
  const items = await ecriture.collecterFrais(g,
    `/sites/${g.siteGraphId}/lists/${listeEtat.id}/items?$expand=fields($select=Title)&$top=100`);
  const oui = items.filter((i) => /^oui\b/i.test(String(i.fields?.Title || "").trim()));
  const non = items.filter((i) => /^non\b/i.test(String(i.fields?.Title || "").trim()));
  if (oui.length !== 1 || non.length !== 1) return { erreur: "Les états actif/inactif ne sont pas configurés de manière unique." };
  return { colonne: colonnes[0], ouiId: String(oui[0].id), nonId: String(non[0].id) };
}

function statutActif(fields, configuration) {
  if (!configuration?.colonne) return false;
  return String(fields?.[`${configuration.colonne.name}LookupId`] || "") === configuration.ouiId;
}

/*
 * Articles : la colonne texte URL de OBJ-ARTICLE contient le chemin de l'article sur son site.
 * Le domaine vient toujours du DOMAIN-PRINCIPAL du site selectionne, jamais d'une saisie.
 */
const MESSAGE_CHEMIN = "Chemin de l'article : saisissez uniquement le chemin (exemple /actualites/mon-article). Le domaine principal du site est ajouté automatiquement.";

function champsDuComposant(composant, champs) {
  if (composant !== "articles") return champs;
  return champs.map((c) => /^URL$/i.test(c.nom) ? { ...c, libelle: "Chemin de l'article", chemin: true } : c);
}

function normaliserChemin(brut) {
  const v = String(brut ?? "").trim();
  if (!v) return { valeur: "" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith("//") || (!v.startsWith("/") && v.split("/")[0].includes("."))) {
    return { erreur: MESSAGE_CHEMIN };
  }
  const chemin = `/${v.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
  if (!/^\/[A-Za-z0-9/_.-]*$/.test(chemin) || chemin.split("/").some((s) => s === "." || s === "..")) {
    return { erreur: "Chemin de l'article : utilisez uniquement des lettres sans accent, chiffres, tirets, soulignés et barres obliques." };
  }
  return { valeur: chemin };
}
const cibleArticle = dse.trouverColonneSiteCible;

function sitesArticle(fields, colonnes, listeSiteId) {
  const cible = cibleArticle(colonnes, listeSiteId);
  const primaire = cible && fields[`${cible.name}LookupId`];
  if (primaire) return [String(primaire)];
  const ids = colonnes.filter((c) => c.lookup?.listId === listeSiteId).flatMap((c) => {
    const v = fields[`${c.name}LookupId`];
    return Array.isArray(v) ? v : v ? [v] : [];
  });
  return [...new Set(ids.map(String))];
}

function selectionArticle(colonnes, listeSiteId) {
  return [...new Set(["Title", ...ecriture.champsModifiables(colonnes).map((c) => c.nom),
    ...colonnes.filter((c) => c.lookup?.listId === listeSiteId ||
      /^(OBJ-)?(ACTIF|VALIDE|VER[RO]*UILLE)$/i.test(c.displayName))
      .map((c) => c.lookup ? `${c.name}LookupId` : c.name)])];
}

function elementsLies(items, colonnes, siteId, listeSiteId, composant) {
  if (composant === "articles") return items.filter((i) =>
    sitesArticle(i.fields || {}, colonnes, listeSiteId).includes(String(siteId)));
  if (composant !== "seo") return items.filter((i) => dse.correspondAuSite(i.fields || {}, colonnes, siteId, listeSiteId));
  const officiel = colonnes.find((c) => c.name === "OBJSITEPUBLIC" && c.lookup?.listId === listeSiteId);
  return items.filter((i) => {
    const f = i.fields || {};
    if (f.OBJSITEPUBLICLookupId) return !!officiel && String(f.OBJSITEPUBLICLookupId) === String(siteId);
    return dse.correspondAuSite(f, colonnes.filter((c) => c.name !== "OBJSITEPUBLIC"), siteId, listeSiteId);
  });
}

async function relireLies(g, listId, colonnes, siteId, listeSiteId, composant) {
  const expansion = composant === "articles" ? `fields($select=${selectionArticle(colonnes, listeSiteId).join(",")})` : "fields";
  const items = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${listId}/items?$expand=${expansion}&$top=500`);
  return elementsLies(items, colonnes, siteId, listeSiteId, composant);
}

/* Resolution serveur de l'unique element du composant rattache au site. */
async function resoudre(g, composant, siteId, element = "") {
  const def = COMPOSANTS_EDITABLES[composant];
  if (!def) return { indisponible: "Ce réglage n'est pas modifiable depuis le cockpit." };
  const liste = dse.trouverListe(g.listes, def.listes);
  const listeSite = dse.trouverListe(g.listes, ["OBJ-SITE-PUBLIC"]);
  if (!liste || !listeSite) return { indisponible: `${def.libelle} : données non disponibles.` };
  const [colonnes, bruts] = await Promise.all([
    dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id, { contraintes: true }),
    composant === "articles" ? null : dse.chargerItemsListe(g.token, g.siteGraphId, liste.id)
  ]);
  const selectionChamps = composant === "articles" ? selectionArticle(colonnes, listeSite.id) : null;
  const items = bruts || await ecriture.collecterFrais(g,
    `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields($select=${selectionChamps.join(",")})&$top=200`);
  const champs = champsDuComposant(composant, ecriture.champsModifiables(colonnes));
  if (!champs.length) return { indisponible: `${def.libelle} : aucun champ modifiable.` };
  const lies = elementsLies(items, colonnes, siteId, listeSite.id, composant);
  if (lies.length === 0 || def.creation && element === "nouveau") {
    const candidats = colonnes.filter((c) => c.lookup?.listId === listeSite.id && !c.lookup.allowMultipleValues);
    const lookup = composant === "articles" ? cibleArticle(colonnes, listeSite.id)
      : candidats.length === 1 ? candidats[0] : candidats.find((c) => c.name === "OBJSITEPUBLIC");
    if (def.creation && lookup) {
      const nonPrisEnCharge = colonnes.filter((c) => c.required && !c.readOnly && !c.hidden &&
        c.name !== lookup.name && !champs.some((x) => x.nom === c.name) &&
        !["OBJ_x002d_ACTIF", "OBJ_x002d_VALIDE"].includes(c.name));
      if (nonPrisEnCharge.length) return { indisponible: "La création exige des informations non disponibles dans ce formulaire." };
      return { def, listId: liste.id, itemId: null, champs, actuel: {}, lookup, colonnes, selectionChamps, listeSiteId: listeSite.id };
    }
    if (composant === "articles") return { indisponible: "Création refusée : SITE-CIBLE doit être un Lookup simple vers OBJ-SITE-PUBLIC. Le Lookup multiple historique est conservé, pas utilisé pour créer un article." };
    return { indisponible: `${def.libelle} : aucun élément n'est encore rattaché à ce site. Le rattachement doit être complété avant modification.` };
  }
  if (def.collection && !element) {
    return { selection: true, def, listId: liste.id, colonnes, items: lies,
      elements: lies.map((i) => ({ ref: referenceElement(liste.id, i.id), titre: i.fields?.Title || def.libelle })) };
  }
  const cible = def.collection ? lies.find((i) => referenceElement(liste.id, i.id) === element) : lies[0];
  if (def.collection && !cible) return { indisponible: "Élément introuvable dans ce site." };
  if (!def.collection && lies.length > 1) {
    return { indisponible: `${def.libelle} : plusieurs éléments sont rattachés à ce site. Modification bloquée pour éviter toute erreur.` };
  }
  if (composant === "articles" && sitesArticle(cible.fields, colonnes, listeSite.id).length !== 1) {
    return { indisponible: "Cet article historique est partagé entre plusieurs sites. Sa modification nécessite un rattachement simple explicite, sans migration automatique." };
  }
  const itemId = String(cible.id);
  const actuel = ecriture.valeursDe(await ecriture.lireItemFrais(g, liste.id, itemId, selectionChamps), champs.map((c) => c.nom));
  return { def, listId: liste.id, itemId, champs, actuel, colonnes, selectionChamps, listeSiteId: listeSite.id, cible };
}

const formulaire = (r) => ({
  libelle: r.def.libelle,
  champs: r.champs.map((c) => ({ cle: c.cle, libelle: c.libelle, multiligne: c.multiligne, max: c.max, valeur: r.actuel[c.nom] ?? "",
    ...(c.chemin ? { chemin: true } : {}) }))
});

async function champsCreation(g, r, siteId, composant) {
  const champs = { [`${r.lookup.name}LookupId`]: String(siteId) };
  for (const nom of ["OBJ-ACTIF", "OBJ-VALIDE"]) {
    const l = dse.trouverListe(g.listes, [nom]);
    const c = l && r.colonnes.find((col) => col.lookup?.listId === l.id && !col.lookup.allowMultipleValues);
    if (!c && composant === "articles") return { erreur: "Les états de création de l'article sont incomplets." };
    if (!c) continue;
    const motif = composant === "articles" && nom === "OBJ-VALIDE" ? /^non\b/i : /^oui\b/i;
    const etats = (await dse.chargerItemsListe(g.token, g.siteGraphId, l.id))
      .filter((i) => motif.test(String(i.fields?.Title || "").trim()));
    if (etats.length !== 1) return { erreur: `${nom} : état de création indisponible ou ambigu.` };
    champs[`${c.name}LookupId`] = String(etats[0].id);
  }
  return { champs };
}

async function lire({ composant, siteId, element }) {
  const g = await ecriture.contexteGraph();
  const r = await resoudre(g, composant, siteId, element);
  if (r.selection) {
    if (["menu", "logo"].includes(composant)) {
      const configuration = await configurationEtatActif(g, r);
      if (configuration.erreur) return { disponible: true, selection: true, libelle: r.def.libelle,
        peutDesactiver: false, etatIndisponible: configuration.erreur, elements: r.elements };
      return { disponible: true, selection: true, libelle: r.def.libelle, peutDesactiver: true,
        elements: r.items.map((i) => ({ ref: referenceElement(r.listId, i.id), titre: i.fields?.Title || r.def.libelle,
          actif: statutActif(i.fields, configuration) })) };
    }
    return { disponible: true, selection: true, libelle: r.def.libelle, elements: r.elements };
  }
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
  if (r.itemId && estVerrouille(await ecriture.lireItemFrais(g, r.listId, r.itemId, r.selectionChamps))) {
    return { status: 403, erreur: "Cet élément est verrouillé et protégé contre les modifications." };
  }
  const { erreurs, propres } = ecriture.validerValeurs(r.champs, valeurs);
  for (const c of r.champs.filter((x) => x.chemin && Object.hasOwn(propres, x.nom))) {
    // Une valeur historique non modifiee est conservee telle quelle.
    if (propres[c.nom] === String(r.actuel[c.nom] ?? "").trim()) continue;
    const n = normaliserChemin(propres[c.nom]);
    if (n.erreur) erreurs.push(n.erreur);
    else propres[c.nom] = n.valeur;
  }
  if (!r.itemId && !String(propres.Title || "").trim()) erreurs.push("Un titre est nécessaire pour créer ce réglage.");
  if (erreurs.length) return { status: 422, erreur: erreurs.join(" "), erreurs };
  const diff = ecriture.differences(r.champs, r.actuel, propres);
  if (!diff.length) return { status: 200, aucunChangement: true, changements: [] };
  const nouveaux = Object.fromEntries(diff.map((d) => [d.nom, d.apres]));
  if (!r.itemId) {
    const creation = await champsCreation(g, r, siteId, composant);
    if (creation.erreur) return { status: 409, erreur: creation.erreur };
    Object.assign(nouveaux, creation.champs);
  }
  const avant = Object.fromEntries(diff.map((d) => [d.nom, r.actuel[d.nom]]));
  const { jeton } = ecriture.emettreJeton(identite, {
    type: r.itemId ? "modifier" : "ajouter", portee: "site", composant, fonction: r.def.fonction, siteId: String(siteId),
    operation: `${r.def.fonction}.${r.itemId ? "modifier" : "creer"}`,
    journalComptes: composant === "articles",
    listId: r.listId, itemId: r.itemId, champs: nouveaux, avant: ecriture.hash(avant), selectionChamps: r.selectionChamps,
    cleDoublon: `${composant}:${siteId}`,
    verifierVersion: (fields) => estVerrouille(fields) ? "Cet élément est maintenant verrouillé."
      : composant === "articles" && sitesArticle(fields, r.colonnes, r.listeSiteId).length !== 1
        ? "Cet article est maintenant partagé entre plusieurs sites. Écriture refusée."
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

async function preparerDesactivation({ identite, composant, siteId, siteNom, element }) {
  if (!["menu", "logo"].includes(composant)) return { status: 400, erreur: "Cette désactivation n'est pas prise en charge." };
  const g = await ecriture.contexteGraph();
  const r = await resoudre(g, composant, siteId, element);
  if (r.indisponible || !r.itemId) return { status: 409, erreur: r.indisponible || "Élément introuvable dans ce site." };
  const configuration = await configurationEtatActif(g, r);
  if (configuration.erreur) return { status: 409, erreur: configuration.erreur };
  const nomLookup = `${configuration.colonne.name}LookupId`;
  const actuel = String(r.cible?.fields?.[nomLookup] || "");
  if (actuel !== configuration.ouiId) return { status: 409, erreur: "Cet élément n'est plus actif. Relisez la liste avant de continuer." };
  const champs = { [nomLookup]: configuration.nonId };
  const avant = { [nomLookup]: actuel };
  const fonction = r.def.fonction;
  const jeton = ecriture.emettreJeton(identite, {
    type: "modifier", portee: "site", composant, fonction, operation: `${fonction}.modifier`,
    editionEtat: true, siteId: String(siteId), listId: r.listId, itemId: r.itemId,
    champs, avant: ecriture.hash(avant), selectionChamps: [nomLookup], journalComptes: true,
    cleDoublon: `${composant}:${siteId}:${r.itemId}`,
    action: `Cockpit : désactivation ${r.def.libelle}`,
    nom: `${r.def.libelle} désactivé — ${siteNom || "site"}`,
    notes: `Site ${siteId} (${siteNom || "-"}) | Composant ${composant} | Élément ${r.itemId}`
  }).jeton;
  return { status: 200, jeton, changements: [{ libelle: "Publication", avant: "Actif et visible",
    apres: "Inactif — conservé dans SharePoint" }] };
}

async function revaliderDesactivation(op) {
  if (!op?.editionEtat || !["menu", "logo"].includes(op.composant)) return "Action de désactivation non autorisée.";
  const g = await ecriture.contexteGraph();
  const r = await resoudre(g, op.composant, op.siteId, referenceElement(op.listId, op.itemId));
  if (r.indisponible || String(r.itemId) !== String(op.itemId)) return "L'élément n'est plus lié au site autorisé.";
  const configuration = await configurationEtatActif(g, r);
  if (configuration.erreur) return configuration.erreur;
  const nomLookup = `${configuration.colonne.name}LookupId`;
  const valeurAttendue = String(op.champs?.[nomLookup] || "");
  if (String(r.cible?.fields?.[nomLookup] || "") !== configuration.ouiId ||
    valeurAttendue !== configuration.nonId) return "Le statut de l'élément a changé. Relisez avant de confirmer.";
  return null;
}

module.exports = { referenceElement, COMPOSANTS_EDITABLES, lire, preparer, resoudre, elementsLies, champsCreation,
  preparerDesactivation, revaliderDesactivation,
  _test: { normaliserChemin, champsDuComposant, statutActif } };
