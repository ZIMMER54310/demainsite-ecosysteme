"use strict";

/*
 * Sauvegarde des listes SharePoint dans le coffre-fort (bibliotheque "DSE - Coffre Ford",
 * dossier SAUVEGARDES-LISTES) et restauration manuelle securisee.
 *
 * Sauvegarde : une copie JSON par liste, deposee uniquement si son contenu a change depuis la
 * sauvegarde precedente, et un manifeste par passage qui pointe vers la derniere copie de chaque liste.
 * Le depot GitHub etant public, aucune donnee n'y est jamais ecrite.
 * Seul le dossier SAUVEGARDES-LISTES du coffre est lu ou ecrit : les autres fichiers ne sont jamais ouverts.
 *
 * Restauration : apercu des differences, puis confirmation. Seules les fiches modifiees ou manquantes
 * sont retablies ; aucune fiche n'est supprimee, aucune fiche presente n'est dupliquee.
 * Le journal OBJ-JRN (ajout seul) n'est jamais restaure.
 */

const crypto = require("crypto");
const dse = require("./dse");
const ecriture = require("./ecriture");

const DOSSIER = "SAUVEGARDES-LISTES";
const FORMAT = "DSE-SAUVEGARDE-LISTE-1";
// Journal en ajout seul ; geographie, relations et references jamais modifiees par le moteur (sauvegardees en lecture seule).
const NON_RESTAURABLES = ["OBJ-JRN", "OBJ-REL", "OBJ-REF"];
const restaurable = (titre) => !NON_RESTAURABLES.includes(titre) && !/^OBJ-GEO(-|$)/i.test(String(titre || ""));
const REFUS_NON_RESTAURABLE = "Ces données ne se restaurent jamais depuis le cockpit (journal, géographie ou références protégées).";
const SYSTEME = new Set(["ContentType", "Attachments", "Edit", "LinkTitle", "LinkTitleNoMenu", "DocIcon", "ItemChildCount",
  "FolderChildCount", "AppAuthor", "AppEditor", "ComplianceAssetId", "SelectTitle", "ID", "Author", "Editor", "Created", "Modified"]);
const JETON_MS = 10 * 60 * 1000;

const bibliotheque = () => process.env.DSE_COFFRE_LIBRARY || "DSE - Coffre Ford";
const segment = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9-]+/g, "_").slice(0, 80) || "liste";
const horodatage = (d) => d.toISOString().replace(/\D/g, "").slice(0, 14);
const empreinte = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const chemin = (c) => c.split("/").map(encodeURIComponent).join("/");

async function graphBrut(g, methode, url, corps, entetes = {}) {
  const auth = url.startsWith("https://graph.microsoft.com/") ? { Authorization: `Bearer ${g.token}` } : {};
  const r = await fetch(url, { method: methode, headers: { ...auth, ...entetes }, body: corps, signal: AbortSignal.timeout(120000) });
  const texte = await r.text();
  let json = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { json = null; }
  return { status: r.status, json, texte };
}

async function idCoffre(g) {
  const drives = await dse.collecter(g.token, `/sites/${g.siteGraphId}/drives?$select=id,name`);
  const d = drives.find((x) => x.name === bibliotheque());
  if (!d) throw Object.assign(new Error("Coffre-fort des sauvegardes indisponible."), { refus: true });
  return d.id;
}

/* Cree DOSSIER/sous-dossier si absent (jamais de remplacement). */
async function assurerDossier(g, driveId, relatif) {
  let parent = "root";
  let courant = "";
  for (const nom of relatif.split("/")) {
    courant = courant ? `${courant}/${nom}` : nom;
    const lu = await graphBrut(g, "GET", `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${chemin(courant)}?$select=id,folder`);
    if (lu.status === 200) {
      if (!lu.json?.folder) throw new Error("Emplacement des sauvegardes occupé par un fichier.");
      parent = lu.json.id;
      continue;
    }
    if (lu.status !== 404) throw new Error(`Lecture du coffre refusée (${lu.status}).`);
    const cree = await graphBrut(g, "POST", `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parent}/children`,
      JSON.stringify({ name: nom, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }), { "Content-Type": "application/json" });
    if (cree.status === 409) { continue; }
    if (![200, 201].includes(cree.status)) throw new Error(`Création du dossier de sauvegarde refusée (${cree.status}).`);
    parent = cree.json.id;
  }
}

