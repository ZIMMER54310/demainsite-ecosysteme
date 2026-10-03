# Synchronisation des domaines OVH

`api/tools/sync-ovh-sharepoint.js` lit les domaines enregistrés auprès d'OVH
et résout les listes et colonnes SharePoint depuis leurs métadonnées.
L'exécution par défaut est en lecture seule.

## Exécution

Depuis `api/` :

```sh
node tools/sync-ovh-sharepoint.js --dry-run
node tools/sync-ovh-sharepoint.js --dry-run --domain exemple.fr
node tools/sync-ovh-sharepoint.js --domain exemple.fr
node tools/sync-ovh-sharepoint.js --sync
node tools/sync-ovh-sharepoint.js --metadata-sync --dry-run
node tools/sync-ovh-sharepoint.js --metadata-sync
```

`--domain` et `--sync` écrivent dans SharePoint. La création est bloquée si une
référence obligatoire ne peut être résolue sans ambiguïté. Pour un nouveau
domaine, le type, le client, la durée, les états et la date d'achat certaine
fournie par OVH doivent être disponibles. Aucune valeur métier n'est inventée.
Les sites créés reçoivent le Lookup natif vers le statut Construction et des
références SharePoint non publiées résolues sans ambiguïté (`NON - Actif`,
`NON`).

`--metadata-sync` est le mode utilisé par le timer de production pour cette
synchronisation technique : il ne crée, ne supprime et n'archive aucun domaine
ni site. Il ne traite que les domaines déjà présents dans `OBJ-NOM DE DOMAINE`.
Les domaines OVH sans élément SharePoint produisent une alerte
`DOMAINE_OVH_ABSENT_SHAREPOINT_A_TRAITER` pour examen métier. Les domaines
présents sont lus via `GET /domain/{domaine}/serviceInfos` :

- `creation` alimente `Date Achat`;
- `expiration` alimente `Date d'expiration`;
- `renew.period` (mois OVH) est associé à une valeur existante de `OBJ-TEMPS`
  (`1 AN`, `2 ANS`, etc.) et écrit par son ID natif SharePoint. La valeur
  affichée est dérivée du nombre de mois; aucun nombre de jours n'est calculé.

Les valeurs OVH absentes, invalides ou impossibles à associer à une valeur
SharePoint sont conservées côté SharePoint et signalées. Les dates SharePoint
de type `dateOnly` sont comparées et écrites selon le fuseau constaté sur les
valeurs existantes DSE (`Europe/Paris`). Les journaux distinguent les valeurs
OVH sources, la période dérivée et les IDs SharePoint. Le mode
`--metadata-sync --dry-run` affiche le bilan sans écriture.

Configurez les identifiants officiels manquants dans `/etc/dse/domain-sync.env` en
partant de [domain-sync.env.example](../deploy/systemd/domain-sync.env.example).
Les clés OVH/Microsoft existantes restent dans le fichier d'environnement
sécurisé déjà utilisé par l'API; aucune clé n'est requise dans ce fichier de
configuration ni dans Git.

Le journal JSONL local est écrit par défaut dans
`/var/log/dse/domain-sync.jsonl`. OBJ-JRN reste en lecture seule : son Lookup
STATUT cible une liste absente du catalogue SharePoint, donc chaque exécution
signale `JOURNAL_OBJ_JRN_BLOQUÉ` et fournit le journal local compensatoire.

## Timer systemd

Le timer existant `dse-sync.timer` exécute le service toutes les 15 minutes.
Le service lance `--metadata-sync`, puis la synchronisation DNS/Nginx/HTTPS
existante uniquement si la synchronisation SharePoint a réussi. Installation
ou mise à jour :

```sh
sudo install -m 0644 deploy/systemd/dse-sync.service /etc/systemd/system/dse-sync.service
sudo install -m 0644 deploy/systemd/dse-sync.timer /etc/systemd/system/dse-sync.timer
sudo systemctl daemon-reload
sudo systemctl enable --now dse-sync.timer
sudo systemctl start dse-sync.service
sudo journalctl -u dse-sync.service -n 100 --no-pager
```
