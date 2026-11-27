# Testing

## 2026-10-07 local readiness proof (safe entry point)

Use `./scripts/test-readiness-local.sh` for DB-backed regression proof. It creates a fresh temporary PostgreSQL 16 cluster, sets an explicit test-only role and Unix socket (no TCP listener), applies all migrations, checks for schema drift, runs intake/queue/suppression/retry/event tests plus the actual mock worker CLI, then stops/removes the cluster. It sets `DOTENV_CONFIG_PATH=/dev/null` and its own `DATABASE_URL`; it never uses the project `.env` database. The server deliberately uses `America/Toronto` to verify UTC queue comparisons. Override `PG_BIN` only to point to installed PostgreSQL 16 binaries.

`npm test` runs offline unit checks and **skips** database integration by default. Do not manually enable `CRM_ISOLATED_PROOF`; use the harness. Do not run a mock worker against an existing database: mock delivery still mutates durable campaign state.

For other local checks, use an inert database override and disable dotenv:

```bash
export DOTENV_CONFIG_PATH=/dev/null
export DATABASE_URL=postgresql://localhost:1/crm_build_no_database
export EMAIL_PROVIDER=disabled
export NEXT_TELEMETRY_DISABLED=1
npm test
npx prisma validate
npx tsc --noEmit
npm run lint
npm run build
npm run email-worker -- --once
```

The disabled worker returns before claiming/recovering/updating anything. The 2026-10-07 font follow-up removed the unused `next/font/google` Inter download from `src/app/layout.tsx`. Real build, independent TypeScript check and lint now pass (8 existing lint warnings); see `reports/font-fix-*-2026-10-07.log`. The existing system-font stack is unchanged. `next.config.ts` also has `ignoreBuildErrors:true`, so independent typechecking remains mandatory.

Results, evidence files, exact changed paths and launch gates: [JT readiness report](reports/JT-CAMPAIGN-READINESS-2026-10-07.md). Future website contract: [scratch intake](SCRATCH-INTAKE-CONTRACT.md). No live email delivery has been verified.


## Local email infrastructure checks

No external email is sent by default. `.env.example` sets `EMAIL_PROVIDER=disabled`; use `EMAIL_PROVIDER=mock` only for local worker acceptance tests.

Commands:

```bash
npm test
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run lint
npm run build
```

Worker dry run:

```bash
EMAIL_PROVIDER=mock npm run email-worker -- --once
```

The worker claims due queued recipients, re-checks contact suppression immediately before send, records attempts, and marks expired in-flight leases as `UNKNOWN` so they are not blindly retried.

## Production safety

- Local SES seed guard: `EMAIL_SES_RECIPIENT_ALLOWLIST` must contain comma-separated exact bare addresses for Philip/Janice test inboxes. Empty/malformed configuration or a nonmember recipient refuses before any SDK send; no wildcard/domain matching or bulk bypass exists. Case/outer spaces normalize, but header syntax, display names and recipient lists are rejected. This is a recipient restriction, **not approval**: every email still needs Philip's explicit approval, with repeated approved Philip/Janice rounds before any separately approved bulk send. Disabled/mock providers are unchanged. Offline fake-SDK proof is in `tests/ses-recipient-guard.test.ts`; it proves local guard behavior, not live delivery or production configuration.
- Do not run the worker against production until AWS SES credentials, DKIM/SPF/DMARC, SNS verification, bounce/complaint handling, and a seed inbox test are complete.
- Do not set `EMAIL_PROVIDER=ses` until the AWS handoff checklist is complete. The SES adapter is implemented, but remains inert while `EMAIL_PROVIDER=disabled`.
- Legacy SendGrid webhooks are disabled unless `ENABLE_LEGACY_SENDGRID_WEBHOOK=true` and `SENDGRID_WEBHOOK_SIGNATURE` are set.
- The production dependency audit has no known critical advisory after the Next.js security update.
- The root development install still reports Prisma CLI's transitive `deepmerge-ts` advisory. The worker target creates a production-only dependency set with dev/peer tooling omitted, fails its Docker build on any high-severity runtime advisory, and receives only the generated Prisma runtime from the builder. The resulting worker dependency set has no high or critical findings.
- A low-severity `esbuild` advisory remains through `tsx`; it concerns the Windows development server. The worker runs on Linux and never starts that development server.

