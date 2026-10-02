# API DSE (OVH, Node/Express)

API de **lecture seule** vers SharePoint via Microsoft Graph. Ecoute `127.0.0.1:3000` derriere Nginx
(service `dse-api.service`). Voir le [README racine](../README.md) pour l'architecture, le
deploiement et la verification.

Routes : `GET /api/v1/etat`, `/sites/par-domaine`, `/site/{id}`, `/site-complet/{id}`.
`GET /api/v1/media/{id}` sert l'image d'un element OBJ-MEDIA (ID natif) en lecture seule : fichier lu
uniquement dans la bibliotheque `DSE - MEDIAS` (`DSE_MEDIA_LIBRARY`), sous `SITE-PUBLIC/`, element actif et valide,
types image, 15 Mo max. Le chemin `MEDIA-PATH` prime ; le drive stocke dans l'element est ignore.
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

## Audit multi-domaines (lecture seule)

```bash
cd api
npm run audit:domaines            # tableau DOMAINE | OVH | DNS | HTTP | HTTPS | SHAREPOINT | SITE | PAGE | RESULTAT
node tests/audit-domaines.js --json
curl -s "http://127.0.0.1:3000/api/v1/sites/par-domaine?domaine=dseco.fr"   # un domaine
curl -s http://127.0.0.1:3000/api/v1/etat                                    # API + connexion SharePoint
```

Variables : `DSE_API_BASE`, `DSE_VPS_IP`, `DSE_NGINX_DIR`, `DSE_AUDIT_RESEAU=0`.
Code de sortie 1 si une erreur est detectee. Aucune ecriture SharePoint.
