#!/bin/bash
# Creates and removes only a fresh temp cluster. Never reads the project .env.
set -euo pipefail
export LC_ALL=C
export LANG=C
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
LOCAL_PROOF_ROOT="$(mktemp -d /tmp/company-crm-readiness.XXXXXX)"
cleanup() {
  "$PG_BIN/pg_ctl" -D "$LOCAL_PROOF_ROOT/db" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$LOCAL_PROOF_ROOT"
}
trap cleanup EXIT
"$PG_BIN/initdb" -D "$LOCAL_PROOF_ROOT/db" -U crm_proof -A trust --no-locale -E UTF8 > "$LOCAL_PROOF_ROOT/init.log"
# Unix socket only; no network listener and no existing cluster/database reuse.
"$PG_BIN/pg_ctl" -D "$LOCAL_PROOF_ROOT/db" -l "$LOCAL_PROOF_ROOT/postgres.log" -o "-h '' -k $LOCAL_PROOF_ROOT -p 55439 -c timezone=America/Toronto" start >/dev/null || { cat "$LOCAL_PROOF_ROOT/postgres.log"; exit 1; }
"$PG_BIN/createdb" -U crm_proof -h "$LOCAL_PROOF_ROOT" -p 55439 crm_readiness_test
export DATABASE_URL="postgresql://crm_proof@localhost:55439/crm_readiness_test?host=$LOCAL_PROOF_ROOT&port=55439"
export EMAIL_PROVIDER=mock
export DOTENV_CONFIG_PATH=/dev/null
export CRM_ISOLATED_PROOF=1
export NEXT_TELEMETRY_DISABLED=1
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
./node_modules/.bin/tsx --test tests/readiness.integration.test.ts
