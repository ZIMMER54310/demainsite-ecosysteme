# DSE-RUNNER-DOUBLE-CLIC-V1.0

## Objectif

Pack DemainSite Ecosysteme pour lancer les scripts sans taper de commande PowerShell.

Il suffit de double-cliquer sur un fichier `.bat`.

## Boutons disponibles

### 1. LANCER-PROCEDURE-GEO-001.bat
Installe ou met a jour la procedure officielle GEO-001 dans SharePoint.

### 2. LANCER-CONTROLE-GEO.bat
Lance le controle geographique sans modification.

### 3. LANCER-MOTEUR-LIAISONS-GEO-AUDIT.bat
Teste le moteur de liaison sans modifier les donnees.

### 4. LANCER-MOTEUR-LIAISONS-GEO-REEL.bat
Lance le moteur reel de liaison. Une confirmation OUI est demandee.
Aucune suppression automatique n'est faite.

### 5. INSTALLER-TACHE-MENSUELLE-GEO.bat
Installe la verification mensuelle automatique.

## Utilisation

1. Extraire le ZIP.
2. Ouvrir le dossier extrait.
3. Double-cliquer sur le bouton voulu.

## Ordre recommande

1. LANCER-PROCEDURE-GEO-001.bat
2. LANCER-CONTROLE-GEO.bat
3. LANCER-MOTEUR-LIAISONS-GEO-AUDIT.bat
4. LANCER-MOTEUR-LIAISONS-GEO-REEL.bat uniquement si l'audit est bon
5. INSTALLER-TACHE-MENSUELLE-GEO.bat

## Regle DemainSite

Suppression automatique = NON.
Archivage et journalisation = OUI.
Pascal valide les actions sensibles.
