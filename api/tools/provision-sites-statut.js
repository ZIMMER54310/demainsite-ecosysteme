"use strict";

// Provisionneur idempotent : OBJ-SITES-STATUT + Lookup OBJ-SITE-PUBLIC -> OBJ-SITES-STATUT.
// Modes : --plan (lecture seule) | --apply (liste, colonnes, 5 statuts) | --seed (affecte un statut aux sites SANS statut) | --verify
// Aucune suppression, aucun renommage. --apply et --seed exigent Sites.Manage.All / Sites.Selected selon l'operation.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const dse = require("../shared/dse");
const P = require("../shared/provisionnement");
const { cle, T, TL, N, B, L, ETAT_VEROUILLE } = P;

const STATUTS = [
  { titre: "Construction", code: "CONSTRUCTION", note: "Site en préparation, avant intervention et validation du client." },
  { titre: "Actif", code: "ACTIF", note: "Site publié : le vrai site est affiché." },
  { titre: "Maintenance", code: "MAINTENANCE", note: "Opération de maintenance en cours." },
  { titre: "Suspendu", code: "SUSPENDU", note: "Site temporairement indisponible." },
  { titre: "Archivé", code: "ARCHIVE", note: "Site archivé, aucune donnée supprimée." }
];
const SPECIALES = new Set(["CONSTRUCTION", "MAINTENANCE", "SUSPENDU", "ARCHIVE"]);

const LISTES = [
  {
    nom: "OBJ-SITES-STATUT", creer: true,
    colonnes: [T("CODE"), T("NOTE-COURTE"), TL("NOTE-LONGUE"), N("ORDRE-AFFICHAGE"), B("AFFICHER-PAGE-SPECIALE"), ...ETAT_VEROUILLE()]
  },
  { nom: "OBJ-SITE-PUBLIC", creer: false, colonnes: [L("OBJ-SITES-STATUT", "OBJ-SITES-STATUT")] }
];

const planifier = (etat) => P.planifierListes(etat, LISTES);

async function semerStatuts(token, siteId, etat) {
  const id = etat.ids["OBJ-SITES-STATUT"];
  const existants = await P.elementsDe(token, siteId, id);
  const col = (n) => P.nomInterne(etat, "OBJ-SITES-STATUT", n);
  let n = 0;
  for (const [i, s] of STATUTS.entries()) {
    const avant = existants.length;
    await P.creerSiAbsent(token, siteId, id, s.titre, {
      [col("CODE")]: s.code, [col("NOTE-COURTE")]: s.note, [col("ORDRE-AFFICHAGE")]: i + 1,
      [col("AFFICHER-PAGE-SPECIALE")]: SPECIALES.has(s.code),
      [`${col("OBJ-ACTIF")}LookupId`]: 1, [`${col("OBJ-VALIDE")}LookupId`]: 1, [`${col("OBJ-VEROUILLE")}LookupId`]: 2
    }, existants);
    n += existants.length - avant;
  }
  return n;
}

// Sites sans statut : Actif s'ils servent deja un vrai site (page d'accueil active+validee), sinon Construction.
async function affecter(token, siteId, etat) {
  const statuts = await P.elementsDe(token, siteId, etat.ids["OBJ-SITES-STATUT"]);
  const parCode = (c) => statuts.find((s) => cle(s.fields?.CODE) === c)?.id;
  const sites = await P.elementsDe(token, siteId, etat.ids["OBJ-SITE-PUBLIC"]);
  const colSite = P.nomInterne(etat, "OBJ-SITE-PUBLIC", "OBJ-SITES-STATUT");
  const donnees = await require("../shared/builder-source").obtenirDonnees();
  const pret = (sid) => (donnees.pages || []).some((p) => {
    const f = p._fields || {};
    const k = Object.keys(f).find((x) => /^OBJ_x002d_SITE/.test(x) && x.endsWith("LookupId"));
    const ok = (re) => { const kk = Object.keys(f).find((x) => re.test(x) && x.endsWith("LookupId")); return kk && String(f[kk]) === "1"; };
    return k && String(f[k]) === String(sid) && String(f.URL || "/").trim() === "/" && ok(/^OBJ_x002d_ACTIF/) && ok(/^OBJ_x002d_VALIDE/);
  });
  let n = 0;
  for (const s of sites) {
    if (s.fields?.[`${colSite}LookupId`]) continue;
    const cible = parCode(pret(s.id) ? "ACTIF" : "CONSTRUCTION");
    if (!cible) throw new Error("Statuts manquants (--apply requis)");
    console.log(`ACTION site ${s.id} (${s.fields.Title}) -> statut ID ${cible}`);
    await P.appel(token, "PATCH", `/sites/${siteId}/lists/${etat.ids["OBJ-SITE-PUBLIC"]}/items/${s.id}/fields`, { [`${colSite}LookupId`]: String(cible) });
    n += 1;
  }
  return n;
}

async function principal(mode) {
  console.log(`DEBUT provisionnement OBJ-SITES-STATUT (${mode})`);
  const { token, site, large } = await P.contexteProvisionnement(mode);
  const etat = await P.lireEtat(token, site.id, LISTES);
  if (mode === "plan") { P.afficherPlan(planifier(etat)); return 0; }
  if (mode === "verify") {
    const actions = planifier(etat);
    const items = etat.ids["OBJ-SITES-STATUT"] ? await P.elementsDe(token, site.id, etat.ids["OBJ-SITES-STATUT"]) : [];
    const codes = new Set(items.map((i) => cle(i.fields?.CODE)));
    const ok = !actions.length && STATUTS.every((s) => codes.has(s.code));
    console.log(ok ? "VERIFICATION OK" : "VERIFICATION INCOMPLETE");
    return ok ? 0 : 2;
  }
  if (mode === "apply" && !large) { console.log("ARRET : Sites.Manage.All absent. Aucune ecriture effectuee."); return 3; }
  if (mode === "apply") {
    console.log(`Sauvegarde du schema : ${P.sauvegarder(etat, "sites-statut")}`);
    const bilan = await P.appliquerPlan(token, site.id, etat, LISTES);
    const apres = await P.lireEtat(token, site.id, LISTES);
    console.log(`BILAN listes : ${bilan.listes}, colonnes : ${bilan.colonnes}, statuts crees : ${await semerStatuts(token, site.id, apres)}`);
  } else {
    console.log(`BILAN sites affectes : ${await affecter(token, site.id, etat)}`);
  }
  return 0;
}

module.exports = { STATUTS, LISTES, planifier };

if (require.main === module) P.lancer(principal, ["plan", "apply", "seed", "verify"]);
