# Company Theatre CRM — Project Overview

*Last updated: 2026-10-07 (local readiness preparation only)*

## Local readiness update — 2026-10-07

Authenticated/idempotent future scratch intake, separate consent evidence, nonmarketable contact defaults, suppression-preserving import/webhook changes, and queue/provider hardening are implemented locally. No deployment, push, external email, production database operation, DNS/config mutation or spend occurred. The existing production/audience descriptions below are historical, not reverified today.

See [JT readiness report](reports/JT-CAMPAIGN-READINESS-2026-10-07.md), [safe isolated test instructions](TESTING.md), and [website intake contract](SCRATCH-INTAKE-CONTRACT.md). Scratch intake stays disabled without protected authentication and an approved promotion allowlist; no website integration exists.

Production readiness is **not established**: build/typecheck/lint now pass after removal of an unused Google Fonts download; authenticated admin access and public-route exceptions still need verification, sender mailing address and new single-ticket copy/CTA need approval, and all AWS/DNS/deployment/seed gates remain outstanding. The local older JT announcement still says single tickets are not yet on sale; it is not the single-ticket launch creative.

## Vision

Company Theatre-owned contact and email campaign system. The CRM owns audience data, consent/suppression state, campaign approval, durable delivery state, and reporting; a low-level provider performs final delivery.

## Authentication follow-up — 2026-10-07

Philip confirms login works. Live Traefik protects all paths, including recipient unsubscribe and SES webhook paths. The live legacy unsubscribe decoder is unsigned, so public exceptions must wait for the reviewed signed-token release. Inactive routing proposal and remaining acceptance checks: `reports/auth-routing-2026-10-07/REVIEW.md`. No live changes.

## Seed-recipient guard — 2026-10-07

Local SES adapter now requires an exact recipient allowlist and refuses missing/malformed/nonmember addresses before provider calls. No bulk bypass; allowlisting does not grant send approval. Unit tests/typecheck/scoped lint and real build pass; not deployed. Proposed four-round test plan: `reports/PHILIP-JANICE-TEST-PLAN-2026-10-07.md`.

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

1. No emails (including tests) without Philip's explicit approval. Before any bulk email, run repeated approved test rounds exclusively to Philip and Janice; obtain separate bulk-send approval only after their review.
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

## Email product increment — October 7, local review
Philip authorized continued Mailchimp-style product work and current competitor research. Local campaign workflow now connects visual design, draft save/reopen, reusable templates, preview, accurate eligible audience counts and timezone-visible review. Sender defaults persist without storing credentials. Proposed default footer follows requested two-sites/hello/no-address direction but remains unapproved for sending. Independent browser QA plus 17 unit and 21 isolated-DB tests passed; build, independent typecheck and lint passed (six existing warnings). Additive campaign design/reply-to migration is local only. Details, scope limits and evidence: `reports/ux-review-2026-10-07/REVIEW.md`; research: `reports/EMAIL-UX-RESEARCH-2026-10-07.md`. No production or email actions. First design review is next; not full Mailchimp parity or launch clearance.


## Workflow clarification — 2026-10-07 15:26 America/Cayman
Philip wants Mildred to create beautiful Company Theatre emails in the CRM; his primary role is opening drafts, reviewing them and giving notes, not building templates himself. This supersedes self-service template creation as the main UX priority.

Target: Mildred creates a polished saved draft → Philip reviews desktop/mobile presentation and gives notes → Mildred revises → Philip approves the design → preserve that exact approved version as a reusable template/reference → create future drafts from a copy, preserving the approved original.

Prioritize a clear review view, straightforward feedback/revision handoff and visibly distinct draft/awaiting-review/approved-design states. In-CRM comments and approval/version preservation are acceptance requirements, not claimed implemented. Feedback can continue through Telegram until the review UI supports it. The builder remains a supporting authoring tool, not the primary Philip-facing experience. Design approval does not authorize a test email, scheduling, or bulk delivery; existing separate send approvals remain.

## October 10: audience signup repair — local only
Both public site signup paths now have an isolated, tested release candidate against live code bases. Dedicated authenticated CRM intake records source/versioned consent transactionally and preserves unsubscribe/global suppression/ambiguous legacy no-solicitation. Real local browser → website proxy → CRM HTTP → isolated DB proof passed. Report: `reports/signup-2026-10-10/REVIEW.md`. NOT deployed; protected site edge auth/dedicated token and edge abuse throttling plus authorized production proof still required. No emails or production contact changes.
