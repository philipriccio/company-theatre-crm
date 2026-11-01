#!/bin/bash
set -euo pipefail
export LC_ALL=C LANG=C
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
LOCAL_PROOF_ROOT="$(mktemp -d /tmp/company-crm-auth.XXXXXX)"
cleanup() {
  if [[ -n "${LOCAL_WEB_PID:-}" ]]; then kill "$LOCAL_WEB_PID" >/dev/null 2>&1 || true; fi
  "$PG_BIN/pg_ctl" -D "$LOCAL_PROOF_ROOT/db" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$LOCAL_PROOF_ROOT"
}
trap cleanup EXIT
"$PG_BIN/initdb" -D "$LOCAL_PROOF_ROOT/db" -U theatre -A trust --no-locale -E UTF8 > "$LOCAL_PROOF_ROOT/init.log"
"$PG_BIN/pg_ctl" -D "$LOCAL_PROOF_ROOT/db" -l "$LOCAL_PROOF_ROOT/postgres.log" -o "-h '' -k $LOCAL_PROOF_ROOT -p 55441" start >/dev/null
"$PG_BIN/createdb" -U theatre -h "$LOCAL_PROOF_ROOT" -p 55441 crm_auth_test
export DATABASE_URL="postgresql://theatre@localhost:55441/crm_auth_test?host=$LOCAL_PROOF_ROOT&port=55441"
export DOTENV_CONFIG_PATH=/dev/null EMAIL_PROVIDER=disabled NEXT_TELEMETRY_DISABLED=1 CRM_AUTH_ISOLATED_PROOF=1 CRM_AUTH_ORIGIN=http://127.0.0.1:3257
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -U theatre -h "$LOCAL_PROOF_ROOT" -p 55441 -d crm_auth_test <<'SQL'
CREATE ROLE crm_review_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO crm_review_app;
ALTER DEFAULT PRIVILEGES FOR ROLE theatre IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_review_app;
ALTER DEFAULT PRIVILEGES FOR ROLE theatre IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO crm_review_app;
SQL
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
# DDL/migration history belongs to the owner; all runtime tests below use only DML grants.
export DATABASE_URL="postgresql://crm_review_app@localhost:55441/crm_auth_test?host=$LOCAL_PROOF_ROOT&port=55441"
./node_modules/.bin/tsx --test tests/auth-grants.integration.test.ts tests/auth.integration.test.ts tests/operator.integration.test.ts tests/security-history.integration.test.ts
if [[ "${CRM_AUTH_BROWSER_PROOF:-0}" = 1 ]]; then
  CRM_AUTH_BROWSER_PORT="${CRM_AUTH_BROWSER_PORT:-3263}"
  [[ "$CRM_AUTH_BROWSER_PORT" =~ ^[0-9]+$ ]] || exit 1
  export CRM_AUTH_ORIGIN="http://127.0.0.1:$CRM_AUTH_BROWSER_PORT"
  ./node_modules/.bin/next start --hostname 127.0.0.1 --port "$CRM_AUTH_BROWSER_PORT" > "$LOCAL_PROOF_ROOT/web.log" 2>&1 & LOCAL_WEB_PID=$!
  sleep 1
  kill -0 "$LOCAL_WEB_PID" || { echo 'Synthetic browser server failed to start; possible port collision.'; exit 1; }
  for i in {1..60}; do
    kill -0 "$LOCAL_WEB_PID" || exit 1
    if curl -fsS "$CRM_AUTH_ORIGIN/login" >/dev/null; then break; fi
    sleep 1
  done
  ./node_modules/.bin/tsx scripts/auth-browser-proof.ts
  ./node_modules/.bin/tsx scripts/security-history-browser-proof.ts
fi
