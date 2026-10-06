"use strict";

const dse = require("./dse");
const ecriture = require("./ecriture");
const { cle } = require("./provisionnement");

const NOM_LISTE = "OBJ-COCKPIT-PROGRESSION";
const ACTION = "CONFIGURATION-PROGRESSION";
const ACTION_VERSION = "REGLAGE-PROGRESSION";
const CHAMPS = {
  libelle: ["LIBELLE", "TITLE"],
  min: ["POURCENTAGEMIN"],
  max: ["POURCENTAGEMAX"],
  couleur: ["COULEUR"],
  ordre: ["ORDRE"],
  actif: ["ACTIF"],
  description: ["DESCRIPTION"]
};

function colonnesConfiguration(colonnes) {
  const metier = colonnes.filter((c) => !c.name.startsWith("_") && !c.readOnly);
  return Object.fromEntries(Object.entries(CHAMPS).map(([champ, noms]) => [
    champ, metier.find((c) => noms.includes(cle(c.name))) ||
      metier.find((c) => noms.includes(cle(c.displayName)))
  ]));
}

function structureExacte(colonnes) {
  const c = colonnesConfiguration(colonnes);
  return Boolean(c.libelle?.text && c.min?.number && c.max?.number && c.couleur?.text &&
    c.ordre?.number && c.actif?.boolean);
}

async function trouverConfiguration(g, inspecterToutes = false) {
  const nommee = dse.trouverListe(g.listes, [NOM_LISTE]);
  if (nommee && !inspecterToutes) return nommee;
  const candidates = [];
  for (let i = 0; i < g.listes.length; i += 8) {
    await Promise.all(g.listes.slice(i, i + 8).map(async (liste) => {
      const colonnes = await dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id);
      if (structureExacte(colonnes)) candidates.push(liste);
    }));
  }
  if (candidates.length > 1) throw new Error("Plusieurs configurations de progression existent : choisir la liste officielle avant de continuer.");
  return candidates[0] || nommee || null;
}

function reglesDepuis(items, colonnes) {
  const c = colonnesConfiguration(colonnes);
  if (!structureExacte(colonnes)) throw new Error("La structure de la configuration de progression est incomplète.");
  const regles = [];
  const nombre = (v) => typeof v === "number" && Number.isFinite(v);
  for (const item of items) {
    const f = item.fields || {};
    if (f[c.actif.name] !== true) {
      if (f[c.actif.name] != null && f[c.actif.name] !== false) throw new Error("Le champ ACTIF doit être un booléen SharePoint.");
      continue;
    }
    const r = {
      id: String(item.id), libelle: String(f[c.libelle.name] || "").trim(),
      min: f[c.min.name], max: f[c.max.name], ordre: f[c.ordre.name],
      couleur: String(f[c.couleur.name] || "").trim(),
      description: c.description ? String(f[c.description.name] || "").trim() : ""
    };
    if (!r.libelle || !nombre(r.min) || !nombre(r.max) || !nombre(r.ordre) ||
      r.min < 0 || r.max > 100 || r.min > r.max || !/^#[0-9a-f]{6}$/i.test(r.couleur)) {
      throw new Error(`Réglage de progression invalide (élément SharePoint ${r.id}). Vérifier les bornes, l'ordre, le libellé et la couleur #RRGGBB.`);
    }
    regles.push(r);
  }
  return regles.sort((a, b) => a.ordre - b.ordre || a.id.localeCompare(b.id, "en", { numeric: true }));
}

async function journaliserConfiguration(g, liste, colonnes, items) {
  return { desactive: true };
}

async function lire() {
  try {
    const g = await ecriture.contexteGraph();
    const liste = await trouverConfiguration(g);
    if (!liste) return { etat: "absente", regles: [], message: "La liste SharePoint de configuration de progression est absente." };
    const [colonnes, items] = await Promise.all([
      dse.chargerColonnesListe(g.token, g.siteGraphId, liste.id),
      ecriture.collecterFrais(g, `/sites/${g.siteGraphId}/lists/${liste.id}/items?$expand=fields&$top=500`)
    ]);
    const avertissement = null;
    const regles = reglesDepuis(items, colonnes);
    return { etat: regles.length ? "configuree" : "vide", regles,
      message: regles.length ? null : "Les couleurs de progression sont à configurer dans SharePoint.", avertissement };
  } catch (e) {
    console.error("[DSE progression] configuration", e.message);
    return { etat: "erreur", regles: [],
      message: "Configuration visuelle de progression indisponible ou invalide dans SharePoint. Contactez votre administrateur." };
  }
}

function pourcentage(configuration, valeur) {
  const r = configuration.regles.find((regle) => Number.isFinite(valeur) && valeur >= regle.min && valeur <= regle.max);
  return {
    etat: configuration.etat,
    couleur: r?.couleur || null, libelle: r?.libelle || null, description: r?.description || null,
    message: configuration.message || (!r ? "Aucune plage SharePoint active ne correspond à cette progression." : null),
    avertissement: configuration.avertissement || null
  };
}

function tranches(configuration) {
  return configuration.regles.map((r) => ({ valeur: r.id, libelle: r.libelle, min: r.min, max: r.max }));
}

module.exports = { NOM_LISTE, ACTION, ACTION_VERSION, CHAMPS, colonnesConfiguration, structureExacte, trouverConfiguration,
  reglesDepuis, journaliserConfiguration, lire, pourcentage, tranches };
