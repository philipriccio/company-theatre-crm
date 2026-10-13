#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN=/opt/homebrew/opt/postgresql@16/bin
LOCAL_PROOF_ROOT=$(mktemp -d /tmp/crm-save-proof.XXXXXX)
trap '"$PG_BIN/pg_ctl" -D "$LOCAL_PROOF_ROOT/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$LOCAL_PROOF_ROOT"' EXIT
"$PG_BIN/initdb" -D "$LOCAL_PROOF_ROOT/db" -U crm_proof -A trust --no-locale -E UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$LOCAL_PROOF_ROOT/db" -l "$LOCAL_PROOF_ROOT/postgres.log" -o "-h '' -k $LOCAL_PROOF_ROOT -p 55441" start >/dev/null
"$PG_BIN/createdb" -U crm_proof -h "$LOCAL_PROOF_ROOT" -p 55441 crm_readiness_test
export DATABASE_URL="postgresql://crm_proof@localhost:55441/crm_readiness_test?host=$LOCAL_PROOF_ROOT&port=55441"
export EMAIL_PROVIDER=disabled DOTENV_CONFIG_PATH=/dev/null NEXT_TELEMETRY_DISABLED=1 CRM_ISOLATED_PROOF=1
./node_modules/.bin/prisma migrate deploy >/dev/null
./node_modules/.bin/tsx tests/save-browser-proof.ts
