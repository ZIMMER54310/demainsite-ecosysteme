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

### Tableau des droits individuels

Depuis Administration, « Tableau des droits et autorisations » ouvre
`#/cockpit/droits?domaine=…`. Chaque affectation utilisateur/site dispose de
cases par operation technique, regroupees par capacite ; « Tout » ne change
que les cases **affichees et modifiables** du groupe. Les groupes et informations techniques
sont repliables. Le tableau distingue le reglage herite/individuel du droit
effectif, qui tient aussi compte du profil, des options et des autres affectations.
La recherche globale (nom, code, groupe, action ; accents/casse ignores)
se combine aux filtres groupe, type d'action et etat : active, desactive,
modifiable ou protege. Chaque groupe possede aussi sa propre recherche et
son filtre d'etat. Les filtres ne modifient ni n'effacent les cases choisies.
« Reinitialiser les filtres » les efface sans perdre les modifications.
Les compteurs globaux et par groupe indiquent **actives / total**, le nombre
desactives et le nombre affiche. Le total inclut les droits proteges et
masques par les filtres. Les cases choisies actualisent immediatement ces
compteurs et les couleurs vert/rouge, avec libelles « Active/Desactive » ;
la colonne du droit effectif reste celle de l'etat enregistre.

L'administrateur agit dans le contexte d'un site autorise, uniquement sur
les affectations dont **tous** les sites sont dans ce contexte. Il ne peut
depasser ses droits effectifs, modifier un compte administrateur ou superieur,
ses propres acces ou des droits verrouilles. Une politique de role absente
ne permet jamais d'inferer un niveau inferieur. Le super administrateur
(politique globale avec fonction `plateforme`) peut egalement gerer les
profils et ajouter des droits au catalogue. Son propre profil est protege.
Un profil verrouille propose « Deverrouiller ce profil pour modifier ses
droits » uniquement au super administrateur, hors de ses propres profils.
Cette action exige apercu/confirmation, ETag et journal ; elle ne modifie
que le verrou du role, pas ses permissions. Les droits individuellement
verrouilles restent proteges.
Le super administrateur est **global pour tous les sites**, meme lorsqu'un
site possede une affectation locale plus restrictive. Il peut modifier
les contenus et administrer les comptes/profils ; les indisponibilites
globales de fonctions et options client restent appliquees. Le titre
d'un role local ne transforme jamais a lui seul un compte en super
administrateur global.

Seul un super administrateur peut attribuer ou retirer le role global
d'un autre super administrateur. Une modification de role ou de politique
doit conserver au moins un compte super administrateur actif, valide et
lie a une identite Entra unique. Les modifications de roles et de politiques
partagent un verrou de gouvernance, puis relisent les droits avant ecriture,
pour empecher deux retraits concurrents du dernier acces. La protection
s'applique aux ecritures du cockpit ; une modification directe des donnees
officielles hors DSE ne passe pas par ces controles.

`tools/promouvoir-super-administrateur.js` permet une promotion de maintenance
**uniquement apres accord explicite**, avec ID utilisateur, nom exact et ID
du role global officiel. Sans `--apply`, aucune ecriture ; avec `--apply`,
seule la relation du role global est modifiee, avec ETag, journal et relecture.

Le schema est complete par `node tools/provision-droits-individuels.js`
(simulation), puis `--apply` apres autorisation. Quatre colonnes facultatives :

- `OBJ-ROLE-CAPACITE` : lookup simple `OBJ-DROIT-OPERATION`, booleen `AUTORISATION`.
- `OBJ-UTILISATEUR-PERMISSION` : lookup simple `OBJ-DROIT-OPERATION`.
- `OBJ-DROIT-OPERATION` : booleen `INDIVIDUEL-REQUIS`.

