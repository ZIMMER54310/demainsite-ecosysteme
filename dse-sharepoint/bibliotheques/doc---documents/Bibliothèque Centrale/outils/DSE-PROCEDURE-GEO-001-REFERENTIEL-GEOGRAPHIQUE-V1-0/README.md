# DSE Procedure GEO-001

## Objet
Ce ZIP installe ou met a jour la procedure officielle :

**GEO-001 - Referentiel Geographique France**

Elle concerne :

- Pays
- Regions
- Departements
- Villes / Communes
- CodesPostaux
- CodesPostauxVilles

## Utilisation

1. Extraire le ZIP.
2. Ouvrir PowerShell 7.
3. Aller dans le dossier extrait.
4. Lancer :

```powershell
.\RUN-INSTALL-PROCEDURE-GEO-001.ps1
```

## Resultat

Le script cree ou met a jour un element dans la liste SharePoint :

```text
Procedures
```

Titre de la procedure :

```text
GEO-001 - Referentiel Geographique France
```

## Regle importante
Aucune suppression automatique. Toute disparition d'une ville, commune, region, departement ou code postal doit etre archivee et journalisee.
