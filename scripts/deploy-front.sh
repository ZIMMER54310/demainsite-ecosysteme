#!/usr/bin/env bash
# Deploie le front DSE (uniquement) depuis un commit Git identifie vers /var/www/html.
# Usage : scripts/deploy-front.sh [commit-ish] [--dry-run]
# Par defaut : HEAD, qui doit etre publie sur origin/ovh/api-native.
set -euo pipefail

CIBLE="${DSE_FRONT_TARGET:-/var/www/html}"
REF="HEAD"
DRY=()
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=(--dry-run) ;;
    *) REF="$arg" ;;
  esac
done

# Seuls ces chemins sont publies.
FICHIERS=(index.html 404.html)
DOSSIERS=(assets components js modules pages services)

cd "$(git rev-parse --show-toplevel)"
SHA="$(git rev-parse --verify "$REF^{commit}")"

if ! git branch -r --contains "$SHA" | grep -q 'origin/ovh/api-native'; then
  echo "ERREUR : $SHA n'est pas sur origin/ovh/api-native (pousser d'abord)." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git archive "$SHA" "${FICHIERS[@]}" "${DOSSIERS[@]}" | tar -x -C "$TMP"

# Controle avant copie : rien d'interdit, tous les fichiers requis presents.
for f in "${FICHIERS[@]}"; do [ -f "$TMP/$f" ] || { echo "ERREUR : $f absent" >&2; exit 1; }; done
INTERDITS="$(find "$TMP" \( -name '.git*' -o -name '.env*' -o -name node_modules -o -name 'server.js*' -o -name '*.backup*' -o -name '*.bak' -o -name '*experimental*' -o -name '.vscode' -o -name api \))"
if [ -n "$INTERDITS" ]; then echo "ERREUR : fichiers interdits :" >&2; echo "$INTERDITS" >&2; exit 1; fi
if grep -rIlE 'DSE_CLIENT_SECRET|client_secret' "$TMP" >/dev/null; then
  echo "ERREUR : motif de secret detecte dans le front" >&2; exit 1
fi

echo "Deploiement du commit $SHA vers $CIBLE ${DRY[*]:-}"
# Copie non destructive ; les fichiers deja presents et les medias sont preserves.
for f in "${FICHIERS[@]}"; do
  sudo rsync -a "${DRY[@]}" "$TMP/$f" "$CIBLE/$f"
done
for d in "${DOSSIERS[@]}"; do
  sudo rsync -a "${DRY[@]}" "$TMP/$d/" "$CIBLE/$d/"
done

[ ${#DRY[@]} -gt 0 ] && { echo "Simulation terminee."; exit 0; }

# Controle apres copie : contenu identique au commit.
for f in "${FICHIERS[@]}"; do cmp -s "$TMP/$f" "$CIBLE/$f" || { echo "ERREUR : $f differe" >&2; exit 1; }; done
for d in "${DOSSIERS[@]}"; do
  while IFS= read -r -d '' f; do
    rel="${f#"$TMP/"}"
    cmp -s "$f" "$CIBLE/$rel" || { echo "ERREUR : $rel differe" >&2; exit 1; }
  done < <(find "$TMP/$d" -type f -print0)
done
[ ! -e "$CIBLE/api" ] && [ ! -e "$CIBLE/.env" ] || { echo "ERREUR : element interdit en cible" >&2; exit 1; }

echo "$SHA" | sudo tee "$(dirname "$CIBLE")/.dse-front-commit" >/dev/null
echo "OK : front $SHA deploye."
