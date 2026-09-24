# DSE-INSTALLER-COMMUNES-FRANCE-COMPLETES-V2.1

## Correction V2.1

La V2.0 pouvait prendre par erreur `regions-france.csv`, qui ne contient que 18 lignes.
La V2.1 refuse maintenant automatiquement toute source de moins de 30 000 lignes.

Le script essaie seulement d'utiliser un vrai CSV complet des communes.

## Objectif

Mettre en place toutes les communes de France dans la Bibliotheque Centrale SharePoint :

- Pays
- Regions
- Departements
- Villes / Communes
- CodesPostaux
- CodesPostauxVilles

Le script ajoute ou met a jour. Il ne supprime jamais.

## Utilisation simple

1. Extraire le ZIP.
2. Double-cliquer sur :

```text
LANCER-INSTALLATION-COMMUNES-FRANCE.bat
```

3. Ecrire :

```text
OUI
```

## Si le telechargement automatique ne trouve pas le bon CSV

Deposer manuellement dans le dossier `data` un CSV complet, par exemple :

```text
communes-departement-region.csv
```

Le CSV doit contenir plus de 30 000 lignes.

## Audit sans modification

Double-cliquer sur :

```text
LANCER-AUDIT-COMMUNES-FRANCE.bat
```

## Utilisation avec CSV manuel

```powershell
.\RUN-INSTALL-COMMUNES-FRANCE-COMPLETES.ps1 -CsvPath "C:\chemin\communes-departement-region.csv" -Mode Update
```

## Apres installation

Relancer ensuite le moteur de liaison geographique :

```text
LANCER-MOTEUR-LIAISONS-GEO-REEL.bat
```

## Regle DemainSite

Suppression automatique = NON.
Journalisation = OUI.
Pascal valide les actions sensibles.
