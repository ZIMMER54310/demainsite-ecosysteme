"use strict";

const session = require("./session");
const droits = require("./droits");
const incidents = require("./incidents");
const inscription = require("./inscription");
const ecriture = require("../shared/ecriture");
const perimetre = require("../shared/perimetre");
const limites = new Map();
const maximum = Number(process.env.DSE_ACCES_REQUETES_MINUTE || 120);
if (!Number.isInteger(maximum) || maximum < 1) throw new Error("Limite technique des requêtes d'accès invalide.");
const erreur = (res, code, message) => res.status(code).set("Cache-Control", "no-store").json({ succes: false, erreur: { message } });
const domaine = (req) => req.hostname || String(req.get("host") || "").split(":")[0];

async function etat(identite, nom) {
  if (!identite) return { etat: "visiteur", cible: "/api/v1/auth/entra/connexion" };
  if (await incidents.verifier(identite)) return { etat: "bloque", cible: null };
  const g = await ecriture.contexteGraph();
  const ctx = await inscription.domaineContexte(g, nom);
  const d = await droits.droitsPour(identite);
  if (!d.reconnu || !d.fonctions.length) {
    const x = await droits.donneesDroits();
    const u = x.utilisateurs.find((u) => String(u.entraObjectId || "").toLowerCase() === String(identite.sujet).toLowerCase());
    return { etat: u && !u.actif ? "refuse" : "attente", cible: null };
  }
  let metier = ctx && d.siteIds.includes(ctx.siteId);
  if (ctx && !metier && !(d.sitesCommuns || []).includes(ctx.siteId)) {
    const index = await droits.sitesIndex();
    const groupe = perimetre.groupeParDomaine(perimetre.regrouperSites([...index.sites.values()]), nom);
    metier = !!groupe && d.siteIds.includes(String(groupe.id));
  }
  if (!ctx || (!metier && !(d.sitesCommuns || []).includes(ctx.siteId))) {
    return { etat: "refuse", cible: null };
  }
  return { etat: "autorise", cible: metier
    ? `/#/cockpit/site/${encodeURIComponent(ctx.domaine)}` : "/#/cockpit" };
}

async function status(req, res) {
  try {
    const id = session.identiteSession(req);
    const resultat = await etat(id, domaine(req));
    res.set("Cache-Control", "no-store").json({ succes: true, donnees: { ...resultat,
      csrf: id ? session.signer({ usage: "csrf", sub: id.sujet }, 600) : null } });
  } catch (e) { console.error("[DSE accès]", e.message); erreur(res, 503, "Accès momentanément indisponible."); }
}

async function entrer(req, res) {
  try {
    const id = session.identiteSession(req);
    const resultat = await etat(id, domaine(req));
    if (resultat.cible) return res.redirect(302, resultat.cible);
    if (resultat.etat !== "bloque") await incidents.refuser(id, domaine(req), "Compte ou site non autorisé");
    return erreur(res, 403, resultat.etat === "bloque" ? "Accès temporairement sécurisé." : "Accès DSE non autorisé. Contactez votre administrateur.");
  } catch (e) { console.error("[DSE accès entrée]", e.message); erreur(res, 503, "Accès momentanément indisponible."); }
}

function limiter(req, res, next) {
  const maintenant = Date.now();
  for (const [cle, x] of limites) if (x.fin <= maintenant) limites.delete(cle);
  const cle = ecriture.hash([req.ip || req.socket?.remoteAddress || "inconnu"]);
  const x = limites.get(cle) || { fin: maintenant + 60000, nombre: 0 };
  x.nombre++; limites.set(cle, x);
  if (x.nombre > maximum || limites.size > 10000) {
    res.set("Retry-After", "60");
    return erreur(res, 429, "Veuillez patienter avant de réessayer.");
  }
  next();
}

async function proteger(req, res, next) {
  try {
    const id = session.identiteSession(req);
    if (!id) return next();
    if (await incidents.verifier(id)) return erreur(res, 403, "Accès temporairement sécurisé.");
    if (req.method === "POST") {
      const csrf = session.verifier(req.get("x-dse-csrf"));
      if (!session.origineValide(req) || csrf?.usage !== "csrf" || csrf.sub !== id.sujet) {
        return erreur(res, 403, "Requête refusée.");
      }
      if (req.path !== "/inscription" && req.baseUrl === "/api/v1/cockpit") {
        const courant = await etat(id, domaine(req));
        if (!courant.cible) {
          await incidents.refuser(id, domaine(req), "Compte ou site courant non autorisé");
          return erreur(res, 403, "Accès DSE non autorisé.");
        }
      }
    }
    const json = res.json.bind(res);
    res.json = (corps) => {
      res.json = json;
      if (res.statusCode !== 403) return json(corps);
      incidents.refuser(id, domaine(req), "Fonction, rôle ou périmètre non autorisé")
        .then(() => json(corps))
        .catch((e) => { console.error("[DSE incident]", e.message); erreur(res, 503, "Accès momentanément indisponible."); });
      return res;
    };
    next();
  } catch (e) { console.error("[DSE protection]", e.message); erreur(res, 503, "Accès momentanément indisponible."); }
}

async function liste(req, res) {
  try {
    const id = session.identiteSession(req);
    if (!id) return erreur(res, 401, "Connexion requise.");
    droits.viderCache();
    const d = await droits.droitsPour(id);
    if (!incidents.global(d)) return erreur(res, 403, "Accès non autorisé.");
    const data = await incidents.lire(true);
    res.set("Cache-Control", "no-store").json({ succes: true, donnees: {
      politiqueDisponible: !!data.regle,
      incidents: data.incidents.map((i) => ({ id: i.id, utilisateur: i.utilisateur, domaine: i.domaine, motif: i.motif,
        nombre: i.nombre || i.refus.length, premier: i.premier, dernier: i.dernier, etat: i.etat,
        expireLe: i.expireLe || null, journalId: i.journalId }))
    } });
  } catch (e) { console.error("[DSE incidents liste]", e.message); erreur(res, 503, "Incidents momentanément indisponibles."); }
}

async function decision(req, res) {
  try {
    const id = session.identiteSession(req);
    if (!id) return erreur(res, 401, "Connexion requise.");
    if (Object.keys(req.body || {}).some((c) => !["incident", "decision"].includes(c)) ||
      typeof req.body?.incident !== "string" || !["reactiver", "maintenir"].includes(req.body?.decision)) {
      return erreur(res, 400, "Décision invalide.");
    }
    droits.viderCache();
    if (!await incidents.decider(id, req.body.incident, req.body.decision)) return erreur(res, 403, "Décision non autorisée.");
    res.json({ succes: true, donnees: { journalise: true } });
  } catch (e) { console.error("[DSE incidents décision]", e.message); erreur(res, 503, "Décision momentanément indisponible."); }
}

module.exports = { etat, status, entrer, limiter, proteger, liste, decision };
