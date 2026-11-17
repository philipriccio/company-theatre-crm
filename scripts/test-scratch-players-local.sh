#!/bin/bash
set -euo pipefail
export LC_ALL=C LANG=C
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
SCRATCH_PROOF_ROOT="$(mktemp -d /tmp/company-crm-scratch.XXXXXX)"
cleanup() { "$PG_BIN/pg_ctl" -D "$SCRATCH_PROOF_ROOT/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$SCRATCH_PROOF_ROOT"; }
trap cleanup EXIT
"$PG_BIN/initdb" -D "$SCRATCH_PROOF_ROOT/db" -U scratch_owner -A trust --no-locale -E UTF8 > "$SCRATCH_PROOF_ROOT/init.log"
"$PG_BIN/pg_ctl" -D "$SCRATCH_PROOF_ROOT/db" -l "$SCRATCH_PROOF_ROOT/postgres.log" -o "-h '' -k $SCRATCH_PROOF_ROOT -p 55447" start >/dev/null
"$PG_BIN/createdb" -U scratch_owner -h "$SCRATCH_PROOF_ROOT" -p 55447 crm_scratch_test
export DATABASE_URL="postgresql://scratch_owner@localhost:55447/crm_scratch_test?host=$SCRATCH_PROOF_ROOT&port=55447"
export DOTENV_CONFIG_PATH=/dev/null EMAIL_PROVIDER=disabled CRM_SCRATCH_ISOLATED_PROOF=1 NEXT_TELEMETRY_DISABLED=1
unset SCRATCH_REPORT_DATABASE_URL
if [[ "${CRM_SCRATCH_BROWSER_PROOF:-0}" = 1 ]]; then ./node_modules/.bin/prisma migrate deploy; fi
./node_modules/.bin/tsx --test tests/scratch-players.integration.test.ts
if [[ "${CRM_SCRATCH_BROWSER_PROOF:-0}" = 1 ]]; then
  export SCRATCH_REPORT_DATABASE_URL="postgresql://scratch_reader@localhost:55447/crm_scratch_test?host=$SCRATCH_PROOF_ROOT&port=55447"
  export CRM_AUTH_ORIGIN=http://127.0.0.1:3397
  ./node_modules/.bin/tsx scripts/scratch-players-browser-proof.ts
fi
