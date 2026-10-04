"use strict";

/*
 * Session cockpit DSE : cookie HttpOnly signe (HMAC-SHA256), sans etat serveur.
 * Aucun jeton Microsoft n'est conserve ni transmis au navigateur.
 */

const crypto = require("crypto");

const COOKIE_SESSION = "dse_session";
const COOKIE_TRANSACTION = "dse_auth_tx";
const DUREE_SESSION_S = 8 * 3600;
const DUREE_TRANSACTION_S = 600;

function secret() {
  const propre = String(process.env.DSE_SESSION_SECRET || "");
  if (propre.length >= 32) return propre;
  const base = String(process.env.DSE_CLIENT_SECRET || "");
  if (!base) return null;
  return crypto.createHmac("sha256", base).update("dse-cockpit-session-v1").digest("hex");
}

function b64url(tampon) {
  return Buffer.from(tampon).toString("base64url");
}

function signer(donnees, dureeS, maintenant = Date.now()) {
  const cle = secret();
  if (!cle) return null;
  const corps = b64url(JSON.stringify({ ...donnees, exp: Math.floor(maintenant / 1000) + dureeS }));
  const signature = crypto.createHmac("sha256", cle).update(corps).digest("base64url");
  return `${corps}.${signature}`;
}

function verifier(valeur, maintenant = Date.now()) {
  const cle = secret();
  if (!cle || typeof valeur !== "string") return null;
  const [corps, signature, reste] = valeur.split(".");
  if (!corps || !signature || reste !== undefined) return null;
  const attendue = crypto.createHmac("sha256", cle).update(corps).digest();
  let recue;
  try { recue = Buffer.from(signature, "base64url"); } catch { return null; }
  if (recue.length !== attendue.length || !crypto.timingSafeEqual(recue, attendue)) return null;
  let donnees;
  try { donnees = JSON.parse(Buffer.from(corps, "base64url").toString("utf8")); } catch { return null; }
  if (!donnees || typeof donnees.exp !== "number" || donnees.exp * 1000 <= maintenant) return null;
  return donnees;
}

function lireCookies(req) {
  const sortie = {};
  for (const morceau of String(req.headers?.cookie || "").split(";")) {
    const i = morceau.indexOf("=");
    if (i < 1) continue;
    const nom = morceau.slice(0, i).trim();
    try { sortie[nom] = decodeURIComponent(morceau.slice(i + 1).trim()); } catch { /* cookie ignore */ }
  }
  return sortie;
}

function cookie(nom, valeur, dureeS) {
  return `${nom}=${encodeURIComponent(valeur)}; Path=/api/v1; HttpOnly; Secure; SameSite=Lax; Max-Age=${dureeS}`;
}

function ajouterCookie(res, valeurCookie) {
  const existants = res.getHeader("Set-Cookie");
  const liste = Array.isArray(existants) ? existants : existants ? [String(existants)] : [];
  res.setHeader("Set-Cookie", [...liste, valeurCookie]);
}

function ouvrirSession(res, identite) {
  const jeton = signer({
    f: identite.fournisseur,
    sub: identite.sujet,
    email: identite.email || null,
    nom: identite.nom || null
  }, DUREE_SESSION_S);
  if (!jeton) return false;
  ajouterCookie(res, cookie(COOKIE_SESSION, jeton, DUREE_SESSION_S));
  return true;
}

function fermerSession(res) {
  ajouterCookie(res, cookie(COOKIE_SESSION, "", 0));
}

function identiteSession(req) {
  const d = verifier(lireCookies(req)[COOKIE_SESSION]);
  if (!d || !d.f || !d.sub) return null;
  return { fournisseur: d.f, sujet: d.sub, email: d.email || null, nom: d.nom || null };
}

function ouvrirTransaction(res, donnees) {
  const jeton = signer(donnees, DUREE_TRANSACTION_S);
  if (!jeton) return false;
  ajouterCookie(res, cookie(COOKIE_TRANSACTION, jeton, DUREE_TRANSACTION_S));
  return true;
}

function consommerTransaction(req, res) {
  ajouterCookie(res, cookie(COOKIE_TRANSACTION, "", 0));
  return verifier(lireCookies(req)[COOKIE_TRANSACTION]);
}

function origineValide(req) {
  const origine = String(req.get("origin") || "");
  const hote = String(req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim().toLowerCase();
  try {
    const u = new URL(origine);
    return u.host.toLowerCase() === hote &&
      (u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hote)));
  } catch { return false; }
}

module.exports = {
  signer,
  verifier,
  lireCookies,
  ouvrirSession,
  fermerSession,
  identiteSession,
  ouvrirTransaction,
  consommerTransaction,
  origineValide,
  sessionDisponible: () => Boolean(secret())
};
