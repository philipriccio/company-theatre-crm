# Email delivery rollout preparation — 10 October 2026

## State and scope

Local preparation from `2b6f103` only. No push, deploy, AWS operation, secret retrieval, production write, email or new dependency installation. Existing dependencies copied locally. The SES recipient guard, signed tokens, durable queue and SNS validation already exist in this source; they are not new work in this patch. Older sections of PROJECT.md/TESTING.md describe historical deployment state and must not be used as current rollout evidence.

## Diagnosed wiring repairs

- `docker-compose.yml`: forwards mandatory `EMAIL_SES_RECIPIENT_ALLOWLIST` to the worker, empty by default. Previously even a configured host allowlist never reached that service. Explicitly fixes the web provider to `disabled`, independent of the worker's provider setting. This keeps the direct test endpoint from bypassing durable queue correlation.
- `scripts/test-disabled-worker.mjs`: executes the actual worker CLI with an isolated environment, disabled provider, unreachable local database, no dotenv and no AWS credentials. A 15-second timeout bounds the proof. Success demonstrates disabled startup does not reach queue/database operations; it is not an SES or container proof.

## Concrete deployment specification — NOT executed

Use a separate Coolify worker service at the same reviewed release as the web app, Dockerfile target `worker`, default command `./node_modules/.bin/tsx scripts/email-worker.ts`, one replica, no public domain/ports. Do not deploy the repository's entire Compose stack: it also defines a separate database and a default cron service. No schema change is part of this patch; compare live migration state instead of blindly applying old migration instructions.

| Service | Protected runtime configuration | Initial value/policy |
| --- | --- | --- |
| Web | `EMAIL_PROVIDER` | `disabled`, including during future seed tests |
| Web | `EMAIL_TOKEN_SECRET` | Protected shared signing secret; same as worker, never copied into reports |
| Web | `NEXT_PUBLIC_APP_URL` | `https://crm.companytheatre.ca` |
| Web | `AWS_SNS_TOPIC_ARN` | Exact approved topic, after AWS verification |
| Web | AWS send credentials | Absent; web cannot send |
| Worker | `DATABASE_URL` | Existing protected CRM database reference; not a new database |
| Worker | `EMAIL_PROVIDER` | `disabled`; separate later approval for seed activation |
| Worker | `EMAIL_TOKEN_SECRET`, `NEXT_PUBLIC_APP_URL` | Same protected signing secret/canonical URL as web |
| Worker | `AWS_SES_REGION` | `ca-central-1` after account verification |
| Worker | `AWS_SES_CONFIGURATION_SET` | Verified configuration set; proposed `company-theatre-campaigns` |
| Worker | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Worker-only least-privilege identity through protected host controls; not required for disabled smoke |
| Worker | `EMAIL_SES_RECIPIENT_ALLOWLIST` | Empty until exact seed recipients approved; no wildcard/bulk bypass |
| Worker | `EMAIL_WORKER_BATCH_SIZE` | `1` for first approved seed round |
| Worker | `EMAIL_WORKER_LEASE_SECONDS`, `EMAIL_WORKER_IDLE_MS` | `300`, `5000` |

The worker performs database recovery/claiming whenever its provider is not disabled, even if the SES allowlist is empty. Empty allowlist prevents provider calls but can still turn claimed recipients into FAILED records. Therefore never use an empty allowlist as a substitute for `EMAIL_PROVIDER=disabled` during staging. Never use `mock` in production: it changes durable recipient state.

## Executable no-send smoke plan

Local, already-installed dependencies:

```sh
node scripts/test-disabled-worker.mjs
./scripts/test-readiness-local.sh
```

Container proof on an approved Docker-capable build host (not run here):

```sh
docker build --target worker -t tct-crm-worker:readiness .
docker run --rm --network none --entrypoint ./node_modules/.bin/tsx \
  -e EMAIL_PROVIDER=disabled -e DOTENV_CONFIG_PATH=/dev/null \
  -e DATABASE_URL=postgresql://localhost:1/disabled_worker_no_database \
  tct-crm-worker:readiness scripts/email-worker.ts --once
```

No secrets are passed in these commands. Network-disabled smoke must exit 0. Build includes runtime dependency audit and needs network; absence of Docker locally leaves image/build proof open. For the eventual disabled production deployment: fresh backup, record exact image ref, verify provider disabled and credential absence by boolean-only inspection, capture repeatable-read campaign/recipient/attempt/event digests before and after starting one disabled replica, and verify unchanged digests. A running process alone does not prove delivery or database reachability. Do not invoke send/test/enqueue/cron APIs as smoke tests.

## Public routing proposal — separate rollout scope

