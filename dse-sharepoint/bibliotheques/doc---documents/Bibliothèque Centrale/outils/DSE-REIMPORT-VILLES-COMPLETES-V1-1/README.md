# DSE-REIMPORT-VILLES-COMPLETES-V1.1

## Correction V1.1

Cette version corrige le blocage :

```text
ERREUR : Aucun CSV trouve
```

Le script cherche maintenant automatiquement le CSV dans :

- le dossier `data` du pack,
- le chemin probable de l'ancien installateur `DSE-INSTALLER-GEOGRAPHIE-FRANCE-V1-1`,
- `Téléchargements`,
- `Downloads`,
- `DemainSite`,
- `OneDrive`,
- `Documents`.

## Boutons disponibles

### LANCER-LOCALISER-CSV-GEO.bat
Recherche les CSV geographiques sur le PC et affiche le chemin trouve.

### LANCER-REIMPORT-VILLES-COMPLETES.bat
Lance le reimport complet des Villes, CodesPostaux et CodesPostauxVilles.

## Ordre recommande

1. Double-cliquer sur `LANCER-LOCALISER-CSV-GEO.bat`.
2. Si un CSV est trouve, double-cliquer sur `LANCER-REIMPORT-VILLES-COMPLETES.bat`.
3. Ecrire `OUI` pour confirmer.

## Utilisation avec chemin manuel

Si besoin :

```powershell
.\RUN-REIMPORT-VILLES-COMPLETES.ps1 -CsvPath "C:\chemin\communes-departement-region.csv"
```

## Regle DemainSite

Suppression automatique = NON.
Mise a jour et ajout = OUI.
Journalisation = OUI.
