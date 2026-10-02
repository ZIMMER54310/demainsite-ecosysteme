"use strict";

// Synchronisation DSE : SharePoint (domaines actifs/valides) -> DNS OVH -> Nginx -> certificat HTTPS.
// LECTURE SEULE cote SharePoint. Par defaut : PLAN uniquement (rien n'est modifie).
//
//   node tools/sync-domaines.js                    plan complet
//   sudo node tools/sync-domaines.js --nginx       ecrit /etc/nginx/conf.d/dse-<domaine>.conf + reload
//   sudo node tools/sync-domaines.js --https       obtient les certificats (si DNS OK) via certbot
//   node tools/sync-domaines.js --dns              applique le DNS OVH (necessite OVH_APP_KEY/OVH_APP_SECRET/OVH_CONSUMER_KEY)
//   --domaine=exemple.fr                           limite STRICTEMENT a ce domaine (doit exister dans SharePoint)
//   --nouveaux                                     liste (lecture seule) les domaines restant a configurer
//   --tous                                         requis pour modifier plusieurs domaines d'un coup (sans --domaine)
// Les modes --dns/--nginx/--https exigent --domaine=x ou --tous. Options inconnues : refus.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const dns = require("dns").promises;
const { execFileSync } = require("child_process");
const { lireDomainesSharePoint, lireNginx, DOMAINE_VALIDE, confHttp, selectionner } = require("../shared/domaines");
const ovh = require("../shared/ovh");

const VPS_IP = process.env.DSE_VPS_IP || "57.129.164.243";
const BACKUPS = process.env.DSE_BACKUP_DIR || require("path").join(__dirname, "..", "backups");
const CONNUS = new Set(["--dns", "--nginx", "--https"]);
const argsBrutes = process.argv.slice(2);
const arg = (n) => argsBrutes.includes(n);
const argDomaine = argsBrutes.find((a) => a.startsWith("--domaine"));
const filtre = argDomaine === undefined ? undefined : (argDomaine.startsWith("--domaine=") ? argDomaine.slice(10) : "");
const inconnus = argsBrutes.filter((a) => !CONNUS.has(a) && a !== "--nouveaux" && !a.startsWith("--domaine") && a !== "--tous");
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const fichierConf = (d) => `/etc/nginx/conf.d/dse-${d}.conf`;

// Interroge les serveurs faisant autorite (evite les caches de propagation) ; repli sur le resolveur systeme.
async function resolveur(d) {
  try {
    const ns = await dns.resolveNs(d);
    const ips = (await Promise.all(ns.map((n) => dns.resolve4(n).catch(() => [])))).flat();
    if (ips.length) { const r = new dns.Resolver({ timeout: 4000, tries: 2 }); r.setServers(ips); return r; }
  } catch (_) { /* repli */ }
  return dns;
}

async function dnsPointeVersVps(d) {
  try {
    const r = await resolveur(d);
    const a = await r.resolve4(d);
    if (!a.includes(VPS_IP)) return false;
    const w = await r.resolve4("www." + d).catch(() => []);
    return w.includes(VPS_IP);
  } catch (_) { return false; }
}

const certificatExiste = (d, nginx) =>
  fs.existsSync(`/etc/letsencrypt/live/${d}/fullchain.pem`) ||
  [...(nginx.fichiers[d] || [])].some((f) => { try { return /ssl_certificate\s/.test(fs.readFileSync(f, "utf8")); } catch (_) { return false; } });

