#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Uso: bash scripts/restore.sh ARQUIVO CONTAINER USUARIO BANCO"
  exit 1
fi

FILE="$1"
CONTAINER="$2"
DB_USER="$3"
DB_NAME="$4"

if [[ ! -s "$FILE" ]]; then
  echo "Erro: backup inexistente ou vazio." >&2
  exit 1
fi

if [[ "$CONTAINER" == "tagravado-db" ]]; then
  echo "Erro: use um container separado para restaurar." >&2
  exit 1
fi

OBJECTS="$(docker exec "$CONTAINER" psql \
  -X --username="$DB_USER" --dbname="$DB_NAME" \
  --set=ON_ERROR_STOP=1 -Atqc "
    SELECT count(*)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%'
      AND n.nspname <> 'information_schema';
  " | tr -d '[:space:]')"

if [[ "$OBJECTS" != "0" ]]; then
  echo "Erro: o banco de destino precisa estar vazio." >&2
  exit 1
fi

echo "Restaurando em $CONTAINER / $DB_NAME..."

docker exec -i "$CONTAINER" psql \
  -X --username="$DB_USER" --dbname="$DB_NAME" \
  --set=ON_ERROR_STOP=1 \
  --single-transaction \
  --file=- < "$FILE"

echo "Restore concluido com sucesso: $CONTAINER / $DB_NAME"