## Coolify worker service

The Dockerfile includes a dedicated `worker` target. Locally, the Compose
service is disabled by default and must be enabled explicitly:

```bash
docker compose --profile email-worker build email-worker
docker compose --profile email-worker up -d email-worker
```

In Coolify, create a separate service from the same repository using Docker
target `worker`; its default command is already the durable email worker.

Use the same `DATABASE_URL`, `NEXT_PUBLIC_APP_URL`, and `EMAIL_TOKEN_SECRET` as the web service. Before AWS is ready, keep `EMAIL_PROVIDER=disabled` in production. For local-only smoke tests, use `EMAIL_PROVIDER=mock` and `npm run email-worker -- --once`.

The web service and worker are intentionally separate. Web requests enqueue durable recipient rows; only the worker claims recipient jobs and calls the configured provider.

## Migration rehearsal

On 2026-09-17 the new migration was applied to an isolated local PostgreSQL 16 database created from the two committed predecessor migrations. The fixture included accepted, delivered, and unresolved legacy recipients. Verification proved:

- sent legacy rows became `ACCEPTED`;
- delivered legacy rows became `DELIVERED`;
- unresolved legacy rows became `UNKNOWN` with `legacy_unresolved`;
- the recipient email snapshot was populated and made non-null;
- Prisma schema diff returned clean after migration.

This proves migration shape and legacy quarantine locally. Production still requires a fresh backup and exports before `prisma migrate deploy`.

## AWS SES/DNS handoff checklist

See `SES-HANDOFF.md` for the exact AWS, DNS, least-privilege, production-access, and cutover steps.

Blocked until AWS access and DNS change approval exist:

1. Verify SES identity for the sending domain/address.
2. Publish DKIM records.
3. Confirm SPF includes SES without breaking existing mail.
4. Confirm DMARC policy/alignment.
5. Move SES account out of sandbox or verify every seed recipient for sandbox testing.
6. Set the exact `AWS_SNS_TOPIC_ARN` and complete the SNS subscription confirmation in AWS.
7. Send seed tests to Gmail, Outlook/Hotmail, Yahoo, Apple Mail, and Company addresses.
8. Enable the production worker with a low batch size and monitor attempts/events/suppressions.

## Rollback/migration notes

- Before applying the migration in production, take a Postgres backup.
- If the worker misbehaves before provider acceptance, stop the worker service. Queued rows remain durable and unsent.
- If a campaign must stop, pause first. Cancel changes queued rows only; an already claimed/in-flight row must be rechecked or reconciled, not falsely declared unsent; accepted/delivered/unknown rows are not resent automatically.
- Do not delete recipient rows to roll back a send. Preserve attempt/event evidence for auditability.
- Application rollback to pre-queue code would require restoring the pre-migration database backup because the migration adds enum values and required recipient snapshot fields.

## Product workflow proof — October 7
Local visual workflow evidence is in `reports/ux-review-2026-10-07/REVIEW.md`. Ordinary unit runner: 17 pass/1 isolated DB skip; fresh isolated harness: 21 pass. Browser proved draft save/edit/reopen, template reuse, sender-default persistence and save failures, accurate overlapping-tag counts, and responsive local layouts with delivery disabled. Browser previews are not inbox rendering proof. The new campaign design/reply-to migration has not been applied to production. Earlier multi-inbox seed suggestions do not override Philip’s explicit Philip/Janice-only testing rule.

## October 10: both audience websites
`CRM_BROWSER_PROOF=1 ./scripts/test-website-signup-local.sh` creates/destroys its own isolated DB and starts local production-build website servers. Requires sibling `ct-signup-release` and `jt-signup-release` worktrees built first, PostgreSQL 16, installed Chrome and existing agent-browser Playwright dependency. No production config/.env is used. The test-only preload rewrites only CRM intake fetches to loopback. See `reports/signup-2026-10-10/REVIEW.md` for proof, config names and rollout dependencies.

