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
