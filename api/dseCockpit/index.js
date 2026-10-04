"use strict";

/*
 * API du cockpit DSE. Toutes les autorisations sont controlees ici, cote serveur :
 * session signee -> droits resolus depuis SharePoint -> perimetre de sites -> fonctions.
 * Modifier l'URL ou un parametre cote navigateur ne donne acces a rien de plus.
 */

const session = require("../auth/session");
const dse = require("../shared/dse");
const fournisseurs = require("../auth/fournisseurs");
const droits = require("../auth/droits");
const cockpit = require("../shared/cockpit");
const perimetre = require("../shared/perimetre");
const controleurSiteComplet = require("../dseSiteComplet");
const resumeSites = require("../shared/resume-sites");
const edition = require("../shared/edition");
const ecriture = require("../shared/ecriture");
const administration = require("../shared/administration");
const inscription = require("../auth/inscription");

const meta = () => ({ genereLe: new Date().toISOString() });

function repondre(res, status, corps) {
  res.status(status).set("Cache-Control", "no-store").json(corps);
}

function refuser(res, status, message) {
  repondre(res, status, { succes: false, erreur: { message }, meta: meta() });
}

async function refuserEcriture(res, ctx, domaine, action, message) {
  let enregistre = false;
  try {
    const g = await ecriture.contexteGraph();
    const cible = await inscription.domaineContexte(g, domaine);
    const j = await inscription.journal(g, ctx.identite, cible, action, "REFUS", message, ctx.droits.utilisateurId);
    enregistre = j.ok;
  } catch (e) { console.error("[DSE cockpit] journal refus", e.message); }
  return repondre(res, 403, { succes: false, erreur: { message }, journal: { enregistre }, meta: meta() });
}

async function contexteUtilisateur(req) {
  const identite = session.identiteSession(req);
  if (!identite) return null;
  return { identite, droits: await droits.droitsPour(identite) };
}

async function chargerSiteComplet(siteId) {
  const contexte = { res: null, log: { info() {}, warn: console.warn, error: console.error } };
  await controleurSiteComplet(contexte, { params: { siteId: String(siteId) }, query: {}, headers: {} });
  const corps = contexte.res?.body;
  const donnees = typeof corps === "string" ? JSON.parse(corps) : corps;
  return donnees?.succes ? donnees.donnees : null;
}

