"use strict";

const crypto = require("node:crypto");
const dse = require("./dse");
const ecriture = require("./ecriture");
const journal = require("./journal-comptes");

const refDemande = (id) => crypto.createHash("sha256").update(`demande-compte:${id}`).digest("hex").slice(0, 32);
const trouver = (g, nom) => {
  const liste = dse.trouverListe(g.listes, nom);
  if (!liste) throw new Error(`Liste ${nom} indisponible.`);
  return liste;
};
if (!C.id.required || !C.entra.required || !C.client.required || !C.etat.required || !C.date.required ||
    !C.cle.required || !C.cle.indexed || !C.cle.enforceUniqueValues || !C.actif.required || !C.valide.required) {
  throw new Error("Schéma OBJ-DEMANDE-COMPTE non conforme.");
}
const colonnes = async (g, liste) => dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id);
const champ = (cols, name, type) => {
  const xs = cols.filter((c) => !c.hidden && c.name === name && (!type || c[type]));
  if (xs.length !== 1) throw new Error(`Colonne SharePoint absente ou ambiguë : ${name}.`);
  return xs[0];
};
const lookup = (cols, name, liste) => {
  const c = champ(cols, name, "lookup");
  if (c.lookup.allowMultipleValues || c.lookup.listId.toLowerCase() !== liste.id.toLowerCase()) {
    throw new Error(`Relation SharePoint incohérente : ${name}.`);
  }
  return c;
};
async function items(g, liste, champs) {
  return ecriture.collecterFrais(g,
    `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields($select=${[...new Set(["Title", ...champs])].join(",")})&$top=500`);
}

async function modele(g) {
  const demande = trouver(g, "OBJ-DEMANDE-COMPTE");
  const etats = trouver(g, "OBJ-DEMANDE-COMPTE-ETAT");
  const sites = trouver(g, "OBJ-SITE-PUBLIC");
  const clients = trouver(g, "OBJ-CLIENT");
  const utilisateurs = trouver(g, "OBJ-UTILISATEUR");
  const actifs = trouver(g, "OBJ-ACTIF");
  const valides = trouver(g, "OBJ-VALIDE");
  const [dc, ec, sc, act, val, demandes, statuts] = await Promise.all([
    colonnes(g, demande), colonnes(g, etats), colonnes(g, sites), dse.chargerItemsListe(g.token, g.siteGraphId, actifs.id),
    dse.chargerItemsListe(g.token, g.siteGraphId, valides.id),
    items(g, demande, ["ENTRAOBJECTID", "OBJCLIENTLookupId", "OBJSITEPUBLICLookupId", "OBJETATDEMANDECOMPTEId",
      "OBJETATDEMANDECOMPTELookupId", "DATEDEMANDE", "DECISION", "DATEDECISION", "RESPONSABLETRAITEMENTLookupId",
      "CLEIDEMPOTENCE", "OBJACTIFLookupId", "OBJVALIDELookupId"]),
    items(g, etats, ["CODEETATDEMANDECOMPTE", "OBJACTIFLookupId", "OBJVALIDELookupId"])
  ]);
  const C = {
    id: champ(dc, "Title", "text"), entra: champ(dc, "ENTRAOBJECTID", "text"),
    client: lookup(dc, "OBJCLIENT", clients), site: lookup(dc, "OBJSITEPUBLIC", sites),
    etat: lookup(dc, "OBJETATDEMANDECOMPTE", etats), date: champ(dc, "DATEDEMANDE", "dateTime"),
    decision: champ(dc, "DECISION", "text"), dateDecision: champ(dc, "DATEDECISION", "dateTime"),
    responsable: lookup(dc, "RESPONSABLETRAITEMENT", utilisateurs),
    cle: champ(dc, "CLEIDEMPOTENCE", "text"), actif: lookup(dc, "OBJACTIF", actifs),
    valide: lookup(dc, "OBJVALIDE", valides)
  };
  const etatCode = champ(ec, "CODEETATDEMANDECOMPTE", "text");
  const etatActif = lookup(ec, "OBJACTIF", actifs);
  const etatValide = lookup(ec, "OBJVALIDE", valides);
  const sitesClient = lookup(sc, "OBJ-CLIENT", clients);
  const idOui = (xs) => {
    const matches = xs.filter((x) => /^oui\b/i.test(String(x.fields?.Title || "").trim()));
    if (matches.length !== 1) throw new Error("Référentiel Oui/Non absent ou ambigu.");
    return String(matches[0].id);
  };
  const ouiActif = idOui(act), ouiValide = idOui(val);
  const etatParCode = (code) => {
    const xs = statuts.filter((x) => x.fields[etatCode.name] === code &&
      String(x.fields[`${etatActif.name}LookupId`]) === ouiActif &&
      String(x.fields[`${etatValide.name}LookupId`]) === ouiValide);
    if (xs.length !== 1) throw new Error(`État de demande absent ou ambigu : ${code}.`);
    return String(xs[0].id);
  };
  return { demande, etats, sites, clients, utilisateurs, actifs, valides, C, demandes,
    sitesClient, etatParCode,
    enAttente: etatParCode("EN-ATTENTE"), acceptee: etatParCode("ACCEPTEE"), refusee: etatParCode("REFUSEE"),
    ouiActif, ouiValide };
}

async function clientDuSite(g, m, siteId) {
  const site = (await items(g, m.sites, [`${m.sitesClient.name}LookupId`]))
    .filter((x) => String(x.id) === String(siteId));
  if (site.length !== 1) throw new Error("Site SharePoint absent ou ambigu.");
  return String(site[0].fields[`${m.sitesClient.name}LookupId`] || "");
}

