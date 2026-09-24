# DSE-INSTALLER-VILLES-PAR-DEPARTEMENT-V1.0

## Objectif
Mettre en place dans SharePoint le systeme de communes / villes classees par departement pour DemainSite Ecosysteme.

Ce pack prepare une organisation SharePoint plus logique :

- une liste index : `Geo - Villes Index`
- une liste par departement : `Villes-54`, `Villes-57`, etc.
- les colonnes utiles pour lier plus tard WordPress : article, produits, medias, score de completude
- des vues simples : Toutes les villes, A completer, Sans article WordPress, Avec article WordPress
- un journal d'actions et un journal d'erreurs
- une note de projet dans la liste `Projets`

## Regle DemainSite
Suppression automatique = NON.
Le script ajoute ou met a jour. Il ne supprime pas les communes.

## Connexion SharePoint utilisee
Url : https://blogssite.sharepoint.com/sites/Bibliotheque
Tenant : demainsite.com
ClientId : 5d607413-77c5-47b2-975a-eaca6827921c
Mode : DeviceLogin

## Utilisation simple
1. Extraire le ZIP.
2. Double-cliquer sur :
   `LANCER-INSTALLATION-VILLES-PAR-DEPARTEMENT.bat`
3. Choisir :
   - `STRUCTURE` pour creer seulement l'organisation SharePoint
   - un code departement, exemple `54` ou `57`, pour importer un seul departement
   - `TOUS` pour importer tous les departements fournis par l'API Geo

## Source des communes
Le script utilise l'API officielle geo.api.gouv.fr :
- liste des departements : https://geo.api.gouv.fr/departements
- communes d'un departement : https://geo.api.gouv.fr/departements/{code}/communes

## Ce que contient une ligne de ville
- Title / Nom commune
- Code INSEE
- Code departement
- Nom departement
- Code region
- Codes postaux
- Population
- SIREN commune
- Code EPCI
- Statut geo
- Article WordPress lie
- Produits lies
- Medias lies
- Score completude
- Source donnee
- Date import

## Important
Ce pack ne publie rien sur WordPress.
Ce pack prepare seulement SharePoint pour la future liaison SharePoint -> WordPress.
