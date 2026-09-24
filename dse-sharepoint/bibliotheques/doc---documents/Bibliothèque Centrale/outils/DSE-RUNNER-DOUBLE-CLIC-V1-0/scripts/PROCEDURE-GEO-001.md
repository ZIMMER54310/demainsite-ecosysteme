# GEO-001 - Referentiel Geographique France

## Statut
Procedure officielle DemainSite Ecosysteme.

## Version
1.0

## Objectif
Maintenir automatiquement le referentiel geographique France dans la Bibliotheque Centrale SharePoint.

Structure officielle :

```text
Pays
↓
Regions
↓
Departements
↓
Villes / Communes
↓
CodesPostaux
↓
CodesPostauxVilles
```

Cette structure doit alimenter les fiches Relations, Clients, Sites, Domaines, Utilisateurs et Projets.

## Listes SharePoint officielles

- Pays
- Regions
- Departements
- Villes
- CodesPostaux
- CodesPostauxVilles
- Journal actions
- Journal erreurs
- Procedures

## Regle source unique
La Bibliotheque Centrale SharePoint est la source officielle.
Aucune donnee geographique officielle ne doit etre geree durablement hors Bibliotheque Centrale.

## Regle suppression interdite
Aucune ville, commune, region, departement, pays ou code postal ne doit etre supprime automatiquement.

Si une donnee disparait d'une source officielle future :

```text
Suppression physique = NON
Archivage = OUI
Journalisation = OUI
Validation Pascal = OUI
```

Statut possible :

```text
ArchiveSource
A verifier
Inactif
Historique conserve
```

## Moteur officiel de liaison
Le moteur officiel doit etre lance par un RUN principal.

Nom recommande :

```text
RUN-GEO-LIAISONS.ps1
```

Fonctionnement attendu :

```text
Connexion SharePoint
↓
Controle des listes
↓
Creation des colonnes Lookup manquantes
↓
Liaison automatique Pays / Regions / Departements / Villes / CodesPostaux
↓
Controle final
↓
Journal actions
↓
Journal erreurs
↓
Rapport final
```

## Liaisons officielles

### Regions
Chaque region doit etre reliee a un pays.

```text
Region → Pays
```

### Departements
Chaque departement doit etre relie a une region et a un pays.

```text
Departement → Region → Pays
```

### Villes / Communes
Chaque ville ou commune doit etre reliee a un departement, une region et un pays.

```text
Ville / Commune → Departement → Region → Pays
```

### CodesPostauxVilles
La liste CodesPostauxVilles est la table de liaison detaillee entre les codes postaux et les communes.

```text
CodesPostauxVilles → CodePostal
CodesPostauxVilles → Ville
CodesPostauxVilles → Departement
CodesPostauxVilles → Region
CodesPostauxVilles → Pays
```

### CodesPostaux
Un code postal peut etre lie au pays et, uniquement si le rattachement est unique, a une ville principale, un departement principal et une region principale.

Si plusieurs villes utilisent le meme code postal, le detail officiel reste dans CodesPostauxVilles.

```text
CodePostal → Pays
CodePostal → Ville principale si unique
CodePostal → Departement principal si unique
CodePostal → Region principale si unique
```

## Journalisation obligatoire
Toute execution doit alimenter :

```text
Journal actions
Journal erreurs
```

Exemples d'anomalies :

- Ville sans departement
- Ville sans region
- Code postal sans ville
- Departement sans region
- Region sans pays
- Code postal rattache a plusieurs villes
- Donnee absente de la nouvelle source
- Doublon detecte

## Controle manuel
Un administrateur peut lancer un controle manuel a tout moment.

Objectif :

```text
Compter les elements
Verifier les colonnes
Verifier les liaisons
Detecter les champs vides
Creer les vues de controle
Journaliser le rapport
```

## Controle automatique mensuel
Une verification mensuelle doit etre prevue.

Objectif :

```text
Controle automatique
Detection des ecarts
Journalisation
Aucune suppression automatique
Alerte si action humaine requise
```

## Boutons futurs dans DemainSite Ecosysteme

Boutons recommandés :

- Analyser la geographie
- Reparer automatiquement
- Synchroniser source officielle
- Voir l'historique geographie
- Ouvrir Journal actions
- Ouvrir Journal erreurs

## Regle IA / Pascal

```text
L'IA propose
Pascal valide
```

Le moteur peut preparer, analyser, relier et journaliser.
Les actions sensibles, les suppressions definitives, les changements de source officielle ou les corrections massives doivent rester sous validation de Pascal.

## Regle anti-regression
Aucune evolution future ne doit supprimer :

- les listes officielles,
- les colonnes de liaison,
- les journaux,
- les statuts historiques,
- les vues de controle,
- les donnees archivees.

## Conclusion officielle
Cette procedure GEO-001 est la reference principale pour les villes, communes, regions, departements, pays, codes postaux et relations codes postaux / villes dans DemainSite Ecosysteme.
