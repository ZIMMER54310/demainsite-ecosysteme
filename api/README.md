# API DSE (OVH, Node/Express)

API publique en lecture et cockpit avec ecriture controlee vers SharePoint via Microsoft Graph. Ecoute `127.0.0.1:3000` derriere Nginx
(service `dse-api.service`). Voir le [README racine](../README.md) pour l'architecture, le
deploiement et la verification.

Routes : `GET /api/v1/etat`, `/sites/par-domaine`, `/site/{id}`, `/site-complet/{id}`.
`GET /api/v1/media/{id}` sert l'image d'un element OBJ-MEDIA (ID natif) en lecture seule : fichier lu
uniquement dans la bibliotheque `DSE - MEDIAS` (`DSE_MEDIA_LIBRARY`), sous `SITE-PUBLIC/`, element actif et valide,
types image, 15 Mo max. Le chemin `MEDIA-PATH` prime ; le drive stocke dans l'element est ignore.
Le cockpit utilise une session native Entra et des controles de perimetre cote serveur.

## Droits et edition cockpit

La politique est lue dans OBJ-ROLE : PORTEE, NIVEAUACCES, FONCTIONS, avec activation
et validation. OBJ-UTILISATEUR utilise exclusivement le Lookup client `_x002d_CLIENT`.
Un role inconnu, incomplet ou desactive n'accorde aucun droit. La politique JSON historique
n'est plus utilisee en production. Un administrateur de portee CLIENT doit avoir exactement
un client actif et valide ; aucun lien vers un site d'un autre client ne peut etendre ses droits.
Tous les comptes hors portee TOUS voient uniquement leurs relations OBJ-UTILISATEUR-SITE
actives et validees, avec egalite du client utilisateur, client de la relation et client du site.
Un administrateur CLIENT peut affecter les sites appartenant a son client sans que cela
lui donne automatiquement acces a leur contenu. Un administrateur de portee ATTRIBUES
ne peut affecter que ses propres sites autorises.

Le menu propose « Voir le site » avant Cockpit. `/moi` fournit `sitesPublics`,
un resume leger des seuls groupes autorises (nom, domaine principal, domaines alias).
Le lien respecte le site selectionne dans les routes de fiche et d'edition, y compris
un alias, mais ouvre toujours le domaine principal public en HTTPS dans un nouvel onglet.
Sans selection, un site unique est utilise ; plusieurs sites offrent un choix explicite.
Un domaine principal absent ou un site hors perimetre ne produit aucun lien de secours.
Le lien n'inclut ni route cockpit ni parametre : le moteur public conserve ses statuts.
La page publique de situation utilise une disposition verticale en-tete/carte/footer.
La carte et son titre restent dans la largeur disponible, avec retour a la ligne des
titres longs sur mobile, sans modification du contenu ou de la decision de statut.

## Identification Entra et inscription controlee

ENTRAOBJECTID est prioritaire. L'email ne sert qu'a migrer un compte historique unique
non lie, apres authentification Microsoft reussie : PATCH conditionnel ETag, relecture,
journalisation, sans changer role/client/sites. Un compte deja lie a un autre objet Entra
ne peut pas etre repris par son email. Le point de connexion resout le domaine HTTP reel
depuis OBJ-NOM DE DOMAINE -> OBJSITE -> client, pas un client transmis par le navigateur.

