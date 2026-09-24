# Checklist preuve Microsoft 365 V1

## Validation 1 - Dataverse
- [ ] Les tables V1 existent.
- [ ] Les 3 comptes pilotes existent.
- [ ] Les 3 sites pilotes existent.
- [ ] Les statuts sont visibles dans Dataverse.

## Validation 2 - Power Apps
- [ ] Pascal voit un accueil cockpit.
- [ ] Pascal voit les comptes.
- [ ] Pascal voit les sites avec statut clair.
- [ ] Pascal voit les projets.
- [ ] Pascal voit les journaux.

## Validation 3 - Power Pages public
- [ ] Une page publique est accessible sans connexion.
- [ ] Le visiteur ne voit pas les donnees privees.

## Validation 4 - Power Pages client
- [ ] Un client connecte voit uniquement son compte.
- [ ] Un client connecte voit ses projets.
- [ ] Un client connecte voit ses documents.
- [ ] Un client connecte voit ses produits/commandes si disponibles.

## Validation 5 - SharePoint documents
- [ ] Un document SharePoint est rattache a un compte.
- [ ] Le document est visible dans le portail client avec les droits corrects.

## Validation 6 - Journalisation
- [ ] Une creation ou modification ecrit une ligne dans DSE_JournalActions.
- [ ] Le journal indique OK ou ERREUR de maniere lisible.

## Regle finale
Si une preuve manque, la version V1 n'est pas validee.
