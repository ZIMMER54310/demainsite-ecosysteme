"use strict";

/*
 * API du cockpit DSE. Toutes les autorisations sont controlees ici, cote serveur :
 * session signee -> droits resolus depuis SharePoint -> perimetre de sites -> fonctions.
 * Modifier l'URL ou un parametre cote navigateur ne donne acces a rien de plus.
 */

const session = require("../auth/session");
const fournisseurs = require("../auth/fournisseurs");
const droits = require("../auth/droits");
const cockpit = require("../shared/cockpit");
const controleurSiteComplet = require("../dseSiteComplet");

const meta = () => ({ genereLe: new Date().toISOString() });

function repondre(res, status, corps) {
  res.status(status).set("Cache-Control", "no-store").json(corps);
}

function refuser(res, status, message) {
  repondre(res, status, { succes: false, erreur: { message }, meta: meta() });
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
        nombreSites: ctx.droits.siteIds.length,
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
    const { sites: index, statuts } = await droits.sitesIndex();
    const autorises = new Set(ctx.droits.siteIds);
    const liste = [...index.values()]
      .filter((s) => autorises.has(String(s.id)))
      .map((s) => cockpit.resumeSite(s, statuts.get(String(s.statutId)) || null))
      .filter((s) => s.domaine)
      .sort((a, b) => String(a.nom).localeCompare(String(b.nom), "fr"));
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
    const info = domaine ? [...index.values()].find((s) => (s.domaines || []).includes(domaine)) : null;
    // Meme reponse pour un site inexistant ou hors perimetre : rien n'est divulgue.
    if (!info || !ctx.droits.siteIds.includes(String(info.id)) || !ctx.droits.fonctions.includes("sites")) {
      return refuser(res, 404, "Ce site n'est pas disponible dans votre espace.");
    }
    const siteComplet = await chargerSiteComplet(info.id);
    const vue = cockpit.vueSite({
      siteComplet,
      info,
      statut: statuts.get(String(info.statutId)) || null,
      fonctions: ctx.droits.fonctions
    });
    repondre(res, 200, { succes: true, donnees: vue, meta: meta() });
  } catch (e) {
    console.error("[DSE cockpit] site", e.message);
    refuser(res, 503, "Le service est momentanément indisponible.");
  }
}

function connexion(req, res) {
  const f = fournisseurs.trouver(req.params.fournisseur);
  if (!f || !f.disponible() || !f.demarrer(req, res)) {
    res.redirect(302, "/#/cockpit?connexion=indisponible");
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

module.exports = { moi, sites, site, connexion, retour, deconnexion };
