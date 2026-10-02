"use strict";

// Provisionneur idempotent du socle SharePoint DSE (catalogue, footer, pages).
// Modes : --plan (lecture seule) | --apply | --seed | --verify. Aucune suppression, aucun renommage.
// Sans Sites.Manage.All dans le jeton, --apply et --seed s'arretent avant toute ecriture.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("node:fs");
const path = require("node:path");
const dse = require("../shared/dse");

const cle = (n) => String(n ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const SAUVEGARDES = path.join(__dirname, "..", ".sauvegardes");

/* ---------- Schema cible (declaratif) ---------- */

const T = (name) => ({ name, type: "text" });
const TL = (name) => ({ name, type: "note" });
const N = (name) => ({ name, type: "number" });
const B = (name) => ({ name, type: "bool" });
const U = (name) => ({ name, type: "text" });
const L = (name, liste, multiple = false) => ({ name, type: "lookup", liste, multiple });

const ETAT = () => [L("OBJ-ACTIF", "OBJ-ACTIF"), L("OBJ-VALIDE", "OBJ-VALIDE")];
const ETAT_VEROUILLE = () => [...ETAT(), L("OBJ-VEROUILLE", "OBJ-VEROUILLE")];

const REFERENTIELS = ["OBJ-THEME", "OBJ-CATEGORIE", "OBJ-COLLECTION", "OBJ-FORMAT", "OBJ-VISIBILITE", "OBJ-DISPONIBILITE"];

const CLASSIFS = (extra = {}) => [
  L("OBJ-SITE-PUBLIC", "OBJ-SITE-PUBLIC", true),
  L("OBJ-THEME", "OBJ-THEME", true),
  L("OBJ-CATEGORIE", "OBJ-CATEGORIE", true),
  ...(extra.collection ? [L("OBJ-COLLECTION", "OBJ-COLLECTION", true)] : []),
  ...(extra.format ? [L("OBJ-FORMAT", "OBJ-FORMAT")] : []),
  L("OBJ-VISIBILITE", "OBJ-VISIBILITE"),
  L("OBJ-DISPONIBILITE", "OBJ-DISPONIBILITE"),
  L("OBJ-MEDIA", "OBJ-MEDIA"),
  B("AGREGATION-PORTAIL")
];

// Colonnes equivalentes deja utilisees dans DSE : pas de doublon sous un autre nom.
const EQUIVALENTS = { "OBJ-ACTIF": ["ACTIF"], "OBJ-VALIDE": ["VALIDER", "VALIDE"], "OBJ-DEVISE": ["DEVISE"] };

const LISTES = [
  ...REFERENTIELS.map((nom) => ({ nom, creer: true, colonnes: [...ETAT(), N("ORDRE-AFFICHAGE"), T("NOTE-COURTE")] })),
  {
    nom: "OBJ-ARTICLE", creer: true,
    colonnes: [T("NOTE-COURTE"), TL("DESCRIPTION"), U("URL"), ...CLASSIFS({ collection: true, format: true }),
      L("OBJ-CATALOGUE", "OBJ-CATALOGUE", true), L("OBJ-SERVICE", "OBJ-SERVICE", true), ...ETAT(), N("ORDRE-AFFICHAGE")]
  },
  {
    nom: "OBJ-SERVICE", creer: true,
    colonnes: [T("NOTE-COURTE"), TL("DESCRIPTION"), U("URL"), ...CLASSIFS(),
      L("OBJ-ARTICLE", "OBJ-ARTICLE", true), L("OBJ-CATALOGUE", "OBJ-CATALOGUE", true), ...ETAT(), N("ORDRE-AFFICHAGE")]
  },
  {
    nom: "OBJ-CATALOGUE", creer: false,
    colonnes: [T("NOTE-COURTE"), TL("DESCRIPTION"), U("URL"), N("PRIX"), L("OBJ-DEVISE", "OBJ-GEO-DEVISE"),
      ...CLASSIFS({ collection: true, format: true }),
      L("OBJ-ARTICLE", "OBJ-ARTICLE", true), L("OBJ-SERVICE", "OBJ-SERVICE", true), ...ETAT(), N("ORDRE-AFFICHAGE")]
  },
  {
    nom: "OBJ-MODULE-FOOTER", creer: true,
    colonnes: [L("OBJ-MODULE-SITE-PUBLIC", "OBJ-MODULE-SITE-PUBLIC"), T("TITRE-PRINCIPAL"), TL("TEXTE"), TL("MENTIONS"),
      ...[1, 2, 3, 4].flatMap((i) => [T(`LIEN-${i}-TEXTE`), U(`LIEN-${i}-URL`)]),
      T("BOUTIQUE-TEXTE"), U("BOUTIQUE-URL"), ...ETAT_VEROUILLE(), N("ORDRE-AFFICHAGE")]
  },
  { nom: "OBJ-SITE-PUBLIC", creer: false, colonnes: [B("PORTAIL-CATALOGUE")] }
];

const REFERENTIELS_VALEURS = {
  "OBJ-THEME": ["Numérique", "Création", "Actualités"],
  "OBJ-CATEGORIE": ["Article", "Produit", "Service"],
  "OBJ-FORMAT": ["Numérique", "Service", "Article"],
  "OBJ-VISIBILITE": ["Public", "Privé"],
  "OBJ-DISPONIBILITE": ["Disponible", "Indisponible"]
};

/* ---------- Acces Graph (ecriture) ---------- */

async function appel(token, methode, chemin, corps) {
  const reponse = await fetch(`https://graph.microsoft.com/v1.0${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: corps ? JSON.stringify(corps) : undefined
  });
  const texte = await reponse.text();
  let json = null;
  try { json = texte ? JSON.parse(texte) : null; } catch (_) { /* corps non JSON */ }

  if (!reponse.ok) {
    const e = new Error(`HTTP ${reponse.status} ${json?.error?.code || ""}`.trim());
    e.status = reponse.status;
    throw e;
  }
  return json;
}

function colonneGraph(c, ids) {
  const base = { name: c.name, indexed: false };
  switch (c.type) {
    case "text": return { ...base, text: {} };
    case "note": return { ...base, text: { allowMultipleLines: true, textType: "plain" } };
    case "number": return { ...base, number: {} };
    case "bool": return { ...base, boolean: {}, defaultValue: { value: "false" } };
    case "lookup": return { ...base, lookup: { listId: ids[c.liste], columnName: "Title", allowMultipleValues: Boolean(c.multiple) } };
    default: throw new Error(`Type inconnu ${c.type}`);
  }
}

/* ---------- Etat existant + plan ---------- */

async function lireEtat(token, siteId) {
  const listes = await dse.collecter(token, `/sites/${siteId}/lists?$select=id,displayName`);
  const ids = Object.fromEntries(listes.map((l) => [l.displayName, l.id]));
  const colonnes = {};

  for (const def of LISTES) {
    if (ids[def.nom]) {
      const c = await dse.chargerColonnesListe(token, siteId, ids[def.nom]);
      colonnes[def.nom] = c.map((x) => ({ name: x.name, displayName: x.displayName, lookup: x.lookup?.listId || null }));
    }
  }
  return { listes, ids, colonnes };
}

function colonneExiste(etat, liste, c) {
  const noms = [c.name, ...(EQUIVALENTS[c.name] || [])].map(cle);
  return (etat.colonnes[liste] || []).some((x) => noms.includes(cle(x.displayName)) || noms.includes(cle(x.name)));
}

function planifier(etat) {
  const actions = [];
  for (const def of LISTES) {
    const existe = Boolean(etat.ids[def.nom]);
    if (!existe && def.creer) actions.push({ type: "liste", liste: def.nom });
    if (!existe && !def.creer) actions.push({ type: "erreur", liste: def.nom, message: "liste requise absente" });
  }
  for (const def of LISTES) {
    for (const c of def.colonnes) {
      if (!colonneExiste(etat, def.nom, c)) actions.push({ type: "colonne", liste: def.nom, colonne: c });
    }
  }
  return actions;
}

function afficherPlan(actions) {
  for (const a of actions) {
    if (a.type === "liste") console.log(`PLAN creer liste ${a.liste}`);
    else if (a.type === "colonne") console.log(`PLAN ${a.liste} + ${a.colonne.name} (${a.colonne.type}${a.colonne.liste ? "->" + a.colonne.liste : ""}${a.colonne.multiple ? ", multiple" : ""})`);
    else console.log(`ERREUR ${a.liste} : ${a.message}`);
  }
  console.log(`PLAN total : ${actions.length} action(s)`);
}

function rolesDuJeton(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).roles || []; } catch (_) { return []; }
}

/* ---------- Application ---------- */

async function appliquer(token, siteId, etat) {
  const ids = { ...etat.ids };
  const actions = planifier(etat);
  let creees = 0, colonnes = 0;

  for (const a of actions.filter((x) => x.type === "liste")) {
    console.log(`ACTION creer liste ${a.liste}`);
    const l = await appel(token, "POST", `/sites/${siteId}/lists`, { displayName: a.liste, list: { template: "genericList" } });
    ids[a.liste] = l.id;
    creees++;
  }

  // Une fois toutes les listes presentes, les lookups croises (article <-> produit <-> service) sont possibles.
  for (const a of actions.filter((x) => x.type === "colonne")) {
    console.log(`ACTION ${a.liste} + ${a.colonne.name}`);
    try {
      await appel(token, "POST", `/sites/${siteId}/lists/${ids[a.liste]}/columns`, colonneGraph(a.colonne, ids));
      colonnes++;
    } catch (e) {
      console.log(`ERREUR ${a.liste}.${a.colonne.name} : ${e.message}`);
      throw e;
    }
  }
  return { listes: creees, colonnes };
}

/* ---------- Donnees pilotes ---------- */

const PILOTES = {
  article: { liste: "OBJ-ARTICLE", titre: "Article initial DSE — contenu de démarrage", sites: ["1"] },
  produit: { liste: "OBJ-CATALOGUE", titre: "Produit initial DSE — contenu de démarrage", sites: ["1", "2", "3"] },
  service: { liste: "OBJ-SERVICE", titre: "Service initial DSE — contenu de démarrage", sites: ["1"] }
};

async function elementsDe(token, siteId, listId) {
  return dse.collecter(token, `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=500`);
}

async function creerSiAbsent(token, siteId, listId, titre, champs, existants) {
  const trouve = existants.find((i) => cle(i.fields?.Title) === cle(titre));
  if (trouve) return trouve.id;
  console.log(`ACTION creer element « ${titre} »`);
  const r = await appel(token, "POST", `/sites/${siteId}/lists/${listId}/items`, { fields: { Title: titre, ...champs } });
  return r.id;
}

function champLookup(etat, liste, nom) {
  const c = (etat.colonnes[liste] || []).find((x) => cle(x.displayName) === cle(nom));
  return c?.name;
}

async function semer(token, siteId) {
  const etat = await lireEtat(token, siteId);
  const manquantes = LISTES.filter((l) => !etat.ids[l.nom]).map((l) => l.nom);
  if (manquantes.length) throw new Error(`Schema incomplet (--apply requis) : ${manquantes.join(", ")}`);

  const bilan = { referentiels: 0, pilotes: 0, divers: 0 };

  for (const [liste, valeurs] of Object.entries(REFERENTIELS_VALEURS)) {
    const existants = await elementsDe(token, siteId, etat.ids[liste]);
    const actif = champLookup(etat, liste, "OBJ-ACTIF");
    const valide = champLookup(etat, liste, "OBJ-VALIDE");

    for (const [i, titre] of valeurs.entries()) {
      const avant = existants.length;
      await creerSiAbsent(token, siteId, etat.ids[liste], titre, {
        [`${actif}LookupId`]: 1, [`${valide}LookupId`]: 1, "ORDRE_x002d_AFFICHAGE": i + 1
      }, existants);
      if (!existants.some((e) => cle(e.fields?.Title) === cle(titre))) bilan.referentiels++;
      void avant;
    }
  }

  // Type de module FOOTER.
  const types = await elementsDe(token, siteId, etat.ids["OBJ-MODULE-SITE-PUBLIC-TYPE"]);
  if (!types.some((t) => cle(t.fields?.Title) === "FOOTER")) {
    const ta = (await dse.chargerColonnesListe(token, siteId, etat.ids["OBJ-MODULE-SITE-PUBLIC-TYPE"])).find((c) => cle(c.displayName) === "OBJACTIF");
    const tv = (await dse.chargerColonnesListe(token, siteId, etat.ids["OBJ-MODULE-SITE-PUBLIC-TYPE"])).find((c) => cle(c.displayName) === "OBJVALIDE");
    await creerSiAbsent(token, siteId, etat.ids["OBJ-MODULE-SITE-PUBLIC-TYPE"], "FOOTER",
      { [`${ta.name}LookupId`]: 1, [`${tv.name}LookupId`]: 1 }, types);
    bilan.divers++;
  }

  // Pilotes : actifs, NON valides (publication apres controle).
  const reference = async (liste, titre) => {
    const items = await elementsDe(token, siteId, etat.ids[liste]);
    return items.find((i) => cle(i.fields?.Title) === cle(titre))?.id;
  };

  for (const [type, p] of Object.entries(PILOTES)) {
    const existants = await elementsDe(token, siteId, etat.ids[p.liste]);
    const champs = { NOTE_x002d_COURTE: "Contenu initial DSE, à compléter avant publication." };
    const nomPlateformes = champLookup(etat, p.liste, "OBJ-SITE-PUBLIC");

    if (p.liste === "OBJ-CATALOGUE") {
      champs.ACTIF = true;
      champs.VALIDER = false;
      champs.NOM_x002d_PRODUIT = p.titre;
    } else {
      champs[`${champLookup(etat, p.liste, "OBJ-ACTIF")}LookupId`] = 1;
      champs[`${champLookup(etat, p.liste, "OBJ-VALIDE")}LookupId`] = 2;
    }

    champs[`${nomPlateformes}@odata.type`] = "Collection(Edm.Int32)";
    champs[`${nomPlateformes}LookupId`] = p.sites.map(Number);

    const dispo = await reference("OBJ-DISPONIBILITE", "Disponible");
    const vis = await reference("OBJ-VISIBILITE", "Public");
    const cat = await reference("OBJ-CATEGORIE", { article: "Article", produit: "Produit", service: "Service" }[type]);
    const th = await reference("OBJ-THEME", "Numérique");
    if (dispo) champs[`${champLookup(etat, p.liste, "OBJ-DISPONIBILITE")}LookupId`] = Number(dispo);
    if (vis) champs[`${champLookup(etat, p.liste, "OBJ-VISIBILITE")}LookupId`] = Number(vis);
    if (cat) {
      const n = champLookup(etat, p.liste, "OBJ-CATEGORIE");
      champs[`${n}@odata.type`] = "Collection(Edm.Int32)"; champs[`${n}LookupId`] = [Number(cat)];
    }
    if (th) {
      const n = champLookup(etat, p.liste, "OBJ-THEME");
      champs[`${n}@odata.type`] = "Collection(Edm.Int32)"; champs[`${n}LookupId`] = [Number(th)];
    }

    const avant = existants.length;
    await creerSiAbsent(token, siteId, etat.ids[p.liste], p.titre, champs, existants);
    if (!existants.some((e) => cle(e.fields?.Title) === cle(p.titre))) bilan.pilotes++;
    void avant;
  }

  // Portail : dseco (site 4).
  const sp = await elementsDe(token, siteId, etat.ids["OBJ-SITE-PUBLIC"]);
  const portailCol = champLookup(etat, "OBJ-SITE-PUBLIC", "PORTAIL-CATALOGUE");
  for (const s of sp) {
    const voulu = String(s.id) === "4";
    if (Boolean(s.fields?.[portailCol]) !== voulu) {
      console.log(`ACTION site ${s.id} PORTAIL-CATALOGUE=${voulu}`);
      await appel(token, "PATCH", `/sites/${siteId}/lists/${etat.ids["OBJ-SITE-PUBLIC"]}/items/${s.id}/fields`, { [portailCol]: voulu });
      bilan.divers++;
    }
  }

  // Pages racines manquantes (sites 2 et 3), non validees : pas de contenu invente.
  const pages = await elementsDe(token, siteId, (await lireEtatPages(token, siteId)).id);
  const modele = pages.find((p) => String(p.fields?.OBJ_x002d_SITE_x002d_PUBLICLookupId) === "1");
  for (const siteCible of ["2", "3"]) {
    const deja = pages.some((p) => String(p.fields?.OBJ_x002d_SITE_x002d_PUBLICLookupId) === siteCible && p.fields?.URL === "/");
    if (!deja && modele) {
      const nom = sp.find((s) => String(s.id) === siteCible)?.fields?.Title;
      const champs = {
        Title: `Accueil ${nom}`, URL: "/",
        OBJ_x002d_ACTIFLookupId: 1, OBJ_x002d_VALIDELookupId: 2, OBJ_x002d_VEROUILLELookupId: 2,
        OBJ_x002d_SITE_x002d_PUBLICLookupId: Number(siteCible),
        OBJ_x002d_PAGES_x002d_SITE_x002dLookupId: Number(modele.fields.OBJ_x002d_PAGES_x002d_SITE_x002dLookupId)
      };
      console.log(`ACTION creer page racine site ${siteCible}`);
      await appel(token, "POST", `/sites/${siteId}/lists/${(await lireEtatPages(token, siteId)).id}/items`, { fields: champs });
      bilan.divers++;
    }
  }

  return bilan;
}

let cachePages = null;
async function lireEtatPages(token, siteId) {
  if (!cachePages) {
    const l = await dse.collecter(token, `/sites/${siteId}/lists?$select=id,displayName`);
    cachePages = l.find((x) => x.displayName === "OBJ-PAGES-SITE");
  }
  return cachePages;
}

/* ---------- Principal ---------- */

function sauvegarder(etat) {
  fs.mkdirSync(SAUVEGARDES, { recursive: true });
  const fichier = path.join(SAUVEGARDES, `schema-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(fichier, JSON.stringify({ ids: etat.ids, colonnes: etat.colonnes }, null, 2));
  return path.relative(path.join(__dirname, ".."), fichier);
}

async function principal(mode) {
  console.log(`DEBUT provisionnement SharePoint (${mode})`);
  const token = await dse.obtenirJetonGraph();
  const site = await dse.obtenirSiteGraph(token);
  const roles = rolesDuJeton(token);
  const large = roles.includes("Sites.Manage.All") || roles.includes("Sites.FullControl.All");
  console.log(`Droit large (Sites.Manage.All) : ${large ? "present" : "ABSENT"}`);

  const etat = await lireEtat(token, site.id);

  if (mode === "plan") { afficherPlan(planifier(etat)); return 0; }

  if (mode === "verify") {
    const actions = planifier(etat);
    for (const a of actions) console.log(`MANQUE ${a.liste}${a.colonne ? "." + a.colonne.name : ""}`);
    let ok = actions.length === 0;

    if (ok) {
      for (const [liste, valeurs] of Object.entries(REFERENTIELS_VALEURS)) {
        const items = await elementsDe(token, site.id, etat.ids[liste]);
        const manquants = valeurs.filter((v) => !items.some((i) => cle(i.fields?.Title) === cle(v)));
        if (manquants.length) { ok = false; console.log(`MANQUE valeurs ${liste} : ${manquants.join(", ")}`); }
      }
    }
    console.log(ok ? "VERIFICATION OK" : "VERIFICATION INCOMPLETE");
    return ok ? 0 : 2;
  }

  if (!large) {
    console.log("ARRET : le jeton ne contient pas Sites.Manage.All. Aucune ecriture effectuee.");
    console.log("ACTION ENTRA REQUISE : ajouter Sites.Manage.All (application) a API DSE + consentement administrateur, puis relancer.");
    return 3;
  }

  if (mode === "apply") {
    console.log(`Sauvegarde du schema : ${sauvegarder(etat)}`);
    const bilan = await appliquer(token, site.id, etat);
    console.log(`BILAN listes creees : ${bilan.listes}, colonnes creees : ${bilan.colonnes}`);
  } else if (mode === "seed") {
    console.log(`Sauvegarde du schema : ${sauvegarder(etat)}`);
    console.log(`BILAN ${JSON.stringify(await semer(token, site.id))}`);
  }
  return 0;
}

module.exports = { LISTES, REFERENTIELS_VALEURS, PILOTES, planifier, colonneExiste, colonneGraph };

if (require.main === module) {
  const mode = ["plan", "apply", "seed", "verify"].find((m) => process.argv.includes(`--${m}`));
  if (!mode) { console.log("Usage : --plan | --apply | --seed | --verify"); process.exit(1); }

  principal(mode)
    .then((code) => { console.log("FIN\nTERMINÉ"); process.exit(code); })
    .catch((e) => { console.log(`ERREUR ${e.message}\nFIN\nTERMINÉ (ECHEC)`); process.exit(1); });
}
