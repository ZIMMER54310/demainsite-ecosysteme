"use strict";

const crypto = require("crypto");
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");
const droits = require("./droits");
const queues = new Map();
const cache = { expiration: 0, valeur: null };

const identifiant = (identite) => ecriture.hash([identite.fournisseur, String(identite.sujet).toLowerCase()]);
const global = (d) => d.reconnu && d.portee === "tous" && d.niveau === "administration" && d.fonctions.includes("utilisateurs");

async function serialiser(cle, fn) {
  const precedent = queues.get(cle) || Promise.resolve();
  const courant = precedent.catch(() => {}).then(fn);
  queues.set(cle, courant);
  try { return await courant; } finally { if (queues.get(cle) === courant) queues.delete(cle); }
}

async function politique(g) {
  const liste = dse.trouverListe(g.listes, ["OBJ-POLITIQUE-ACCES"]);
  if (!liste) return null;
  const colonnes = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id);
  const actifs = dse.trouverListe(g.listes, ["OBJ-ACTIF"]);
  const valides = dse.trouverListe(g.listes, ["OBJ-VALIDE"]);
  const col = (l) => colonnes.find((c) => c.lookup?.listId === l?.id && !c.lookup.allowMultipleValues);
  const oui = async (l) => {
    if (!l) return null;
    const items = await dse.chargerItemsListe(g.token, g.siteGraphId, l.id);
    const candidats = items.filter((i) => /^oui\b/i.test(String(i.fields?.Title || "")));
    return candidats.length === 1 ? String(candidats[0].id) : null;
  };
  const [a, v] = await Promise.all([oui(actifs), oui(valides)]);
  if (!a || !v || !col(actifs) || !col(valides)) throw new Error("Politique d'accès incomplète.");
  const items = await ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields`);
  const candidates = items.filter((i) => String(i.fields?.[`${col(actifs).name}LookupId`]) === a &&
    String(i.fields?.[`${col(valides).name}LookupId`]) === v);
  if (candidates.length !== 1) throw new Error("Politique d'accès absente ou ambiguë.");
  const f = candidates[0].fields;
  const fenetre = Number(f.FENETREREFUSMINUTES), duree = Number(f.BLOCAGEMINUTES);
  if (!Number.isFinite(fenetre) || fenetre <= 0 || !Number.isFinite(duree) || duree <= 0) {
    throw new Error("Fenêtre de refus et durée de blocage SharePoint requises.");
  }
  return { fenetreMs: fenetre * 60000, blocageMs: duree * 60000 };
}

async function lire(frais = false) {
  if (!frais && cache.valeur && cache.expiration > Date.now()) return cache.valeur;
  const g = await ecriture.contexteGraph();
  const liste = dse.trouverListe(g.listes, ["OBJ-JRN"]);
  if (!liste) throw new Error("Journal des incidents indisponible.");
  const [items, regle] = await Promise.all([
    ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields&$top=500`), politique(g)
  ]);
  const parIncident = new Map();
  for (const i of items) {
    if (!["INCIDENT-REFUS", "VERROUILLAGE-ACCES", "REACTIVATION-ACCES", "MAINTIEN-BLOCAGE", "EXPIRATION-ACCES"].includes(i.fields?.ACTION)) continue;
    let donnees;
    try { donnees = JSON.parse(i.fields.NOUVELLEVALEUR); }
    catch { throw new Error("Journal d'incident illisible."); }
    const incident = donnees?.incident;
    if (!incident?.id || !incident.identite || !Array.isArray(incident.refus)) throw new Error("Journal d'incident incomplet.");
    const ancien = parIncident.get(incident.id);
    if (!ancien || Number(i.id) > Number(ancien.journalId)) parIncident.set(incident.id, { ...incident, journalId: String(i.id) });
  }
  const valeur = { g, regle, incidents: [...parIncident.values()] };
  cache.valeur = valeur; cache.expiration = Date.now() + 5000;
  return valeur;
}

async function enregistrer(g, incident, action, acteur, cle = crypto.randomUUID()) {
  const j = await ecriture.journaliser(g, { cle: ecriture.hash([incident.id, action, cle]), action, nom: "Incident d'accès DSE",
    ancien: {}, nouveau: { incident }, notes: "Gestion d'accès DSE", succes: true,
    refus: action === "INCIDENT-REFUS", contexte: { acteur: acteur || null, incidentId: incident.id,
      utilisateurId: incident.utilisateurId, domaine: incident.domaine } });
  if (!j.ok) throw new Error("Journalisation d'incident indisponible.");
  cache.expiration = 0;
}

