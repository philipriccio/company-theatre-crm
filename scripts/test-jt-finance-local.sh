#!/bin/bash
set -euo pipefail
export LC_ALL=C LANG=C
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
JT_TEST_ROOT="$(mktemp -d /tmp/jt-finance.XXXXXX)"
cleanup(){ if [[ -n "${JT_WEB_PID:-}" ]]; then kill "$JT_WEB_PID" >/dev/null 2>&1 || true; fi; "$PG_BIN/pg_ctl" -D "$JT_TEST_ROOT/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$JT_TEST_ROOT"; }
trap cleanup EXIT
"$PG_BIN/initdb" -D "$JT_TEST_ROOT/db" -U theatre -A trust --no-locale -E UTF8 > "$JT_TEST_ROOT/init.log"
"$PG_BIN/pg_ctl" -D "$JT_TEST_ROOT/db" -l "$JT_TEST_ROOT/postgres.log" -o "-h '' -k $JT_TEST_ROOT -p 55451" start >/dev/null
"$PG_BIN/createdb" -U theatre -h "$JT_TEST_ROOT" -p 55451 jt_finance_test
export DATABASE_URL="postgresql://theatre@localhost:55451/jt_finance_test?host=$JT_TEST_ROOT&port=55451"
export DOTENV_CONFIG_PATH=/dev/null EMAIL_PROVIDER=disabled NEXT_TELEMETRY_DISABLED=1 JT_FINANCE_ISOLATED_PROOF=1 JT_FINANCE_USER_IDS=finance-proof,janice-proof CRM_AUTH_ORIGIN=http://127.0.0.1:3421
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -U theatre -h "$JT_TEST_ROOT" -p 55451 -d jt_finance_test <<'SQL'
CREATE ROLE jt_review_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO jt_review_app;
ALTER DEFAULT PRIVILEGES FOR ROLE theatre IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jt_review_app;
ALTER DEFAULT PRIVILEGES FOR ROLE theatre IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO jt_review_app;
SQL
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
"$PG_BIN/psql" -X -v ON_ERROR_STOP=1 -U theatre -h "$JT_TEST_ROOT" -p 55451 -d jt_finance_test <<'SQL'
REVOKE ALL ON "JtFinanceWorkspace","JtFinanceChange","JtFinanceRequest","JtFinanceReceipt" FROM jt_review_app;
GRANT SELECT,INSERT,UPDATE ON "JtFinanceWorkspace" TO jt_review_app;
GRANT SELECT,INSERT ON "JtFinanceChange","JtFinanceRequest","JtFinanceReceipt" TO jt_review_app;
SQL
export DATABASE_URL="postgresql://jt_review_app@localhost:55451/jt_finance_test?host=$JT_TEST_ROOT&port=55451"
./node_modules/.bin/next start --hostname 127.0.0.1 --port 3421 > "$JT_TEST_ROOT/web.log" 2>&1 & JT_WEB_PID=$!
for i in {1..60}; do if curl -fsS "$CRM_AUTH_ORIGIN/login" >/dev/null; then break; fi; sleep 1; done
./node_modules/.bin/tsx scripts/jt-finance-proof.ts
