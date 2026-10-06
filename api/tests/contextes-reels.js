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
  const uiComptes = await import(pathToFileURL(path.join(__dirname, "..", "..", "modules/cockpit/comptes.js")));
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
    fournisseur: "entra", sujet: u.entraObjectId
  });
  const nonLies = data.utilisateurs.filter((u) => u.actif && u.valide && !u.entraObjectId);
  for (const u of nonLies) {
    assert.equal(droits.calculerDroits({ identite: { fournisseur: "entra", sujet: u.titre, email: u.titre }, ...data }).reconnu, false);
    noter(`Compte natif ${u.id} sans OID : aucun rapprochement par Title`);
  }
  const bases = data.utilisateurs.filter((u) => u.actif && u.valide && u.entraObjectId).map((u) => {
    const i = identite(u);
    const d = droits.calculerDroits({ identite: i, ...data });
    assert.ok(d.reconnu, "Un compte reel actif/valide doit etre reconnu sans politique globale.");
    return { u, identite: i, droits: d };
  });
  assert.ok(bases.length, "Aucun compte reel exploitable.");
  const { sites: index } = await droits.sitesIndex();
  const groupes = perimetre.regrouperSites([...index.values()]);
  let complets = 0;
  for (const l of data.liens) {
    const u = data.utilisateurs.find((u) => u.id === l.utilisateurId);
    const c = droits.contexteSite({ reconnu: !!u?.actif && !!u?.valide, utilisateurId: u?.id }, data, l.siteId);
    if (c.contexte.etat === "COMPLET") {
      assert.equal(c.roleId, l.roleId); assert.equal(c.accesType.id, l.accesTypeId);
      assert.deepEqual(c.siteIds, [l.siteId]); assert.deepEqual(c.clientIds, [l.clientId]);
      if (l.verrouille) assert.equal(c.niveau, droits.regleRole(data.politique, l.roleId).niveau);
      complets++;
      noter(`Relation native ${l.id} : moteur contextuel complet, hors preuve OAuth`);
    }
  }
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
      const html = uiComptes.rendreComptes({}, comptes.corps.donnees);
      assert.ok(html.includes("Gérer les accès"));
      assert.ok(!html.includes('data-action-admin="modifier-acces-site"'));
      for (const u of comptes.corps.donnees.utilisateurs) {
        assert.ok(!Object.hasOwn(u, "sites"), "la liste ne charge pas les affectations imbriquees");
        const fiche = await appeler(api.adminUtilisateurs, base, { utilisateur: u.ref });
        assert.equal(fiche.code, 200);
        const rendu = uiComptes.rendreComptes({}, fiche.corps.donnees);
        assert.ok(rendu.includes("Synthèse utilisateur"));
        for (const s of fiche.corps.donnees.utilisateur.sites) {
          if (s.verrouille) assert.equal(s.modifiable, false);
          for (const [cle, valeur] of [["site", s.siteRef], ["client", s.clientRef],
            ["role", s.roleRef], ["accesType", s.accesTypeRef], ["actif", String(s.actif)],
            ["valide", String(s.valide)], ["verrouille", String(s.verrouille)], ["incomplet", String(s.incomplet)]]) {
            const filtre = await appeler(api.adminUtilisateurs, base, { utilisateur: u.ref, [cle]: valeur });
            assert.equal(filtre.code, 200);
            assert.ok(filtre.corps.donnees.utilisateur.sites.some((l) => l.ref === s.ref));
            assert.ok(filtre.corps.donnees.utilisateur.sites.every((l) =>
              String(Object.hasOwn(l, `${cle}Ref`) ? l[`${cle}Ref`] : l[cle]) === valeur));
          }
          const combines = await appeler(api.adminUtilisateurs, base, { utilisateur: u.ref,
            q: s.nom, site: s.siteRef, client: s.clientRef, role: s.roleRef, accesType: s.accesTypeRef,
            actif: String(s.actif), valide: String(s.valide), verrouille: String(s.verrouille), incomplet: String(s.incomplet) });
          assert.ok(combines.corps.donnees.utilisateur.sites.some((l) => l.ref === s.ref));
          for (const cle of ["actif", "valide", "verrouille", "incomplet"]) {
            const inverse = await appeler(api.adminUtilisateurs, base, { utilisateur: u.ref, [cle]: String(!s[cle]) });
            assert.ok(!inverse.corps.donnees.utilisateur.sites.some((l) => l.ref === s.ref));
          }
          for (const q of [s.nom, s.domaine, s.client, s.role, s.accesType].filter(Boolean)) {
            const recherche = await appeler(api.adminUtilisateurs, base, { utilisateur: u.ref, q });
            assert.ok(recherche.corps.donnees.utilisateur.sites.some((l) => l.ref === s.ref));
          }
        }
        for (const tri of ["site", "domaine", "client", "role", "accesType", "etat", "modifieLe"]) {
          const asc = await appeler(api.adminUtilisateurs, base, { utilisateur: u.ref, tri, sens: "asc", parPage: "100" });
          const desc = await appeler(api.adminUtilisateurs, base, { utilisateur: u.ref, tri, sens: "desc", parPage: "100" });
          assert.equal(asc.corps.donnees.pagination.criteres.tri, tri);
          assert.equal(desc.corps.donnees.pagination.criteres.sens, "desc");
          assert.equal(asc.corps.donnees.pagination.total, desc.corps.donnees.pagination.total);
        }
        for (const parPage of [10, 25, 50, 100]) {
          const paginee = await appeler(api.adminUtilisateurs, base, { utilisateur: u.ref, parPage: String(parPage), page: "99999" });
          const p = paginee.corps.donnees.pagination;
          assert.equal(p.parPage, parPage); assert.equal(p.page, p.pages);
          assert.ok(paginee.corps.donnees.utilisateur.sites.length <= parPage);
        }
      }
      noter("Comptes : liste legere, fiches affectations, protection verrouillee");
      noter("Affectations reelles : recherche sur cinq champs, huit filtres, combinaisons, sept tris et quatre tailles de page");
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
        const fiche = await appeler(api.adminUtilisateurs, base, { contexteDomaine: s.acces, utilisateur: u.ref });
        for (const relation of fiche.corps.donnees.utilisateur.sites) {
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
      const params = { utilisateur: utilisateur.ref, domaine, role: role.ref, accesType: profil.ref,
        actif: "true", valide: "true", verrouille: "false" };
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
      const fiche = await administration.utilisateurs(admin.droits, { utilisateur: utilisateur.ref });
      const relation = fiche.utilisateur.sites.find((s) => s.ref === administration._test.ref("l", lien.id));
      assert.ok(relation.modifieLe && Number.isFinite(Date.parse(relation.modifieLe)),
        "la date native de modification de l'affectation est disponible pour le tri");
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
      } else if (relation?.verrouille) {
        const modification = await administration.construireAction(admin.droits, "modifier-acces-site",
          { ...params, relation: relation.ref }, null);
        assert.match(modification.refus, /verrouill/);
        const deverrouillage = await administration.construireAction(admin.droits, "deverrouiller-acces-site",
          { utilisateur: utilisateur.ref, relation: relation.ref }, null);
        assert.ok(deverrouillage.op);
        assert.equal(deverrouillage.op.champs[`${data.structure.colonnes.lienVerrou}LookupId`], data.structure.etats.verrouNon);
        noter("Relation verrouillee : modification refusee, deverrouillage global explicite prevalide sans ecriture");
      }
      assert.ok((await administration.construireAction(admin.droits, "lier-identite-utilisateur",
        { utilisateur: utilisateur.ref, codeLiaison: "" }, null)).refus);
      noter("Identite : liaison refusee sans preuve OAuth personnelle, aucune attribution par navigateur");
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