async function alerter(g, incident) {
  const x = await droits.donneesDroits();
  const destinataires = x.utilisateurs.filter((u) => u.actif && u.valide &&
    x.politique.roles?.[u.roleId]?.portee === "tous" && x.politique.roles?.[u.roleId]?.niveau === "administration")
    .map((u) => u.id);
  const j = await ecriture.journaliser(g, { cle: ecriture.hash([incident.id, "ALERTE-EN-ATTENTE"]),
    action: "ALERTE-EN-ATTENTE", nom: "Alerte d'accès en attente", ancien: {}, nouveau: {
      incidentId: incident.id, date: incident.dernier, domaine: incident.domaine,
      utilisateur: `${incident.identite.slice(0, 8)}…`, motif: "Refus de sécurité DSE répétés",
      destinatairesUtilisateurIds: destinataires, lien: "/#/cockpit/utilisateurs?incidents=1"
    }, notes: "Envoi email non configuré ; aucun email envoyé.", succes: true });
  if (!j.ok) throw new Error("Journalisation d'alerte indisponible.");
}

async function verifier(identite) {
  if (!identite) return false;
  const { g, incidents } = await lire();
  const blocage = incidents.find((i) => i.identite === identifiant(identite) && i.etat === "BLOQUE");
  if (!blocage) return false;
  if (!blocage.expireLe || Date.parse(blocage.expireLe) > Date.now()) return true;
  await serialiser(blocage.identite, async () => {
    const actuel = (await lire(true)).incidents.find((i) => i.id === blocage.id);
    if (actuel?.etat === "BLOQUE" && actuel.expireLe && Date.parse(actuel.expireLe) <= Date.now()) {
      await enregistrer(g, { ...actuel, etat: "RESOLU", resolution: "Expiration de la politique SharePoint" },
        "EXPIRATION-ACCES", null, actuel.expireLe);
    }
  });
  return (await lire(true)).incidents.some((i) => i.identite === identifiant(identite) && i.etat === "BLOQUE");
}

async function refuser(identite, domaine, motif) {
  if (!identite) return;
  const cle = identifiant(identite);
  return serialiser(cle, async () => {
    const { g, regle, incidents } = await lire(true);
    const x = await droits.donneesDroits();
    const u = x.utilisateurs.find((u) => String(u.entraObjectId || "").toLowerCase() === String(identite.sujet).toLowerCase());
    const ancien = incidents.find((i) => i.identite === cle && i.etat !== "RESOLU");
    if (ancien?.etat === "BLOQUE") { await alerter(g, ancien); return ancien; }
    const maintenant = new Date().toISOString();
    const incident = ancien || { id: crypto.randomUUID(), identite: cle, utilisateurId: u?.id || null,
      utilisateur: u?.titre || `${cle.slice(0, 8)}…`, premier: maintenant, refus: [], etat: "OUVERT" };
    const refus = regle ? incident.refus.filter((t) => Date.parse(t) >= Date.now() - regle.fenetreMs) : incident.refus;
    const suivant = { ...incident, domaine, motif, dernier: maintenant,
      nombre: regle ? refus.length + 1 : (incident.nombre || incident.refus.length) + 1,
      refus: [...refus, maintenant].slice(-3), politiqueDisponible: !!regle };
    await enregistrer(g, suivant, "INCIDENT-REFUS", cle);
    if (regle && suivant.refus.length >= 3) {
      suivant.etat = "BLOQUE";
      suivant.expireLe = new Date(Date.now() + regle.blocageMs).toISOString();
      await enregistrer(g, suivant, "VERROUILLAGE-ACCES", cle, "verrouillage");
      await alerter(g, suivant);
    }
    return suivant;
  });
}

async function decider(identite, id, decision) {
  if (!["reactiver", "maintenir"].includes(decision)) return false;
  const d = await droits.droitsPour(identite);
  if (!global(d) || await verifier(identite)) return false;
  const cible = (await lire(true)).incidents.find((i) => i.id === id);
  if (!cible) return false;
  if (decision === "maintenir" && cible.identite === identifiant(identite)) return false;
  return serialiser(cible.identite, async () => {
    const { g, incidents } = await lire(true);
    const incident = incidents.find((i) => i.id === id);
    if (!incident) return false;
    if (decision === "reactiver" && incident.etat === "RESOLU") return true;
    const suivant = { ...incident, etat: decision === "reactiver" ? "RESOLU" : "BLOQUE", expireLe: null,
      resolution: decision === "reactiver" ? "Vérification Super Administrateur" : "Blocage maintenu par Super Administrateur" };
    await enregistrer(g, suivant, decision === "reactiver" ? "REACTIVATION-ACCES" : "MAINTIEN-BLOCAGE", d.utilisateurId);
    if (decision === "maintenir") await alerter(g, suivant);
    return true;
  });
}

module.exports = { lire, verifier, refuser, decider, global, identifiant, politique,
  viderCache: () => { cache.expiration = 0; cache.valeur = null; } };
