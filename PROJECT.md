# Company Theatre CRM — Project Overview

*Last updated: 2026-09-17 by Mildred*

## Vision

Company Theatre-owned contact and email campaign system. The CRM owns audience data, consent/suppression state, campaign approval, durable delivery state, and reporting; a low-level provider performs final delivery.

## Production

- URL: `https://crm.companytheatre.ca`
- Hosting: Coolify on DigitalOcean
- Database: PostgreSQL; credentials belong only in the protected production secret store
- Repository: `philipriccio/company-theatre-crm`
- Current live sender: legacy SendGrid path; not approved for full-list use
- Local durable-queue/SES work described below is **not deployed**

## Audience state verified 2026-09-06

- 14,148 contacts
- 11,763 subscribed/solicitable
- 2,385 suppressed/no-solicitation
- Preserve fresh solicitable and suppressed exports before migration or sender cutover.

## Known legacy campaign inconsistencies

- `cmn9j5me30000o30j2rtrzwoo`, “Jackpot Twins Announcement — March 31, 2026,” remained `SENDING`: 91 recipient rows, 89 marked sent, no completion timestamp.
- `cmlst2oq20002mr0ku4ekastt`, “Test Email - Janice Introduction,” was marked `SENT` while carrying 11,755 recipient rows without `sentAt`.
- The migration quarantines unresolved legacy recipients as `UNKNOWN`; worker claims also require a new approval timestamp. Old campaigns cannot resume automatically.

## Local durable email infrastructure — not deployed

- Immediate and scheduled campaigns freeze an approved audience snapshot and enqueue recipient jobs instead of sending from the web request.
- Postgres-backed worker claims use leases, re-check suppression immediately before delivery, retry known transient failures only, and quarantine uncertain outcomes rather than blindly resend.
- Provider-neutral adapters include disabled, mock, and Amazon SES v2 implementations. Production remains inert while `EMAIL_PROVIDER=disabled`.
- Delivery attempts, provider message IDs, normalized events, global suppressions, consent snapshots, and recipient-level error state are durable.
- Signed unsubscribe and click tokens replace forgeable base64 email tokens; RFC 8058 one-click unsubscribe headers use the POST endpoint.
- Campaign controls support pause, resume, cancel, retry of known transient failures, and status counts distinguishing queued/accepted/delivered/failed/suppressed/unknown.
- SES/SNS ingestion enforces the exact topic ARN, validates AWS certificate URLs, verifies cryptographic signatures, stores events idempotently, and applies delivery/bounce/complaint/reject outcomes.
- Legacy SendGrid campaign execution was removed; its webhook is disabled by default.

## Verification

- Unit tests: signed unsubscribe/click tokens, unsafe redirects, retry rules, SNS certificate URL restrictions, SNS canonicalization
- Prisma schema validation: pass
- TypeScript: pass
- ESLint: pass with pre-existing warnings only
- Production build: pass on Next.js 16.3.5
- `git diff --check`: pass
- Durable-queue migration rehearsal: pass on an isolated local PostgreSQL 16 database built from the two prior migrations. Legacy sent/delivered/unresolved rows became `ACCEPTED`/`DELIVERED`/`UNKNOWN` as intended, and Prisma reported no schema drift afterward.
- Worker dependency rehearsal: high-severity runtime audit gate passes after omitting dev/peer tooling; Prisma CLI and its `deepmerge-ts` advisory chain are excluded from the worker image. The remaining low `esbuild` advisory is Windows development-server-only and is not reachable in the Linux worker process.
- The migration was not applied to production, and no production data was accessed or changed.

## Critical constraints

1. No campaign sends without Philip's explicit approval.
2. Do not modify production contact data without approval.
3. CASL: provable consent basis, sender identification, valid mailing address, visible unsubscribe, one-click unsubscribe, and suppression within legal timelines.
4. Preserve audit evidence. Never delete recipient/attempt/event rows to hide or “reset” a delivery state.
5. Unknown provider outcomes are reconciled from signed events; they are not automatically resent.
6. Keep Google Workspace mail records intact during SES DNS changes.
7. Never store or transmit credentials in Git, project documentation, chat, commands, or logs. Use protected secret entry.

## Remaining AWS/DNS gates

See `SES-HANDOFF.md`. The next user action is to create/select a Company Theatre-owned AWS account and make SES available in `ca-central-1`. After that:

- SES domain identity, Easy DKIM, custom MAIL FROM, and production access
- Configuration set and SNS topic/subscription
- DNS publication and alignment proof
- Dedicated least-privilege worker identity and protected environment settings
- Fresh backup/exports, production migration execution, seed inbox/event/suppression/crash proofs
- Explicit approval before any production deployment or campaign send

## Security note

A plaintext database credential was removed from this project document on 2026-09-17. Because repository history may retain it, rotate that credential before the next production deployment and scrub history only under a separately approved plan.

## History

- 2026-02-17: CRM/contact import foundation created.
- 2026-03-30: Campaign workflow, personalization, tag management, and legacy background sender work.
- 2026-09-06: Production audit documented list state, campaign inconsistencies, and provider migration strategy.
- 2026-09-17: Local provider-neutral durable queue, worker, compliance hardening, SES adapter, signed SNS ingestion, operational controls, tests, and handoff documentation implemented. No deploy, push, DNS change, email send, or production data mutation.