Aucun element existant n'est migre ou modifie par ce provisionneur.
Sans relation a une operation, les permissions historiques restent
inchangees. Une surcharge utilisateur precise remplace le couple
capacite/action pour cette operation et cette affectation seulement ;
un ancien refus verrouille reste prioritaire. Une interdiction de profil
retire cette operation du plafond du role ; un profil individuel autorise
fournit une permission de base, sous reserve des restrictions utilisateur.
Le modele historique de sites applique egalement ces interdictions
individuelles, sans depasser ses limites de role/profil d'acces.
Les operations globales (creation et validation d'un site) figurent
egalement dans le catalogue. Le super administrateur dispose d'entrees
« Droits globaux » pour les comptes globaux autorises ; leur permission
precise n'a pas d'affectation a un site, et les controles de creation/
validation utilisent le meme moteur de selection par operation pour les
comptes globaux restreints ; le super administrateur global conserve
l'acces complet aux operations disponibles.

Les nouveaux droits crees depuis le tableau portent `INDIVIDUEL-REQUIS=true` :
aucune permission historique ne les attribue automatiquement. Creer une
entree de catalogue ne cree **pas** la fonctionnalite metier ; son code doit
etre raccorde dans le logiciel.

Routes : `GET /cockpit/admin/droits`, `POST /cockpit/admin/droits/apercu`,
confirmation commune `POST /cockpit/edition/confirmer`.
Les references utilisateur/operation/profil sont opaques. Les ID, colonnes,
etats et perimetres sont recalcules cote serveur ; apercu signe lie a
l'identite, revalidation des droits, verrou de concurrence, ETag, journal
debut/fin et relecture utilisent le pipeline commun. Plusieurs cases sont
confirmees ensemble puis enregistrees **separement**, sans promesse de
transaction globale : un echec arrete la suite et affiche le nombre confirme.
Une relecture est obligatoire avant de reprendre apres un echec.

Tests hors reseau : `npm run test:droits-individuels`.

### Bandeau de chantier et typographie

Le bandeau « Page en chantier » utilise la colonne booleenne
`AFFICHER-BANDEAU-CHANTIER` de `OBJ-PAGES-SITE`. Le soulignement utilise
`SOULIGNEMENT` de `OBJ-STYLE-PRESET`. La liste `OBJ-POLICE` porte les familles
proposees dans le panneau Design.

Les modules CARTE, LISTE-CARTES, CTA, FAQ, ACCORDEON et HERO disposent de deux
groupes independants « Typographie du titre » et « Typographie du texte ».
Ils utilisent `TYPO-TITRE` et `TYPO-TEXTE` dans `OBJ-STYLE-PRESET` :
plusieurs lignes de texte **brut**, non obligatoires, sans ajout des modifications.
Le cockpit y enregistre un objet JSON valide contenant les proprietes
typographiques et `responsive.TABLETTE` / `responsive.MOBILE`. Les polices
sont des references a `OBJ-POLICE`, resolues au rendu. Ces champs ne doivent
pas etre edites manuellement. Une colonne absente ou de mauvais type bloque
explicitement l'enregistrement. Les presets partages restent inchanges :
le constructeur cree une variante propre a l'element.
Les types IMAGE et IMAGE-TEXTE disposent egalement des deux typographies.
Dans `OBJ-MODULE-IMAGE`, `TITRE-IMAGE` (texte facultatif sur une ligne)
et `TEXTE` (texte brut multiligne facultatif) fournissent les contenus visibles.
La colonne systeme `Title` reste le nom de repere obligatoire ; elle ne
devient jamais automatiquement le titre visible. Le texte alternatif et
le lien existants restent inchanges. Le formulaire ne propose plus la legende
ni l'alignement (regle dans Design). Une ancienne legende est reprise comme
titre public si `TITRE-IMAGE` est vide ; a l'enregistrement de ce titre,
la legende est videe pour eviter tout doublon ou reapparition apres effacement.
Les aides des formulaires dynamiques se trouvent sous les champs, en italique
et dans une couleur distincte. Le selecteur d'image s'ouvre a la demande,
propose une recherche insensible aux accents et 24 resultats par page ;
le formulaire ferme n'affiche que l'image choisie.
`IMAGE-DISPOSITION` et `BORDURES-DETAIL`, dans `OBJ-STYLE-PRESET`, sont des
colonnes de texte brut multiligne facultatives, sans ajout des modifications.
Le cockpit y enregistre des objets JSON valides, avec les surcharges
`responsive.TABLETTE` et `responsive.MOBILE`. Chaque titre/texte est masquable
independamment, autour ou sur l'image, en haut/bas/gauche/droite.
Le placement par defaut est titre au-dessus et texte en dessous.
Les cases « Afficher le titre/texte au public » du formulaire de contenu
utilisent les memes masquages generaux que Design dans `IMAGE-DISPOSITION`.
Les surcharges tablette/mobile sont conservees. Les valeurs inchangees
n'ecrivent pas le preset. Les ecritures de visibilite et de contenu ne sont
pas transactionnelles dans Graph : une erreur du contenu apres modification
de visibilite signale explicitement cet enregistrement partiel.
Les bordures proposent quatre rayons (0 a 200 px), puis une epaisseur
(0 a 20 px), une couleur et un style pour chacun des quatre cotes.
Les reglages precis priment sur les reglages globaux ; les reinitialiser
revient au style herite. Pour une image, les bordures ciblent l'image
elle-meme, pas ses textes. Aucun champ JSON ne doit etre edite manuellement.
Le panneau rassemble bordures et coins dans une seule rubrique par appareil.
Le dessin permet de selectionner Tous/Haut/Droite/Bas/Gauche sans modifier
les valeurs. Modifier une propriete globale l'applique explicitement aux
quatre cotes, y compris si le preset parent les differencie. La case
« Meme arrondi pour les quatre coins » regroupe les coins ; la decocher
ne modifie pas les valeurs. Ouvrir le panneau conserve toutes les valeurs
independantes. Annuler/retablir/copier/coller conservent les memes champs.
`imagePosition` dans `IMAGE-DISPOSITION` accepte GAUCHE/CENTRE/DROITE et
positionne l'image dans sa colonne sans changer l'alignement de ses textes.
Il remplace dans le panneau Image le reglage de repartition des elements,
reserve aux conteneurs et autres types disposant de ce groupe.
Les alignements, l'italique, le soulignement et la casse utilisent des
boutons accessibles au clavier avec infobulles et etat selectionne ;
la fleche de reinitialisation revient a la valeur heritee.
Une rubrique « Afficher le titre et le texte » pilote les rubriques
typographiques independantes. Non cache la rubrique et le contenu public,
sans effacer les valeurs. Pour les images, les positions et placements sont
dans la rubrique de chaque partie et la visibilite reste dans
`IMAGE-DISPOSITION`. Pour les autres modules a typographie separee, le
booleen `masque` est stocke dans `TYPO-TITRE` / `TYPO-TEXTE`, avec les
surcharges responsive habituelles. Les questions FAQ/accordeon restent
visibles pour permettre l'ouverture de la reponse ; leur masquage est refuse.
Les details d'ombre et de soulignement apparaissent uniquement si l'effet
est actif, y compris apres reinitialisation ou annuler/retablir. Desactiver
une ombre heritee supprime effectivement son rendu et conserve ses details.
Un dessin distingue « Espace autour de l'element » (distance des voisins)
et « Espace entre le bord et le contenu » (place a l'interieur).
Les blocs adaptes HEADER/FOOTER dans l'apercu reutilisent le rendu public du
logo/menu et des mentions, au lieu de simples reperes. Le contexte visiteur
est calcule separement du contexte de travail ; les brouillons recursifs
sont exclus. Une zone vide en vue visiteur reprend le rendu historique,
comme le site public. En composition, les zones vides restent editables.
Un conteneur de contexte non associe ne remplace jamais le rendu du site.
L'editeur d'en-tete/pied de page indique ses pages d'utilisation et propose
l'affectation selon les droits ; construire un bloc ne l'affecte pas.
Les formulaires d'informations Menu proposent « Modifier les liens du menu »
vers l'editeur de navigation du meme site (liens, ordre et sous-menus).
« Supprimer » une entree de menu effectue un DELETE SharePoint avec ETag,
confirmation signee, journal et verification de l'absence (404). La page
liee n'est pas supprimee. Les entrees parentes sont bloquees tant que leurs
sous-menus existent, y compris masques et lors du controle avant ecriture.
Le droit distinct `menu.entree.supprimer` doit etre configure dans
OBJ-DROIT-OPERATION puis accorde dans le perimetre du site ; aucune
compatibilite avec le droit de modification ne donne ce droit implicitement.
Le bouton est grise sans autorisation ou en presence de sous-menus.
Le provisionneur des autorisations declare cette operation avec l'action
ADMINISTRER ; son execution et les affectations utilisateur restent explicites.

Le soulignement propose une couleur independante, un style SIMPLE / DOUBLE /
POINTILLES / TIRETS / ONDULE, une epaisseur (0 a 10 px) et une distance sous
le texte (0 a 20 px). Ces reglages ne l'activent pas automatiquement :
utiliser le bouton « Souligner ». Une valeur vide suit le style herite ou
le comportement du navigateur (couleur du texte, ligne simple, epaisseur
et distance automatiques).
Pour la typographie unique, ajouter dans `OBJ-STYLE-PRESET`, sans valeur
par defaut et non obligatoires : `SOULIGNEMENT-COULEUR` (texte sur une ligne,
hexadecimal), `SOULIGNEMENT-STYLE` (Choix avec les cinq valeurs ci-dessus,
sans choix libres), `SOULIGNEMENT-EPAISSEUR` et `SOULIGNEMENT-DISTANCE`
(Nombres decimaux). Pour les deux typographies, les memes proprietes
restent dans `TYPO-TITRE` / `TYPO-TEXTE`, y compris les surcharges responsive.

Pour installer uniquement ces reglages et les 25 familles de polices, sans
provisionner les autres modules ni les modeles :

```bash
node tools/provision-dse-builder.js --plan --typographie-chantier
node tools/provision-dse-builder.js --apply --typographie-chantier
node tools/provision-dse-builder.js --verify --typographie-chantier
```

L'application exige les droits de provisionnement existants, sauvegarde le
schema et relit les champs et familles apres ecriture. Elle ne donne aucun
droit utilisateur et ne remplace pas une police deja presente mais incomplete.
Publier egalement le front avec le script du depot, puis redemarrer l'API :
les fichiers du dossier de travail ne sont pas automatiquement servis au navigateur.

### Lot cockpit / construction / accompagnement

`node tools/provision-cockpit.js --apply` sauvegarde le schema concerne avant
de proposer des ajouts idempotents. Il ne cree aucun etat, offre, abonnement,
modele ni droit utilisateur. Un 403 interrompt le provisionnement sans modifier
les permissions Graph/Azure. Les fonctionnalites concernees restent bloquees,
pas remplacees par des donnees fictives :

- OBJ-REALISATION-ETAT porte libelle, progression 0-100, couleur et prochaine
  operation technique. Les Lookups simples REALISATION-ETAT des En-tetes,
  Footers, pages et elements de construction conservent les etats historiques.
  La progression du cockpit consomme les etats renseignes ; un etat absent
  conserve le calcul historique, sans inventer de libelle du nouveau referentiel.
- OBJ-DROIT-OPERATION peut declarer DEMANDABLE, INTERDITE, OPTION-REQUISE et
  MESSAGE-REFUS. Une interdiction explicite reste prioritaire et non demandable.
  OBJ-CLIENT-CAPACITE porte une activation fonctionnelle client/site/capacite,
  pas un prix ou un abonnement. Une option requise sans configuration exploitable
  est bloquee ; une activation client ne donne jamais de droit utilisateur.
  Ces contraintes s'appliquent aussi aux contextes globaux et de compatibilite,
  sans leur accorder de nouvelles operations.
- OBJ-DEMANDE-ACCES est un flux metier distinct de la liste systeme SharePoint
  « Demandes d'acces ». L'API derive utilisateur/affectation/client/site/périmetre/
  capacite/action depuis la session et les Lookups, puis exige apercu et
  confirmation, revalidation, anti-doublon, relecture et OBJ-JRN. La demande
  n'attribue aucun droit. Une demande deja traitee est suivie avec l'interlocuteur,
  sans creation automatique d'une seconde ligne identique.
- OBJ-ACCOMPAGNEMENT distingue les types techniques humain et ia, leurs textes
  et Lookups vers les medias officiels, sans copie de fichiers. Le texte officiel
  approuve reste visible sans inventer d'avatar lorsqu'il n'est pas configure.
  L'IA ne recoit ni session ni privilege et ne realise aucune action autonome.
- Les modeles existants restent dans OBJ-MODELE-BUILDER. SOURCE-ENTETE,
  SOURCE-FOOTER et DEFAUT-NOUVEAU-SITE preparent leur designation native.
  L'assistant actuel ne cree pas de site serveur : l'instanciation automatique
  n'est donc pas activee. Les modeles non valides restent inutilisables ;
  la construction libre est conservee.
- `GET /api/v1/cockpit/creer/referentiels` lit les usages, types de boutique,
  options, modes commerciaux, périodicités, licences et décisions client depuis
  les listes natives. `GET /api/v1/cockpit/creer/domaines` ne propose que des
  domaines existants, actifs, valides, complets et non rattachés, avec leur
  client dérivé du Lookup. La création requiert une autorisation globale
  explicite dans SharePoint : opération `site.creer`, capacité/action du rôle
  global et permission utilisateur sans affectation site. Une opération héritée
  d'un site ne suffit pas. `POST /api/v1/cockpit/site/creer/apercu` prépare une
  création à ligne unique dans `OBJ-SITE-PUBLIC`, en brouillon, inactive et non
  validée. Le navigateur ne transmet qu'un nom et une référence opaque ; les
  Lookups natifs, le client et les états sont reconstruits côté serveur.
  L'assistant n'enregistre que le nom et le domaine ; les autres configurations
  du site ne sont pas créées automatiquement.
  `POST /api/v1/cockpit/site/modifier/apercu` limite l'édition au nom d'un site
  du périmètre. `GET /api/v1/cockpit/sites/brouillons` et
  `POST /api/v1/cockpit/site/valider/apercu` permettent une validation humaine
  explicite via un jeton opaque lié à la session. Valider ne modifie jamais
  l'état actif. Toutes les écritures revalident droits, périmètre, état actuel
  et doublon, puis relisent SharePoint et journalisent OBJ-JRN. Si un champ
  obligatoire, Lookup ou autorisation est absent ou ambigu, l'aperçu est refusé.
  Avant toute écriture, le schéma réel du journal est vérifié contre le contrat autorisé ;
  les champs requis ID-JRN (Title), CODE, NOM et ANOMALIE sont renseignés,
  CLEIDEMPOTENCE doit être indexée et unique, et toute incompatibilité suspend
  l'opération. Les confirmations journalisées suivent DÉBUT, SUCCÈS/ÉCHEC/REFUS,
  puis FIN, avec relecture SharePoint et refus de réutiliser une clé existante.
  Les opérations commerce doivent en outre être explicitement accordées par les
  relations dynamiques de capacité/action et un périmètre réel ; aucun accès
  n'est créé si ces données sont absentes. La permission globale de création
  nécessite un enregistrement explicite sans affectation ; si le schéma courant
  ne permet pas cette représentation, la création reste bloquée par défaut.
- `GET /api/v1/cockpit/site/usages` expose, après contrôle site/périmètre et
  opération, les usages existants et/ou les choix autorisés.
  `POST /api/v1/cockpit/usages/apercu` prépare le rattachement d'un usage réel
  à un site déjà accessible. Le flux utilise les colonnes internes constatées
  `ObjSitePublic`, `ObjUsageSite`, `DateEffet` et `EmpreinteSiteUsage` de
  `OBJ-SITE-USAGE`, ainsi que les IDs natifs des références. Il relit les
  références actives/valides et les relations existantes. Le jeton émis est
  lié à la session et à l'opération ; il doit être confirmé via
  `POST /api/v1/cockpit/edition/confirmer`, qui revalide droits, périmètre,
  référence et doublon avant toute écriture. Une relation déjà existante ou
  une structure SharePoint incomplète bloque l'opération. Ce flux ne crée ni
  site ni droit.
- `GET /api/v1/cockpit/site` exige également l'opération dynamique `site.voir`
  sur le site résolu, en plus de l'identité et du périmètre. La page site n'est
  pas autorisée par le seul accès général à la fonction `sites`.

Les boutons de conteneurs et de l'arbre generique consomment les operations
effectivement autorisees. Publication/desactivation de conteneur, affectation
de page et changement d'etat d'element exigent un aperçu serveur sans écriture,
avec valeurs actuelles/proposees puis confirmation unique liee a l'identite.
Les versions sont recontrolees, une sauvegarde locale protegee precede l'ecriture
sensible, et chaque ecriture du constructeur utilise ETag puis relecture.
Les succes sont journalises dans OBJ-JRN avec cle d'idempotence. Un echec de
journal apres ecriture est signale comme partiel et ne permet pas de reecrire.
Les apercus de creation/duplication et toutes les operations internes de Design
ne sont pas convertis en flux de confirmation dans ce lot.

Validation ciblee : `node tests/cockpit-lot.js` (unitaire hors reseau) et
`node tests/droits-dynamiques-reels.js` (lecture native). Aucun de ces tests ne
constitue une preuve OAuth de Laurence. L'activation des etats/demandes/avatars
exige des configurations SharePoint officielles et une recette reelle.

### Autorisations atomiques SharePoint

Le service central [auth/autorisations.js](auth/autorisations.js) lit les comptes,
affectations, roles, capacites, actions, permissions et appartenances depuis SharePoint.
Les relations sont comparees par IDs natifs ; Title ne sert pas d'identite.
Les Lookups sont lus par projections bornees, puis les champs omis par Graph sont
relus individuellement. Les ETags doivent rester coherents entre projections.
Une valeur absente n'est jamais interpretee comme une colonne absente.

OBJ-DROIT-OPERATION contient uniquement les correspondances operations techniques /
fonctions du cockpit / Lookups capacite et action. OBJ-DROIT-PERIMETRE contient
les Lookups type et origine, colonne cible, liste cible, mode technique de resolution,
colonnes d'appartenance et IDs des types de cibles admissibles.
Ces listes ne sont pas des attributions utilisateur.

Une capacite du role et une permission atomique active/valide Autorisation=Oui
sont necessaires. OBJ-CAPACITE-ACTION valide la paire mais n'accorde jamais
l'action. Un Non explicite applicable prime sur les Oui cumules.
Les verrous des affectations ne retirent pas leurs droits de lecture ; les
elements editoriaux verrouilles restent proteges contre les ecritures.
CLIENT et groupements resolvent leurs membres natifs ; une boutique ne donne
aucun droit implicite sur son parent. Le type de cible doit etre renseigne.

Les affectations typees utilisent ce moteur sans exiger l'ancien profil
OBJ-ACCES-TYPE. Les relations non migrees et le role global conservent leur
compatibilite, dont les traductions sont elles aussi dans OBJ-DROIT-OPERATION
(mode technique compatibility). Aucun code de role ne donne un acces par lui-meme.
Un contexte dynamique direct declare pour un site mais incomplet ne retombe
jamais sur une ancienne affectation de ce meme site.
Sans affectation contextuelle applicable, une politique globale SharePoint
deja autorisee conserve son perimetre explicite sur les sites/client valides.
Ce chemin n'ajoute aucune fonction a la politique globale resolue.
Comptes conserve la consultation des affectations typees. Son formulaire
historique ne peut pas modifier/deverrouiller ces lignes : il ne transporte pas
la cible et l'origine du nouveau modele. Le refus est revalide cote serveur ;
leurs changements doivent etre effectues dans SharePoint, pas via un formulaire
qui desynchroniserait les anciennes colonnes et les nouvelles cibles.

Les routes edition/aperçu/confirmation et construire/action controlent l'action
atomique sur la cible relue. La confirmation reutilise la session, la version
ETag, l'anti-doublon et la relecture existants. Articles utilise le meme flux
editorial sur OBJ-ARTICLE et journalise les succes avec cle d'idempotence.
Les controles internes du Builder ne sont pas modifies.

OBJ-ARTICLE dispose du Lookup simple SITE-CIBLE (nom interne relu depuis le
schema). Une valeur renseignee prime sur le Lookup multiple historique ;
sans valeur, les liens historiques restent consultables. Aucun lien ni article
historique n'est migre ou supprime. Un article historique partage entre plusieurs
sites est protege contre l'edition dans ce formulaire. Les projections ciblees
incluent rattachement, verrous et champs editoriaux pour eviter les omissions Graph.
Le catalogue public utilise la meme priorite de rattachement.
La creation exige le site natif cote serveur et utilise les etats natifs
Actif=Oui et Valide=Non relus dans SharePoint : creer ne valide/publie jamais.
Un etat absent ou ambigu refuse l'operation, sans valeur inventee.
Les affectations dynamiques ne beneficient pas implicitement d'autres fiches
de site regroupees par le catalogue historique.

Outils :

```sh
node tools/provision-autorisations.js
node tools/provision-autorisations.js --apply
node tools/provision-autorisations.js --configure --apply
node tools/provision-autorisations.js --article-site --apply
node tools/provision-autorisations.js --menu-logo
node tools/provision-autorisations.js --menu-logo --apply
node tests/droits-dynamiques-reels.js
```

Le provisionnement est additif et idempotent, sans suppression. Une correspondance
existante differente est refusee, pas remplacee automatiquement. Graph peut
autoriser les items et refuser la creation de listes/colonnes (403) ; aucune
modification Azure n'est entreprise. Les deux structures peuvent alors etre
ajoutees par une session SharePoint administrateur reellement authentifiee.

`--menu-logo` ne configure que `menu.modifier` et `logo-medias.modifier`, en
reliant les capacités/action déjà présentes et en exigeant un périmètre direct
existant vers `OBJ-SITE-PUBLIC`. `--apply` crée les opérations manquantes,
relit leurs valeurs et journalise chaque écriture dans `OBJ-JRN`. Il ne crée ni
permission utilisateur, ni affectation, ni périmètre, ni site.

Le test natif est en lecture seule : il verifie les donnees du pilote et les
refus calcules, mais **ne constitue ni une preuve OAuth ni une ecriture metier**.
La recette fonctionnelle exige une session Microsoft reelle du pilote :
modifier En-tete/Footer, consulter Pages, creer/modifier un article utile reel,
et verifier les refus Page/admin/boutique/autre cible/API directe.
Ne pas creer d'article fictif pour la recette. Pour le test dynamique, changer
une permission ou capacite dans SharePoint, relire le contexte et refaire l'action
dans la meme session : aucune modification de code n'est necessaire. Faire
approuver la modification metier et sa restauration ; ne pas modifier
arbitrairement des permissions de production pour tester.

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
Mes sites propose aussi un lien public par ligne vers le domaine principal, dans un
nouvel onglet, independamment du statut. L'action Ouvrir reste la fiche cockpit.
La modification de statut est reservee a la portee TOUS, niveau ADMINISTRATION et
fonctions administration/sites. La popup lit OBJ-SITES-STATUT via des references opaques,
presente le statut actuel, puis reutilise apercu/confirmation admin, ETag, relecture
sans dependance au journal. La relation Lookup existante d'OBJ-SITE-PUBLIC est resolue par la liste cible.
La confirmation revalide la cible et le statut ; les caches publics sont invalides.
La liste, ses compteurs et filtres sont relus apres succes sans recharger la page.
La page publique de situation utilise une disposition verticale en-tete/carte/footer.
La carte et son titre restent dans la largeur disponible, avec retour a la ligne des
titres longs sur mobile, sans modification du contenu ou de la decision de statut.

## Acces public et incidents DSE

Le composant public commun propose l'entree Entra (`/acces/entrer`) ou le retour au
cockpit du domaine courant, jamais un autre site choisi par defaut.
`GET /acces/status` ne compte aucune tentative : visiteur, autorise, attente, refuse
ou bloque. Une erreur API laisse le site public utilisable et n'incremente aucun incident.
Les acces communs permettent l'accueil du cockpit, sans droit metier sur le site commun.

Le blocage automatique et les decisions d'incident adosses au journal sont desactives
par decision explicite du responsable. Les anciens incidents et leurs donnees restent
intacts dans SharePoint, mais ne servent plus a bloquer une session.
L'authentification Entra, les droits dynamiques, les perimetres client/site, les controles
CSRF et la limitation technique des requetes restent en place.

`GET /cockpit/incidents` et `POST /cockpit/incidents/decision` sont reserves a la portee
TOUS, niveau ADMINISTRATION, fonction utilisateurs. La vue est dans Utilisateurs et acces.
La lecture signale explicitement la desactivation ; aucune decision historique n'est ecrite.
Les verrous et caches correspondent au processus Node unique de production : une
architecture multi-processus requerrait un verrou partage avant activation.

Aucune alerte d'incident ni notification de reactivation n'est inscrite automatiquement.

Les POST cockpit exigent une origine identique et X-DSE-CSRF lie a la session, obtenu
par `/acces/status`. Les confirmations d'ecriture signees restent obligatoires.
Limitation technique avant authentification : DSE_ACCES_REQUETES_MINUTE (120 par defaut),
par IP hachee, sans assimilation a un incident utilisateur. Cette limite n'est pas une
politique de verrouillage metier.

Le retour Entra central conserve la transaction PKCE/nonce cote OVH et redirige uniquement
vers le domaine HTTP d'origine, deja resolu par SharePoint. Un passage aleatoire, unique
et valable 60 secondes exige le cookie de transaction du navigateur d'origine avant
creation de sa session locale Secure/HttpOnly/SameSite=Lax. Aucun mot de passe ni jeton
Microsoft n'est stocke. Le nonce de passage est consomme avant ouverture de session.
Les transactions en cours expirent en cas de redemarrage, sans incident de securite.

## Identification Entra et inscription controlee

ENTRAOBJECTID est prioritaire. L'email ne sert qu'a migrer un compte historique unique
non lie, apres authentification Microsoft reussie : PATCH conditionnel ETag, relecture,
sans journalisation, sans changer role/client/sites. Un compte deja lie a un autre objet Entra
ne peut pas etre repris par son email. Le point de connexion resout le domaine HTTP reel
depuis OBJ-NOM DE DOMAINE -> OBJSITE -> client, pas un client transmis par le navigateur.

`POST /api/v1/cockpit/inscription` exige une session Entra et une origine identique.
Le corps vide affiche l'apercu ; `{ "confirmer": true }` confirme. Aucun parametre de role,
client ou site n'est accepte. Pour autoriser une inscription, la structure minimale est
OBJ-INSCRIPTION avec ENTRA-OBJECT-ID texte (nom interne resolu), Lookups OBJ-UTILISATEUR (facultatif pour un
nouveau compte), OBJ-CLIENT, OBJ-SITE-PUBLIC, OBJ-ROLE, OBJ-ACCES-TYPE, OBJ-ACTIF et OBJ-VALIDE.
Une invitation unique active/validee doit designer les IDs reels du compte et du domaine.
La creation de role global n'est jamais permise dans ce parcours. Sans invitation, 409/403,
trace REFUS et aucune attribution. Un utilisateur existant est reutilise sans modifier
son role global et son client historiques ; le contexte de l'invitation peut etre different.
Le couple utilisateur/site est relu avant creation ;
une relation contextuelle existante incomplete ou differente exige une correction administrateur.
Le role et le profil d'acces de l'invitation doivent etre valides et sont enregistres dans la relation.
Sans Lookup/profil dans l'invitation, refus explicite avant toute creation de compte ou de relation.
La reprise apres erreur relit les elements deja crees et ne reactive pas un acces desactive.
Apres authentification Entra, un compte non reconnu passe automatiquement par ce parcours
sur le domaine conserve dans la transaction signee. Sans autorisation exacte, aucune session
nouvelle n'est ouverte. Un utilisateur reconnu non global reprend aussi le parcours si
une invitation exacte existe (ajout d'un site ou reprise d'une inscription interrompue).
Sans invitation exacte, sa connexion conserve les droits existants sans nouvelle attribution.
Les connexions globales restent inchangees ; l'endpoint avec confirmation permet aussi
l'ajout d'un autre site autorise.

### Contextes multi-sites et comptes

OBJ-UTILISATEUR-SITE est la source des droits de chaque site : utilisateur, site,
client, role, profil d'acces, actif, valide et verrou. Les Lookups simples sont
resolus depuis le schema reel et leur liste cible ; aucun GUID de colonne n'est fixe.
L'absence d'un champ dans un item signifie une valeur non renseignee, pas une colonne absente.
Les champs utiles sont selectionnes explicitement dans Graph pour la lecture des Lookups.

Le role global est conserve pour compatibilite et administration globale autorisee.
Hors administration globale, aucun droit d'administration ou d'ecriture n'est accorde
avant selection d'un contexte complet. Toute operation de site, meme par un administrateur
global, exige une relation active/validee unique avec role et profil valides, client coherent.
Une valeur manquante refuse le contexte sans repli sur le role global. Une relation
verrouillee est protegee contre la modification de ses droits ; elle ne reduit pas
le niveau du role et n'interdit pas la connexion ni la consultation.
Mes sites ne contient que les sites reellement attribues ;
les relations incompletes y sont signalees et ne donnent aucun droit sur le site.

GET /moi?domaine=... recharge le contexte et le menu ; GET /cockpit/compte est une vue
personnelle en lecture seule. Les routes d'administration recoivent contexteDomaine
pour un acteur non global. Les references opaques et la confirmation serveur sont
revalidees avec les droits frais avant toute ecriture. Comptes permet de choisir
explicitement role/profil lors de l'ajout ou de la correction d'une relation.
L'anti-doublon porte sur utilisateur + site actif, jamais sur utilisateur seul ou client.

Les profils actuels qualifient l'acces (validite et client facultatif) ; leur titre
ne constitue pas une matrice de droits. Si SharePoint configure des colonnes de
restriction FONCTIONS/NIVEAU-ACCES, celles-ci peuvent uniquement reduire la politique
du role. Sans ces colonnes, les capacites proviennent de la politique du role.
Aucune valeur de remplacement et aucune modification automatique de donnee ou schema.
`npm run test:contextes-reels` execute la recette en lecture seule avec les comptes,
relations et schemas reels accessibles par la configuration Graph existante.
Les sessions de recette sont signees localement pour les identites presentes :
ce test verifie l'API et le rendu, pas le parcours OAuth dans un navigateur.
Les ajouts/corrections de relations sont uniquement prevalides, jamais executes.
Avec DSE_CONTEXTES_BASE=https://dseco.fr, les controles de lecture passent par
l'API HTTP de production avec les sessions de recette, sans exposer ces sessions.
Les scenarios impossibles faute de relations completes sont signales NON TESTABLE,
sans completer les donnees a la place de l'administrateur.

La version API expose dans GET /etat le commit Git capture au demarrage et
demarreLe : ces valeurs ne changent pas tant que le processus n'est pas redemarre.
Le front publie est trace par /var/www/.dse-front-commit. Le deploiement du front
est non destructif ; une archive de la version precedente doit etre conservee
avant copie pour permettre le retour arriere.

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

L'editeur generique propose En-tete, SEO, Pages, Menu, Logo et Footer lorsque leur structure le permet.
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
Menu et Logo permettent une desactivation logique uniquement apres apercu et confirmation.
Elle ne supprime aucun element, revalide le rattachement au site, exige l'operation dynamique
`menu.modifier` ou `logo-medias.modifier`, relit l'etat SharePoint et journalise le cycle dans
OBJ-JRN. Une operation absente ou un droit insuffisant bloque l'action sans ecriture.

Les chemins generiques d'edition de texte ne journalisent pas OBJ-JRN ; les flux qui le
requièrent explicitement (dont Articles et la desactivation Menu/Logo) utilisent le contrat
OBJ-JRN et refusent l'ecriture si le journal ne peut pas commencer ou etre relu. La liste et ses
donnees ne sont pas supprimees. Les adaptateurs historiques renvoient un etat explicite
de desactivation, jamais une fausse confirmation de journalisation.
Les erreurs techniques serveur restent signalees. L'idempotence des commandes, les
verrous et la relecture des donnees metier sont independants de ce journal.
Les nouvelles sauvegardes de listes excluent OBJ-JRN ; les sauvegardes deja presentes
et la liste d'origine ne sont pas modifiees ni supprimees.

### Constructeur visuel et modele recursif

L'editeur s'ouvre en plein ecran avec barre d'actions, arbre a gauche, Canvas central
et reglages a droite. Le Canvas partage le renderer public et change immediatement
de largeur ordinateur/tablette/mobile. Selection et drag-and-drop sont disponibles
dans l'arbre et le Canvas. Les retraits sont logiques et confirmes.
Les commandes structurelles sont enregistrees immediatement. Un historique temporaire
de 100 commandes permet annuler/retablir ajout, duplication, deplacement et retrait
generiques. Les inverses sont recontroles cote serveur (droits, verrouillage,
imbrication, minimum/maximum, profondeur, medias et empreinte de composition).
L'historique est perdu en quittant la page ; aucun stockage metier parallele n'existe.
Une modification concurrente refuse l'inverse plutot que d'ecraser une autre edition.
Annuler/retablir les reglages locaux actualise le Canvas ; Enregistrer applique ensuite
ces reglages. Copier/coller style ou reglages est limite aux definitions compatibles
du meme type natif. L'identifiant CSS unique n'est jamais colle.
La creation de pages utilise une URL unique au site et un etat brouillon.

OBJ-BUILDER-TYPE, OBJ-BUILDER-ELEMENT, OBJ-BUILDER-REGLE-IMBRICATION,
OBJ-BUILDER-CHAMP et OBJ-BUILDER-VALEUR sont lus via Graph.
ELEMENT-PARENT et ELEMENT-RACINE utilisent les ID natifs ; les regles d'imbrication
sont controlees par Lookup de type, avec refus des cycles, changements de site,
racines ambigues et valeurs actives dupliquees. Le rendu public exige ACTIF et VALIDE.
Le formulaire generique lit les libelles, natures et valeurs SharePoint ; le renderer
traduit uniquement des cles techniques autorisees (CLE-RENDU, CODE-CHAMP).
Les familles de champs utilisent exclusivement OBJ-BUILDER-CHAMP.CATEGORIECHAMP :
CONTENU, DESIGN et AVANCE. Une categorie absente ou invalide est signalee comme erreur,
sans classement deduit du nom ou du prefixe. Aucun HTML/CSS arbitraire n'est execute.

Une racine generique ne remplace jamais automatiquement une composition historique.
Le socle SharePoint generique est considere pret ; aucun type, regle, preset ou
contenu fictif n'est initialise par le code. Les compositions historiques sont conservees.
OBJ-BUILDER-CHAMP.APPAREIL est exclue de la selection Graph des elements, des
configurations et des relations : cette colonne erronee n'est ni lue ni ecrite ni supprimee.
Les sauvegardes de listes et les restaurations manuelles appliquent la meme exclusion,
y compris pour les anciens snapshots contenant cette colonne.
Seule OBJ-BUILDER-VALEUR.APPAREIL est utilisee : vide = general, ORDINATEUR,
TABLETTE ou MOBILE = surcharge du meme champ pour cet appareil. Une surcharge vide
herite de la valeur generale, sans cascade tablette vers mobile. L'unicite active est
controlee par element + champ + appareil. Le formulaire permet de modifier plusieurs
appareils avant sauvegarde ; toutes les valeurs sont validees avant toute mutation,
puis relues. Le Canvas et le rendu public partagent ces valeurs et les seuils techniques
existants (tablette <= 1024 px, mobile <= 640 px).
OBJ-STYLE-RESPONSIVE reste utilisee pour les elements historiques.
La duplication generique recree le sous-arbre et ses valeurs configurees, y compris
les surcharges, avec de nouveaux ID natifs, en brouillon. Les cycles, cardinalites,
verrous descendants et references externes incoherentes refusent la duplication
avant mutation. Un identifiant CSS deja configure doit etre retire avant duplication.
La duplication de conteneur copie aussi la racine generique vers le nouveau conteneur
et reconstitue ELEMENTRACINE/ELEMENTPARENT. Une page exige une nouvelle URL unique
choisie par l'utilisateur. Les compositions historiques restent duplicables.
EST-RACINE definit les types de racine autorises ; les relations natives vers Page,
En-tete ou Footer definissent le perimetre, sans imposer une correspondance de noms.
PROFONDEUR et ORDRE sont ecrits a la creation et recalcules lors des deplacements.
Les boutons du Canvas et de l'arbre restent synchronises ; la palette lit les enfants
autorises et les zones de depot permettent avant/apres/dans, avec validation serveur.
Les brouillons de reglages restent disponibles en changeant de selection ; ils doivent
etre enregistres avant une commande structurelle. Enregistrer traite tous les elements
configures et relit chaque enregistrement. Une erreur ne masque pas les brouillons restants.
La publication controle la composition et les champs obligatoires,
puis valide les enfants avant la racine, avec relecture apres chaque ecriture.
Les 29 codes de proprietes generiques ont un contrat partage navigateur/serveur :
contenu, medias autorises (TYPE-DONNEE OBJMEDIA), couleurs hexadecimales, fond/media,
degrade lineaire, police, taille/unite, graisse, alignement, dimensions, quatre cotes,
bordure, rayon, ombre, opacite, Flex, Grid, Gap, position, visibilite, classes et ID CSS.
Le module generique rend uniquement le titre, texte, medias et bouton reellement
configures. Classes et ID CSS sont generaux, la visibilite est responsive.
Les conteneurs partagent un seul DOM : un ID CSS n'est pas triple par appareil.
Les champs rattaches uniquement au type MODULE ne sont pas inventes pour les autres
types. De meme, aucune regle enfant EN-TETE/FOOTER n'est ajoutee artificiellement.
L'emplacement PascAra IA reste une popup facultative, sans service IA.

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
- Compatibilité Builder : un module HERO valide rattaché directement à la page, mais absent de sa hiérarchie historique, peut être projeté en mémoire pour le rendu et l'aperçu. Cette projection est en lecture seule, conserve les IDs natifs comme source et n'est pas appliquée lorsqu'une racine Builder récursive existe ; un module déjà présent dans les sections n'est jamais ajouté une seconde fois.
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

### Couleurs de progression du cockpit

`npm run provision:progression` inspecte les structures existantes sans écriture ;
`npm run provision:progression -- --apply` réutilise une liste équivalente ou crée
`OBJ-COCKPIT-PROGRESSION` vide, sans dependance au journal.
Aucune plage, couleur ou donnée métier n'est initialisée.
La création du schéma via Graph nécessite une autorisation de gestion des listes.
Si l'application Sites.Selected reçoit un refus 403, la création peut être effectuée
avec la session SharePoint administrateur existante, sans modifier Azure ni les
permissions de l'application.

Champs : `LIBELLE` (colonne native Title affichée sous ce nom), `POURCENTAGE-MIN`,
`POURCENTAGE-MAX`, `COULEUR`, `ORDRE`, `ACTIF` (booléen), `DESCRIPTION` facultative.
Les bornes sont inclusives, comprises dans le domaine mathématique 0–100 ; la couleur
doit être une valeur opaque `#RRGGBB`. En cas de chevauchement, le plus petit ORDRE
prime, puis le plus petit ID natif SharePoint à ordre égal. Les lignes inactives sont
ignorées. Les seuils, couleurs et libellés sont exclusivement administrés dans SharePoint.

L'API relit les éléments sans cache à chaque chargement de la fiche ou de Mes sites.
Le bloc « Progression du site - XX % », sa barre, les mini-jauges et les filtres de
progression interprètent la même configuration. Aucune plage absente n'est remplacée
par un seuil ou une couleur métier par défaut : un message explicite accompagne
l'affichage neutre. Une configuration invalide ou une panne ne supprime pas les
informations de progression existantes.

Les modifications administratives directes sont relues dans SharePoint au prochain
chargement, sans lecture/ecriture du journal et sans duplication de l'historique natif.

Les blocs Progression et Accès rapides utilisent des éléments HTML `details/summary`
accessibles au clavier, fermés initialement. Un lien vers une section ouvre la
progression pour conserver la navigation existante. Aucun détail ni raccourci retiré.
Tests hors ligne : `npm run test:progression`.

`npm run provision:sharepoint-production -- --plan | --apply | --seed | --verify` (idempotent, aucune suppression).
`--plan` et `--verify` sont en lecture seule. `--apply` crée listes et colonnes (référentiels `OBJ-THEME/-CATEGORIE/-COLLECTION/-FORMAT/-VISIBILITE/-DISPONIBILITE`, `OBJ-ARTICLE`, `OBJ-SERVICE`, `OBJ-MODULE-FOOTER`, colonnes de `OBJ-CATALOGUE`, `PORTAIL-CATALOGUE`). `--seed` ajoute référentiels, type FOOTER, un pilote par type (actif, non validé), pages racines des sites 2 et 3 (non validées).
`--apply` et `--seed` exigent `Sites.Manage.All` (temporaire, à révoquer ensuite) ; sans lui, ils s'arrêtent sans rien écrire. Sauvegarde du schéma dans `api/.sauvegardes/` (ignoré par Git).

### Comptes multi-sites et identité OAuth

`GET /cockpit/admin/utilisateurs` renvoie une liste légère (identité affichée, rôle
global distinct, état, nombre d'affectations). Avec `utilisateur=<référence opaque>`,
le même endpoint renvoie une fiche et uniquement la page demandée de relations
OBJ-UTILISATEUR-SITE, ainsi que les synthèses dans le périmètre autorisé.
La source Graph complète est collectée côté serveur ; le navigateur ne reçoit
jamais toutes les affectations pour les paginer lui-même.

Paramètres : `q`, `site`, `client`, `role`, `accesType`, `actif`, `valide`,
`verrouille`, `incomplet`, `tri`, `sens`, `page`, `parPage` (10/25/50/100).
Les valeurs des filtres relationnels sont les références opaques retournées
par le serveur ; les états sont `true`/`false`. `qSite` et `pageSite` paginent
indépendamment les choix de sites pour l'ajout. L'URL conserve ces critères.
`GET /cockpit/espaces` centralise les sites du périmètre, avec recherche,
client/statut, tri et pagination. Aucun statut ni couleur métier de repli.

Les états Actif/Valide/Verrouillé sont distincts ; leurs LookupId Oui/Non sont
résolus dans les référentiels réels. Les comptes globaux ne peuvent pas modifier
leurs propres accès via ces formulaires. Une relation verrouillée reste
consultable ; seul un administrateur global peut proposer son déverrouillage
explicite avant une autre modification. Le retrait est une désactivation,
jamais une suppression. Une réactivation recontrôle le doublon Utilisateur+Site.

Pour Entra, seul ENTRA-OBJECT-ID explicitement lié au compte natif identifie
l'utilisateur. Ni Title, ni nom affiché, ni e-mail du client ne peuvent le
remplacer. Un compte existant non lié doit être rattaché explicitement :
sa session Microsoft authentifiée affiche un code personnel temporaire
(15 minutes, mémoire du processus, invalidé au redémarrage).
L'administrateur global sélectionne le compte natif existant dans Comptes,
saisit ce code et confirme l'identité OAuth présentée dans l'aperçu.
L'API vérifie à nouveau preuve, compte, unicité et version ; elle ne crée aucun
compte, rôle, profil ou affectation. Aucun code personnel ni jeton OAuth n'est
journalisé. Les traces OAuth exposent uniquement une empreinte et la première
condition de reconnaissance, avec les IDs natifs des relations si reconnu.

Les mutations d'affectations et de liaison d'identité réussies puis relues
sont journalisées dans les champs texte/date réellement disponibles d'OBJ-JRN,
avec une clé d'idempotence ; les anciens Lookup orphelins ne sont pas utilisés.
Les mutations des rôles globaux, politiques et comptes réalisées dans Comptes
utilisent le même journal de succès ciblé.
DATE-EVENEMENT est écrit à la seconde, précision effectivement conservée par
SharePoint, et sa relecture compare l'instant plutôt que la forme ISO du texte.
Un échec de journal après écriture est signalé explicitement comme une réussite
partielle, jamais comme un échec permettant de répéter aveuglément la mutation.
Ce branchement est limité à Comptes : le Builder et les autres journaux restent
inchangés.

La publication front génère depuis le commit une import map déterministe
versionnant tous les modules et les feuilles de style par SHA. Une simple
query sur la page ne suffit pas à invalider le cache des imports relatifs :
le bootstrap publié versionne aussi les dépendances statiques et dynamiques.
Les contrôles de publication comparent les fichiers copiés à cette sortie
générée ; aucun fichier API ni secret n'est copié dans le front.

`npm run test:contextes-reels` vérifie en lecture seule les données réelles et
les prévalidations sans écrire de fausses affectations. Les sessions locales de
recette sont limitées aux OID réellement liés ; elles ne prouvent pas un parcours
OAuth personnel. Un compte non lié n'est plus simulé à partir de son titre.
