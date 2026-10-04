"use strict";

/*
 * Fournisseur d'identite Microsoft Entra (OpenID Connect, code d'autorisation + PKCE).
 * L'echange du code se fait cote serveur OVH avec l'application DSE existante :
 * aucun secret ni jeton Microsoft n'atteint le navigateur.
 */

const crypto = require("crypto");
const session = require("../session");
const inscription = require("../inscription");
const ecriture = require("../../shared/ecriture");
const acces = require("../acces");
const incidents = require("../incidents");
const transactions = new Map();
const passages = new Map();

function nettoyer() {
  for (const map of [transactions, passages]) {
    for (const [cle, valeur] of map) if (valeur.expiration <= Date.now()) map.delete(cle);
  }
}

const ID = "entra";
const CHEMIN_RETOUR = "/api/v1/auth/entra/retour";

function configuration() {
  const tenant = String(process.env.DSE_TENANT_ID || "").trim();
  const client = String(process.env.DSE_CLIENT_ID || "").trim();
  const secret = String(process.env.DSE_CLIENT_SECRET || "").trim();
  const base = String(process.env.DSE_AUTH_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!tenant || !client || !secret || !/^https:\/\/[a-z0-9.-]+$/i.test(base)) return null;
  return { tenant, client, secret, base, retour: `${base}${CHEMIN_RETOUR}` };
}

function disponible() {
  return Boolean(configuration()) && session.sessionDisponible();
}

function domaineRetour(valeur) {
  const d = String(valeur || "").trim().toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) && d.length <= 253 ? d : null;
}

function cibleApresConnexion(base, domaine) {
  return `${base}/#/cockpit${domaine ? `/site/${encodeURIComponent(domaine)}` : ""}`;
}

async function demarrer(req, res) {
  const c = configuration();
  if (!c) return false;
  const domaine = domaineRetour(req.hostname || req.get?.("host")?.split(":")[0]);
  const contexte = await inscription.domaineContexte(await ecriture.contexteGraph(), domaine);
  if (!contexte) return false;
  const etat = crypto.randomBytes(24).toString("base64url");
  const nonce = crypto.randomBytes(24).toString("base64url");
  const verificateur = crypto.randomBytes(48).toString("base64url");
  const defi = crypto.createHash("sha256").update(verificateur).digest("base64url");
  if (!session.ouvrirTransaction(res, { etat, nonce, verificateur, domaine })) return false;
  nettoyer();
  if (transactions.size >= 10000) throw new Error("Trop de connexions en cours.");
  transactions.set(etat, { etat, nonce, verificateur, domaine, expiration: Date.now() + 600000 });
  const url = new URL(`https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: c.client,
    response_type: "code",
    response_mode: "query",
    redirect_uri: c.retour,
    scope: "openid profile email",
    state: etat,
    nonce,
    code_challenge: defi,
    code_challenge_method: "S256",
    prompt: "select_account"
  }).toString();
  res.redirect(302, url.toString());
  return true;
}

function decoderJwt(jwt) {
  const morceaux = String(jwt || "").split(".");
  if (morceaux.length !== 3) return null;
  try { return JSON.parse(Buffer.from(morceaux[1], "base64url").toString("utf8")); } catch { return null; }
}

// Le jeton d'identite est recu directement du point de jeton Microsoft (TLS, authentifie
// par le secret client) : on controle audience, emetteur, nonce et expiration.
function identiteDepuisJeton(revendications, c, nonce, maintenant = Date.now()) {
  if (!revendications) return null;
  if (revendications.aud !== c.client) return null;
  if (String(revendications.tid || "") !== c.tenant) return null;
  if (!String(revendications.iss || "").includes(c.tenant)) return null;
  if (!nonce || revendications.nonce !== nonce) return null;
  if (typeof revendications.exp !== "number" || revendications.exp * 1000 <= maintenant) return null;
  const sujet = revendications.oid;
  if (!sujet) return null;
  return {
    fournisseur: ID,
    sujet: String(sujet),
    email: String(revendications.preferred_username || revendications.email || "").toLowerCase() || null,
    nom: revendications.name ? String(revendications.name) : null
  };
}

async function rappel(req, res) {
  const c = configuration();
  nettoyer();
  const transaction = transactions.get(String(req.query?.state || ""));
  transactions.delete(String(req.query?.state || ""));
  if (!c || req.hostname !== new URL(c.base).hostname || !transaction || !req.query?.code || req.query.state !== transaction.etat) {
    return { ok: false, cible: c ? `${c.base}/#/cockpit?connexion=echec` : "/" };
  }
  const reponse = await fetch(`https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: c.client,
      client_secret: c.secret,
      grant_type: "authorization_code",
      code: String(req.query.code),
      redirect_uri: c.retour,
      code_verifier: transaction.verificateur,
      scope: "openid profile email"
    }),
    signal: AbortSignal.timeout(15000)
  });
  const corps = await reponse.json().catch(() => ({}));
  const identite = reponse.ok ? identiteDepuisJeton(decoderJwt(corps.id_token), c, transaction.nonce) : null;
  const origine = `https://${transaction.domaine}`;
  if (!identite) return { ok: false, cible: `${origine}/#/cockpit?connexion=echec` };
  if (await incidents.verifier(identite)) return { ok: false, cible: `${origine}/#/cockpit?connexion=securise` };
  const reconnu = await inscription.apresAuthentification(identite, transaction.domaine);
  const resultat = reconnu ? await acces.etat(identite, transaction.domaine) : { etat: "attente", cible: null };
  if (reconnu && !resultat.cible) await incidents.refuser(identite, transaction.domaine, "Site courant non autorisé");
  const code = crypto.randomBytes(32).toString("base64url");
  if (passages.size >= 10000) throw new Error("Trop de retours de connexion en cours.");
  passages.set(code, { identite, domaine: transaction.domaine, etat: transaction.etat,
    cible: resultat.cible || "/#/cockpit?connexion=inscription-refusee", expiration: Date.now() + 60000 });
  res.setHeader("Referrer-Policy", "no-referrer");
  return { ok: !!resultat.cible, cible: `${origine}/api/v1/auth/continuer?code=${code}` };
}

async function continuer(req, res) {
  try {
    nettoyer();
    const code = String(req.query?.code || "");
    const passage = passages.get(code);
    const tx = session.consommerTransaction(req, res);
    if (!passage || !tx || tx.etat !== passage.etat || req.hostname !== passage.domaine) {
      return res.status(403).send("Retour de connexion non autorisé.");
    }
    passages.delete(code);
    const ctx = await inscription.domaineContexte(await ecriture.contexteGraph(), passage.domaine);
    if (!ctx || await incidents.verifier(passage.identite)) {
      return res.redirect(302, "/#/cockpit?connexion=securise");
    }
    const courant = await acces.etat(passage.identite, passage.domaine);
    if (passage.cible !== "/#/cockpit?connexion=inscription-refusee" && !courant.cible) {
      await incidents.refuser(passage.identite, passage.domaine, "Droits modifiés avant ouverture de session");
      return res.redirect(302, "/#/cockpit?connexion=inscription-refusee");
    }
    if (!session.ouvrirSession(res, passage.identite)) throw new Error("Session indisponible.");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    return res.redirect(302, passage.cible);
  } catch (e) {
    console.error("[DSE retour origine]", e.message);
    return res.status(503).send("Connexion momentanément indisponible.");
  }
}

module.exports = {
  id: ID,
  libelle: "Compte Microsoft",
  disponible,
  demarrer,
  rappel,
  continuer,
  _test: { identiteDepuisJeton, decoderJwt, domaineRetour, cibleApresConnexion }
};
