# Email analytics — local release candidate, October 13

**Not deployed. No emails sent, AWS changes, production reads/writes, pushes or settings changes.**

## Implementation

- Campaign comparison and detailed reports; unique and total recorded activity, exact delivery denominators, daily trends, delivery-state breakdown.
- Search/filter/paginate recipients; scoped evidence timelines; distinct same-destination link placements and zero-click inventory.
- People, per-link and matching-event CSVs, streamed where large, formula-safe and free of tracking tokens/raw provider payloads.
- Reversible provider-likely-automation exclusion; unknown != human.
- Durable minimal ledger, signed placement-aware redirects, transactional capture, SNS deduplication, first-time preservation and out-of-order-safe status handling.
- Campaign-specific unsubscribe attribution with old-token compatibility and scanner-safe GET.
- Preserved presend entity/name repair, live web save recovery and current worker historical-tag exclusions/dependency isolation.

## Verification to date

- Additive migration deployed to fresh Unix-socket-only synthetic PostgreSQL; Prisma schema diff clean.
- 14 isolated analytics checks passed, including real persistence, repeated/duplicate/out-of-order events, overlap, unsafe/tampered/cross-campaign links, explicit storage failure, bot filtering, export parity, delay timing and complaint ordering.
- 14,000-recipient final-page lookup and matching full streaming export passed; local paginated read threshold <2 seconds.
- Existing isolated readiness: **23/23 passed**.
- Production webpack build passed; independent TypeScript/scoped ESLint/diff check passed before final review.
- Parent independent browser QA is in progress; do not infer visual acceptance from this report alone.

Default Turbopack build cannot traverse the reused dependency symlink outside its root; webpack production build is the verified local path. No dependency installation was performed. Docker container build remains unverified locally.

## Reproduce

Use inert build settings from `TESTING.md`; build with `npm run build -- --webpack` for this symlinked worktree. `bash scripts/test-analytics-local.sh` creates, migrates, tests and removes a fresh isolated DB. `CRM_ANALYTICS_PREVIEW=1 bash scripts/test-analytics-local.sh` additionally seeds synthetic examples and starts loopback :3194 until stopped. It never reads project .env or calls a real provider.

Preview: `http://127.0.0.1:3194/campaigns/analytics-showcase/analytics`.

Expected fixture: 120 recipients; 110 accepted; 90 confirmed deliveries; 60 unique opens / 80 open events; 30 unique clicks / 60 click events; 6 bounces; 3 campaign unsubscribes; 4 complaints. Excluding likely automation removes 10 unique opens and 20 total open events; clicks remain unknown and unchanged. Separate empty, historical and 14k queued campaigns demonstrate unavailable data and large pagination.

## Rollout gates — require separate approval

1. Back up production PostgreSQL; keep both web and worker disabled.
2. Apply only additive analytics migration, then deploy this unified reviewed source to **both** web and worker. Do not deploy worker from the older web baseline alone: current worker is 6548139, web baseline ba09b6e; this candidate carries worker exclusions/projection forward.
3. Rehearse/review idempotent historical evidence recovery separately; apply only with production write approval. Do not delete old audit rows.
4. Verify authenticated analytics/export routes remain private; click/unsubscribe/SNS public exceptions unchanged. Private open pixel need not be opened.
5. Verify existing campaign editing, exact draft content, disabled provider/worker settings, signed redirects/SNS ingestion and suppression safeguards.
6. An explicitly approved small inbox round is still required to prove real SES open telemetry, click tracking and link destinations. No live-end-to-end analytics claim before that evidence.

Additive schema can remain if app rolls back; do not delete audit events or recipient rows. A worker rollback stops generating placement-aware tokens, so mark its resulting tracking coverage historical. Direct legacy layout-test endpoint still bypasses durable campaign analytics; use approved queue-based test campaigns for analytics acceptance.
