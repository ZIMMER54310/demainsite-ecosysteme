# DSE-REIMPORT-VILLES-COMPLETES-V1.0

## Objectif

Reimporter les listes geographiques incompletes :

- Villes
- CodesPostaux
- CodesPostauxVilles

Le script ne supprime jamais les anciennes donnees.
Il ajoute les villes manquantes et met a jour les lignes existantes selon le code INSEE.

## Source CSV

Utiliser un CSV de correspondance codes postaux / communes contenant au minimum :

- code_commune_INSEE
- nom_commune ou nom_commune_complet
- code_postal
- code_departement
- nom_departement
- code_region
- nom_region

La base officielle des codes postaux data.gouv / La Poste convient.

## Utilisation double-clic

1. Telecharger le CSV source.
2. Deposer le fichier CSV dans le dossier `data`.
3. Double-cliquer sur :

```text
LANCER-REIMPORT-VILLES-COMPLETES.bat
```

4. Ecrire `OUI` quand la confirmation est demandee.

## Utilisation PowerShell directe

```powershell
.\RUN-REIMPORT-VILLES-COMPLETES.ps1
```

Test limite :

```powershell
.\RUN-REIMPORT-VILLES-COMPLETES.ps1 -MaxRows 100
```

Audit sans modification :

```powershell
.\RUN-REIMPORT-VILLES-COMPLETES.ps1 -Mode AuditOnly
```

## Apres reimport

Relancer ensuite :

```text
LANCER-MOTEUR-LIAISONS-GEO-REEL.bat
```

## Regle DemainSite

Suppression automatique = NON.
Archivage et journalisation = OUI.
Pascal valide les actions sensibles.
