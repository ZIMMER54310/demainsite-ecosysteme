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
  seo: { fonction: "seo", libelle: "Référencement SEO", listes: ["OBJ-SEO"] }
};

/* Resolution serveur de l'unique element du composant rattache au site. */
async function resoudre(g, composant, siteId) {
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
  const lies = items.filter((i) => dse.correspondAuSite(i.fields || {}, colonnes, siteId, listeSite.id));
  if (lies.length === 0) {
    return { indisponible: `${def.libelle} : aucun élément n'est encore rattaché à ce site. Le rattachement doit être complété avant modification.` };
  }
  if (lies.length > 1) {
    return { indisponible: `${def.libelle} : plusieurs éléments sont rattachés à ce site. Modification bloquée pour éviter toute erreur.` };
  }
  const itemId = String(lies[0].id);
  const actuel = ecriture.valeursDe(await ecriture.lireItemFrais(g, liste.id, itemId), champs.map((c) => c.nom));
  return { def, listId: liste.id, itemId, champs, actuel };
}

const formulaire = (r) => ({
  libelle: r.def.libelle,
  champs: r.champs.map((c) => ({ cle: c.cle, libelle: c.libelle, multiligne: c.multiligne, max: c.max, valeur: r.actuel[c.nom] }))
});

async function lire({ composant, siteId }) {
  const g = await ecriture.contexteGraph();
  const r = await resoudre(g, composant, siteId);
  if (r.indisponible) return { disponible: false, raison: r.indisponible, libelle: COMPOSANTS_EDITABLES[composant]?.libelle || null };
  return { disponible: true, ...formulaire(r) };
}

async function preparer({ identite, composant, siteId, siteNom, valeurs }) {
  const g = await ecriture.contexteGraph();
  const r = await resoudre(g, composant, siteId);
  if (r.indisponible) return { status: 409, erreur: r.indisponible };
  const { erreurs, propres } = ecriture.validerValeurs(r.champs, valeurs);
  if (erreurs.length) return { status: 422, erreur: erreurs.join(" "), erreurs };
  const diff = ecriture.differences(r.champs, r.actuel, propres);
  if (!diff.length) return { status: 200, aucunChangement: true, changements: [] };
  const nouveaux = Object.fromEntries(diff.map((d) => [d.nom, d.apres]));
  const avant = Object.fromEntries(diff.map((d) => [d.nom, r.actuel[d.nom]]));
  const { jeton } = ecriture.emettreJeton(identite, {
    type: "modifier", portee: "site", composant, fonction: r.def.fonction, siteId: String(siteId),
    listId: r.listId, itemId: r.itemId, champs: nouveaux, avant: ecriture.hash(avant),
    action: `Cockpit : modification ${r.def.libelle}`,
    nom: `${r.def.libelle} — ${siteNom || "site"}`,
    notes: `Site ${siteId} (${siteNom || "-"}) | Composant ${composant}`
  });
  return { status: 200, jeton, changements: diff.map(({ libelle, avant: a, apres }) => ({ libelle, avant: a, apres })) };
}

module.exports = { COMPOSANTS_EDITABLES, lire, preparer, resoudre };
