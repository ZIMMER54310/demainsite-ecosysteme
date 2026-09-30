# DSE API Azure Function V0.9

Endpoints conservés :
- GET /api/v1/etat
- GET /api/v1/sites/par-domaine?domaine=dseco.fr
- GET /api/v1/site/{siteId}

Nouvel endpoint :
- GET /api/v1/site-complet/{siteId}

Test : GET /api/v1/site-complet/4

Le nouvel endpoint agrège OBJ-SITE-PUBLIC avec OBJ-MENU-SITE, OBJ-LOGO-SITE, OBJ-ENTETE-SITE, OBJ-THEME et OBJ-SEO. Il découvre les colonnes de relation vers le site et retourne uniquement les champs publics et les Lookups résolus.