async function deposer(g, driveId, relatif, objet) {
  const corps = Buffer.from(JSON.stringify(objet));
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${chemin(relatif)}:/content?@microsoft.graph.conflictBehavior=fail`;
  const r = await graphBrut(g, "PUT", url, corps, { "Content-Type": "application/json", "Content-Length": String(corps.length) });
  if (r.status === 409) return { deja: true };
  if (![200, 201].includes(r.status)) throw new Error(`Dépôt de la sauvegarde refusé (${r.status}).`);
  return { id: r.json?.id };
}

async function lireJson(g, driveId, relatif) {
  if (!relatif.startsWith(`${DOSSIER}/`) || relatif.includes("..")) throw Object.assign(new Error("Sauvegarde introuvable."), { refus: true });
  const meta = await graphBrut(g, "GET", `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${chemin(relatif)}`);
  const url = meta.json?.["@microsoft.graph.downloadUrl"];
  if (meta.status !== 200 || !/^https:\/\//.test(url || "")) throw Object.assign(new Error("Sauvegarde introuvable."), { refus: true });
  const r = await graphBrut(g, "GET", url);
  if (r.status !== 200 || !r.json) throw new Error("Sauvegarde illisible.");
  return r.json;
}

async function enfants(g, driveId, relatif) {
  const r = await graphBrut(g, "GET", `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${chemin(relatif)}:/children?$select=name,file,size&$top=999`);
  if (r.status === 404) return [];
  if (r.status !== 200) throw new Error(`Lecture du coffre refusée (${r.status}).`);
  const sortie = [...(r.json?.value || [])];
  let suivant = r.json?.["@odata.nextLink"];
  for (let i = 0; suivant && i < 50; i++) {
    const p = await graphBrut(g, "GET", suivant);
    sortie.push(...(p.json?.value || []));
    suivant = p.json?.["@odata.nextLink"];
  }
  return sortie;
}

/* Lecture complete (pagination sans limite artificielle) : les grosses listes sont sauvegardees entieres. */
async function tout(g, chemin0) {
  const sortie = [];
  let suivant = chemin0;
  for (let i = 0; suivant && i < 2000; i++) {
    const r = await dse.graphSansCache(g.token, suivant);
    if (!Array.isArray(r?.value)) throw new Error("Réponse de lecture invalide.");
    sortie.push(...r.value);
    suivant = r["@odata.nextLink"];
  }
  if (suivant) throw new Error("Lecture incomplète.");
  return sortie;
}

async function listesSauvegardables(g) {
  const listes = await tout(g, `/sites/${g.siteGraphId}/lists?$select=id,name,displayName,list,system&$top=999`);
  return listes.filter((l) => !l.system && !l.list?.hidden && !/library/i.test(String(l.list?.template || "")))
    .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
}

const colonnesUtiles = (cols) => cols.map((c) => ({
  name: c.name, displayName: c.displayName, readOnly: Boolean(c.readOnly), hidden: Boolean(c.hidden),
  calculated: Boolean(c.calculated), personne: Boolean(c.personOrGroup),
  lookup: c.lookup ? { listId: c.lookup.listId || null, multi: Boolean(c.lookup.allowMultipleValues) } : null,
  choixMulti: Boolean(c.choice && c.choice.displayAs === "checkBoxes")
}));

async function exporterListe(g, l) {
  const [cols, items] = await Promise.all([
    tout(g, `/sites/${g.siteGraphId}/lists/${l.id}/columns?$top=999`),
    tout(g, `/sites/${g.siteGraphId}/lists/${l.id}/items?$expand=fields&$top=999`)
  ]);
  const elements = items.map((i) => {
    const { "@odata.etag": _e, ...fields } = i.fields || {};
    return { id: String(i.id), fields };
  }).sort((a, b) => Number(a.id) - Number(b.id));
  return { colonnes: colonnesUtiles(cols), elements, empreinte: empreinte(elements) };
}

async function dernierManifeste(g, driveId) {
  const fichiers = (await enfants(g, driveId, `${DOSSIER}/manifestes`)).filter((f) => f.file && /^\d{14}\.json$/.test(f.name))
    .map((f) => f.name).sort();
  if (!fichiers.length) return null;
  return { nom: fichiers.at(-1), contenu: await lireJson(g, driveId, `${DOSSIER}/manifestes/${fichiers.at(-1)}`) };
}

/* Un passage complet. Retour : rapport sans identifiant technique sensible. */
async function sauvegarder({ acteur }) {
  const g = await ecriture.contexteGraph();
  const driveId = await idCoffre(g);
  await assurerDossier(g, driveId, `${DOSSIER}/manifestes`);
  await assurerDossier(g, driveId, `${DOSSIER}/listes`);
  const precedent = await dernierManifeste(g, driveId).catch(() => null);
  const avant = new Map((precedent?.contenu?.listes || []).map((x) => [x.id, x]));
  const maintenant = new Date();
  const h = horodatage(maintenant);
  const rapport = { listes: 0, deposees: 0, inchangees: 0, elements: 0, erreurs: [] };
  const entrees = [];
  for (const l of await listesSauvegardables(g)) {
    rapport.listes++;
    try {
      const x = await exporterListe(g, l);
      rapport.elements += x.elements.length;
      const p = avant.get(l.id);
      let fichier = p?.fichier;
      if (!p || p.empreinte !== x.empreinte) {
        await assurerDossier(g, driveId, `${DOSSIER}/listes/${segment(l.displayName)}`);
        fichier = `${DOSSIER}/listes/${segment(l.displayName)}/${h}-${x.empreinte.slice(0, 8)}.json`;
        await deposer(g, driveId, fichier, { format: FORMAT, le: maintenant.toISOString(), liste: { id: l.id, nom: l.name, titre: l.displayName },
          colonnes: x.colonnes, elements: x.elements, empreinte: x.empreinte });
        rapport.deposees++;
      } else rapport.inchangees++;
      entrees.push({ id: l.id, titre: l.displayName, fichier, empreinte: x.empreinte, elements: x.elements.length, change: !p || p.empreinte !== x.empreinte });
    } catch (e) {
      console.error("[DSE sauvegarde]", l.displayName, e.message);
      rapport.erreurs.push(l.displayName);
      if (avant.get(l.id)) entrees.push({ ...avant.get(l.id), change: false, erreur: true });
    }
  }
  const nomManifeste = `${h}.json`;
  await deposer(g, driveId, `${DOSSIER}/manifestes/${nomManifeste}`, { format: FORMAT, le: maintenant.toISOString(), acteur, listes: entrees });
  rapport.manifeste = nomManifeste;
  if (rapport.deposees || rapport.erreurs.length) {
    const j = await ecriture.journaliser(g, {
      cle: ecriture.hash(["sauvegarde-listes", nomManifeste]), action: "Synchronisations : sauvegarde des listes",
      nom: `Sauvegarde ${nomManifeste} · ${rapport.deposees} liste(s) copiée(s)`, ancien: {},
      nouveau: { manifeste: nomManifeste, copiees: entrees.filter((x) => x.change).map((x) => x.titre), erreurs: rapport.erreurs },
      notes: `Acteur : ${acteur} | Listes ${rapport.listes} | Inchangées ${rapport.inchangees} | Éléments ${rapport.elements} | Coffre ${bibliotheque()}/${DOSSIER}`,
      succes: !rapport.erreurs.length, contexte: { coffre: DOSSIER }
    });
    rapport.journal = j.ok;
  }
  return rapport;
}

async function sauvegardes() {
  const g = await ecriture.contexteGraph();
  const driveId = await idCoffre(g);
  const noms = (await enfants(g, driveId, `${DOSSIER}/manifestes`)).filter((f) => f.file && /^\d{14}\.json$/.test(f.name))
    .map((f) => f.name).sort().reverse();
  return noms.map((n) => ({ nom: n, le: `${n.slice(0, 4)}-${n.slice(4, 6)}-${n.slice(6, 8)}T${n.slice(8, 10)}:${n.slice(10, 12)}:${n.slice(12, 14)}Z` }));
}

const nomManifesteValide = (n) => /^\d{14}\.json$/.test(String(n || ""));

async function listesDeSauvegarde(nom) {
  if (!nomManifesteValide(nom)) return { refus: "Sauvegarde introuvable." };
  const g = await ecriture.contexteGraph();
  const m = await lireJson(g, await idCoffre(g), `${DOSSIER}/manifestes/${nom}`);
  return { listes: (m.listes || []).filter((x) => x.fichier).map((x) => ({ id: x.id, titre: x.titre, elements: x.elements,
    restaurable: restaurable(x.titre) })) };
}

/* ---------------- Restauration ---------------- */

const ecrivable = (c) => c && !c.readOnly && !c.hidden && !c.calculated && !c.personne && !SYSTEME.has(c.name) && !c.name.startsWith("_");

function valeur(c, f) {
  if (c.lookup) {
    if (c.lookup.multi) {
      const v = f[c.name];
      return Array.isArray(v) ? v.map((x) => Number(x.LookupId)).filter(Number.isFinite).sort((a, b) => a - b) : null;
    }
    const v = f[`${c.name}LookupId`];
    return v === undefined || v === null || v === "" ? null : String(v);
  }
  const v = f[c.name];
  if (v === undefined || v === null || v === "") return null;
  if (Array.isArray(v)) return v.length ? [...v].map(String).sort() : null;
  return v;
}

const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function champEcriture(c, v) {
  if (c.lookup) {
    if (c.lookup.multi) return { [`${c.name}LookupId@odata.type`]: "Collection(Edm.Int32)", [`${c.name}LookupId`]: v || [] };
    return { [`${c.name}LookupId`]: v === null ? null : String(v) };
  }
  if (Array.isArray(v) || c.choixMulti) return { [`${c.name}@odata.type`]: "Collection(Edm.String)", [c.name]: v || [] };
  return { [c.name]: v };
}

const affichable = (v) => (v === null ? "(vide)" : Array.isArray(v) ? v.join(", ") : String(v)).slice(0, 200);

/* Calcule le plan : pour chaque fiche, les champs a retablir et l'etat actuel attendu (controle a la confirmation). */
async function calculer(g, sauvegarde) {
  const liste = g.listes.find((l) => l.id === sauvegarde.liste?.id);
  if (!liste) return { refus: "La liste de cette sauvegarde n'existe plus ou a été remplacée." };
  if (!restaurable(sauvegarde.liste.titre)) return { refus: REFUS_NON_RESTAURABLE };
  const actuelles = await tout(g, `/sites/${g.siteGraphId}/lists/${liste.id}/columns?$top=999`);
  const colsActuelles = new Map(colonnesUtiles(actuelles).map((c) => [c.name, c]));
  const colonnes = (sauvegarde.colonnes || []).filter((c) => ecrivable(c) && ecrivable(colsActuelles.get(c.name)))
    .map((c) => colsActuelles.get(c.name));
  const items = await tout(g, `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields&$top=999`);
  const parId = new Map(items.map((i) => [String(i.id), i.fields || {}]));
  const titres = new Map();
  for (const [id, f] of parId) if (f.Title) titres.set(String(f.Title).trim().toLowerCase(), id);
  const plan = { listId: liste.id, titre: sauvegarde.liste.titre, modifiees: [], manquantes: [], identiques: 0,
    ajouteesDepuis: [...parId.keys()].filter((id) => !(sauvegarde.elements || []).some((e) => e.id === id)).length };
  for (const el of sauvegarde.elements || []) {
    const actuel = parId.get(el.id);
    if (actuel) {
      const champs = colonnes.filter((c) => !egal(valeur(c, actuel), valeur(c, el.fields)))
        .map((c) => ({ nom: c.name, libelle: c.displayName || c.name, actuel: valeur(c, actuel), sauvegarde: valeur(c, el.fields) }));
      if (!champs.length) { plan.identiques++; continue; }
      plan.modifiees.push({ id: el.id, titre: String(el.fields.Title || actuel.Title || `Fiche ${el.id}`), champs,
        avant: empreinte(colonnes.map((c) => valeur(c, actuel))) });
    } else {
      const champs = colonnes.map((c) => ({ nom: c.name, libelle: c.displayName || c.name, sauvegarde: valeur(c, el.fields) }))
        .filter((x) => x.sauvegarde !== null);
      const titre = String(el.fields.Title || "").trim();
      const homonyme = titre ? titres.get(titre.toLowerCase()) || null : null;
      plan.manquantes.push({ id: el.id, titre: titre || `Fiche ${el.id}`, champs, homonyme });
    }
  }
  plan.colonnes = colonnes;
  return plan;
}

const jetons = new Map();

async function apercu({ identite, manifeste, listeId }) {
  if (!nomManifesteValide(manifeste)) return { refus: "Sauvegarde introuvable." };
  const g = await ecriture.contexteGraph();
  const driveId = await idCoffre(g);
  const m = await lireJson(g, driveId, `${DOSSIER}/manifestes/${manifeste}`);
  const entree = (m.listes || []).find((x) => x.id === String(listeId || "") && x.fichier);
  if (!entree) return { refus: "Cette liste ne figure pas dans la sauvegarde." };
  if (!restaurable(entree.titre)) return { refus: REFUS_NON_RESTAURABLE };
  const sauvegarde = await lireJson(g, driveId, entree.fichier);
  if (sauvegarde.format !== FORMAT || sauvegarde.liste?.id !== entree.id) return { refus: "Sauvegarde illisible." };
  const plan = await calculer(g, sauvegarde);
  if (plan.refus) return plan;
  for (const [k, v] of jetons) if (v.expire < Date.now()) jetons.delete(k);
  const jeton = crypto.randomUUID();
  jetons.set(jeton, { plan, manifeste, fichier: entree.fichier, f: identite.fournisseur, sub: identite.sujet, expire: Date.now() + JETON_MS });
  return {
    jeton, liste: plan.titre, sauvegardeDu: sauvegarde.le, identiques: plan.identiques, ajouteesDepuis: plan.ajouteesDepuis,
    modifiees: plan.modifiees.map((x) => ({ id: x.id, titre: x.titre,
      champs: x.champs.map((c) => ({ libelle: c.libelle, actuel: affichable(c.actuel), sauvegarde: affichable(c.sauvegarde) })) })),
    manquantes: plan.manquantes.map((x) => ({ id: x.id, titre: x.titre, champs: x.champs.length, homonyme: Boolean(x.homonyme) }))
  };
}

const tronquerJson = (v) => { const s = JSON.stringify(v); return s.length > 30000 ? { resume: `${s.length} caractères (détail tronqué)` } : v; };

async function confirmer({ identite, jeton, selection, acteur }) {
  const t = jetons.get(String(jeton || ""));
  if (!t || t.expire < Date.now()) return { refus: "Cet aperçu a expiré. Merci de recommencer." };
  if (t.f !== identite.fournisseur || t.sub !== identite.sujet) return { refus: "Cet aperçu ne vous appartient pas." };
  jetons.delete(String(jeton));
  const voulu = new Set((Array.isArray(selection) ? selection : []).map(String));
  if (!voulu.size) return { refus: "Aucune fiche sélectionnée." };
  const { plan } = t;
  const g = await ecriture.contexteGraph();
  const rapport = { retablies: [], recreees: [], ignorees: [], erreurs: [] };
  const ancien = {};
  const nouveau = {};
  for (const x of plan.modifiees.filter((m) => voulu.has(m.id))) {
    try {
      const actuel = (await dse.graphSansCache(g.token, `/sites/${g.siteGraphId}/lists/${plan.listId}/items/${x.id}?$expand=fields`))?.fields || {};
      if (empreinte(plan.colonnes.map((c) => valeur(c, actuel))) !== x.avant) { rapport.ignorees.push({ titre: x.titre, raison: "modifiée depuis l'aperçu" }); continue; }
      const champs = Object.assign({}, ...x.champs.map((c) => champEcriture(plan.colonnes.find((k) => k.name === c.nom), c.sauvegarde)));
      await dse.graphEcriture(g.token, "PATCH", `/sites/${g.siteGraphId}/lists/${plan.listId}/items/${x.id}/fields`, champs);
      ancien[x.id] = Object.fromEntries(x.champs.map((c) => [c.libelle, c.actuel]));
      nouveau[x.id] = Object.fromEntries(x.champs.map((c) => [c.libelle, c.sauvegarde]));
      rapport.retablies.push({ titre: x.titre, champs: x.champs.length });
    } catch (e) {
      console.error("[DSE restauration] PATCH", x.id, e.message, e.detailGraph || "");
      rapport.erreurs.push({ titre: x.titre, raison: "rétablissement refusé" });
    }
  }
  if (plan.manquantes.some((m) => voulu.has(m.id))) {
    const items = await tout(g, `/sites/${g.siteGraphId}/lists/${plan.listId}/items?$expand=fields($select=Title)&$top=999`);
    const titres = new Set(items.map((i) => String(i.fields?.Title || "").trim().toLowerCase()).filter(Boolean));
    for (const x of plan.manquantes.filter((m) => voulu.has(m.id))) {
      if (x.homonyme || (x.titre && titres.has(x.titre.trim().toLowerCase()))) { rapport.ignorees.push({ titre: x.titre, raison: "une fiche du même nom existe déjà (aucun doublon)" }); continue; }
      try {
        const champs = Object.assign({}, ...x.champs.map((c) => champEcriture(plan.colonnes.find((k) => k.name === c.nom), c.sauvegarde)));
        const cree = await dse.graphEcriture(g.token, "POST", `/sites/${g.siteGraphId}/lists/${plan.listId}/items`, { fields: champs });
        titres.add(x.titre.trim().toLowerCase());
        nouveau[`recree:${x.id}`] = { nouvelId: cree?.id || null, titre: x.titre };
        rapport.recreees.push({ titre: x.titre, ancienNumero: x.id, nouveauNumero: cree?.id || null });
      } catch (e) {
        console.error("[DSE restauration] POST", x.id, e.message, e.detailGraph || "");
        rapport.erreurs.push({ titre: x.titre, raison: "recréation refusée" });
      }
    }
  }
  const j = await ecriture.journaliser(g, {
    cle: ecriture.hash(["restauration", jeton]), action: "Synchronisations : restauration",
    nom: `Restauration ${plan.titre} · ${rapport.retablies.length} rétablie(s), ${rapport.recreees.length} recréée(s)`,
    ancien: tronquerJson(ancien), nouveau: tronquerJson(nouveau),
    notes: `Acteur : ${acteur} | Sauvegarde ${t.manifeste} | Ignorées ${rapport.ignorees.length} | Erreurs ${rapport.erreurs.length} | Aucune suppression`,
    succes: !rapport.erreurs.length, contexte: { liste: plan.titre, listeId: plan.listId }
  });
  rapport.journal = j.ok;
  if (rapport.retablies.length || rapport.recreees.length) {
    ecriture.invaliderCaches();
    try { require("./builder-source").viderCache(); } catch { /* cache optionnel */ }
  }
  return { liste: plan.titre, ...rapport };
}

/* Date du dernier passage connue par le coffre (utile apres un redemarrage du service). */
async function dateDerniereSauvegarde() {
  const s = await sauvegardes();
  return s[0]?.le || null;
}

module.exports = {
  sauvegarder, sauvegardes, listesDeSauvegarde, apercu, confirmer, dateDerniereSauvegarde, DOSSIER, NON_RESTAURABLES,
  _test: { restaurable, valeur, champEcriture, ecrivable, segment, nomManifesteValide, colonnesUtiles, jetons }
};
