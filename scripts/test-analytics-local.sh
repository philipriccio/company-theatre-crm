#!/bin/bash
set -euo pipefail
export LC_ALL=C LANG=C
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
ANALYTICS_ROOT="$(mktemp -d /tmp/company-crm-analytics.XXXXXX)"
cleanup() {
  if [ -n "${ANALYTICS_SERVER_PID:-}" ]; then kill "$ANALYTICS_SERVER_PID" 2>/dev/null || true; fi
  "$PG_BIN/pg_ctl" -D "$ANALYTICS_ROOT/db" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$ANALYTICS_ROOT"
}
trap cleanup EXIT
"$PG_BIN/initdb" -D "$ANALYTICS_ROOT/db" -U crm_proof -A trust --no-locale -E UTF8 > "$ANALYTICS_ROOT/init.log"
"$PG_BIN/pg_ctl" -D "$ANALYTICS_ROOT/db" -l "$ANALYTICS_ROOT/postgres.log" -o "-h '' -k $ANALYTICS_ROOT -p 55441 -c timezone=America/Toronto" start >/dev/null
"$PG_BIN/createdb" -U crm_proof -h "$ANALYTICS_ROOT" -p 55441 crm_analytics_test
export DATABASE_URL="postgresql://crm_proof@localhost:55441/crm_analytics_test?host=$ANALYTICS_ROOT&port=55441"
export EMAIL_PROVIDER=disabled DOTENV_CONFIG_PATH=/dev/null CRM_ANALYTICS_PROOF=1 NEXT_TELEMETRY_DISABLED=1
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
./node_modules/.bin/tsx --test tests/analytics.integration.test.ts
if [ "${CRM_ANALYTICS_PREVIEW:-0}" = 1 ]; then
  ./node_modules/.bin/tsx scripts/seed-analytics-preview.ts
  ./node_modules/.bin/next start --hostname 127.0.0.1 --port 3194 > "$ANALYTICS_ROOT/server.log" 2>&1 &
  ANALYTICS_SERVER_PID=$!
  echo "Synthetic preview starting at http://127.0.0.1:3194/campaigns/analytics-showcase/analytics"
  wait "$ANALYTICS_SERVER_PID"
fi
