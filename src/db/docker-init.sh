#!/bin/sh
# Inicialização do Postgres no Docker (executado só em volume vazio).
# Aplica as migrações de /migrations e, se montado (apenas em dev), o seed de /seed.
set -e

apply_dir() {
    for file in "$1"/*.sql; do
        [ -e "$file" ] || continue
        echo "docker-init: aplicando $file"
        psql -v ON_ERROR_STOP=1 --no-psqlrc --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$file"
    done
}

apply_dir /migrations

if [ -d /seed ]; then
    apply_dir /seed
fi