Reuse `reports/delivery-readiness-2026-10-10/proposed-public-email-router.json` and its 75-case routing harness. It permits only subscriber unsubscribe GET/HEAD, API unsubscribe GET/HEAD/POST, tracking GET/HEAD, static assets, and SES webhook POST; authenticated catch-all remains for admin/send/test/intake. Before installation, verify the current Traefik service name/host, inspect backup/rollback, rerun actual Docker-based routing proof, configure shared token secret/SNS topic, and prove malformed signatures fail and admin/lookalike paths stay locked. No router was installed in this task. Existing screenshots only prove invalid unsubscribe visual state, not successful real unsubscribe.

## Seed activation gates and rollback

1. Independently establish AWS account/region, identity/DKIM, MAIL FROM/alignment, production-access or exact sandbox-recipient eligibility, quota, verified configuration set and SNS subscription. Pending requests are not approval.
2. Approve sender/reply-to/footer/legal basis, exact creative/version/links, exact Philip/Janice recipients, count and test round. Recipient allowlist is not send approval. No real recipients are embedded in this patch.
3. Confirm no unexpected claimable jobs; legacy UNKNOWN recipients must remain quarantined. Freeze only the explicitly approved seed campaign/audience. The worker has no campaign-ID restriction: the exact-recipient allowlist does not stop other approved queued campaigns to the same people. Inspect every claimable row before enabling.
4. Only then enable SES on the worker, never the web. Use the queued path; the direct test endpoint does not create equivalent attempt/event correlation. Prove actual inbox arrival, auth headers, queue/provider IDs, signed delivery events and separately approved unsubscribe actions.
5. To stop: disable/stop worker first, preserve queues/attempts/events, reconcile in-flight/UNKNOWN outcomes, do not replay or delete records. Restore previous app image/config if necessary; do not restore an old database over new signups as routine rollback. Keep the web disabled. Remove only the newly installed routing file if routing must roll back; keep authenticated catch-all.

No bulk launch is included. Historical mailing flags and enqueue `solicitable_snapshot` records are not affirmative consent proof; audience review remains necessary.

## Historical negative-tag hold — independently requested during review

Parent's live read-only evidence identified 304 flag-eligible contacts carrying exact historical negative tags (284 unsubscribe, 20 hard bounce, disjoint). These counts are parent-supplied, not re-queried by this worker. Parent authorized a focused local hold in both shared campaign selection and final worker recheck for these exact labels only:

- `Article Alerts List - Unsubscribed`
- `Nappoholics Anonymous List - Unsubscribed`
- `Things...MainList - Unsubscribed`
- `Donor_List_2020_NA - Unsubscribed`
- `HARD BOUNCE`

`src/lib/email/legacy-exclusions.ts` defines the list; `src/lib/email/audience.ts` excludes those contacts from all/tag-selected eligible audiences while retaining honest matched/excluded counts. `src/lib/email/queue.ts` rechecks the current contact's tags and holds an already-enqueued recipient as SUPPRESSED with `legacy_negative_tag_review`, without provider call, delivery attempt, global suppression creation, consent evidence creation or Contact permission changes. This is a conservative campaign hold pending evidence review, not adjudication of consent. Removing/renaming an exact tag removes this particular hold; existing other permission controls remain. No automatic review/removal workflow is added.

`tests/readiness.integration.test.ts` proves every exact label, selection counts, all/tag paths, late tag arrival, unchanged contact permissions/global suppressions/evidence, zero provider calls/attempts, and that a similarly named unrelated tag is not accidentally matched. Shared selection affects campaign audience preview and enqueue; worker recheck affects final delivery only. The audience browser's separate operational permission classification is not rewritten in this increment, so it does not yet visually explain this additional campaign exclusion.

Parent additionally reports two invalid mailbox strings and one `txt.bell.ca` SMS destination requiring preflight exclusion. Those are remaining audience-preflight gates, not added policy in this exact-label patch. `Review Opt-In` is not proof of consent and is not automatically promoted or cleared here.

## Local verification

- Actual disabled worker CLI against unreachable database: PASS (`disabled-worker.log`).
- Fresh Unix-socket-only PostgreSQL integration harness: 24 tests passed, zero skipped/failed; includes actual mock CLI, queue controls/events/suppression, and the new legacy-tag hold (`readiness.log`). Temporary cluster destroyed by harness.
- Independent TypeScript: PASS (`typecheck.log`).
- Scoped ESLint including new smoke script and changed tests: PASS (`lint.log`).
- Offline unit suite: 26 passed, 3 DB-gated skips (`unit.log`); readiness DB suite run separately via the isolated harness. Website/audience DB suites were not rerun for this email-only change.
- Dependency graph rebuilt; generated `knowledge-graph.json` deliberately excluded from commit.
- Docker CLI is absent. Container build, runtime audit refresh, Compose parser and actual Traefik rerun are NOT verified in this task. No claim of production/AWS/inbox proof.
