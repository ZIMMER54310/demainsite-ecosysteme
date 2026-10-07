"use strict";

const dse = require("./dse");
const ecriture = require("./ecriture");
const catalogue = require("./catalogue");

const cle = catalogue.cleChamp;

function trouverListe(listes, nom) {
  const correspondantes = listes.filter((l) => l.displayName === nom);
  if (correspondantes.length !== 1) throw new Error(`Liste SharePoint unique requise : ${nom}.`);
  return correspondantes[0];
}

function trouverColonne(colonnes, noms, type) {
  const nomsNormalises = new Set(noms.map(cle));
  const candidates = colonnes.filter((c) => !c.hidden &&
    nomsNormalises.has(cle(c.displayName || c.name)) && (!type || c[type]));
  if (candidates.length !== 1) {
    throw new Error(`Colonne SharePoint unique requise : ${noms[0]}.`);
  }
  return candidates[0];
}

function resoudreUsage(referentiels, id) {
  return (referentiels.usages || []).find((usage) => String(usage.id) === String(id));
}

function referenceUsage(listeId, itemId) {
  return ecriture.hash([listeId, String(itemId)]).slice(0, 24);
}

function dateEffetValide(dateEffet) {
  if (typeof dateEffet !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateEffet)) return false;
  const date = new Date(`${dateEffet}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === dateEffet;
}

const operationAutorisee = (droits, operation) =>
  require("../auth/autorisations").autoriser(droits?.autorisations, operation).autorise;

function refuserSiHorsPortee(droits, siteId, operation) {
  if (!droits?.reconnu || !droits.siteIds?.includes(String(siteId))) {
    return "Ce site n'est pas disponible dans votre périmètre.";
  }
  if (!operationAutorisee(droits, operation)) {
    return `L'opération ${operation} n'est pas autorisée pour ce site.`;
  }
  return null;
}

async function chargerUsagesSite({ droits, siteId }) {
  const refusPortee = !droits?.reconnu || !droits.siteIds?.includes(String(siteId))
    ? "Ce site n'est pas disponible dans votre périmètre." : null;
  if (refusPortee) return { status: 403, erreur: refusPortee };
  const peutVoir = operationAutorisee(droits, "usage-site.voir");
  const peutCreer = operationAutorisee(droits, "usage-site.creer");
  if (!peutVoir && !peutCreer) {
    return { status: 403, erreur: "Aucune opération usage-site n'est autorisée pour ce site." };
  }

  const [g, referentiels] = await Promise.all([
    ecriture.contexteGraph(),
    peutCreer ? require("./commerce-source").chargerReferentielsCreation() : null
  ]);
  const siteListe = trouverListe(g.listes, "OBJ-SITE-PUBLIC");
  const usagesListe = trouverListe(g.listes, "OBJ-SITE-USAGE");
  const refListe = trouverListe(g.listes, "OBJ-USAGE-SITE");
  const [site, colonnes, relations, refsConsultables] = await Promise.all([
    ecriture.lireItemFrais(g, siteListe.id, siteId),
    dse.chargerColonnesListe(g.token, g.siteGraphId, usagesListe.id),
    peutVoir ? ecriture.collecterFrais(g,
      `/sites/${g.siteGraphId}/lists/${usagesListe.id}/items?$expand=fields&$top=500`) : [],
    peutVoir && !peutCreer ? ecriture.collecterFrais(g,
      `/sites/${g.siteGraphId}/lists/${refListe.id}/items?$expand=fields&$top=500`) : []
  ]);
  if (!site?.Title) return { status: 404, erreur: "Le site SharePoint demandé est introuvable." };

  const siteLookup = trouverColonne(colonnes, ["OBJ-SITE-PUBLIC"], "lookup");
  const usageLookup = trouverColonne(colonnes, ["OBJ-USAGE-SITE"], "lookup");
  const dateCol = trouverColonne(colonnes, ["DATE-EFFET"], "dateTime");
  if (siteLookup.lookup.allowMultipleValues ||
      siteLookup.lookup.listId.toLowerCase() !== siteListe.id.toLowerCase()) {
    throw new Error("Le Lookup OBJ-SITE-PUBLIC d'OBJ-SITE-USAGE est incohérent.");
  }
  if (peutCreer && (usageLookup.lookup.allowMultipleValues ||
      usageLookup.lookup.listId.toLowerCase() !== refListe.id.toLowerCase())) {
    throw new Error("Le Lookup OBJ-USAGE-SITE d'OBJ-SITE-USAGE est incohérent.");
  }

  const titresUsages = new Map((peutCreer
    ? referentiels.usages.map((usage) => ({ id: usage.id, titre: usage.titre }))
    : refsConsultables.map((usage) => ({ id: usage.id, titre: String(usage.fields?.Title || "") })))
    .map((usage) => [String(usage.id), usage.titre]));
  const existants = relations.filter((item) =>
    String(item.fields?.[`${siteLookup.name}LookupId`] || "") === String(siteId)).map((item) => ({
    titre: String(item.fields?.Title || ""),
    usage: peutVoir ? titresUsages.get(String(item.fields?.[`${usageLookup.name}LookupId`] || "")) || "Usage indisponible" : null,
    dateEffet: peutVoir ? String(item.fields?.[dateCol.name] || "") : null
  }));
  return {
    site: String(site.Title),
    usages: existants,
    choix: (referentiels?.usages || []).map((usage) => ({
      reference: referenceUsage(refListe.id, usage.id),
      titre: usage.titre
    })),
    autorisations: { voir: peutVoir, creer: peutCreer }
  };
}

async function construireAjoutUsage({ droits, siteId, usageReference: reference, dateEffet }) {
  const refusPortee = refuserSiHorsPortee(droits, siteId, "usage-site.creer");
  if (refusPortee) return { status: 403, erreur: refusPortee };
  if (!dateEffetValide(dateEffet)) {
    return { status: 400, erreur: "Une date d'effet valide est requise." };
  }

  const [g, referentiels] = await Promise.all([
    ecriture.contexteGraph(),
    require("./commerce-source").chargerReferentielsCreation()
  ]);
  const siteListe = trouverListe(g.listes, "OBJ-SITE-PUBLIC");
  const usagesListe = trouverListe(g.listes, "OBJ-SITE-USAGE");
  const referentielUsages = trouverListe(g.listes, "OBJ-USAGE-SITE");
  const [colonnes, site, relations] = await Promise.all([
    dse.chargerColonnesListe(g.token, g.siteGraphId, usagesListe.id, { contraintes: true }),
    ecriture.lireItemFrais(g, siteListe.id, siteId),
    ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${usagesListe.id}/items?$expand=fields&$top=500`)
  ]);
  if (!site?.Title) return { status: 404, erreur: "Le site SharePoint demandé est introuvable." };
  const usage = (referentiels.usages || []).find((item) =>
    referenceUsage(referentielUsages.id, item.id) === String(reference || ""));
  if (!usage) return { status: 409, erreur: "Cet usage n'est plus disponible dans SharePoint." };

  const siteLookup = trouverColonne(colonnes, ["OBJ-SITE-PUBLIC"], "lookup");
  const usageLookup = trouverColonne(colonnes, ["OBJ-USAGE-SITE"], "lookup");
  const dateCol = trouverColonne(colonnes, ["DATE-EFFET"], "dateTime");
  const empreinteCol = trouverColonne(colonnes, ["EMPREINTE-SITE-USAGE"], "text");
  if (siteLookup.lookup.allowMultipleValues ||
      siteLookup.lookup.listId.toLowerCase() !== siteListe.id.toLowerCase() ||
      usageLookup.lookup.allowMultipleValues ||
      usageLookup.lookup.listId.toLowerCase() !== referentielUsages.id.toLowerCase()) {
    throw new Error("Les Lookups natifs d'OBJ-SITE-USAGE ne correspondent pas aux listes attendues.");
  }

  const empreinte = ecriture.hash(["OBJ-SITE-USAGE", String(siteId), String(usage.id)]);
  const doublon = async (graph) => {
    const existants = await ecriture.collecterFrais(graph,
      `/sites/${graph.siteGraphId}/lists/${usagesListe.id}/items?$expand=fields&$top=500`);
    return existants.some((item) => {
      const f = item.fields || {};
      return String(f[`${siteLookup.name}LookupId`] || "") === String(siteId) &&
        String(f[`${usageLookup.name}LookupId`] || "") === String(usage.id);
    });
  };
  if (await doublon(g)) return { status: 409, erreur: "Cet usage est déjà rattaché à ce site." };

  const champs = {
    Title: `${site.Title} — ${usage.titre}`.slice(0, 255),
    [`${siteLookup.name}LookupId`]: String(siteId),
    [`${usageLookup.name}LookupId`]: String(usage.id),
    [dateCol.name]: `${dateEffet}T00:00:00Z`,
    [empreinteCol.name]: empreinte
  };
  const nonRenseignes = colonnes.filter((c) => c.required && !c.readOnly && !c.hidden)
    .filter((c) => !Object.hasOwn(champs, c.name) &&
      !(c.lookup && Object.hasOwn(champs, `${c.name}LookupId`)));
  if (nonRenseignes.length) {
    return { status: 409, erreur: `Configuration incomplète : champ obligatoire ${nonRenseignes[0].displayName || nonRenseignes[0].name}.` };
  }

  const clientId = droits.clientIds?.length === 1 ? String(droits.clientIds[0]) : null;
  const operation = {
    type: "ajouter",
    portee: "site",
    siteId: String(siteId),
    fonction: "usage-site",
    operation: "usage-site.creer",
    listId: usagesListe.id,
    champs,
    selectionChamps: Object.keys(champs),
    action: "usage-site.creer",
    nom: "Rattachement d'un usage à un site",
    avant: ecriture.hash({}),
    journalComptes: true,
    cleDoublon: empreinte,
    contexteJournal: { utilisateurId: droits.utilisateurId, clientId, siteId: String(siteId),
      usageId: String(usage.id), dateEffet },
    doublon
  };
  return {
    operation,
    apercu: {
      contexte: { site: String(site.Title), client: clientId },
      changements: [
        { libelle: "Usage", avant: "Non rattaché", apres: usage.titre },
        { libelle: "Date d'effet", avant: "—", apres: dateEffet }
      ],
      impact: "Ajout d'une relation OBJ-SITE-USAGE. Aucun coût n'est déterminé par cette relation."
    }
  };
}

