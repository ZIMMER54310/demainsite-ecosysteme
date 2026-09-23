# DSE-GITHUB V1

## Règle d'architecture

- SharePoint, bibliothèque `DSE-GITHUB`, est la source officielle des fichiers.
- GitHub est la destination de publication.
- Aucun contenu métier n'est placé directement dans `index.html` ou `js/app.js`.
- Les données visibles sont chargées depuis `data/site.json`.
- Les identifiants DSE permanents doivent être utilisés dans les futurs exports.

## Structure

```text
DSE-GITHUB/
├── index.html
├── README.md
├── css/
│   └── style.css
├── js/
│   └── app.js
├── data/
│   ├── site.json
│   └── manifest.json
└── assets/
    └── README.txt
```

## Installation dans SharePoint

1. Décompresser le ZIP.
2. Charger tous les éléments dans la bibliothèque `DSE-GITHUB` en conservant les dossiers.
3. Vérifier que `index.html` est à la racine.
4. Modifier uniquement `data/site.json` pour changer le contenu de démonstration.

## Publication GitHub

La synchronisation directe SharePoint vers GitHub sera ajoutée séparément. Ce pack constitue la source complète du site V1.
