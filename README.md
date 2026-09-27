# DSE Cockpit V1

Interface statique dynamique pour **DemainSite Écosystème**.

## Principe

- GitHub Pages héberge uniquement l’interface.
- `dse-api-prod` fournit les données.
- SharePoint reste la source officielle.
- Aucun secret, client, site, domaine ou contenu métier n’est stocké dans ce dépôt.
- `OBJ-GEO` n’est jamais utilisé pour les sites, DNS, GitHub ou synchronisations.
- L’ancienne logique `OBJ-REL` n’est pas utilisée.

## Routes API V1 utilisées

- `GET /etat`
- `GET /sites/par-domaine?domaine=...`
- `GET /site/{siteId}`
- `GET /site-complet/{siteId}`

## Lancement local

```bash
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.

## Configuration

Modifier uniquement `js/config.js` pour changer l’URL publique de l’API. Ne jamais ajouter de secret dans GitHub.

## État de la V1

La V1 est en lecture seule. Les fonctions d’écriture et d’authentification Entra External ID seront raccordées uniquement après disponibilité des routes API sécurisées correspondantes.