## Audience workspace local proof — October 10
`CRM_BROWSER_PROOF=1 ./scripts/test-audience-local.sh` creates and destroys an isolated Unix-socket-only PostgreSQL database and starts the existing production build on loopback port 3047. Requires locally installed Chrome and agent-browser's Playwright runtime. It validates shared filters/count/export, permission precedence, safe creation and dossier mutation behavior at 14k synthetic contacts, then exercises real browser journeys at 1440/390/320. Never uses project `.env`; no real email provider. See `reports/audience-workspace-2026-10-10/REVIEW.md`.

## Draft-save recovery — October 13
After a production build, `PROOF_FIXED=1 bash scripts/test-copy-save-local.sh` runs real Chromium/HTTP/isolated PostgreSQL checks for typing/save/reload, stale-version recovery, missing input events, network failures, and same-field conflict retention. It never uses project `.env` or production data and leaves email disabled. Optional `COPY_PROOF_FIXTURE` is a local HTML fixture; default synthetic. See `reports/save-fix-2026-10-13/REVIEW.md` for evidence limits.

## Email analytics — October 13 (local candidate)
`bash scripts/test-analytics-local.sh` creates a fresh Unix-socket-only PostgreSQL cluster, applies the additive analytics migration, checks schema drift, and runs synthetic capture/report/export/14k-pagination regressions. No project `.env` or real provider is used. With `CRM_ANALYTICS_PREVIEW=1`, it also seeds explicitly labelled synthetic examples and runs loopback :3194 until stopped. Build first; shared external node_modules symlinks require `npm run build -- --webpack` locally. See `reports/analytics-2026-10-13/REVIEW.md` for exact gates and limitations. Production migration/deployment/send approval are separate.

## Combined email analytics — October 14
`bash scripts/test-analytics-local.sh` now also runs `tests/combined-analytics.integration.test.ts` against the same disposable, Unix-socket-only database. It checks cross-batch aggregation, Toronto sent-date boundaries/DST, invalid/reversed ranges, unsent exclusions, current status versus historical delivery evidence, shared CSV/list/summary filters and automation parity. Preview mode defaults to `/campaigns/analytics` (all sent email records together). Run `node scripts/combined-analytics-browser-proof.mjs` after starting the labelled synthetic preview for responsive 1440/390/320 checks and real filter/export/drilldown interactions. See `reports/combined-analytics-2026-10-14/REVIEW.md`. No production or email operations.

## Personal account candidate — October 31 (local only)
See AUTHENTICATION.md for fail-closed configuration, rollout gates and account/machine-access compatibility. `scripts/test-auth-local.sh` owns a fresh local socket-only database, applies migrations and checks drift, then tests auth transactions. `CRM_AUTH_BROWSER_PROOF=1 scripts/test-auth-local.sh` additionally starts the already-built app at127.0.0.1:3257 and exercises real login/change/logout at1440/390/320; all fixtures/services are removed afterward. Never enable isolated-proof flags manually against another database. Full repository lint has pre-existing React-effect and CommonJS-test errors; new auth code is checked separately. Old private-route harnesses need genuine synthetic sessions, not bypass flags.

### Expanded October31 auth candidate
`test-auth-local.sh` now also runs operator/machine lifecycle tests. Browser mode checks the private masked operator UI plus actual machine HTTP contact-read/draft-only/denied-send/revocation behavior. Corpus source/license/hash are recorded under security/; offline tests validate a long entry from the imported denylist without printing passwords. `npm run auth:operator` is a trusted-host-only private UI, NOT an application route or public service. `npm run auth:housekeeping` is a bounded operational command preserving all audit history. No live schedule is created by these scripts.

### Limited-role activation rehearsal

`scripts/test-auth-local.sh` now initializes its isolated cluster as owner `theatre`, establishes the observed schema/default DML grants for non-superuser `crm_review_app`, applies all migrations and checks Prisma drift as owner, then runs **all runtime suites/browser proof under crm_review_app**. No app fixture needs owner bypass. The added grant suite confirms both auth migration records, all five auth tables owned by theatre with inherited DML grants, no schema CREATE, and rejected table creation/alteration. This is an isolated reconstruction of catalog evidence, not production migration proof.