`POST /api/v1/cockpit/inscription` exige une session Entra et une origine identique.
Le corps vide affiche l'apercu ; `{ "confirmer": true }` confirme. Aucun parametre de role,
client ou site n'est accepte. Pour autoriser une inscription, la structure minimale est
OBJ-INSCRIPTION avec ENTRA-OBJECT-ID texte (nom interne resolu), Lookups OBJ-UTILISATEUR (facultatif pour un
nouveau compte), OBJ-CLIENT, OBJ-SITE-PUBLIC, OBJ-ROLE, OBJ-ACTIF et OBJ-VALIDE.
Une invitation unique active/validee doit designer les IDs reels du compte et du domaine.
La creation de role global n'est jamais permise dans ce parcours. Sans invitation, 409/403,
trace REFUS et aucune attribution. Un utilisateur existant est reutilise sans modifier
son role, qui doit correspondre a l'invitation ; le triplet utilisateur/client/site est relu avant creation et ne se duplique pas.
La reprise apres erreur relit les elements deja crees et ne reactive pas un acces desactive.
Apres authentification Entra, un compte non reconnu passe automatiquement par ce parcours
sur le domaine conserve dans la transaction signee. Sans autorisation exacte, aucune session
nouvelle n'est ouverte. Un utilisateur reconnu non global reprend aussi le parcours si
une invitation exacte existe (ajout d'un site ou reprise d'une inscription interrompue).
Sans invitation exacte, sa connexion conserve les droits existants sans nouvelle attribution.
Les connexions globales restent inchangees ; l'endpoint avec confirmation permet aussi
l'ajout d'un autre site autorise.

L'acces commun DSE utilise OBJ-ACCES-COMMUN : Lookups utilisateur, site, actif et valide.
Apres inscription valide, le domaine de service dseco.fr est resolu dans SharePoint ;
aucun ID ni client n'est fixe dans le code. La relation utilisateur/site commun est creee
ou reutilisee et relue. Le client utilisateur, le proprietaire DSECO et les relations metier
restent intacts. Les droits lisent ces relations dans `sitesCommuns`, separe de `siteIds` :
l'acces commun n'autorise ni administration ni ecriture sur le site DSECO.
Le cockpit expose seulement l'indicateur `accesCommun`, pas les donnees de ce client.
Une relation desactivee ou dupliquee bloque le parcours sans reactivation automatique.
Ce lot ne cree ni ne modifie les structures SharePoint.

Les journaux utilisent des cles deterministes et relisent CLEIDEMPOTENCE avant insertion ;
les confirmations rejouees n'ajoutent pas d'entree. Les refus et ecritures d'inscription /
attribution incluent acteur, utilisateur, client, site, resultat et motif dans NOTES.
Les verrous sont limites au processus Node unique actuel.
Actions du parcours : INSCRIPTION-AUTORISEE, INSCRIPTION-REFUSEE,
CREATION-UTILISATEUR, AJOUT-SITE, AJOUT-ACCES-COMMUN, DOUBLON-IGNORE et ERREUR.

Les capacites SharePoint sont traduites en fonctions du moteur dans
[politique-sharepoint.js](auth/politique-sharepoint.js) : ADMINISTRATION-GLOBALE (TOUS /
ADMINISTRATION uniquement), GESTION-CLIENT, GESTION-UTILISATEURS-CLIENT,
GESTION-SITES-ATTRIBUES. Les codes individuels des fonctions cockpit sont aussi acceptes.
Tout code inconnu invalide la politique. Les politiques des autres roles peuvent etre
completees dans le cockpit global, avec apercu, confirmation et controle anti-elevation.

L'editeur generique propose En-tete, SEO, Pages, Menu et Footer lorsque leur structure le permet.
Pages et Menu proposent une selection d'element dans le seul site autorise ; les references
opaques ne permettent pas de modifier un autre site. Plusieurs SEO ou En-tetes lies bloquent
l'edition : aucun choix arbitraire. SEO utilise
OBJSITEPUBLIC ; l'ancien Lookup reste uniquement en compatibilite de lecture.
Sans SEO lie, un formulaire vide permet une creation explicite avec
OBJSITEPUBLICLookupId, activation et validation resolues depuis SharePoint. Aucun orphelin
n'est rattache automatiquement. La cible est relue sans cache avant confirmation ;
les creations concurrentes dans ce processus sont serialisees par site/composant.
Les PATCH exigent l'ETag, reverifient le rattachement sur cette version et le transmettent
a Graph ; sans version, l'ecriture est refusee. Les POST ne sont pas
rejoues automatiquement sur 503 : une relecture est necessaire avant un nouvel apercu.
L'anti-doublon suppose le service Node unique actuel ; avant un deploiement multi-processus,
une contrainte d'unicite SharePoint ou un verrou distribue sera necessaire.