async function lire({ siteId }) {
  if (!/^\d{1,12}$/.test(String(siteId || ""))) throw new Error("Site natif invalide.");
  const g = await ecriture.contexteGraph();
  const m = await modele(g);
  const clientId = await clientDuSite(g, m, siteId);
  if (!clientId) throw new Error("Client du site indisponible.");
  const enAttente = await items(g, m.etats, ["CODEETATDEMANDECOMPTE"]);
  const codes = new Map(enAttente.map((x) => [String(x.id), x.fields.CODEETATDEMANDECOMPTE]));
  return m.demandes.filter((x) => String(x.fields[`${m.C.site.name}LookupId`] || "") === String(siteId) &&
      String(x.fields[`${m.C.client.name}LookupId`] || "") === clientId &&
      String(x.fields[`${m.C.etat.name}LookupId`] || "") === m.enAttente)
    .sort((a, b) => String(a.fields[m.C.date.name] || "").localeCompare(String(b.fields[m.C.date.name] || "")))
    .map((x) => ({ reference: refDemande(x.id), etat: codes.get(String(x.fields[`${m.C.etat.name}LookupId`])) || "EN-ATTENTE",
      dateDemande: String(x.fields[m.C.date.name] || ""), demandeur: String(x.fields[m.C.id.name] || "Identité Microsoft"),
      siteId: String(x.fields[`${m.C.site.name}LookupId`] || "") }));
}

async function decider({ siteId, reference, decision, responsableId }) {
  if (!/^\d{1,12}$/.test(String(siteId || "")) || !["accepter", "refuser"].includes(decision) ||
      !/^\d{1,12}$/.test(String(responsableId || ""))) throw new Error("Décision de demande invalide.");
  const g = await ecriture.contexteGraph();
  const m = await modele(g);
  const clientId = await clientDuSite(g, m, siteId);
  if (!clientId) throw new Error("Client du site indisponible.");
  const cible = m.demandes.filter((x) => refDemande(x.id) === reference);
  if (cible.length !== 1 || String(cible[0].fields[`${m.C.site.name}LookupId`] || "") !== String(siteId)) {
    throw new Error("Cette demande n’est pas disponible dans ce site.");
  }
  const item = cible[0];
  if (String(item.fields[`${m.C.client.name}LookupId`] || "") !== clientId) {
    throw new Error("Cette demande n’est pas disponible dans ce site.");
  }
  const etatActuel = String(item.fields[`${m.C.etat.name}LookupId`] || "");
  const etatFinal = decision === "accepter" ? m.acceptee : m.refusee;
  if (etatActuel === etatFinal) return { dejaTraitee: true, decision: decision === "accepter" ? "ACCEPTÉE" : "REFUSÉE" };
  if (etatActuel !== m.enAttente) throw new Error("Cette demande a déjà été traitée.");
  const actifId = String(item.fields[`${m.C.actif.name}LookupId`] || "");
  const valideId = String(item.fields[`${m.C.valide.name}LookupId`] || "");
  if (!actifId || !valideId) throw new Error("État actif/valide de la demande incohérent.");
  const chemin = `/sites/${g.siteGraphId}/lists/${m.demande.id}/items/${encodeURIComponent(item.id)}`;
  const courant = await dse.graphSansCache(g.token, `${chemin}?$expand=fields($select=${m.C.etat.name}LookupId,${m.C.cle.name})`);
  const etag = courant?.eTag || courant?.["@odata.etag"];
  if (!etag || String(courant.fields?.[`${m.C.etat.name}LookupId`]) !== m.enAttente) {
    throw new Error("La demande a changé. Actualisez la page avant de décider.");
  }
  const journalKey = `DEMANDE-COMPTE-DECISION:${ecriture.hash([item.id, etatFinal])}`;
  const avant = { etat: "EN-ATTENTE" };
  const apres = { decision: decision === "accepter" ? "ACCEPTÉE" : "REFUSÉE", droitsAttribues: false };
  const contexte = { siteId: String(siteId), demandeId: String(item.id), responsableId: String(responsableId) };
  const entree = await journal.commencer(g, { cle: journalKey, action: "DEMANDE-COMPTE-DECISION",
    nom: "Décision de demande de compte", domaine: String(siteId), avant, apres, contexte });
  try {
    const date = new Date().toISOString();
    const fields = {
      [`${m.C.etat.name}LookupId`]: etatFinal,
      [m.C.decision.name]: apres.decision,
      [m.C.dateDecision.name]: date,
      [`${m.C.responsable.name}LookupId`]: String(responsableId)
    };
    await dse.graphEcriture(g.token, "PATCH", `${chemin}/fields`, fields, etag);
    const relu = await ecriture.lireItemFrais(g, m.demande.id, item.id, Object.keys(fields));
    if (String(relu[`${m.C.etat.name}LookupId`]) !== etatFinal ||
        relu[m.C.decision.name] !== apres.decision ||
        String(relu[`${m.C.responsable.name}LookupId`]) !== String(responsableId) ||
        !Number.isFinite(Date.parse(relu[m.C.dateDecision.name]))) throw new Error("Relecture de la décision différente.");
    await journal.terminer(g, entree, { statut: "SUCCÈS", avant,
      apres: { ...apres, dateDecision: relu[m.C.dateDecision.name] }, contexte });
    return { dejaTraitee: false, decision: apres.decision, droitsAttribues: false };
  } catch (err) {
    await journal.terminer(g, entree, { statut: "ÉCHEC", anomalie: true, erreur: err.message, avant, apres: null, contexte });
    throw err;
  }
}

module.exports = { lire, decider, _test: { refDemande, champ, lookup } };
