"use strict";

/*
 * Fournisseur d'identite Microsoft Entra (OpenID Connect, code d'autorisation + PKCE).
 * L'echange du code se fait cote serveur OVH avec l'application DSE existante :
 * aucun secret ni jeton Microsoft n'atteint le navigateur.
 */

const crypto = require("crypto");
const session = require("../session");

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

function demarrer(req, res) {
  const c = configuration();
  if (!c) return false;
  const etat = crypto.randomBytes(24).toString("base64url");
  const nonce = crypto.randomBytes(24).toString("base64url");
  const verificateur = crypto.randomBytes(48).toString("base64url");
  const defi = crypto.createHash("sha256").update(verificateur).digest("base64url");
  if (!session.ouvrirTransaction(res, { etat, nonce, verificateur, domaine: domaineRetour(req.query?.domaine) })) return false;
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
  const sujet = revendications.oid || revendications.sub;
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
  const transaction = session.consommerTransaction(req, res);
  if (!c || !transaction || !req.query?.code || req.query.state !== transaction.etat) {
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
    })
  });
  const corps = await reponse.json().catch(() => ({}));
  const identite = reponse.ok ? identiteDepuisJeton(decoderJwt(corps.id_token), c, transaction.nonce) : null;
  if (!identite || !session.ouvrirSession(res, identite)) {
    return { ok: false, cible: `${c.base}/#/cockpit?connexion=echec` };
  }
  return { ok: true, cible: cibleApresConnexion(c.base, transaction.domaine) };
}

module.exports = {
  id: ID,
  libelle: "Compte Microsoft",
  disponible,
  demarrer,
  rappel,
  _test: { identiteDepuisJeton, decoderJwt, domaineRetour, cibleApresConnexion }
};
