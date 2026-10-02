# API DSE (OVH, Node/Express)

API de **lecture seule** vers SharePoint via Microsoft Graph. Ecoute `127.0.0.1:3000` derriere Nginx
(service `dse-api.service`). Voir le [README racine](../README.md) pour l'architecture, le
deploiement et la verification.

Routes : `GET /api/v1/etat`, `/sites/par-domaine`, `/site/{id}`, `/site-complet/{id}`.
`/api/v1/moi` est desactivee (HTTP 501) tant qu'une authentification Entra native n'existe pas.

`site-complet` agrege OBJ-SITE-PUBLIC avec menu, logo, entete, theme, SEO, pages, modules, contenus
et OBJ-MEDIA en suivant les relations par **ID natifs SharePoint**.

Appels Graph : timeout 15 s, au plus 2 reessais sur 429/503 en respectant `Retry-After` (plafonne
a 5 s).

## Fichiers historiques Azure Functions (conserves)

Les dossiers `dse*/index.js` gardent la signature `(context, req)` des Azure Functions et SONT
utilises par `server.js` via un adaptateur. Les `function.json` et `host.json` ne sont plus utilises
par OVH ; ils sont conserves sans effet jusqu'a un nettoyage dedie.

## Tests

```bash
npm run check
npm run smoke
```
