#!/usr/bin/env bash
set -euo pipefail
umask 077

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

mkdir -p backups

FILE="backups/backup-$(date -u +%Y%m%dT%H%M%SZ)-$$.sql"
TEMP_FILE="$(mktemp backups/.backup-XXXXXX)"

trap 'rm -f "$TEMP_FILE"' EXIT

echo "Gerando backup do banco..."

docker compose exec -T db sh -c '
  exec pg_dump \
    --format=plain \
    --no-owner \
    --no-privileges \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB"
' > "$TEMP_FILE"

if [[ ! -s "$TEMP_FILE" ]]; then
  echo "Erro: o arquivo de backup ficou vazio." >&2
  exit 1
fi

mv "$TEMP_FILE" "$FILE"

echo "Backup gerado: $FILE"
echo "Tamanho: $(wc -c < "$FILE") bytes"