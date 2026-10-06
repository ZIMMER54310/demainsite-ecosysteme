"use strict";

const R = require("./builder-recursif");
const ecriture = require("./ecriture");

const LISTE = "OBJ-BUILDER-ELEMENT";
const VALEURS = "OBJ-BUILDER-VALEUR";

async function executer({ d, w, p, action, siteId, reference, autoriser, mediaAutorise }) {
  const idx = R.index(d);
  const resoudre = (r, collection, sorte) => [...collection.values()].find((x) => reference(x.id, sorte) === r);
  const cible = (r) => {
    const el = resoudre(r, idx.elements, "element");
    const root = el && R.racineDe(d, el);
    if (!root || R.lien(root, "OBJ-SITE-PUBLIC") !== String(siteId)) return null;
    const type = Object.keys(R.CIBLES).find((t) => R.lien(root, R.CIBLES[t]));
    if (!type || !autoriser(type, R.lien(root, R.CIBLES[type]))) return null;
    let courant = el;
    while (courant) {
      if (R.f(courant, "VERROUILLE") === true) return null;
      courant = idx.elements.get(R.lien(courant, "ELEMENT-PARENT"));
    }
    return { el, root };
  };
  const nSimple = async (liste, nom) => {
    const n = await w.simple(liste, nom);
    if (!n) throw new Error(`Colonne ${liste} · ${nom} requise.`);
    return n;
  };
  const nLien = async (liste, nom, dest = nom) => {
    const n = await w.lookup(liste, nom, dest);
    if (!n) throw new Error(`Lookup ${liste} · ${nom} requis.`);
    return n;
  };
  const verifier = async (liste, id, champs) => {
    const f = await ecriture.lireItemFrais(w.g, w.liste(liste).id, id);
    if (!Object.entries(champs).every(([k, v]) => (v === null ? f[k] == null || f[k] === "" : String(f[k]) === String(v)))) {
      throw new Error("Relecture Builder non conforme. Relisez avant de recommencer.");
    }
  };
  const maj = async (liste, id, champs) => { await w.maj(liste, id, champs); await verifier(liste, id, champs); };
  const creer = async (liste, champs) => { const id = await w.creer(liste, champs); await verifier(liste, id, champs); return id; };
  const message = (texte, id) => ({ message: texte, nouveau: id ? { ref: reference(id, "element") } : {} });

  if (action === "builder.initialiser") {
    const type = String(p.type || "");
    if (!R.CIBLES[type] || !autoriser(type, String(p.id || ""))) return { refus: "Conteneur hors périmètre." };
    const existing = R.trouverRacine(d, siteId, type, p.id);
    if (existing) return message("La racine existe déjà.", existing.id);
    const definition = resoudre(p.typeRef, idx.types, "type");
    if (!definition || R.f(definition, "EST-RACINE") !== true || R.f(definition, "EST-CONTENEUR") !== true) {
      return { refus: "Type de racine actif non configuré dans SharePoint." };
    }
    const champs = { Title: String(p.titre || "").trim().slice(0, 255),
      [await nLien(LISTE, "OBJ-SITE-PUBLIC")]: String(siteId),
      [await nLien(LISTE, "OBJ-BUILDER-TYPE")]: definition.id,
      [await nLien(LISTE, R.CIBLES[type])]: String(p.id),
      [await nSimple(LISTE, "ACTIF")]: true, [await nSimple(LISTE, "VALIDE")]: false,
      [await nSimple(LISTE, "VISIBLE")]: true };
    const id = await creer(LISTE, champs);
    await maj(LISTE, id, { [await nLien(LISTE, "ELEMENT-RACINE", LISTE)]: id });
    return message("Racine Builder créée en brouillon.", id);
  }

  const c = cible(p.ref);
  if (!c) return { refus: "Élément absent, verrouillé ou hors périmètre." };
  if (action === "builder.publier") {
    if (c.el.id !== c.root.id) return { refus: "La publication doit cibler la racine." };
    const ordre = [];
    const visiter = (el) => {
      if (!cible(reference(el.id, "element"))) throw new Error("Sous-arbre verrouillé ou hors périmètre.");
      const typeId = R.lien(el, "OBJ-BUILDER-TYPE");
      if (!idx.types.has(typeId)) throw new Error("Type Builder indisponible.");
      const enfants = R.enfantsDe(d, el).filter(R.actif);
      for (const enfant of enfants) {
        const erreur = R.verifierInsertion(d, el, R.lien(enfant, "OBJ-BUILDER-TYPE"), enfant);
        if (erreur) throw new Error(erreur);
        visiter(enfant);
      }
      for (const regle of (d.builderRegles || []).filter((r) => R.actif(r) && R.f(r, "AUTORISE") === true &&
        R.lien(r, "TYPE-PARENT") === typeId)) {
        const nombre = enfants.filter((x) => R.lien(x, "OBJ-BUILDER-TYPE") === R.lien(regle, "TYPE-ENFANT")).length;
        if (nombre < Number(R.f(regle, "MINIMUM") || 0)) throw new Error("Nombre minimal d'enfants requis par SharePoint.");
      }
      for (const def of R.champsDe(d, typeId)) {
        const valeur = R.valeurDe(d, el.id, def);
        if (R.f(def, "OBLIGATOIRE") === true && (valeur === null || valeur === "")) throw new Error("Valeur obligatoire manquante.");
      }
      ordre.push(el);
    };
    visiter(c.root);
    R.arbre(d, c.root, { mediaVisible: mediaAutorise });
    const valide = await nSimple(LISTE, "VALIDE");
    for (const el of ordre) await maj(LISTE, el.id, { [valide]: true });
    return message("Composition Builder validée et relue.");
  }
  if (action === "builder.ajouter") {
    const type = resoudre(p.typeRef, idx.types, "type");
    const erreur = type ? R.verifierInsertion(d, c.el, type.id) : "Type introuvable.";
    if (erreur) return { refus: erreur };
    const enfants = R.enfantsDe(d, c.el);
    const champs = { Title: String(p.titre || R.titre(type)).slice(0, 255),
      [await nLien(LISTE, "OBJ-SITE-PUBLIC")]: String(siteId),
      [await nLien(LISTE, "OBJ-BUILDER-TYPE")]: type.id,
      [await nLien(LISTE, "ELEMENT-PARENT", LISTE)]: c.el.id,
      [await nLien(LISTE, "ELEMENT-RACINE", LISTE)]: c.root.id,
      [await nSimple(LISTE, "ACTIF")]: true, [await nSimple(LISTE, "VALIDE")]: false,
      [await nSimple(LISTE, "VISIBLE")]: true, [await nSimple(LISTE, "ORDRE")]: (enfants.length + 1) * 10 };
    return message("Élément ajouté en brouillon.", await creer(LISTE, champs));
  }
  if (action === "builder.deplacer") {
    const dest = cible(p.parent);
    if (!dest || dest.root.id !== c.root.id) return { refus: "Destination hors de cette racine." };
    if (R.lien(c.el, "ELEMENT-PARENT") !== dest.el.id) {
      const retrait = R.verifierRetrait(d, c.el);
      if (retrait) return { refus: retrait };
    }
    const erreur = R.verifierInsertion(d, dest.el, R.lien(c.el, "OBJ-BUILDER-TYPE"), c.el);
    if (erreur) return { refus: erreur };
    const freres = R.enfantsDe(d, dest.el).filter((x) => x.id !== c.el.id);
    const position = p.avant ? freres.findIndex((x) => reference(x.id, "element") === p.avant) : freres.length;
    if (position < 0) return { refus: "Position de destination inconnue." };
    freres.splice(position, 0, c.el);
    await maj(LISTE, c.el.id, { [await nLien(LISTE, "ELEMENT-PARENT", LISTE)]: dest.el.id });
    const ordre = await nSimple(LISTE, "ORDRE");
    for (const [i, el] of freres.entries()) await maj(LISTE, el.id, { [ordre]: (i + 1) * 10 });
    return message("Élément déplacé et relu.");
  }
  if (action === "builder.desactiver") {
    const erreur = R.verifierRetrait(d, c.el);
    if (erreur) return { refus: erreur };
    await maj(LISTE, c.el.id, { [await nSimple(LISTE, "ACTIF")]: false });
    return message("Élément retiré logiquement ; aucune donnée supprimée.");
  }
  if (action === "builder.enregistrer") {
    const appareil = p.appareil ?? "";
    if (appareil !== "" && !R.APPAREILS.includes(appareil)) return { refus: "Appareil Builder invalide." };
    const nAppareil = await nSimple(VALEURS, "APPAREIL");
    if (!p.valeurs || typeof p.valeurs !== "object" || Array.isArray(p.valeurs)) return { refus: "Valeurs invalides." };
    if (p.surcharges !== undefined && (!p.surcharges || typeof p.surcharges !== "object" || Array.isArray(p.surcharges))) return { refus: "Surcharges invalides." };
    const lots = [[appareil, p.valeurs], ...Object.entries(p.surcharges || {})];
    if (new Set(lots.map(([a]) => a)).size !== lots.length) return { refus: "Appareil fourni plusieurs fois." };
    if (lots.some(([a, valeurs]) => (a !== "" && !R.APPAREILS.includes(a)) ||
      !valeurs || typeof valeurs !== "object" || Array.isArray(valeurs))) return { refus: "Surcharges invalides." };
    const definitions = R.champsDe(d, R.lien(c.el, "OBJ-BUILDER-TYPE"));
    const champs = new Map(definitions.map((x) => [reference(x.id, "champ"), x]));
    const operations = [];
    for (const [appareil, valeurs] of lots) for (const [refChamp, brut] of Object.entries(valeurs)) {
      const def = champs.get(refChamp);
      if (!def) return { refus: "Champ inconnu pour ce type." };
      const nature = String(R.f(def, "TYPE-DONNEE") || "").toUpperCase();
      if (!R.TYPES_VALEUR.has(nature)) return { refus: "Nature de champ non prise en charge." };
      const vide = brut === "" || brut === null;
      if (R.f(def, "OBLIGATOIRE") === true && vide && !appareil) return { refus: "Valeur obligatoire manquante." };
      let valeur = brut;
      if (!vide && nature === "NOMBRE") {
        if (!["string", "number"].includes(typeof brut) || !Number.isFinite(Number(brut))) return { refus: "Nombre invalide." };
        valeur = Number(brut);
      } else if (!vide && nature === "BOOLEEN") {
        if (typeof brut !== "boolean") return { refus: "Booléen invalide." };
      } else if (!vide && nature === "MEDIA") {
        const m = (d.medias || []).find((x) => reference(x.id, "media") === brut && mediaAutorise(x));
        if (!m) return { refus: "Média hors périmètre." };
        valeur = m.id;
      } else if (!vide && (typeof brut !== "string" || brut.length > 10000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(brut))) {
        return { refus: "Texte invalide." };
      }
      const nom = nature === "MEDIA" ? await nLien(VALEURS, "OBJ-MEDIA") :
        await nSimple(VALEURS, { TEXTE: "VALEUR-TEXTE", NOMBRE: "VALEUR-NOMBRE", BOOLEEN: "VALEUR-BOOLEENNE" }[nature]);
      if (!vide && nature === "TEXTE") {
        const col = (await w.cols(VALEURS)).find((x) => x.name === nom);
        if (col?.text?.maxLength && brut.length > col.text.maxLength) return { refus: "Texte trop long pour la colonne SharePoint." };
      }
      const existantes = (d.builderValeurs || []).filter((x) => R.actif(x) &&
        R.lien(x, "OBJ-BUILDER-ELEMENT") === c.el.id && R.lien(x, "OBJ-BUILDER-CHAMP") === def.id &&
        R.appareilDe(x) === appareil);
      if (existantes.length > 1) return { refus: "Valeurs actives dupliquées ; corrigez SharePoint." };
      operations.push({ def, nom, appareil, valeur: vide ? null : valeur, existante: existantes[0] });
    }
    for (const op of operations) {
      if (op.existante) await maj(VALEURS, op.existante.id, { [op.nom]: op.valeur });
      else if (op.valeur !== null) await creer(VALEURS, { Title: R.titre(op.def),
        [await nLien(VALEURS, "OBJ-BUILDER-ELEMENT", LISTE)]: c.el.id,
        [await nLien(VALEURS, "OBJ-BUILDER-CHAMP")]: op.def.id, [await nSimple(VALEURS, "ACTIF")]: true,
        [nAppareil]: op.appareil || null, [op.nom]: op.valeur });
    }
    return message("Valeurs Builder enregistrées et relues.");
  }
  return { refus: "Action Builder non disponible." };
}

module.exports = { executer };
