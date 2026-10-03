# Synchronisation des domaines OVH

`api/tools/sync-ovh-sharepoint.js` lit les domaines enregistrés auprès d'OVH,
résout les listes et colonnes SharePoint depuis leurs métadonnées, puis crée
uniquement les enregistrements nécessaires dans `OBJ-NOM DE DOMAINE` et
`OBJ-SITE-PUBLIC`. L'exécution par défaut est en lecture seule.

## Exécution

Depuis `api/` :

```sh
node tools/sync-ovh-sharepoint.js --dry-run
node tools/sync-ovh-sharepoint.js --dry-run --domain exemple.fr
node tools/sync-ovh-sharepoint.js --domain exemple.fr
node tools/sync-ovh-sharepoint.js --sync
```

`--domain` et `--sync` écrivent dans SharePoint. La création est bloquée si une
référence obligatoire ne peut être résolue sans ambiguïté. Pour un nouveau
domaine, le type, le client, la durée, les états et la date d'achat certaine
fournie par OVH doivent être disponibles. Aucune valeur métier n'est inventée.
Les sites créés reçoivent le Lookup natif vers le statut Construction et des
références SharePoint non publiées résolues sans ambiguïté (`NON - Actif`,
`NON`).

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
Le service lance explicitement `--sync`, puis la synchronisation DNS/Nginx/HTTPS
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