OBJ-JRN est prepare avec STATUTJRN et CLEIDEMPOTENCE. Le Lookup historique STATUT
facultatif est ignore, meme si sa cible est orpheline : aucun champ STATUT n'est envoye.
S'il est obligatoire ou si Graph refuse le journal, le resultat affiche explicitement le blocage.
Aucune valeur artificielle n'est envoyee, aucun nouvel essai sans STATUTJRN n'est effectue.
Une modification deja effectuee n'est pas presentee comme annulee en cas d'echec du journal.
Les historiques presentes a un administrateur client sont limites aux sites de son perimetre.

`site-complet` agrege OBJ-SITE-PUBLIC avec menu, logo, entete, theme, SEO, pages, modules, contenus
et OBJ-MEDIA en suivant les relations par **ID natifs SharePoint**.
Pour un statut autre qu'Actif, seules la page publiee reliee par `PAGE-PUBLIQUE` et sa composition
sont renvoyees. `DATE-DEBUT` et `DATE-FIN` bornent sa periode de publication ; hors periode, aucun
contenu de page n'est expose. Pour un site Actif, `PAGE-PUBLIQUE` est prioritaire ; sans relation,
la route `/` conserve son comportement historique. Le rendu public reprend l'en-tete du site,
la composition Builder et le footer configure ; les rendus de repli n'affichent pas de contenu
metier absent de SharePoint.

Appels Graph : timeout 15 s, au plus 2 reessais sur 429/503 en respectant `Retry-After` (plafonne
a 5 s).

## Gestionnaires `dse*/index.js`

Les dossiers `dse*/index.js` conservent la signature `(context, req)` et sont appeles par
`server.js` via un adaptateur Express. Aucun fichier Azure Functions (`function.json`, `host.json`)
n'est conserve : l'API s'execute uniquement sur le VPS OVH.

## Tests

```bash
npm run check
npm run smoke
```

`check` verifie aussi l'existence des imports relatifs du frontend publie, pour eviter
un ecran vide cause par un module absent en production.

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
- domaine connu + site actif/valide + page configuree publiee (ou route `/` sans `PAGE-PUBLIQUE`) -> `normal` ;
- statuts SharePoint Construction, Maintenance, Suspendu ou Archivé -> page `PAGE-PUBLIQUE` du site, si publiee et dans sa periode ;
- site/page non pret, configuration temporelle invalide ou page speciale absente -> page de repli neutre ;
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

**Nouveaux domaines** : `node tools/sync-domaines.js --nouveaux` (lecture seule) liste ce qui reste à configurer et les commandes par domaine.

## Moteur public HERO + FOOTER (multi-domaines)

Chaîne unique pour tous les domaines : Host → `par-domaine` → site (ID natif) → page racine active/validée → `OBJ-MODULE-SITE-PUBLIC` → contenu spécialisé (`OBJ-MODULE-HERO`, `OBJ-MODULE-FOOTER`) → rendu. Aucun contenu métier dans le code.