async function preparerAjoutUsage({ identite, droits, siteId, usageReference: reference, dateEffet }) {
  const plan = await construireAjoutUsage({ droits, siteId, usageReference: reference, dateEffet });
  if (plan.erreur) return plan;
  const { jeton } = ecriture.emettreJeton(identite, plan.operation);
  return { jeton, apercu: plan.apercu };
}

async function revaliderAjoutUsage({ op, droits }) {
  if (op?.operation !== "usage-site.creer" || op.type !== "ajouter") {
    return "Type d'opération usage-site non pris en charge.";
  }
  const refListe = trouverListe((await ecriture.contexteGraph()).listes, "OBJ-USAGE-SITE");
  const ref = referenceUsage(refListe.id, op.contexteJournal?.usageId);
  const plan = await construireAjoutUsage({
    droits, siteId: op.siteId, usageReference: ref, dateEffet: op.contexteJournal?.dateEffet
  });
  if (plan.erreur) return plan.erreur;
  if (plan.operation.listId !== op.listId ||
      ecriture.hash(plan.operation.champs) !== ecriture.hash(op.champs)) {
    return "Le site, l'usage ou la configuration a changé depuis l'aperçu.";
  }
  return null;
}

module.exports = { chargerUsagesSite, preparerAjoutUsage, revaliderAjoutUsage,
  _test: { trouverListe, trouverColonne, resoudreUsage, referenceUsage, dateEffetValide, operationAutorisee, refuserSiHorsPortee } };
