# Testing

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
- If a campaign must stop, pause first. Cancel only affects queued/in-flight rows; accepted/delivered/unknown rows are not resent automatically.
- Do not delete recipient rows to roll back a send. Preserve attempt/event evidence for auditability.
- Application rollback to pre-queue code would require restoring the pre-migration database backup because the migration adds enum values and required recipient snapshot fields.
