# DemainSite Ecosysteme (DSE)

Cockpit / site public DSE : front statique + API Node de lecture SharePoint.

## Architecture

```
GitHub (code, branche ovh/api-native)
   -> OVH VPS
        -> Nginx (port 80, /var/www/html + proxy /api/v1/)
             -> front statique (JS ES modules)
             -> API Node (dse-api.service, 127.0.0.1:3000)
                  -> Microsoft Graph
                       -> SharePoint (source officielle, LECTURE SEULE)
```

- **GitHub** : depot et versionnement du code uniquement.
- **SharePoint** : source officielle des donnees et configurations. L'API ne fait que lire.
- **OVH VPS** : hebergement public du front, de l'API, de Nginx. OVH gere aussi domaines et DNS.
- **Azure** : abandonne comme hebergeur DSE (aucun deploiement Azure depuis ce depot).
- HTTPS / HSTS : pas encore en place (a traiter separement).

## Regle de donnees

Les relations techniques DSE utilisent les **ID natifs SharePoint**. Aucun ID, contenu metier,
client ou domaine n'est code en dur dans le front. `OBJ-GEO` n'est jamais utilise pour les sites,
DNS, GitHub ou synchronisations.

## Branche et production

### Presentation du cockpit

Le cadre commun utilise des icones SVG locales, un profil issu de la session et une
recherche vers les sites autorises. Le menu reste construit depuis les droits serveur ;
il peut etre reduit sur ordinateur et devient horizontal sur mobile.

La page **Mes sites** propose des compteurs par statut reel, une vue liste/cartes,
les filtres existants et les actions Ouvrir / Voir le site / changer le statut.
La progression moyenne porte sur tous les sites autorises, avant filtrage et
pagination. Elle reste indisponible si un site n'a pas de progression connue.
Les couleurs de progression restent issues de la configuration SharePoint ;
aucune couleur specifique a un statut ni aucun chiffre de maquette n'est ajoute.

Dans un site selectionne, la vue d'ensemble affiche son identite, son statut,
ses etapes reelles, les prochaines etapes non terminees et les acces a sa structure.
La navigation locale utilise le domaine d'acces verifie par le serveur et reste
distincte des commandes globales. Pages, En-tete, Footer, Medias et Catalogue
ouvrent directement l'onglet correspondant du constructeur lorsque disponible.
Les actions d'edition sont reservees aux niveaux autorises. Le contexte local est
efface a chaque navigation et recharge sur les ecrans du site ; il ne peut pas
reprendre les donnees du site precedent.

Les compteurs de pages proviennent des donnees du site, avec le nombre actif et
valide. Aucun compteur de produits, d'utilisateurs, score SEO, activite recente,
image de banniere ou date fictive n'est utilise pour imiter une maquette.
Progression et Acces rapides restent deroulants et fermes par defaut.

- Branche de travail et de production : `ovh/api-native` (pas de fusion vers `main` pour l'instant).
- API : service systemd `dse-api.service` (`api/server.js`, ecoute **127.0.0.1:3000**).
- Recette : port 3001 (reserve, non gere par ce depot).
- Nginx : modeles dans [deploy/nginx/](deploy/nginx) (`dse.conf` -> `/etc/nginx/sites-available/dse`,
  `dse-limits.conf` -> `/etc/nginx/conf.d/`). Limite `/api/` a 5 req/s par IP (burst 20, reponse 429)
  et supprime les en-tetes d'identite Azure `x-ms-client-principal*` entrants.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Variables d'environnement (`api/.env`, jamais commite)

Voir [.env.example](.env.example) : `PORT`, `DSE_SHAREPOINT_HOSTNAME`, `DSE_SHAREPOINT_SITE_PATH`,
`DSE_ALLOWED_ORIGINS`, `DSE_TENANT_ID`, `DSE_CLIENT_ID`, `DSE_CLIENT_SECRET`. Aucune valeur secrete
dans le depot ni la documentation.

## Deploiement du front

```bash
git push origin ovh/api-native          # le commit doit etre sur origin/ovh/api-native
scripts/deploy-front.sh --dry-run       # simulation
scripts/deploy-front.sh                 # deploie HEAD (ou : scripts/deploy-front.sh <sha>)
```

Le script exporte le commit via `git archive`, ne publie que `index.html`, `404.html`, `assets/`,
`components/`, `js/`, `modules/`, `pages/`, `services/` vers `/var/www/html` (jamais `api/`, `.git`,
`.env`, sauvegardes, etc.), controle avant/apres copie et ne touche pas a `/var/www/html/media`.
Il ecrit le SHA deploye dans `/var/www/.dse-front-commit`.

## Deploiement / redemarrage de l'API

```bash
cd api && npm ci --omit=dev
sudo systemctl restart dse-api.service
journalctl -u dse-api.service -n 50 --no-pager
```

## Verification

```bash
cd api
npm run check     # syntaxe de tous les JS (API + front)
npm audit
npm run smoke     # tests de fumee GET uniquement (DSE_SMOKE_BASE pour changer la cible)
```

## Routes API

- `GET /api/v1/etat`
- `GET /api/v1/sites/par-domaine?domaine=...`
- `GET /api/v1/site/{siteId}`
- `GET /api/v1/site-complet/{siteId}`
- `GET /api/v1/media/{id}` : image d'un OBJ-MEDIA (lecture seule, `DSE - MEDIAS/SITE-PUBLIC/`)
- `GET /api/v1/moi` : **desactivee** (HTTP 501, voir ci-dessous)

## AUTHENTIFICATION UTILISATEUR DSE

**Desactivee temporairement en production OVH jusqu'a implementation d'une authentification
Microsoft Entra native securisee (validation JWT : signature, issuer, audience, expiration).**
Les anciens en-tetes Azure `x-ms-client-principal` / `x-ms-client-principal-id` ne prouvent aucune
identite sur OVH et ne sont jamais acceptes. Le code historique `api/dseMoi/` est conserve mais
n'est plus charge par `server.js`.

## Front en local

```bash
python3 -m http.server 8000
```
