# Combined clicked-link breakdown — October 15

Local implementation only. No production reads/writes, email sends, AWS actions, pushes or deployments performed by this workstream.

## Delivered

The combined `/campaigns/analytics` report now includes **Clicked links** before Included batches:

- Captured label, placement, destination, total canonical clicks, distinct clicking email-recipient records, batch count, last recorded click (Toronto).
- Identical label + placement + destination groups combine across batches. Different placements and different labelled creatives remain distinct. No per-person uniqueness claim.
- Matching links CSV (`/api/campaigns/analytics/export?view=links`) includes first/last click UTC. Existing recipient export remains default and unchanged.
- Sent dates, recipient search, outcome, automation and existing URL link-recipient filters apply consistently. Sent dates select email send time, not click time.
- Canonical-only click evidence excludes SES mirror duplicates. Explicit historical coverage/empty-state copy avoids inventing zero-click inventory or treating aggregate legacy flags as link evidence.

The page displays top 100 groups and discloses truncation if needed. Export streams all groups in 500-row identity-keyset database aggregation pages; no raw event or recipient arrays loaded. Export is a live report, not a point-in-time audit snapshot; activity arriving during a large export may change counts between pages, but updated totals cannot move groups across the pagination cursor. Page queries are independent and run concurrently. No schema, tracking ingestion, sending, configuration, summary or per-batch analytics changes.

## Files

- `src/lib/email/combined-analytics.ts` — bounded SQL group aggregation and bound-parameter recipient SQL filter equivalent.
- `src/app/(admin)/campaigns/analytics/page.tsx` — table, definitions, empty/coverage/truncation copy and export.
- `src/app/api/campaigns/analytics/export/route.ts` — private no-store link CSV branch; formula-safe existing CSV encoder.
- `tests/combined-analytics.integration.test.ts` — multi-batch/placement/label/repeat/mirror/automation/sent-date/unsent proof and all-outcome SQL-vs-Prisma parity, CSV.
- `scripts/combined-links-browser-proof.mjs` — synthetic real-browser regression, table/CSV checks and screenshot evidence.

SQL recipient predicates intentionally mirror shared Prisma selection because Prisma cannot express grouped count-distinct recipients. All outcome variants and both automation modes are parity-tested; future selection changes must keep both paths aligned.

## Reproduce

After the inert production build, run `CRM_ANALYTICS_PREVIEW=1 bash scripts/test-analytics-local.sh`, then `node scripts/combined-links-browser-proof.mjs`. Browser base may be overridden with `CRM_ANALYTICS_PREVIEW_URL`; this review used an isolated :3196 copy of the harness to preserve an existing preview.

## Verification

- Production build: `npm run build -- --webpack`, inert DB, dotenv disabled, provider disabled — passed.
- Independent `tsc --noEmit` — passed.
- Scoped ESLint on changed TypeScript — passed.
- `npm test` — 35 passed; 5 explicitly DB-gated skips.
- Disposable Unix-socket PostgreSQL analytics harness — 16 analytics + 10 combined checks passed, migrations and schema drift passed. Synthetic only; no project dotenv.
- Real Chromium synthetic preview, 1440/390/320: 10 browser scenarios passed, no browser errors or document overflow. Link table, recipient/date/outcome/export, reset/refresh, per-batch report and navigation regression included.
- Desktop/mobile screenshots inspected. Mobile table scrolls horizontally within its panel; the page does not overflow. The existing sticky mobile header can overlay the top of automatic element-only screenshots; user scrolling and table remain usable.
- Scoped `git diff --check` — passed.
- Knowledge graph touch/dependents inspected before edits; separate rebuilt graph saved in this report directory. Existing shared graph untouched.

Existing dirty PROJECT.md, shared graph and earlier report screenshot preserved. Live deployment/browser proof remains parent-owned.
