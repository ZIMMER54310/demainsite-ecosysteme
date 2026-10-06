"use strict";

const A = require("../auth/autorisations");
const dse = require("./dse");
const ecriture = require("./ecriture");
const experience = require("./experience-cockpit");

async function construire({ d, donnees, siteId, operation, motif }) {
  const refus = (message) => ({ refus: message });
  if (!d.reconnu || !d.utilisateurId || !d.siteIds.includes(String(siteId)) || !d.autorisations?.actif) {
    return refus("Une affectation valide à ce site est nécessaire pour demander un accès.");
  }
  const decision = d.autorisations.decisions?.find((x) => x.operation === operation);
  if (!decision || decision.autorise || !decision.demandable) return refus(
    decision?.message || "Cette action ne peut pas faire l'objet d'une demande d'accès.");
  const data = donnees.dynamique;
  const op = data.operations.find((o) => o.operation === operation);
  const relations = data.affectations.filter((a) => a.actif && a.utilisateurId === d.utilisateurId &&
    d.autorisations.affectations.some((r) => r.id === a.id));
  if (relations.length !== 1) return refus("Plusieurs affectations s'appliquent : votre interlocuteur doit préciser le contexte de cette demande.");
  const relation = relations[0];
  const site = data.source["OBJ-SITE-PUBLIC"].items.find((s) => s.id === String(siteId));
  const clientId = A.valeur(data.source["OBJ-SITE-PUBLIC"], site, "OBJ-CLIENT", data.source["OBJ-CLIENT"]);
  if (!clientId || !d.clientIds.includes(String(clientId))) return refus("Le contexte client de la demande doit être vérifié.");
  if (typeof motif !== "string" || !motif.trim() || motif.trim().length > 4000 ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(motif)) return refus("Précisez votre besoin en 1 à 4 000 caractères.");
  const g = await ecriture.contexteGraph();
  const liste = await experience.lireListe(g, "OBJ-DEMANDE-ACCES");
  if (!liste) return refus("Le service de demandes d'accès n'est pas encore configuré. Contactez votre interlocuteur.");
  const correspondances = [
    ["OBJ-UTILISATEUR", d.utilisateurId], ["OBJ-UTILISATEUR-SITE", relation.id],
    ["OBJ-CLIENT", String(clientId)], ["OBJ-SITE-PUBLIC", String(siteId)],
    ["OBJ-CAPACITE", op.capaciteId], ["OBJ-ACTION", op.actionId], ["OBJ-PERIMETRE-TYPE", relation.typeId]
  ];
  const champs = {};
  for (const [nom, id] of correspondances) {
    const col = experience.champ(liste, nom, "lookup");
    const cible = data.source[nom];
    if (!id || !cible || col.lookup.allowMultipleValues || col.lookup.listId.toLowerCase() !== cible.id.toLowerCase() ||
      !cible.items.some((i) => i.id === String(id))) throw new Error("Relation native de demande incoherente.");
    champs[`${col.name}LookupId`] = String(id);
  }
  const cle = ecriture.hash([d.utilisateurId, siteId, op.capaciteId, op.actionId]);
  const cCle = experience.champ(liste, "CLE-IDEMPOTENCE", "text").name;
  const cTraitee = experience.champ(liste, "TRAITEE", "boolean").name;
  const precedent = liste.items.find((i) => i.fields[cCle] === cle);
  if (precedent) return refus(precedent.fields[cTraitee] === true
    ? "Une demande pour cette action a déjà été traitée. Contactez votre interlocuteur pour son suivi."
    : "Votre demande pour cette action est déjà enregistrée. Aucune seconde demande n'est nécessaire.");
  Object.assign(champs, { Title: `${op.libelle || op.fonction} — ${data.actions.find((a) => a.id === op.actionId)?.titre || ""}`.slice(0, 255),
    [experience.champ(liste, "OPERATION-TECHNIQUE", "text").name]: operation,
    [experience.champ(liste, "MOTIF", "text").name]: motif.trim(), [cCle]: cle, [cTraitee]: false });
  return {
    op: { type: "ajouter", portee: "demande", siteId: String(siteId), operationDemandee: operation, motif: motif.trim(),
      listId: liste.id, champs, selectionChamps: Object.keys(champs), cleDoublon: cle, journalComptes: true,
      action: "DEMANDE-ACCES", nom: "Demande d'accès", avant: ecriture.hash({}),
      contexteJournal: { utilisateurId: d.utilisateurId, siteId: String(siteId), clientId: String(clientId),
        affectationId: relation.id, perimetreTypeId: relation.typeId, capaciteId: op.capaciteId, actionId: op.actionId },
      verifierCible: async (frais) => {
        const xs = await ecriture.collecterFrais(frais,
          `/sites/${frais.siteGraphId}/lists/${liste.id}/items?$expand=fields($select=${cCle})&$top=200`);
        return xs.some((i) => i.fields[cCle] === cle) ? "Cette demande est déjà enregistrée." : null;
      }
    },
    apercu: { site: site.fields.Title, client: data.source["OBJ-CLIENT"].items.find((i) => i.id === String(clientId))?.fields.Title,
      fonction: op.libelle || op.fonction, action: data.actions.find((a) => a.id === op.actionId)?.titre,
      perimetre: data.types.find((t) => t.id === relation.typeId)?.titre, motif: motif.trim(),
      actuelle: decision.message, nouvelle: "Enregistrer une demande, sans attribuer de droit." }
  };
}

async function preparer(params, identite) {
  const plan = await construire(params);
  if (plan.refus) return { status: 409, erreur: plan.refus };
  return { jeton: ecriture.emettreJeton(identite, plan.op).jeton, apercu: plan.apercu };
}

module.exports = { construire, preparer };
