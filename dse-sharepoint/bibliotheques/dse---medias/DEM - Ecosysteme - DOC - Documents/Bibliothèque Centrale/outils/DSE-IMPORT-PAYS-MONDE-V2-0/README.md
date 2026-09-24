# DSE-IMPORT-PAYS-MONDE-V2.0

## Objectif

Importer tous les pays du monde dans la liste SharePoint :

```text
Pays
```

## Correction V2.0

Cette version corrige l'erreur de connexion :

```text
Please specify -Tenant
```

Connexion utilisee :

```text
Url      : https://blogssite.sharepoint.com/sites/Bibliotheque
Tenant   : demainsite.com
ClientId : 5d607413-77c5-47b2-975a-eaca6827921c
Mode     : DeviceLogin
```

## Source pays

Le script tente de telecharger automatiquement le fichier ISO 3166 complet :

```text
ISO-3166-Countries-with-Regional-Codes / all.csv
```

Le fichier contient les colonnes :

```text
name, alpha-2, alpha-3, country-code, iso_3166-2, region, sub-region
```

Si le telechargement ne fonctionne pas, deposer un fichier `all.csv` dans le dossier `data`.

## Utilisation simple

1. Extraire le ZIP.
2. Double-cliquer sur :

```text
LANCER-IMPORT-PAYS-MONDE.bat
```

3. Ecrire :

```text
OUI
```

## Audit sans modification

Double-cliquer sur :

```text
LANCER-AUDIT-PAYS-MONDE.bat
```

## Ce que le script cree

Colonnes principales de la liste Pays :

- ID Pays
- Code Pays
- Code ISO2
- Code ISO3
- Code Numerique
- Nom Pays
- Nom Pays Source
- Nom Officiel
- Continent
- Sous Region
- Region Intermediaire
- Code Region ONU
- Code Sous Region ONU
- Code ISO 3166-2
- Source Donnee
- Statut Geo
- Date Import

## Regle DemainSite

Suppression automatique = NON.
Ajout ou mise a jour = OUI.
Journalisation = OUI.
