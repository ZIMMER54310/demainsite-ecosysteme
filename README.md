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
                       -> SharePoint (source officielle; écritures cockpit limitées et contrôlées)
```

- **GitHub** : depot et versionnement du code uniquement.
- **SharePoint** : source officielle des donnees et configurations. Les lectures sont la regle ;
  seules les routes cockpit explicitement autorisees executent des ecritures controlees,
  avec apercu, revalidation des droits/perimetres, idempotence, relecture et OBJ-JRN.
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

La section **Medias** du site dispose de sa propre route `/cockpit/site/:domaine/medias`.
Elle reutilise le catalogue et les controles de perimetre du constructeur, mais
ne renvoie ni n'affiche les pages, En-tetes, Footer ou modeles. Recherche et types
proviennent des medias autorises ; le changement de logo reutilise l'action
securisee et journalisee existante. Les raccourcis medias ouvrent cet ecran.
La route actuelle de fichiers reste limitee aux images publiques supportees :
sons, videos et autres types sont catalogues sans faux lecteur ni image cassee.
L'import reste realise dans la bibliotheque SharePoint existante.

Le menu distingue la navigation générale, le site sélectionné et les fonctions globales
dans trois groupes accordéon exclusifs, ouverts selon la page active. Leurs fonds sont
configurables par variables CSS. Le parcours usage-site présente les rattachements
autorisés et demande un aperçu avant confirmation. La lecture d'un site exige
`site.voir`. Le parcours site est raccordé à l'aperçu et à la confirmation :
la création n'utilise qu'un domaine existant, actif, valide et non rattaché, avec
client dérivé côté serveur, et crée un brouillon inactif/non validé ; une autorisation
globale explicite dans SharePoint est obligatoire, sans héritage d'un site. L'édition
est limitée au nom. La validation humaine ne déclenche jamais l'activation. Toutes
les écritures refusent par défaut si le droit, le périmètre, le schéma, les champs
obligatoires ou le journal OBJ-JRN ne peuvent pas être vérifiés.

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

Le cockpit affiche la version du front charge par le navigateur au format
`V 10.20.00`, y compris dans le constructeur plein ecran. Le script de deploiement
incremente le dernier nombre pour chaque nouveau commit touchant le front
apres la premiere publication numerotee : `V 10.20.01`, etc. Republier le meme
commit conserve son numero ; les commits API seuls ne l'incrementent pas.
Le SHA reste utilise pour les URL de cache, sans etre affiche aux clients.
Le cockpit verifie la
version publiee a l'ouverture du cockpit, puis chaque minute et au retour sur
l'onglet visible. Le bouton « Verifier » permet une verification immediate.
Si une autre version est publiee, « Mettre a jour » propose un rechargement
apres confirmation : enregistrer les saisies avant de continuer. L'adresse et
la page courante sont conservees, avec un parametre de version pour eviter
de reutiliser le document en cache. Aucun rechargement n'est automatique ;
un enregistrement du constructeur en cours bloque la mise a jour.
Ce bouton ne deploie aucun code serveur et ne provisionne pas SharePoint.
Une erreur de verification est affichee avec « Reessayer », sans annoncer
que le cockpit est a jour.

Sans connexion, le menu ne propose que « Voir le site ». Les groupes de gestion
restent reserves aux sessions authentifiees. Le texte de connexion vise le
compte client (pas seulement les sites) et un fournisseur unique est presente
par le bouton « Se connecter », sans changer le mecanisme d'authentification.
Sur le site public, l'acces a l'espace est une icone compacte avec libelle au
survol et au focus clavier. Pour un visiteur ou un compte autorise, elle ouvre
directement `/#/cockpit`, sans lancer la connexion ; les etats d'acces refuses
ou en attente restent non cliquables et expliquent leur statut.

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