(async () => {
  log("DEBUT sync-domaines");
  if (inconnus.length) throw new Error(`Option(s) inconnue(s) : ${inconnus.join(" ")} (options : --nouveaux --domaine=x --dns --nginx --https --tous)`);
  const ecriture = [...CONNUS].some(arg);
  const actifs = (await lireDomainesSharePoint()).filter((d) => d.actif && d.valide);
  const sel = selectionner(actifs, { filtre, ecriture, tous: arg("--tous") });
  if (sel.erreur) throw new Error(sel.erreur);
  const sp = sel.domaines;
  log(`AUDIT ${sp.length} domaine(s) actif(s)/valide(s) selectionne(s) ; mode ${ecriture ? "MODIFICATION" : "PLAN"}`);
  const nginx = lireNginx();
  const rapport = [];
  let rechargerNginx = false;

  for (const { domaine: d } of sp) {
    const r = { domaine: d, dns: "?", nginx: "?", https: "?", actions: [] };
    if (!DOMAINE_VALIDE.test(d)) { r.dns = r.nginx = r.https = "IGNORE (nom invalide)"; rapport.push(r); continue; }

    // DNS
    let dnsOk = await dnsPointeVersVps(d);
    r.dns = dnsOk ? "OK" : "A CONFIGURER";
    if (!dnsOk) {
      if (!ovh.configure()) r.actions.push(`DNS: configurer A ${d} -> ${VPS_IP} et CNAME www -> ${d}. (API OVH non configuree)`);
      else {
        try {
          if (!(await ovh.zoneExiste(d))) r.actions.push("DNS: zone absente du compte OVH (domaine gere ailleurs)");
          else {
            const plan = await ovh.planDns(d, VPS_IP);
            plan.actions.forEach((a) => r.actions.push(`DNS OVH: ${a.op} ${a.type} ${a.sousDomaine || "@"} -> ${a.cible}`));
            if (arg("--dns") && plan.actions.length) {
              const sauv = await ovh.appliquerDns(d, plan, BACKUPS);
              r.actions.push(`DNS OVH: applique (sauvegarde rollback : ${sauv})`);
              log(`ACTION DNS applique pour ${d}`);
            }
          }
        } catch (e) { r.actions.push(`DNS OVH: ${e.message}`); }
      }
    }

    // Nginx
    const dejaConf = nginx.noms.has(d);
    const gere = fs.existsSync(fichierConf(d));
    if (dejaConf) r.nginx = "OK";
    else {
      r.nginx = "A CREER";
      r.actions.push(`Nginx: creer ${fichierConf(d)}`);
      if (arg("--nginx")) {
        const f = fichierConf(d);
        fs.writeFileSync(f, confHttp(d), { mode: 0o644, flag: "wx" });
        try {
          execFileSync("nginx", ["-t"], { stdio: "pipe" });
          rechargerNginx = true;
          r.nginx = "CREE";
          log(`ACTION Nginx ${f} cree`);
        } catch (e) {
          fs.unlinkSync(f);
          r.nginx = "ECHEC (annule)";
          log(`ERREUR Nginx invalide pour ${d} ; ${f} retire (CORRECTION)`);
        }
      }
    }

    // HTTPS
    if (certificatExiste(d, nginx)) r.https = "OK";
    else if (!dnsOk) r.https = "EN ATTENTE DNS";
    else if (!(dejaConf || gere || arg("--nginx"))) r.https = "EN ATTENTE NGINX";
    else {
      r.https = "A OBTENIR";
      r.actions.push(`HTTPS: certbot --nginx -d ${d} -d www.${d}`);
    }
    rapport.push(r);
  }

  if (rechargerNginx) {
    execFileSync("systemctl", ["reload", "nginx"], { stdio: "inherit" });
    log("ACTION nginx recharge");
  }

  if (arg("--https")) {
    for (const r of rapport) {
      if (r.https !== "A OBTENIR" && !(r.https === "EN ATTENTE NGINX" && rechargerNginx)) continue;
      const args = ["--nginx", "-d", r.domaine, "-d", "www." + r.domaine, "--non-interactive", "--agree-tos", "--redirect"];
      if (process.env.DSE_CERTBOT_EMAIL) args.push("-m", process.env.DSE_CERTBOT_EMAIL);
      try { execFileSync("certbot", args, { stdio: "inherit" }); r.https = "OBTENU"; }
      catch (_) { r.https = "ECHEC certbot"; }
    }
  }

  const c = (v, n) => String(v).padEnd(n);
  console.log(`${c("DOMAINE", 24)}| ${c("DNS", 14)}| ${c("NGINX", 9)}| HTTPS`);
  for (const r of rapport) console.log(`${c(r.domaine, 24)}| ${c(r.dns, 14)}| ${c(r.nginx, 9)}| ${r.https}`);
  console.log("");
  for (const r of rapport) r.actions.forEach((a) => console.log(`[${r.domaine}] ${a}`));
  if (arg("--nouveaux")) {
    const aFaire = rapport.filter((x) => [x.dns, x.nginx, x.https].some((v) => !/^OK/.test(v)));
    console.log("\nNOUVEAUX DOMAINES (a traiter un par un, jamais en bloc) :");
    if (!aFaire.length) console.log("  aucun : tout est a jour");
    for (const x of aFaire) console.log(`  ${x.domaine} : sync-domaines.js --domaine=${x.domaine} --dns ; sudo ... --nginx ; (apres propagation DNS) sudo ... --https`);
  }
  if (!ecriture) console.log("\nMode PLAN : rien n'a ete modifie.");
  log("FIN sync-domaines - TERMINE");
})().catch((e) => { console.error("ECHEC sync :", e.message); process.exit(2); });
