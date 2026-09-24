# DemainSite Ecosysteme - Test Microsoft 365 V1

## Decision officielle
Le coeur metier de DemainSite Ecosysteme passe par Microsoft 365.
WordPress est mis de cote pour le test et ne doit plus etre le moteur de synchronisation.

## Architecture cible de test
- Dataverse : base metier officielle
- Power Apps : cockpit administrateur Pascal
- Power Pages : portail client et pages publiques
- SharePoint : documents, medias, pieces clients, archives
- Teams : collaboration et suivi
- Power BI : reporting eventuel

## Regle de validation
Aucune validation par discours.
Validation uniquement par preuve visible :
- donnees visibles dans Dataverse
- cockpit Power Apps lisible
- portail Power Pages accessible
- document SharePoint visible depuis le portail
- journal d'action alimente

## Perimetre test V1
Clients pilotes :
- DemainSite
- Acti'Dem
- Carottage Expert

Objets pilotes :
- Comptes
- Relations
- Sites
- Domaines
- Projets
- Documents
- Produits
- Commandes
- Journaux

## Ce qui est abandonne pour le test
- Pont WordPress vers SharePoint
- Statuts WordPress comme source officielle
- Plugins DSE WordPress comme moteur metier
- Synchronisation WordPress multistep

## Resultat attendu
Un administrateur doit voir clairement l'etat des clients, sites, projets, produits, commandes et documents depuis Microsoft 365.
Un client doit acceder a ses informations depuis un portail sans savoir que la technologie est Power Pages.
