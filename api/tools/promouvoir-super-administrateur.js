"use strict";

require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env"), quiet: true });
const droits = require("../auth/droits");
const dse = require("../shared/dse");
const ecriture = require("../shared/ecriture");

async function promouvoir({ utilisateurId, roleId, nom, appliquer }) {
  if (!/^\d+$/.test(utilisateurId || "") || !/^\d+$/.test(roleId || "") || !nom) throw new Error("Utilisateur, rôle et nom exact obligatoires.");
  const calculer = async () => {
    const donnees = await droits.donneesDroits();
    const u = donnees.utilisateurs.find((u) => u.id === utilisateurId && u.titre === nom);
    const role = donnees.roles.find((r) => r.id === roleId && r.actif && r.valide);
    if (!u || !u.actif || !u.valide || !u.entraObjectId) throw new Error("Compte exact, actif, valide et identité liée requis.");
    if (!role || !droits.roleSuperAdministrateur(donnees.politique, roleId)) throw new Error("Rôle super administrateur global officiel requis.");
    if (droits.protegerSuperAdministrateurs(donnees, utilisateurId, roleId)) throw new Error("Identité super administrateur unique requise.");
    const S = donnees.structure;
    if (!S?.colonnes.utilisateurRole || !S.listes.utilisateur) throw new Error("Colonne de rôle utilisateur indisponible.");
    const champ = `${S.colonnes.utilisateurRole}LookupId`;
    return { u, role, op: { type: "modifier", listId: S.listes.utilisateur, itemId: u.id,
      champs: { [champ]: role.id }, avant: ecriture.hash({ [champ]: u.roleId || "" }), selectionChamps: [champ],
      action: "Administration : promotion super administrateur global approuvée",
      nom: u.titre, journalComptes: true, verrouRessource: "gouvernance-super-administrateurs",
      contexteJournal: { utilisateurCibleId: u.id, autorisation: "Demande explicite du titulaire : Laurence WILLIG super administratrice de tous les sites" } } };
  };
  const plan = await calculer();
  console.log(`${plan.u.titre} : ${plan.u.roleTitre} -> ${plan.role.titre} (tous les sites).`);
  if (plan.u.roleId === roleId) { console.log("Déjà conforme : aucune écriture."); return; }
  if (!appliquer) { console.log("Simulation : seule la relation de rôle global du compte sera modifiée."); return; }
  const identite = { fournisseur: "maintenance", sujet: "promotion-super-administrateur-approuvee" };
  const jeton = ecriture.emettreJeton(identite, plan.op).jeton;
  const resultat = await ecriture.executer({ identite, jeton, acteur: "Maintenance approuvée par le titulaire",
    revalider: async () => {
      dse.viderCacheGraph();
      droits.viderCache();
      const actuel = await calculer();
      return actuel.op.listId !== plan.op.listId || actuel.op.itemId !== plan.op.itemId ||
        actuel.op.avant !== plan.op.avant ? "Compte ou rôle modifié entre-temps." : null;
    } });
  if (!resultat.succes || resultat.relecture !== "conforme") throw new Error(resultat.erreur || "Promotion non confirmée par relecture et journal.");
  console.log("Promotion enregistrée, relue et journalisée. Aucun autre compte, profil ou accès modifié.");
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const lire = (nom) => args[args.indexOf(nom) + 1];
  promouvoir({ utilisateurId: args.includes("--utilisateur") ? lire("--utilisateur") : "",
    roleId: args.includes("--role") ? lire("--role") : "", nom: args.includes("--nom") ? lire("--nom") : "",
    appliquer: args.includes("--apply") }).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
module.exports = { promouvoir };