function normaliserDomaine(valeur) {
  const d = String(valeur || "").trim().toLowerCase().replace(/^www\./, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

/*
 * Veritables sites principaux visibles : les fiches alias sont regroupees sous leur site
 * (par ID natifs), et un groupe n'est visible que si son site principal est dans le perimetre.
 */
async function groupesAutorises(ctx) {
  const { sites: index, statuts } = await droits.sitesIndex();
  const autorises = new Set(ctx.droits.siteIds);
  const groupes = perimetre.regrouperSites([...index.values()]).filter((g) => autorises.has(String(g.id)));
  return { groupes, statuts };
}

/*
 * Domaine d'accueil calcule cote serveur : le domaine utilise s'il appartient au perimetre,
 * sinon le site principal designe ; sinon null (l'utilisateur choisit dans sa liste).
 */
async function domaineAccueil(req, ctx) {
  if (!ctx.droits.reconnu || !ctx.droits.siteIds.length) return null;
  const { groupes: autorises } = await groupesAutorises(ctx);
  const demande = normaliserDomaine(req.query.domaine || req.get("x-forwarded-host") || req.hostname);
  if (demande && perimetre.groupeParDomaine(autorises, demande)) return demande;
  const principal = ctx.droits.sitePrincipalId && autorises.find((g) => g.fiches.includes(String(ctx.droits.sitePrincipalId)));
  return principal ? perimetre.domaineAcces(principal) : null;
}

async function moi(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) {
      return repondre(res, 200, { succes: true, donnees: { connecte: false, fournisseurs: fournisseurs.lister() }, meta: meta() });
    }
    return repondre(res, 200, {
      succes: true,
      donnees: {
        connecte: true,
        nom: ctx.identite.nom || ctx.identite.email || null,
        reconnu: ctx.droits.reconnu,
        role: ctx.droits.role,
        fonctions: ctx.droits.fonctions,
        niveau: ctx.droits.niveau,
        menu: await administration.menu(ctx.droits),
        nombreSites: ctx.droits.reconnu ? (await groupesAutorises(ctx)).groupes.length : 0,
        domaineAccueil: await domaineAccueil(req, ctx),
        fournisseurs: fournisseurs.lister()
      },
      meta: meta()
    });
  } catch (e) {
    console.error("[DSE cockpit] moi", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function sites(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    if (!ctx.droits.fonctions.includes("sites")) return refuser(res, 403, "Accès non autorisé.");
    const { groupes, statuts } = await groupesAutorises(ctx);
    // Resume leger : chaque liste est lue une seule fois pour tous les sites.
    const resumes = await resumeSites.obtenirResumes();
    const liste = cockpit.filtrerSites(groupes
      .map((g) => cockpit.resumeSite(g, statuts.get(String(g.statutId)) || null, resumes.get(String(g.id))))
      .filter((s) => s.acces), req.query);
    repondre(res, 200, { succes: true, donnees: liste, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] sites", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function site(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    const domaine = normaliserDomaine(req.query.domaine);
    const { sites: index, statuts } = await droits.sitesIndex();
    // Un alias ouvre son site principal ; le controle porte sur l'ID natif du site principal.
    const info = domaine ? perimetre.groupeParDomaine(perimetre.regrouperSites([...index.values()]), domaine) : null;
    // Meme reponse pour un site inexistant ou hors perimetre : rien n'est divulgue.
    if (!info || !ctx.droits.siteIds.includes(String(info.id)) || !ctx.droits.fonctions.includes("sites")) {
      return refuser(res, 404, "Ce site n'est pas disponible dans votre espace.");
    }
    const siteComplet = await chargerSiteComplet(info.id);
    const vue = cockpit.vueSite({
      siteComplet,
      info,
      statut: statuts.get(String(info.statutId)) || null,
      fonctions: ctx.droits.fonctions,
      domaineDemande: domaine
    });
    repondre(res, 200, { succes: true, donnees: vue, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] site", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

/* ---------------- Ecriture : controles communs ---------------- */

/*
 * Les requetes d'ecriture doivent provenir du cockpit lui-meme (meme origine) :
 * protection contre la falsification de requete inter-sites, en plus du cookie SameSite=Lax.
 */
function origineValide(req) {
  const origine = String(req.get("origin") || "");
  const hote = String(req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim().toLowerCase();
  if (!origine || !hote) return false;
  try {
    const u = new URL(origine);
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hote);
    return u.host.toLowerCase() === hote && (u.protocol === "https:" || (local && u.protocol === "http:"));
  } catch {
    return false;
  }
}

const RANG = { lecture: 0, ecriture: 1, administration: 2 };
const peutEcrire = (d, fonction) => d.reconnu && d.fonctions.includes(fonction) && RANG[d.niveau] >= RANG.ecriture;

/* Site demande -> site principal (ID natif) dans le perimetre, sinon null (aucune divulgation). */
async function siteDuPerimetre(ctx, domaineBrut) {
  const domaine = normaliserDomaine(domaineBrut);
  if (!domaine) return null;
  const { sites: index } = await droits.sitesIndex();
  const info = perimetre.groupeParDomaine(perimetre.regrouperSites([...index.values()]), domaine);
  return info && ctx.droits.siteIds.includes(String(info.id)) ? info : null;
}

function repondreResultat(res, r) {
  const { status, erreur, ...reste } = r;
  if (erreur) return repondre(res, status || 400, { succes: false, erreur: { message: erreur }, ...reste, meta: meta() });
  return repondre(res, status || 200, { succes: true, donnees: reste, meta: meta() });
}

async function contexteEcriture(req, res) {
  if (!origineValide(req)) { refuser(res, 403, "Requête refusée."); return null; }
  const ctx = await contexteUtilisateur(req);
  if (!ctx) { refuser(res, 401, "Connexion requise."); return null; }
  return ctx;
}

/* ---------------- Edition d'un composant (pilote En-tete / SEO) ---------------- */

async function editionLire(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    const composant = String(req.query.composant || "");
    const def = edition.COMPOSANTS_EDITABLES[composant];
    const info = await siteDuPerimetre(ctx, req.query.domaine);
    if (!info || !def || !peutEcrire(ctx.droits, def.fonction)) return refuser(res, 404, "Ce réglage n'est pas disponible dans votre espace.");
    const r = await edition.lire({ composant, siteId: info.id, element: String(req.query.element || "") });
    repondre(res, 200, { succes: true, donnees: { site: info.titre, domaine: perimetre.domaineAcces(info), ...r }, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] edition", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function editionApercu(req, res) {
  try {
    const ctx = await contexteEcriture(req, res);
    if (!ctx) return;
    const composant = String(req.body?.composant || "");
    const def = edition.COMPOSANTS_EDITABLES[composant];
    const info = await siteDuPerimetre(ctx, req.body?.domaine);
    if (!info || !def || !peutEcrire(ctx.droits, def.fonction)) return refuserEcriture(res, ctx, req.body?.domaine, "Cockpit : aperçu édition",
      "Ce réglage n'est pas disponible dans votre espace.");
    const r = await edition.preparer({ identite: ctx.identite, composant, siteId: info.id, siteNom: info.titre, valeurs: req.body?.valeurs, element: String(req.body?.element || "") });
    repondreResultat(res, r);
  } catch (e) {
    console.error("[DSE cockpit] edition apercu", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

/* Confirmation commune : les droits sont recalcules au moment de l'ecriture. */
async function confirmer(req, res) {
  try {
    const ctx = await contexteEcriture(req, res);
    if (!ctx) return;
    const r = await ecriture.executer({
      identite: ctx.identite,
      jeton: req.body?.jeton,
      acteur: ctx.identite.email || ctx.identite.sujet,
      revalider: async (op) => {
        dse.viderCacheGraph();
        droits.viderCache();
        const d = await droits.droitsPour(ctx.identite);
        if (op.portee === "site") {
          const donnees = await droits.donneesDroits();
          const s = donnees.sites.find((s) => String(s.id) === String(op.siteId));
          op.contexteJournal = { acteur: ctx.identite.sujet, utilisateurId: d.utilisateurId,
            clientId: s?.clientId || null, siteId: String(op.siteId) };
          if (!peutEcrire(d, op.fonction) || !d.siteIds.includes(String(op.siteId))) return "Vous n'avez plus l'autorisation de modifier ce réglage.";
          return null;
        }
        if (op.portee === "admin") {
          const a = await administration.construireAction(d, op.adminAction, op.adminParams || {}, null);
          if (a.refus) return a.refus;
          if (op.adminAction === "ajouter-acces-site" && a.op) {
            for (const [nom, valeur] of Object.entries(a.op.champs)) {
              if (String(op.champs[nom]) !== String(valeur)) return "Le rattachement utilisateur/client/site a changé.";
            }
          }
          if (op.type === "ajouter") op.doublon = administration.controleDoublon(op);
          return null;
        }
        return "Opération non autorisée.";
      }
    });
    repondreResultat(res, r);
  } catch (e) {
    console.error("[DSE cockpit] confirmer", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

/* ---------------- Administration ---------------- */

async function adminTableau(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    if (!ctx.droits.reconnu || !ctx.droits.fonctions.includes("administration")) return refuser(res, 403, "Accès non autorisé.");
    repondre(res, 200, { succes: true, donnees: await administration.tableau(ctx.droits), meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] admin tableau", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function adminUtilisateurs(req, res) {
  try {
    const ctx = await contexteUtilisateur(req);
    if (!ctx) return refuser(res, 401, "Connexion requise.");
    const r = ctx.droits.reconnu ? await administration.utilisateurs(ctx.droits) : null;
    if (!r) return refuser(res, 403, "Accès non autorisé.");
    repondre(res, 200, { succes: true, donnees: r, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] admin utilisateurs", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function adminApercu(req, res) {
  try {
    const ctx = await contexteEcriture(req, res);
    if (!ctx) return;
    const action = String(req.body?.action || "");
    const p = req.body?.params && typeof req.body.params === "object" ? req.body.params : {};
    const params = Object.fromEntries(["utilisateur", "role", "domaine", "email", "client", "portee", "niveau", "fonctions"]
      .filter((k) => typeof p[k] === "string").map((k) => [k, p[k].slice(0, k === "fonctions" ? 2000 : 255)]));
    repondreResultat(res, await administration.preparerAction({ identite: ctx.identite, d: ctx.droits, action, params }));
  } catch (e) {
    console.error("[DSE cockpit] admin apercu", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

async function connexion(req, res) {
  try {
    const f = fournisseurs.trouver(req.params.fournisseur);
    if (f && f.disponible() && await f.demarrer(req, res)) return;
  } catch (e) {
    console.error("[DSE cockpit] demarrage connexion", e.message);
  }
    res.redirect(302, "/#/cockpit?connexion=indisponible");
}

async function inscrire(req, res) {
  try {
    if (!origineValide(req)) return refuser(res, 403, "Requête refusée.");
    const identite = session.identiteSession(req);
    if (!identite || identite.fournisseur !== "entra") return refuser(res, 401, "Connexion Microsoft requise.");
    if (Object.keys(req.body || {}).some((k) => k !== "confirmer")) {
      const g = await ecriture.contexteGraph();
      const j = await inscription.journal(g, identite, null, "Entra : inscription", "REFUS", "Paramètres d'attribution interdits.");
      return repondre(res, 403, { succes: false, erreur: { message: "Aucune attribution de client, site ou rôle depuis le navigateur." }, journal: { enregistre: j.ok } });
    }
    const domaine = req.hostname || String(req.get("host") || "").split(":")[0];
    const r = await inscription.inscrire(identite, domaine, req.body?.confirmer === true);
    if (r.erreur) return repondre(res, r.status, { succes: false, erreur: { message: r.erreur }, journal: r.journal });
    return repondre(res, r.status, { succes: r.status === 200, donnees: r.donnees });
  } catch (e) {
    console.error("[DSE cockpit] inscription", e.message);
    refuser(res, 503, "Inscription momentanément indisponible.");
  }
}

async function retour(req, res) {
  const f = fournisseurs.trouver(req.params.fournisseur);
  try {
    const r = f ? await f.rappel(req, res) : { cible: "/#/cockpit?connexion=echec" };
    res.redirect(302, r.cible);
  } catch (e) {
    console.error("[DSE cockpit] retour connexion", e.message);
    res.redirect(302, "/#/cockpit?connexion=echec");
  }
}

function deconnexion(req, res) {
  session.fermerSession(res);
  res.redirect(302, "/#/cockpit");
}

module.exports = {
  moi, sites, site, connexion, retour, deconnexion, inscrire,
  editionLire, editionApercu, confirmer, adminTableau, adminUtilisateurs, adminApercu,
  _test: { origineValide }
};