`./node_modules/.bin/tsx --test tests/operator-relay.test.ts` exercises real local subprocess pipes/TCP, intact 512 KiB responses, target validation, 8-connection mechanism (test lowers cap to one), byte/idle/deadline/lifetime limits, spawn/upstream failure and cleanup. Operator integration also traverses that relay for actual metadata/Host/Origin/oversized-form checks. It substitutes a local Node process for `docker exec`, since Docker is unavailable; it does not prove real Docker/SSH namespace routing. No provider, secret store or live database is accessed.

### Protected Gateway adapter
`./node_modules/.bin/tsx --test tests/gateway-adapter.test.ts` checks request/context/response bounds, scope and destination controls, and actual system curl CONNECT to a local synthetic407 proxy. It uses no credentials, production connections or external network destinations. The pure machine-scope mapping is shared with server auth, with no database import required by this adapter. Successful protected proxy substitution remains production acceptance, not claimed by these tests.

## Security history local proof — 2026-11-01
`./scripts/test-auth-local.sh` now includes isolated security-history DB tests (including owner-only fault injection in the disposable cluster). `CRM_AUTH_BROWSER_PROOF=1 ./scripts/test-auth-local.sh` also runs existing account/operator regressions and the new security UI proof. Build first. Browser server defaults to loopback port 3263; `CRM_AUTH_BROWSER_PORT` can select another free port. The harness verifies its spawned process remains alive so a stale/unrelated preview cannot satisfy readiness. All database state is synthetic and removed on exit. Evidence/coverage boundaries: `../../audits/crm-security-history-20261101/COMPANY.md`.

### Combined release-candidate regression — November 1
The security-history suite now also confirms a trusted 120-character account display name can author a campaign review; browser/HTTP attribution still ignores supplied author. Fresh combined evidence lives in `../../audits/crm-release-readiness-20261101/`. Re-run typecheck independently after webpack since Next configuration skips build-time type failures.
## November 14: Scratch tag/exclusion proof
`bash scripts/test-readiness-local.sh` now checks participant tag idempotency/replay, consent preservation, exclusion counts/queue parity, late signup worker hold, deleted-tag fail-closed behavior, and draft save/copy preservation. All fixtures use the disposable Unix-socket-only database and mock provider; no external sends. Browser evidence uses the real SendFlow component with synthetic audience HTTP responses at 1440/390/320; it is not a live or inbox proof.

## Approval-based machine sending — November 17
`bash scripts/test-readiness-local.sh` additionally exercises machine-send scope denial,
explicit approval requirements, exact draft/audience fingerprint binding, excluded and
newly eligible contacts, concurrent duplicate release, authenticated machine attribution,
revocation and zero external sends. The synthetic send route queues only; no SES call.
`npm test` includes protected adapter handling and malformed/unapproved-send refusal.
Existing `scripts/test-auth-local.sh` verifies stored draft-only scopes still cannot send.

## Scratch player reporting — November 17
`bash scripts/test-scratch-players-local.sh` creates a disposable Unix-socket-only PostgreSQL
cluster with synthetic players, events and cards. It proves first-signup dates, stable source,
last gameplay (excluding login/prize viewing), separate started/completed counts, test exclusion,
source/status/date/search filters, pagination, normalized contact linking prerequisites and
SELECT-column-only role boundaries. Missing configuration, denied SELECT and accidental column
or table writer grants fail explicitly rather than appearing as zero players.

After `next build --webpack`, run `CRM_SCRATCH_BROWSER_PROOF=1 bash scripts/test-scratch-players-local.sh`
for authenticated HTTP/UI proof at 1440/390/320, forged/unauthenticated denial, source filtering,
empty/error states, existing-contact linkage and a database-update/Refresh freshness assertion.
`CRM_SCRATCH_KEEP_PREVIEW=1` retains the synthetic preview until the proof process receives SIGTERM;
its browser state file is local-only mode0600. No production credentials or external email used.

