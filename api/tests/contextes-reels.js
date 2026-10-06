"use strict";

const assert = require("assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const droits = require("../auth/droits");
const dse = require("../shared/dse");
const session = require("../auth/session");
const administration = require("../shared/administration");
const ecriture = require("../shared/ecriture");
const perimetre = require("../shared/perimetre");
const api = require("../dseCockpit");

// Lecture seule : comptes, sites, roles et profils proviennent exclusivement de SharePoint.
async function main() {
  const resultats = [];
  const ui = await import(pathToFileURL(path.join(__dirname, "..", "..", "modules/cockpit/cockpit.js")));
  const noter = (test, resultat = "OK") => { resultats.push({ test, resultat }); };
  dse.viderCacheGraph();
  droits.viderCache();
  const data = await droits.donneesDroits();
  const g = await ecriture.contexteGraph();
  assert.ok(data.structure, "Structure des droits indisponible.");
  const cols = await dse.chargerColonnesListe(g.token, g.siteGraphId, data.structure.listes.lien);
  for (const [nom, champ, liste] of [
    ["OBJ-ROLE", "lienRole", data.structure.listes.role],
    ["OBJ-ACCES-TYPE", "lienAccesType", data.structure.listes.acces]
  ]) {
    const colonne = cols.find((c) => c.displayName === nom);
    assert.ok(colonne?.lookup, `${nom} doit etre un Lookup reel.`);
    assert.equal(colonne.lookup.allowMultipleValues, false);
    assert.equal(colonne.lookup.listId.toLowerCase(), liste.toLowerCase());
    assert.equal(data.structure.colonnes[champ], colonne.name);
    noter(`Schema dynamique ${nom}`);
  }
  const identite = (u) => ({
    fournisseur: "entra", sujet: u.entraObjectId || u.titre, email: u.titre
  });
  const bases = data.utilisateurs.filter((u) => u.actif && u.valide).map((u) => {
    const i = identite(u);
    const d = droits.calculerDroits({ identite: i, ...data });
    assert.ok(d.reconnu, "Un compte reel actif/valide doit etre reconnu sans politique globale.");
    return { u, identite: i, droits: d };
  });
  assert.ok(bases.length, "Aucun compte reel exploitable.");
  const { sites: index } = await droits.sitesIndex();
  const groupes = perimetre.regrouperSites([...index.values()]);
  let complets = 0;
  for (const base of bases) {
    const liens = data.liens.filter((l) => l.actif && l.valide && l.utilisateurId === base.u.id);
    for (const lien of liens) {
      const contexte = droits.contexteSite(base.droits, data, lien.siteId);
      if (contexte.contexte.etat === "COMPLET") {
        assert.equal(contexte.roleId, lien.roleId);
        assert.equal(contexte.accesType.id, lien.accesTypeId);
        assert.deepEqual(contexte.siteIds, [lien.siteId]);
        assert.deepEqual(contexte.clientIds, [lien.clientId]);
        assert.equal(contexte.global, false);
        if (lien.verrouille) {
          const profil = data.accesTypes.find((a) => a.id === lien.accesTypeId);
          if (!profil.niveau) assert.equal(contexte.niveau, droits.regleRole(data.politique, lien.roleId).niveau);
          noter(`Relation ${lien.id} verrouillee : connexion et niveau du role preserves`);
        }
        complets++;
      } else {
        assert.deepEqual(contexte.fonctions, []);
        assert.deepEqual(contexte.siteIds, []);
        assert.equal(contexte.role, null);
        assert.equal(contexte.accesType, null);
        noter(`Relation reelle ${lien.id} : refus controle du contexte incomplet`);
      }
    }
    const horsPerimetre = data.sites.find((s) => !liens.some((l) => l.siteId === s.id));
    if (horsPerimetre) {
      const refus = droits.contexteSite(base.droits, data, horsPerimetre.id);
      assert.equal(refus.contexte.etat, "CONTEXTE INCOMPLET");
      assert.deepEqual(refus.fonctions, []);
      noter(`Compte ${base.u.id} : refus site reel non attribue`);
    }
    if (!base.droits.global) {
      assert.deepEqual(base.droits.fonctions, []);
      const menu = await administration.menu(base.droits);
      assert.ok(menu.some((e) => e.cle === "sites"));
      assert.ok(menu.some((e) => e.url === "/cockpit/compte"));
      assert.ok(!menu.some((e) => ["administration", "utilisateurs", "creer"].includes(e.cle)));
      noter(`Compte ${base.u.id} : menu personnel sans administration globale`);
    }
  }

  // Sessions locales signees a partir d'identites existantes ; aucune authentification OAuth simulee.
  async function appeler(handler, base, query = {}) {
    const entetes = {};
    assert.ok(session.ouvrirSession({ getHeader: (n) => entetes[n], setHeader: (n, v) => { entetes[n] = v; } }, base.identite),
      "Secret de session existant requis pour la recette API.");
    const req = { query, headers: { cookie: entetes["Set-Cookie"].map((v) => v.split(";")[0]).join("; ") }, hostname: "",
      get: () => "" };
    if (process.env.DSE_CONTEXTES_BASE) {
      const routes = new Map([[api.monCompte, "/cockpit/compte"], [api.sites, "/cockpit/sites"],
        [api.adminUtilisateurs, "/cockpit/admin/utilisateurs"], [api.moi, "/moi"]]);
      const route = routes.get(handler);
      assert.ok(route, "Route de recette HTTP inconnue.");
      const url = new URL(`/api/v1${route}`, process.env.DSE_CONTEXTES_BASE);
      url.search = new URLSearchParams(query).toString();
      const reponse = await fetch(url, { headers: { cookie: req.headers.cookie, Accept: "application/json" },
        signal: AbortSignal.timeout(60000) });
      return { code: reponse.status, corps: await reponse.json() };
    }
    const res = { code: null, corps: null, status(v) { this.code = v; return this; },
      set() { return this; }, json(v) { this.corps = v; return this; } };
    await handler(req, res);
    return res;
  }
  for (const base of bases) {
    const compte = await appeler(api.monCompte, base);
    assert.equal(compte.code, 200);
    assert.equal(compte.corps.donnees.email, base.u.titre);
    assert.equal(compte.corps.donnees.sites.length, data.liens.filter((l) =>
      l.utilisateurId === base.u.id && l.actif && l.valide).length);
    assert.ok(ui.rendreMonCompte({}, compte.corps.donnees).includes("Mon compte"));
    noter(`Compte ${base.u.id} : Mon compte prive`);
    const sites = await appeler(api.sites, base, { page: "1", parPage: "50" });
    assert.equal(sites.code, 200);
    const attribues = data.liens.filter((l) => l.utilisateurId === base.u.id && l.actif && l.valide);
    for (const s of sites.corps.donnees.elements) {
      const groupe = perimetre.groupeParDomaine(groupes, s.acces);
      assert.ok(attribues.some((l) => l.siteId === String(groupe.id)));
    }
    noter(`Compte ${base.u.id} : Mes sites exclusivement relationnels`);
    const moi = await appeler(api.moi, base);
    assert.equal(moi.code, 200);
    assert.equal(moi.corps.donnees.nombreSites, sites.corps.donnees.totalSites);
    noter(`Compte ${base.u.id} : compteurs coherents avec Mes sites`);
    const nonGlobal = !base.droits.global;
    const comptes = await appeler(api.adminUtilisateurs, base, { role: data.roles[0]?.id, client: data.clients[0]?.id });
    assert.equal(comptes.code, nonGlobal ? 403 : 200);
    if (!nonGlobal) {
      const html = ui.rendreUtilisateurs({}, comptes.corps.donnees);
      assert.ok(html.includes('name="accesType" required'));
      assert.ok(html.includes('name="role" required'));
      if (comptes.corps.donnees.utilisateurs.some((u) => u.sites.some((s) => s.modifiable))) {
        assert.ok(html.includes('data-action-admin="modifier-acces-site"'));
      } else assert.ok(!html.includes('data-action-admin="modifier-acces-site"'));
      noter("Rendu Comptes : formulaires role/profil, protection des relations verrouillees");
    }
    assert.ok(ui.rendreListeSites({}, sites.corps.donnees).includes("Mes sites"));
    const sitesAvecDroits = sites.corps.donnees.elements.filter((s) => s.contexte?.etat === "COMPLET");
    for (const s of sitesAvecDroits) {
      const selection = await appeler(api.moi, base, { domaine: s.acces });
      const menu = selection.corps.donnees.menu;
      assert.ok(menu.some((e) => e.url === `/cockpit/utilisateurs?domaine=${encodeURIComponent(s.acces)}`));
      assert.ok(!menu.some((e) => e.url.startsWith("/cockpit/synchronisations")));
      const comptesContextuels = await appeler(api.adminUtilisateurs, base, { contexteDomaine: s.acces });
      assert.equal(comptesContextuels.code, 200);
      for (const u of comptesContextuels.corps.donnees.utilisateurs) {
        const utilisateur = data.utilisateurs.find((v) => v.titre === u.email);
        assert.ok(utilisateur, "Compte HTTP absent des donnees reelles.");
        for (const relation of u.sites) {
          const groupe = perimetre.groupeParDomaine(groupes, relation.domaine);
          const native = data.liens.find((l) => l.utilisateurId === utilisateur.id && l.siteId === String(groupe?.id));
          assert.ok(native, "Relation HTTP absente des Lookups reels.");
          if (native.verrouille) assert.equal(relation.modifiable, false);
        }
      }
      noter(`Compte ${base.u.id} : Comptes contextuels accessibles, relations verrouillees non modifiables`);
    }
    noter(`Compte ${base.u.id} : droits API non elevables par parametres`);
    for (const lien of attribues) {
      const groupe = groupes.find((s) => String(s.id) === lien.siteId);
      const domaine = groupe && perimetre.domaineAcces(groupe);
      if (!domaine) continue;
      const contexte = droits.contexteSite(base.droits, data, lien.siteId);
      const selection = await appeler(api.moi, base, { domaine, role: data.roles[0]?.id });
      if (contexte.contexte.etat !== "COMPLET") {
        assert.equal(selection.code, 403);
        noter(`Relation ${lien.id} : selection API refusee, aucun repli global`);
      } else {
        assert.equal(selection.code, 200);
        assert.equal(selection.corps.donnees.role.titre, contexte.role.titre);
        assert.equal(selection.corps.donnees.accesType.titre, contexte.accesType.titre);
        assert.equal(selection.corps.donnees.contexte.domaine, domaine);
        noter(`Relation ${lien.id} : selection et rechargement du contexte API`);
      }
    }
  }

  const admin = bases.find((b) => b.droits.global && b.droits.fonctions.includes("utilisateurs"));
  if (admin) {
    const vue = await administration.utilisateurs(admin.droits);
    const role = vue.roles[0];
    const profil = vue.accesTypes[0];
    assert.ok(role && profil, "Role et profil reels attribuables requis.");
    const lien = data.liens.find((l) => l.actif && data.utilisateurs.some((u) => u.id === l.utilisateurId && u.actif && u.valide));
    if (lien) {
      const utilisateur = vue.utilisateurs.find((u) => u.ref === administration._test.ref("u", lien.utilisateurId));
      const domaine = perimetre.domaineAcces(groupes.find((s) => String(s.id) === lien.siteId));
      const params = { utilisateur: utilisateur.ref, domaine, role: role.ref, accesType: profil.ref };
      const doublon = await administration.construireAction(admin.droits, "ajouter-acces-site", params, null);
      assert.match(doublon.refus, /relation active|Plusieurs relations/);
      const incomplet = await administration.construireAction(admin.droits, "ajouter-acces-site",
        { utilisateur: utilisateur.ref, role: role.ref, accesType: profil.ref }, null);
      assert.ok(incomplet.refus);
      const c = data.structure.colonnes;
      const colonneActif = cols.find((col) => col.name === c.lienActif);
      const oui = (await dse.chargerItemsListe(g.token, g.siteGraphId, colonneActif.lookup.listId))
        .filter((i) => /^oui\b/i.test(String(i.fields?.Title || "").trim()));
      assert.equal(oui.length, 1);
      assert.equal(await administration.controleDoublon({
        listId: data.structure.listes.lien, cleDoublon: `lien:${lien.utilisateurId}:${lien.siteId}`,
        doublonChamps: { utilisateur: `${c.lienUtilisateur}LookupId`, site: `${c.lienSite}LookupId`,
          actif: `${c.lienActif}LookupId`, actifId: String(oui[0].id) }
      })(g), true);
      noter("Refus doublon Utilisateur + Site : prevalidation et relecture Graph");
      noter("Refus ecriture sans site : aucune operation produite");
      const relation = utilisateur.sites.find((s) => s.ref === administration._test.ref("l", lien.id));
      if (relation?.modifiable) {
        const modification = await administration.construireAction(admin.droits, "modifier-acces-site",
          { ...params, relation: relation.ref }, null);
        assert.ok(modification.op || modification.aucunChangement);
        if (modification.op) {
          assert.equal(modification.op.itemId, lien.id);
          const version = await ecriture.lireItemFrais(g, modification.op.listId, modification.op.itemId, modification.op.selectionChamps);
          assert.equal(modification.op.verifierVersion(version), null);
          assert.equal(modification.op.champs[`${c.lienUtilisateur}LookupId`], lien.utilisateurId);
          assert.equal(modification.op.champs[`${c.lienSite}LookupId`], lien.siteId);
          assert.equal(modification.op.champs[`${c.lienClient}LookupId`], lien.clientId);
        }
        noter("Correction relation reelle : champs, perimetre et version valides, sans ecriture");
      }
      const autre = vue.sites.find((s) => data.sites.find((v) =>
        v.id === String(perimetre.groupeParDomaine(groupes, s.domaine)?.id))?.valide && !data.liens.some((l) => l.actif &&
        l.utilisateurId === lien.utilisateurId &&
        l.siteId === String(perimetre.groupeParDomaine(groupes, s.domaine)?.id)));
      if (autre) {
        const action = await administration.construireAction(admin.droits, "ajouter-acces-site",
          { ...params, domaine: autre.domaine }, null);
        assert.ok(action.op && !action.refus);
        noter("Meme utilisateur + autre site reel : prevalidation autorisee, sans ecriture");
      }
    }
  } else noter("Administration Comptes", "NON TESTABLE : aucun administrateur global reel");
  const multiComplet = bases.some((b) => {
    const liens = data.liens.filter((l) => l.utilisateurId === b.u.id &&
      droits.contexteSite(b.droits, data, l.siteId).contexte.etat === "COMPLET");
    return new Set(liens.map((l) => l.roleId)).size > 1 && new Set(liens.map((l) => l.accesTypeId)).size > 1;
  });
  noter("Changement entre deux contextes complets de roles/profils differents",
    multiComplet ? "OK" : "NON TESTABLE : relations completes distinctes manquantes");
  console.log(JSON.stringify({ lectureSeule: true, transport: process.env.DSE_CONTEXTES_BASE ? "HTTP" : "CONTROLEUR",
    comptes: bases.length, relationsCompletes: complets, resultats }, null, 2));
}

main().catch((err) => {
  console.error("Recette contextes reels : ECHEC", err.message);
  process.exitCode = 1;
});
