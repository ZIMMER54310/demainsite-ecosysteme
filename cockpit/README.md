# DSE Cockpit - pack final de raccordement

## Installation
Copier ces fichiers dans le dossier `cockpit/` du dépôt.

## Configuration intégrée
Le domaine Azure visible dans la capture fournie est déjà renseigné dans `js/config.js`.

Les quatre chemins actuellement préparés correspondent aux noms visibles des fonctions Azure : `dseEtat`, `dseSiteComplet`, `dseSiteParDomaine`, `dseSiteParId`.

IMPORTANT : les chemins `/api/...` restent à confirmer avec « Obtenir une URL de fonction ». Si Azure affiche une route personnalisée, modifier uniquement `ROUTES` dans `js/config.js`.

## Test
Ouvrir `tests/diagnostic.html`. Le premier contrôle appelle uniquement `dseEtat`.

## Sécurité DSE
Le navigateur n'accède pas directement à SharePoint. Aucun secret Azure n'est inclus dans ce pack. OBJ-REL n'est pas utilisé.