Runtime requires a separate `SCRATCH_REPORT_DATABASE_URL` with SELECT only on the documented
columns; never reuse the game's application role. `SCRATCH_REPORT_CAMPAIGN_ID` defaults to
`jt-scratch-20261106`. No CRM/game schema migration. Missing/invalid/non-public campaign or
unavailable database reports unavailable. The optional profile lookup is normalized email-only;
ambiguous legacy matches are deliberately not linked. This read-only view neither creates
contacts nor changes consent, tags, email queues, game state or prize fulfillment.

## JT To Do — isolated production-build proof

After `npm run build`, run `./scripts/test-jt-tasks-local.sh`. It creates a temporary Unix-socket-only PostgreSQL cluster, applies all migrations, checks schema drift, and uses a non-superuser runtime role. It never loads the project `.env`. It exercises shared persistence, atomic named history, create/update retries, concurrent versions, imports, narrow machine scopes, and synthetic authenticated browser workflows at 1440/390/320px. It stops the app and removes the synthetic cluster on exit. No provider calls or emails occur. Screenshots are written to workspace `audits/jt-todo-20261121/`.

JT endpoints are `/api/jt-tasks` (GET/POST) and `/api/jt-tasks/[id]` (GET/PATCH). Every mutation requires a unique `requestId` reused unchanged for an uncertain retry; PATCH also requires the current `version`. A 409 means reload/reconcile, not a forced overwrite. Import `sourceKey` is unique and optional; existing source tasks are never silently updated. `sourceLinks` is an array of HTTP(S) URLs. Owners are PHILIP/JANICE/MILDRED or null; statuses TODO/IN_PROGRESS/WAITING/DONE; dates are nullable YYYY-MM-DD strings. Source parent tasks must be created before children.

Rollback: return the web app to its prior image while retaining the additive task tables/history. Do not drop populated task tables to roll back the UI. Before launch, grant the runtime role SELECT/INSERT/UPDATE on JtTask and SELECT/INSERT on JtTaskChange/JtTaskRequest; no task deletion grant is needed. Machine capabilities `tasks:read`/`tasks:write` require explicit enrollment on the intended existing identity; code deployment alone grants no scopes. Existing human account authentication is unchanged.

## JT Finance — November 26

`./node_modules/.bin/tsx --test tests/jt-finance.test.ts` checks accounting invariants offline.
After a production build, `bash scripts/test-jt-finance-local.sh` creates a fresh socket-only PostgreSQL cluster, applies migrations, verifies drift, applies restricted finance grants, and exercises real authenticated HTTP/browser journeys at1440/390/320. No project `.env`, live data or email providers are used. Receipt proof uses a clearly synthetic minimal file. Screenshots and implementation notes: workspace `audits/jt-finance-20261126/`.

`JT_FINANCE_USER_IDS` must contain exact comma-separated approved human CrmUser UUIDs; unset denies everybody. Machines are not supported. Finance grants: SELECT/INSERT/UPDATE on JtFinanceWorkspace; SELECT/INSERT on JtFinanceChange, JtFinanceRequest and JtFinanceReceipt; no DELETE. Changes, requests and receipts also have append-only triggers.

One-time reviewed seed: `JT_FINANCE_IMPORT_CONFIRMED=1 ./node_modules/.bin/tsx scripts/jt-finance-import.ts /path/to/reviewed-initial-state.json` through the normal trusted-host database setup, never credentials in arguments. It refuses to overwrite any existing workspace. Parent/operator must verify backup/authorization before real import. Original budget is immutable through the API. Application rollback preserves all additive tables and evidence; do not drop them.

Cash opening is start-of-day; historical paid/received cash is excluded, overdue unpaid amounts carry forward. Forecast is recorded costs plus commitments plus explicitly entered extra remaining amounts; unknown estimates never become zero. Current version supports CAD gross positive costs/payments, not refunds, bonds, bank sync, recovered-tax accounting or multi-phase workshop budgets. External sends and real transfers are absent.
