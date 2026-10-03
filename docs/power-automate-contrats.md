# Contrats Power Automate DSE (SharePoint ↔ SharePoint)

Ces automatisations restent dans SharePoint/Power Automate : elles ne sont **pas** recodées en
Node.js. Le site public OVH n'en dépend pas pour l'affichage courant : il lit l'état SharePoint
déjà présent (OBJ-MEDIA, OBJ-SITE-PUBLIC, modules…).

Les règles suivantes s'appliquent à tous les flux :

- Aucun Azure.
- Les relations passent uniquement par les ID natifs SharePoint.
- Aucune suppression automatique de fichier, d'élément, de liste ou de colonne.
- OBJ-REL, OBJ-GEO et OBJ-REF ne sont pas utilisés. Les statuts, types, sources et résultats
  d'OBJ-JRN proviennent de ses propres listes de référence.
- Chaque exécution écrit une ligne OBJ-JRN avec la source, l'élément concerné (ID natif), le
  résultat et le message. Si l'écriture OBJ-JRN échoue, le flux ne s'arrête pas : il garde
  l'historique d'exécution Power Automate.

## 1. Synchronisation DSE - MEDIAS → OBJ-MEDIA

Ce flux tient le catalogue OBJ-MEDIA à jour à partir des fichiers de la bibliothèque.

| Élément | Contrat |
|---|---|
| Déclencheur | « Lorsqu'un fichier est créé ou modifié (propriétés uniquement) » dans la bibliothèque **DSE - MEDIAS**, dossier `SITE-PUBLIC/` et sous-dossiers |
| Source | Le fichier : ID natif de l'élément du drive, chemin relatif, nom, type MIME, taille, date de modification |
| Destination | **OBJ-MEDIA** |
| Recherche anti-doublon | OBJ-MEDIA filtré sur `MEDIA-GRAPH-ID`. À défaut, filtré sur `MEDIA-PATH` |
| Si l'élément existe | Mise à jour de `MEDIA-PATH`, `MEDIA-GRAPH-ID`, `MEDIA-DRIVE-ID` et du type, uniquement pour les champs qui ont changé |
| Si l'élément est absent | Création d'un élément avec Titre = nom du fichier, `OBJ-ACTIF` = NON et `OBJ-VALIDE` = NON : la publication reste une décision humaine |
| Résultat attendu | La route OVH `/api/v1/media/:id` sert le fichier une fois l'élément actif et validé |
| Journal OBJ-JRN | Source MEDIAS ; résultat CREE, MAJ, INCHANGE ou DOUBLON |

Un fichier supprimé ou déplacé hors de `SITE-PUBLIC/` ne supprime rien : le flux journalise une
anomalie et l'élément OBJ-MEDIA reste en place pour être traité à la main.

## 2. DSE-INBOX → contrôle → classement

| Élément | Contrat |
|---|---|
| Déclencheur | Fichier créé dans **DSE-INBOX** |
| Contrôles | Extension et type MIME autorisés, taille maximale, nom normalisé, empreinte (hash) comparée à OBJ-MEDIA et DSE - MEDIAS |
| Contrôle réussi | Copie vers le dossier cible de **DSE - MEDIAS** (selon les métadonnées saisies). Le flux n°1 crée ensuite l'élément OBJ-MEDIA |
| Contrôle échoué ou doublon | Le fichier reste dans DSE-INBOX ; une colonne d'état indique le motif |
| Journal OBJ-JRN | Source INBOX ; résultat CLASSE, REJETE ou DOUBLON |

Le fichier d'origine dans DSE-INBOX est conservé, sans suppression automatique. L'archivage se
fait à la main.

## 3. DSE-CSV → import contrôlé

| Élément | Contrat |
|---|---|
| Déclencheur | Fichier CSV créé dans **DSE-CSV**, ou lancement manuel |
| Validation | En-têtes égaux aux noms internes de la liste cible, Lookups résolus par ID natif existant, valeurs obligatoires présentes |
| Anti-doublon | Clé métier définie par liste (par exemple le nom de domaine pour OBJ-NOM DE DOMAINE) : une ligne déjà présente est mise à jour, jamais dupliquée |
| Ligne invalide | Ignorée et journalisée, sans arrêter les lignes suivantes |
| Journal OBJ-JRN | Une ligne de synthèse (créés, mis à jour, inchangés, rejetés) et une ligne par rejet |

Ce flux ne crée ni colonne ni liste et ne supprime aucun élément.

## 4. Contrôle périodique des doublons

| Élément | Contrat |
|---|---|
| Déclencheur | Récurrence quotidienne |
| Portée | OBJ-MEDIA (même `MEDIA-GRAPH-ID` ou même `MEDIA-PATH`), OBJ-NOM DE DOMAINE (même nom), OBJ-SITE-PUBLIC (même domaine principal) |
| Action | Journalisation des groupes de doublons (ID natifs) dans OBJ-JRN, avec notification facultative |

Ce contrôle ne fusionne et ne supprime jamais rien automatiquement.

## Ce qui reste côté GitHub/OVH

- La synchronisation **OVH → SharePoint** des domaines, qui a besoin de l'API OVH (voir
  `synchronisation-domaines-ovh.md`).
- La lecture publique de SharePoint (domaine → site → statut → page → modules → médias) et le
  rendu des pages.
