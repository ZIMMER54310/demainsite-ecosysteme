"use strict";

const dse = require("./dse");
const ecriture = require("./ecriture");
const droits = require("../auth/droits");
const perimetre = require("./perimetre");
const crypto = require("crypto");
const sel = crypto.randomBytes(32);
const ref = (id) => crypto.createHmac("sha256", sel).update(String(id)).digest("hex");
const autorise = (d) => d.reconnu && d.portee === "tous" && d.niveau === "administration" &&
  d.fonctions.includes("administration") && d.fonctions.includes("sites");

async function contexte(d, domaine, g = null) {
  if (!autorise(d)) return { refus: "Changement de statut réservé à l'administration globale autorisée." };
  const { sites } = await droits.sitesIndex();
  const site = perimetre.groupeParDomaine(perimetre.regrouperSites([...sites.values()]), domaine);
  if (!site || !d.siteIds.includes(String(site.id))) return { refus: "Site indisponible dans votre périmètre." };
  g = g || await ecriture.contexteGraph();
  const liste = dse.trouverListe(g.listes, ["OBJ-SITE-PUBLIC"]);
  const statuts = dse.trouverListe(g.listes, ["OBJ-SITES-STATUT"]);
  if (!liste || !statuts) return { refus: "Structure des statuts indisponible." };
  const cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id);
  const col = cols.find((c) => c.lookup?.listId === statuts.id && !c.lookup.allowMultipleValues);
  if (!col) return { refus: "Relation officielle du statut indisponible." };
  const [f, items, index] = await Promise.all([
    ecriture.lireItemFrais(g, liste.id, site.id),
    ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${statuts.id}/items?$expand=fields&$top=500`),
    droits.sitesIndex()
  ]);
  const disponibles = items.filter((i) => {
    const s = index.statuts.get(String(i.id));
    return s?.actif && s?.valide && s?.code;
  });
  return { g, liste, site, col, f, disponibles, statuts: index.statuts };
}

async function lire(d, domaine) {
  const ctx = await contexte(d, domaine);
  if (ctx.refus) return ctx;
  const actuel = String(ctx.f[`${ctx.col.name}LookupId`] || "");
  return { site: ctx.site.titre, actuel: actuel ? ref(actuel) : null,
    statuts: ctx.disponibles.map((i) => ({ ref: ref(i.id), titre: ctx.statuts.get(String(i.id)).titre })),
    statutActuel: ctx.statuts.get(actuel)?.titre || "Non renseigné" };
}

async function construire(d, params, g) {
  if (!autorise(d)) return { refus: "Changement de statut réservé à l'administration globale autorisée." };
  require("./catalogue-source").viderCache();
  const ctx = await contexte(d, params.domaine, g);
  if (ctx.refus) return ctx;
  const journal = await ecriture.etatStructureJournal(ctx.g);
  if (!journal.disponible) return { refus: journal.raison };
  const statut = ctx.disponibles.find((i) => ref(i.id) === params.statut);
  if (!statut) return { refus: "Statut non disponible ou non validé." };
  const nom = `${ctx.col.name}LookupId`;
  const avant = ctx.f[nom] ?? null;
  if (String(avant) === String(statut.id)) return { aucunChangement: true };
  return {
    op: { type: "modifier", listId: ctx.liste.id, itemId: String(ctx.site.id),
      champs: { [nom]: String(statut.id) }, avantValeurs: { [nom]: avant },
      action: "Cockpit : changement de statut site", nom: ctx.site.titre,
      contexteJournal: { siteId: String(ctx.site.id), clientId: ctx.site.clientId || null } },
    changements: [{ libelle: "Statut du site", avant: ctx.statuts.get(String(avant))?.titre || "Non renseigné",
      apres: ctx.statuts.get(String(statut.id))?.titre }]
  };
}

module.exports = { autorise, lire, construire };
