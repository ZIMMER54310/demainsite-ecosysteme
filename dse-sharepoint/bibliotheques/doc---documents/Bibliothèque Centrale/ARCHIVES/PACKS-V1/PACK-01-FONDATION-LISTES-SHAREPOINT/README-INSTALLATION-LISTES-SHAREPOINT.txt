
PACK AUTOMATISATION LISTES SHAREPOINT - DEMAIN SITE ECOSYSTEME

Objectif : créer automatiquement les listes SharePoint de la Bibliothèque Centrale.

Site cible prérempli : https://blogssite.sharepoint.com/sites/Bibliotheque

Contenu :
- DEMAIN_SITE_CREATE_LISTS.ps1 : script PowerShell qui crée les listes et les colonnes.
- schema-listes-demainsite.json : définition complète des listes et colonnes.
- schema-listes-demainsite.csv : version lisible du schéma.

Listes créées :
- Relations
- Clients
- Projets
- Sites
- Domaines
- Pages
- Medias
- Documents
- Utilisateurs
- Equipes_Teams
- Canaux_Teams
- SharePoint
- Procedures

Installation rapide :
1. Décompresser ce ZIP dans un dossier local.
2. Ouvrir PowerShell dans ce dossier.
3. Exécuter :
   .\DEMAIN_SITE_CREATE_LISTS.ps1
4. Se connecter avec le compte Microsoft 365 autorisé.
5. Retourner dans SharePoint > Contenu du site pour contrôler les listes.

Règles DemainSite :
- PascARA IA propose, Pascal valide.
- Aucune suppression réelle.
- Les objets créés sont les fondations de la Bibliothèque Centrale.
- Les colonnes sont une base V1 pouvant évoluer ensuite sans tout refaire.
