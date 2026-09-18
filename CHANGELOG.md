# Changelog

## 2026-09-17

- Replaced request-scoped campaign execution with a durable Postgres-backed queue model.
- Added provider-neutral email provider interfaces plus disabled/mock providers and an SES v2 adapter that remains inert until explicitly enabled after AWS setup.
- Added a standalone `scripts/email-worker.ts` process for separate Coolify worker deployment.
- Added signed unsubscribe and click tracking tokens, durable suppressions, consent evidence, provider events, and attempt records.
- Disabled active legacy SendGrid webhook handling by default and added SES/SNS ingestion with exact-topic enforcement, AWS certificate URL validation, cryptographic signature verification, idempotent event storage, and bounce/complaint suppression updates.
- Updated campaign enqueue/status/control surfaces for queued, accepted, delivered, failed, suppressed, and unknown states.
- Quarantined unresolved legacy recipients as `UNKNOWN` and required a new campaign approval timestamp for worker claims, preventing old stuck campaigns from resuming automatically.
- Updated Next.js to the patched 16.3.5 release and cleared the previously reported critical runtime advisory.
- Rehearsed the durable-queue migration on isolated PostgreSQL 16 from the committed predecessor migrations, including legacy accepted/delivered/unresolved fixtures; post-migration Prisma schema diff was clean.
- Split worker runtime dependencies from build tooling. The worker image now excludes Prisma CLI/dev peers and fails its build if production dependencies contain a high-severity advisory.

Blocked AWS/DNS work remains: SES identity verification and production access, DKIM/SPF/DMARC records, configuration-set/SNS provisioning and subscription confirmation, protected credentials, seed inbox proof, and production worker enablement.
