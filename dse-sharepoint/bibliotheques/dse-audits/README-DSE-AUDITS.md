# README — DSE-AUDITS

## Objectif de la bibliothèque
DSE-AUDITS est le coffre officiel DSE pour les audits, rapports, procédures et historiques d’audit. Elle centralise les éléments de preuve et la documentation afin qu’ils restent consultables, traçables, auditables, versionnés et conservés dans le temps.

## Structure des dossiers
- **RAPPORTS** : rapports d’audit finalisés et livrables associés.
- **PROCEDURES** : procédures, méthodes et consignes d’audit.
- **MODELES** : modèles réutilisables de rapports, grilles et supports d’audit.
- **ARCHIVES** : dossiers et documents d’audit clos conservés pour l’historique.

## Convention de version
Renseigner la colonne **VERSION** pour chaque document applicable avec une convention explicite, par exemple : v1.0, v1.1, v2.0. Les versions SharePoint complètent cette convention et assurent la traçabilité des modifications.

## Cycle de vie des audits
1. Création et qualification en **Brouillon**.
2. Réalisation en **En cours**.
3. Revue et validation en **Validé**.
4. Mise à jour ou remplacement en **Obsolète**.
5. Conservation longue durée en **Archivé**.

Le résultat doit être renseigné comme **Conforme**, **Conforme avec remarques**, **Non conforme** ou **À corriger**. Toute non-conformité doit être documentée avec les éléments de preuve et le rapport associé.

## Règles de conservation
- Aucune suppression automatique n’est autorisée.
- Les audits et leurs preuves restent conservés dans le temps.
- Les éléments clos sont déplacés dans **ARCHIVES** sans rupture de traçabilité.
- Les métadonnées, versions et liens de rapport doivent être maintenus.

## Règles de journalisation DSE
Chaque audit doit comporter un nom explicite, son type, sa version, son statut, sa date, son auditeur, son résultat, sa criticité, des mots-clés et une description. Les décisions, constats, corrections et changements significatifs doivent être journalisés dans les supports DSE prévus à cet effet.

## Liens avec les référentiels DSE
- **OBJ-JRN** : référence de journalisation des événements, constats et décisions liés aux audits.
- **DSE-RAPPORTS** : référentiel de diffusion et de consultation des rapports issus des audits.
- **DSE-OUTILS** : espace réservé aux scripts et outils ; il ne contient pas les résultats ni la documentation d’audit.

## Règle de séparation
- **DSE-OUTILS** = scripts et outils.
- **DSE-AUDITS** = résultats et documentation des audits.