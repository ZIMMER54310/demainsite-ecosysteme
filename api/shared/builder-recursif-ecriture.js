"use strict";

const R = require("./builder-recursif");
const ecriture = require("./ecriture");

const LISTE = "OBJ-BUILDER-ELEMENT";
const VALEURS = "OBJ-BUILDER-VALEUR";

async function executer({ d, w, p, action, siteId, reference, autoriser, mediaAutorise, dupliquerRacine }) {
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
      if (courant.id !== el.id && !R.actif(courant)) return null;
      courant = idx.elements.get(R.lien(courant, "ELEMENT-PARENT"));
    }
    return { el, root };
  };
  const nSimple = async (liste, nom) => {
    const n = await w.simple(liste, nom);
    if (!n) throw Object.assign(new Error(`Colonne ${liste} · ${nom} requise.`), { refus: true });
    return n;
  };
  const nLien = async (liste, nom, dest = nom) => {
    const n = await w.lookup(liste, nom, dest);
    if (!n) throw Object.assign(new Error(`Lookup ${liste} · ${nom} requis.`), { refus: true });
    return n;
  };
  const verifier = async (liste, id, champs) => {
    if (w.apercu) return;
    const f = await ecriture.lireItemFrais(w.g, w.liste(liste).id, id, Object.keys(champs));
    if (!Object.entries(champs).every(([k, v]) => (v === null ? f[k] == null || f[k] === "" : String(f[k]) === String(v)))) {
      throw new Error("Relecture Builder non conforme. Relisez avant de recommencer.");
    }
  };
  const maj = async (liste, id, champs) => { await w.maj(liste, id, champs); await verifier(liste, id, champs); };
  const creer = async (liste, champs) => { const id = await w.creer(liste, champs); await verifier(liste, id, champs); return id; };
  const message = (texte, id) => ({ message: texte, nouveau: id ? { ref: reference(id, "element") } : {} });
  const placement = (parent, retirer = null) => {
    const freres = R.enfantsDe(d, parent).filter((x) => R.actif(x) && x.id !== retirer?.id);
    if (p.avant && p.apres) throw new Error("Une seule position avant ou après est autorisée.");
    let position = freres.length;
    if (p.avant || p.apres) {
      const i = freres.findIndex((x) => reference(x.id, "element") === (p.avant || p.apres));
      if (i < 0) throw new Error("Position de destination inconnue.");
      position = i + (p.apres ? 1 : 0);
    }
    for (const [i, el] of freres.entries()) if (R.f(el, "VERROUILLE") === true &&
      Number(R.f(el, "ORDRE")) !== (i + (i >= position ? 1 : 0) + 1) * 10) {
      throw Object.assign(new Error("Un frère à réordonner est verrouillé."), { refus: true });
    }
    return { freres, position };
  };
  const reordonner = async (freres) => {
    const ordre = await nSimple(LISTE, "ORDRE");
    for (const [i, el] of freres.entries()) if (Number(R.f(el, "ORDRE")) !== (i + 1) * 10) {
      if (R.f(el, "VERROUILLE") === true) throw new Error("Un frère à réordonner est verrouillé.");
      await maj(LISTE, el.id, { [ordre]: (i + 1) * 10 });
    }
  };
  const validerSousArbre = (el) => {
    const elements = R.sousArbre(d, el);
    if (elements.some((x) => R.f(x, "VERROUILLE") === true)) throw new Error("Un descendant est verrouillé.");
    const copie = { ...el, configuration: { ...el.configuration, ACTIF: true } };
    const test = R.actif(el) ? d : { ...d, builderElements: d.builderElements.map((x) => x.id === el.id ? copie : x) };
    R.verifierComposition(test, R.actif(el) ? el : copie);
    for (const x of elements) for (const def of R.champsDe(d, R.lien(x, "OBJ-BUILDER-TYPE"))) {
      for (const appareil of ["", ...R.APPAREILS]) {
        const v = R.valeurDe(d, x.id, def, appareil);
        if (R.natureDe(def) === "MEDIA" && v) {
          const media = (d.medias || []).find((m) => m.id === v);
          if (!media || !mediaAutorise(media)) throw new Error("Média absent ou hors périmètre.");
        }
      }
    }
    return elements;
  };

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
      [await nSimple(LISTE, "VISIBLE")]: true,
      [await nSimple(LISTE, "PROFONDEUR")]: 0, [await nSimple(LISTE, "ORDRE")]: 10 };
    const id = await creer(LISTE, champs);
    await maj(LISTE, id, { [await nLien(LISTE, "ELEMENT-RACINE", LISTE)]: id });
    return message("Racine Builder créée en brouillon.", id);
  }

  const c = cible(p.ref);
  if (!c) return { refus: "Élément absent, verrouillé ou hors périmètre." };
  if (p.attendu && p.attendu !== R.empreinteDe(d, c.root)) {
    return { refus: "La composition a été modifiée depuis sa lecture. Rechargez avant de recommencer." };
  }
  if (!R.actif(c.el) && action !== "builder.reactiver") return { refus: "Élément inactif." };
  if (action === "builder.restaurer") {
    if (c.el.id !== c.root.id || !p.attendu || !Array.isArray(p.elements) || !p.elements.length) {
      return { refus: "Restauration structurelle incomplète." };
    }
    const modifications = new Map();
    for (const entree of p.elements) {
      const el = resoudre(entree.ref, idx.elements, "element");
      const root = el && R.racineDe(d, el);
      const parent = entree.parent ? resoudre(entree.parent, idx.elements, "element") : null;
      if (!el || el.id === c.root.id || root?.id !== c.root.id || modifications.has(el.id) ||
        !parent || R.racineDe(d, parent)?.id !== c.root.id || R.f(el, "VERROUILLE") === true ||
        typeof entree.actif !== "boolean" || typeof entree.ordre !== "number" || !Number.isFinite(entree.ordre) ||
        Math.abs(entree.ordre) > Number.MAX_SAFE_INTEGER ||
        !Number.isSafeInteger(entree.profondeur) || entree.profondeur < 1 || entree.profondeur >= 64) {
        return { refus: "Une modification structurelle est incohérente ou hors périmètre." };
      }
      if (R.sousArbre(d, el).some((x) => R.f(x, "VERROUILLE") === true)) return { refus: "Un descendant à restaurer est verrouillé." };
      let courant = el;
      while (courant) {
        if (R.f(courant, "VERROUILLE") === true) return { refus: "La chaîne d'origine contient un verrou." };
        courant = idx.elements.get(R.lien(courant, "ELEMENT-PARENT"));
      }
      modifications.set(el.id, { el, parent, entree });
    }
    const simules = d.builderElements.map((el) => {
      const m = modifications.get(el.id);
      if (!m) return el;
      const configuration = Object.fromEntries(Object.entries(el.configuration).filter(([k]) =>
        !["ACTIF", "ORDRE", "PROFONDEUR"].includes(k.replace(/[^A-Za-z]/g, "").toUpperCase())));
      const relations = Object.fromEntries(Object.entries(el.relations || {}).filter(([k]) =>
        k.replace(/[^A-Za-z]/g, "").toUpperCase() !== "ELEMENTPARENT"));
      return { ...el, configuration: { ...configuration, ACTIF: m.entree.actif, ORDRE: m.entree.ordre, PROFONDEUR: m.entree.profondeur },
        relations: { ...relations, ELEMENTPARENT: { id: m.parent.id } } };
    });
    const simulation = { ...d, builderElements: simules };
    for (const m of modifications.values()) {
      const el = simules.find((x) => x.id === m.el.id);
      if (!R.racineDe(simulation, el)) return { refus: "La restauration créerait un cycle ou une racine incohérente." };
      if (R.profondeurDe(simulation, el) !== m.entree.profondeur) return { refus: "La profondeur restaurée ne correspond pas à la structure." };
      let courant = el;
      const elements = R.index(simulation).elements;
      while (courant) {
        if (R.f(courant, "VERROUILLE") === true) return { refus: "La chaîne de destination contient un verrou." };
        courant = elements.get(R.lien(courant, "ELEMENT-PARENT"));
      }
    }
    const affectes = new Set([...modifications.values()].flatMap((m) => R.sousArbre(d, m.el).map((x) => x.id)));
    for (const el of simules.filter((x) => affectes.has(x.id))) {
      if (!R.racineDe(simulation, el)) return { refus: "Un descendant aurait une racine incohérente." };
      const profondeur = R.f(el, "PROFONDEUR");
      if (profondeur !== null && Number(profondeur) !== R.profondeurDe(simulation, el)) {
        return { refus: "La restauration doit recalculer la profondeur de tous les descendants concernés." };
      }
    }
    R.verifierComposition(simulation, c.root);
    R.arbre(simulation, c.root, { mediaVisible: mediaAutorise });
    const noms = { parent: await nLien(LISTE, "ELEMENT-PARENT", LISTE), actif: await nSimple(LISTE, "ACTIF"),
      ordre: await nSimple(LISTE, "ORDRE"), profondeur: await nSimple(LISTE, "PROFONDEUR") };
    for (const m of modifications.values()) await maj(LISTE, m.el.id, {
      [noms.parent]: m.parent.id, [noms.actif]: m.entree.actif, [noms.ordre]: m.entree.ordre, [noms.profondeur]: m.entree.profondeur });
    return message("Structure restaurée et relue ; aucune donnée supprimée.");
  }
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
    R.verifierComposition(d, c.root);
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
    const { freres, position } = placement(c.el);
    const champs = { Title: String(p.titre || R.titre(type)).slice(0, 255),
      [await nLien(LISTE, "OBJ-SITE-PUBLIC")]: String(siteId),
      [await nLien(LISTE, "OBJ-BUILDER-TYPE")]: type.id,
      [await nLien(LISTE, "ELEMENT-PARENT", LISTE)]: c.el.id,
      [await nLien(LISTE, "ELEMENT-RACINE", LISTE)]: c.root.id,
      [await nSimple(LISTE, "ACTIF")]: true, [await nSimple(LISTE, "VALIDE")]: false,
      [await nSimple(LISTE, "VISIBLE")]: true, [await nSimple(LISTE, "ORDRE")]: (position + 1) * 10,
      [await nSimple(LISTE, "PROFONDEUR")]: R.profondeurDe(d, c.el) + 1 };
    const id = await creer(LISTE, champs);
    freres.splice(position, 0, { id });
    await reordonner(freres);
    return message("Élément ajouté en brouillon.", id);
  }
  if (action === "builder.dupliquer") {
    const copieRacine = c.el.id === c.root.id && typeof dupliquerRacine === "function";
    const parent = copieRacine ? null : cible(p.parent || reference(R.lien(c.el, "ELEMENT-PARENT"), "element"));
    if (!copieRacine && (!parent || c.el.id === c.root.id || parent.root.id !== c.root.id)) return { refus: "Destination de duplication invalide." };
    const elements = validerSousArbre(c.el);
    if (elements.some((x) => R.lien(x, "OBJ-MODULE-SITE-PUBLIC") || R.lien(x, "OBJ-MODELE-INSTANCE"))) {
      return { refus: "Duplication interdite : ce sous-arbre référence un module partagé ou une instance externe." };
    }
    const erreur = copieRacine ? null : R.verifierInsertion(d, parent.el, R.lien(c.el, "OBJ-BUILDER-TYPE"), c.el, { copie: true });
    if (erreur) return { refus: erreur };
    const { freres, position } = copieRacine ? { freres: [], position: 0 } : placement(parent.el);
    const copies = new Map();
    const noms = {
      site: await nLien(LISTE, "OBJ-SITE-PUBLIC"), type: await nLien(LISTE, "OBJ-BUILDER-TYPE"),
      parent: await nLien(LISTE, "ELEMENT-PARENT", LISTE), root: await nLien(LISTE, "ELEMENT-RACINE", LISTE),
      actif: await nSimple(LISTE, "ACTIF"), valide: await nSimple(LISTE, "VALIDE"),
      visible: await nSimple(LISTE, "VISIBLE"), ordre: await nSimple(LISTE, "ORDRE"), profondeur: await nSimple(LISTE, "PROFONDEUR")
    };
    const ciblesRacine = Object.keys(R.CIBLES).filter((t) => R.lien(c.root, R.CIBLES[t]));
    if (copieRacine && ciblesRacine.length !== 1) return { refus: "Conteneur de racine ambigu." };
    const nCible = copieRacine ? await nLien(LISTE, R.CIBLES[ciblesRacine[0]]) : null;
    const vNoms = { element: await nLien(VALEURS, "OBJ-BUILDER-ELEMENT", LISTE),
      champ: await nLien(VALEURS, "OBJ-BUILDER-CHAMP"), actif: await nSimple(VALEURS, "ACTIF"),
      appareil: await nSimple(VALEURS, "APPAREIL") };
    const valeursACopier = [];
    for (const el of elements) for (const def of R.champsDe(d, R.lien(el, "OBJ-BUILDER-TYPE"))) {
      if (R.categorieDe(def) === "AVANCE" && String(R.f(def, "CODE-CHAMP")).replace(/[^A-Z]/g, "") === "IDCSS" &&
        R.valeurDe(d, el.id, def)) return { refus: "Duplication incohérente : retirez d'abord l'identifiant CSS unique de l'original." };
      const nature = R.natureDe(def);
      if (!R.TYPES_VALEUR.has(nature)) return { refus: "Nature de champ non prise en charge." };
      const nom = nature === "MEDIA" ? await nLien(VALEURS, "OBJ-MEDIA") : await nSimple(VALEURS,
        { TEXTE: "VALEUR-TEXTE", NOMBRE: "VALEUR-NOMBRE", BOOLEEN: "VALEUR-BOOLEENNE" }[nature]);
      for (const appareil of ["", ...R.APPAREILS]) {
        const valeur = R.valeurDe(d, el.id, def, appareil);
        if (valeur !== null) valeursACopier.push({ el, def, nom, appareil, valeur });
      }
    }
    const destination = copieRacine ? await dupliquerRacine() : null;
    if (copieRacine && (!destination?.id || destination.type !== ciblesRacine[0])) throw new Error("Création du conteneur de destination non confirmée.");
    const base = copieRacine ? 0 : R.profondeurDe(d, parent.el) + 1, origine = R.profondeurDe(d, c.el);
    for (const el of elements) {
      const racineNouvelle = copieRacine && el.id === c.el.id;
      const id = await creer(LISTE, { Title: R.titre(el), [noms.site]: String(siteId),
        [noms.type]: R.lien(el, "OBJ-BUILDER-TYPE"),
        ...(!racineNouvelle ? { [noms.parent]: el.id === c.el.id ? parent.el.id : copies.get(R.lien(el, "ELEMENT-PARENT")),
          [noms.root]: copieRacine ? copies.get(c.root.id) : c.root.id } : { [nCible]: String(destination.id) }),
        [noms.actif]: true, [noms.valide]: false,
        [noms.visible]: R.f(el, "VISIBLE") !== false, [noms.ordre]: el.id === c.el.id ? (position + 1) * 10 : Number(R.f(el, "ORDRE") || 0),
        [noms.profondeur]: base + R.profondeurDe(d, el) - origine });
      copies.set(el.id, id);
      if (racineNouvelle) await maj(LISTE, id, { [noms.root]: id });
    }
    for (const v of valeursACopier) await creer(VALEURS, { Title: R.titre(v.def),
      [vNoms.element]: copies.get(v.el.id), [vNoms.champ]: v.def.id, [vNoms.actif]: true,
      [vNoms.appareil]: v.appareil || null, [v.nom]: v.valeur });
    const id = copies.get(c.el.id);
    if (!copieRacine) { freres.splice(position, 0, { id }); await reordonner(freres); }
    return message("Sous-arbre et valeurs dupliqués en brouillon ; original inchangé.", id);
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
    const elements = validerSousArbre(c.el);
    const { freres, position } = placement(dest.el, c.el);
    freres.splice(position, 0, c.el);
    const delta = R.profondeurDe(d, dest.el) + 1 - R.profondeurDe(d, c.el);
    const profondeurs = elements.map((el) => [el, R.profondeurDe(d, el) + delta]);
    const nProfondeur = await nSimple(LISTE, "PROFONDEUR");
    await maj(LISTE, c.el.id, { [await nLien(LISTE, "ELEMENT-PARENT", LISTE)]: dest.el.id });
    for (const [el, profondeur] of profondeurs) await maj(LISTE, el.id, { [nProfondeur]: profondeur });
    await reordonner(freres);
    return message("Élément déplacé et relu.");
  }
  if (action === "builder.reactiver") {
    if (R.actif(c.el)) return { refus: "Cet élément est déjà actif." };
    const parent = idx.elements.get(R.lien(c.el, "ELEMENT-PARENT"));
    if (!parent || !cible(reference(parent.id, "element")) || !R.actif(parent)) return { refus: "Parent inactif ou indisponible." };
    const erreur = R.verifierInsertion(d, parent, R.lien(c.el, "OBJ-BUILDER-TYPE"), c.el);
    if (erreur) return { refus: erreur };
    validerSousArbre(c.el);
    await maj(LISTE, c.el.id, { [await nSimple(LISTE, "ACTIF")]: true });
    return message("Sous-arbre réactivé et relu.", c.el.id);
  }
  if (action === "builder.desactiver") {
    const erreur = R.verifierRetrait(d, c.el);
    if (erreur) return { refus: erreur };
    validerSousArbre(c.el);
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
      const nature = R.natureDe(def);
      if (!R.TYPES_VALEUR.has(nature)) return { refus: "Nature de champ non prise en charge." };
      const vide = brut === "" || brut === null;
      if (R.f(def, "OBLIGATOIRE") === true && vide && !appareil) return { refus: "Valeur obligatoire manquante." };
      let valeur = brut;
      const { erreurValeur } = await import("../../modules/builder/proprietes.js");
      const erreur = erreurValeur({ cle: R.f(def, "CODE-CHAMP"), categorie: R.categorieDe(def), nature }, brut);
      if (erreur) return { refus: `${R.titre(def)} : ${erreur}` };
      const code = String(R.f(def, "CODE-CHAMP") || "").replace(/[^A-Z]/g, "");
      if (appareil && R.categorieDe(def) === "AVANCE" && ["IDCSS", "CLASSECSS"].includes(code) && !vide) {
        return { refus: "Identifiant et classes CSS se configurent uniquement dans les valeurs générales." };
      }
      if (!vide && R.categorieDe(def) === "AVANCE" && code === "IDCSS") {
        const utilise = (d.builderElements || []).filter((x) => R.actif(x) && x.id !== c.el.id &&
          R.lien(x, "OBJ-SITE-PUBLIC") === String(siteId)).some((x) =>
          R.champsDe(d, R.lien(x, "OBJ-BUILDER-TYPE")).some((definition) =>
            R.categorieDe(definition) === "AVANCE" && String(R.f(definition, "CODE-CHAMP")).replace(/[^A-Z]/g, "") === "IDCSS" &&
            R.valeurDe(d, x.id, definition) === brut));
        if (utilise) return { refus: "Cet identifiant CSS est déjà utilisé dans cette composition." };
      }
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