- Code : `modules/public/outils.js` (outils purs), `modules/footer/footer.js` (rendu footer), `pages/accueil.js` (HERO + assemblage), `api/dseSiteComplet/index.js` (`CONTENUS_MODULES` : ajouter une entrée = nouveau type de module).
- Robustesse : aucun HERO → « page en préparation » ; aucun FOOTER → signature minimale (nom du site) ; liste `OBJ-MODULE-FOOTER` absente → ignorée sans erreur ; liens non sûrs et valeurs `ND` jamais affichés.
- **Liste SharePoint à créer (validation Pascal)** : `OBJ-MODULE-FOOTER`, mêmes colonnes que `OBJ-MODULE-HERO` (Lookup `OBJ-MODULE-SITE-PUBLIC`, `OBJ-ACTIF`, `OBJ-VALIDE`, `OBJ-VEROUILLE`, `ORDRE-AFFICHAGE`) + `TITRE-PRINCIPAL` (marque), `TEXTE`, `MENTIONS`, `LIEN-1..4-TEXTE/URL`, `BOUTIQUE-TEXTE`, `BOUTIQUE-URL`. Type `FOOTER` à ajouter dans `OBJ-MODULE-SITE-PUBLIC-TYPE`.
- Boutique commune (demainsite.fr, pasclaure.fr, blogs-site.fr) : chaque site garde son propre footer/identité ; le lien boutique est porté par `BOUTIQUE-TEXTE/URL` d'un footer par site, tous pointant vers l'URL unique de la boutique (aucune copie de contenu).
- Contrôle : `npm test` (pur), `npm run test:rendu-domaines` (lecture seule, 4 domaines prioritaires ou `-- dom1 dom2`).

## Catalogue multiplateforme

Routes publiques (GET, `?domaine=` obligatoire, site déduit du domaine) :
`/api/v1/catalogue`, `/articles`, `/produits` (alias `/boutique`), `/services`, `/themes`, `/recherche?q=`, `/catalogue/element/:cle`.
Filtres combinables : `plateforme` (portail seulement), `type`, `theme`, `categorie`, `collection`, `format`, `visibilite`, `disponibilite`, `q`, `page`, `limite`.
Les options de filtres sont calculées depuis les données ; la recherche ignore casse et accents.

Règles : contenu actif ET validé, public, rattaché au site par ID natif (`OBJ-SITE-PUBLIC`). Un produit existe une seule fois et est rattaché à plusieurs sites. Le portail (dseco.fr) n'agrège que les contenus marqués `AGREGATION-PORTAIL`. Portail : colonne `PORTAIL-CATALOGUE` de `OBJ-SITE-PUBLIC`, ou variable `DSE_CATALOGUE_PORTAIL_SITE_IDS` (IDs natifs séparés par des virgules). Cache : `DSE_CATALOGUE_CACHE_SECONDES` (60).

Structure SharePoint attendue (lecture seule côté API) : `OBJ-ARTICLE`, `OBJ-SERVICE`, `OBJ-CATALOGUE` (produits), référentiels `OBJ-CATALOGUE-THEME/-CATEGORIE/-COLLECTION`, avec Lookups plateformes/thème/catégorie/collection/média/liens, `FORMAT`, `VISIBILITE`, `DISPONIBILITE`, `OBJ-ACTIF`, `OBJ-VALIDE`. Une structure absente donne un catalogue vide (section masquée).

Tests : `npm run test:catalogue`.

## Provisionnement SharePoint de production

`npm run provision:sharepoint-production -- --plan | --apply | --seed | --verify` (idempotent, aucune suppression).
`--plan` et `--verify` sont en lecture seule. `--apply` crée listes et colonnes (référentiels `OBJ-THEME/-CATEGORIE/-COLLECTION/-FORMAT/-VISIBILITE/-DISPONIBILITE`, `OBJ-ARTICLE`, `OBJ-SERVICE`, `OBJ-MODULE-FOOTER`, colonnes de `OBJ-CATALOGUE`, `PORTAIL-CATALOGUE`). `--seed` ajoute référentiels, type FOOTER, un pilote par type (actif, non validé), pages racines des sites 2 et 3 (non validées).
`--apply` et `--seed` exigent `Sites.Manage.All` (temporaire, à révoquer ensuite) ; sans lui, ils s'arrêtent sans rien écrire. Sauvegarde du schéma dans `api/.sauvegardes/` (ignoré par Git).
