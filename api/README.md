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

## Ajout automatique d'un domaine (sans modifier le code)

1. Declarer le domaine dans SharePoint (`OBJ-NOM DE DOMAINE`, actif + valide) et le relier a son site (`OBJ-SITE-PUBLIC`).
2. `cd api && node tools/sync-domaines.js` : plan (DNS OVH, Nginx, HTTPS), rien n'est modifie.
3. Appliquer : `sudo node tools/sync-domaines.js --nginx` puis, quand le DNS pointe vers le VPS, `sudo node tools/sync-domaines.js --https`.
   Le DNS peut etre automatise avec `--dns` si `OVH_APP_KEY`, `OVH_APP_SECRET`, `OVH_CONSUMER_KEY` (et `OVH_ENDPOINT`, defaut `ovh-eu`)
   sont definis dans `api/.env` (droits OVH : GET/POST/DELETE `/domain/zone/*`). Sans eux, le plan indique les enregistrements a creer.
4. `npm run audit:domaines` verifie le resultat.

Etats par domaine (`/api/v1/sites/par-domaine`, champ `etat`) :
- domaine connu + site actif/valide + page d'accueil active/validee -> `normal` (site public) ;
- domaine connu mais site ou page non pret -> `construction` (page "Site en construction") ;
- domaine inconnu -> 404, aucun site.

Statuts de l'audit : OK, CONSTRUCTION, ERREUR DNS, ERREUR NGINX, ERREUR HTTPS, ERREUR SHAREPOINT, DOMAINE INCONNU.

## Automatisation multi-domaines — exploitation

Flux : SharePoint (domaines actifs/valides, lecture seule) → DNS OVH → Nginx → HTTPS (Certbot) → API `/api/v1/sites/par-domaine` → `normal` (site public) ou `construction` (page « Site en construction »). Domaine inconnu : 404, aucun autre site affiché.

**Prérequis** : `api/.env` (ignoré par Git) avec `OVH_APP_KEY`, `OVH_APP_SECRET`, `OVH_CONSUMER_KEY` (droits GET/POST/DELETE sur `/domain/zone/*`), accès sudo pour nginx/certbot. Ne jamais committer ni afficher ces valeurs.

**Mode PLAN (par défaut, aucune modification)** : `node tools/sync-domaines.js` (ou `--domaine=exemple.fr`).

**Ajouter un domaine** : 1) le saisir dans SharePoint (actif, valide, lié à son site) ; 2) `node tools/sync-domaines.js --domaine=exemple.fr` (plan) ; 3) `node tools/sync-domaines.js --domaine=exemple.fr --dns` ; 4) `sudo node tools/sync-domaines.js --domaine=exemple.fr --nginx` ; 5) après propagation DNS, `sudo node tools/sync-domaines.js --domaine=exemple.fr --https` ; 6) `npm run audit:domaines`.

**Sécurités** : toute action d'écriture exige `--domaine=x` (ou `--tous` explicite) ; option inconnue = refus ; domaine absent de SharePoint = refus. Le DNS ne touche que A de `@` et A/CNAME de `www` (jamais MX, TXT, SPF, DKIM, DMARC, NS, AAAA) et ne fait rien si déjà correct ; les enregistrements remplacés sont sauvegardés dans `api/backups/` (ignoré par Git, 0600). Nginx : fichier créé sans écrasement, `nginx -t` obligatoire, retiré automatiquement en cas d'échec.

**Rollback** : DNS → recréer les enregistrements du JSON de `api/backups/dns-<domaine>-*.json` ; Nginx → `sudo rm /etc/nginx/conf.d/dse-<domaine>.conf && sudo nginx -t && sudo systemctl reload nginx`.

**Diagnostic** : `npm run audit:domaines` (OK / CONSTRUCTION / ERREUR DNS / NGINX / HTTPS / SHAREPOINT / DOMAINE INCONNU) ; `npm test` (tests unitaires sécurité DNS/filtrage) ; `npm run smoke` ; `curl --resolve d:443:57.129.164.243 https://d/`; `journalctl -u dse-api`.

## Test d'accès SharePoint app-only

`npm run test:sharepoint-access` : obtient un jeton avec l'identité applicative API DSE (variables `DSE_*`), vérifie le Client ID, lit le site et les listes. **Lecture seule**, ne montre ni secret ni jeton. Code de sortie 1 en cas d'échec.
