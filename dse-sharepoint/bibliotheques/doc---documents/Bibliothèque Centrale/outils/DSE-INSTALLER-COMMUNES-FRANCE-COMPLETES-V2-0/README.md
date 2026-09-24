# DSE-INSTALLER-COMMUNES-FRANCE-COMPLETES-V2.0

## Objectif

Mettre en place toutes les communes de France dans la Bibliotheque Centrale SharePoint :

- Pays
- Regions
- Departements
- Villes / Communes
- CodesPostaux
- CodesPostauxVilles

Le script ajoute ou met a jour. Il ne supprime jamais.

## Source

Le script tente de telecharger automatiquement un CSV compatible depuis data.gouv.
Il accepte aussi un CSV depose dans le dossier `data`.

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
