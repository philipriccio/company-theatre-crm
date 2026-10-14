# Combined email analytics — October 14, 2026

Local implementation only. No production change, send, config change, push, migration, or deployment.

## Product

- `/campaigns/analytics` now opens **All emails, together**: all sent/accepted recipient records across all batches, all dates by default.
- Dedicated **Email analytics** sidebar entry; individual batch reports link back to combined view. Existing batch IDs/evidence and single-batch reporting are unchanged.
- Inclusive **Sent from / Sent through** date controls use America/Toronto calendar days, including 23/25-hour DST days. The effective timestamp is recipient `sentAt`, falling back to `acceptedAt`, never campaign creation date.
- Search by name/email, outcome, and likely-automation option apply consistently to aggregate cards, batch breakdown, paginated recipients, and streaming CSV.
- **Refresh totals** is a full server refresh. **All emails · reset** returns to the all-time aggregate.
- Counts are explicitly **emails**, not deduplicated people. Repeat recipients across batches contribute separate email records. No false summed unique-person claims.
- **Currently delivered** requires current DELIVERED status, delivery timestamp, and no bounce. Separate historical delivery evidence remains visible when a later bounce changes status.
- Held and unattempted rows do not inflate totals. Rows without either a sent or acceptance timestamp (including unresolved historical attempts) are not provably sent and remain accessible in individual batch reports, not counted as confirmed sends here.
- Opens/clicks remain signals, not humans or sales. Historical coverage and automation caveats remain visible.

## Implementation

- `src/lib/email/combined-analytics.ts`: shared date parsing, recipient scope, grouped metrics and bounded recipient query. Fixed query count rather than N+1 summary queries by batch. Invalid/reversed dates fail closed.
- `src/app/(admin)/campaigns/analytics/page.tsx`: combined default UI.
- `src/app/api/campaigns/analytics/export/route.ts`: matching streaming CSV, private/no-store, formula-safe cells and retained provenance IDs. Existing proxy admin authentication boundary unchanged; never add this route to public delivery exceptions.
- `src/components/Sidebar.tsx`, individual report navigation, scoped CSS.
- Tests/harness/browser proof updated; no database/schema/config changes.

## Verification

- Production webpack build: passed (`build.log`).
- Independent `tsc --noEmit`: passed (required because build ignores TS errors).
- Scoped ESLint: passed.
- Offline tests: 35 passed, 5 intentionally DB-gated skips (`offline.log`).
- Existing analytics isolated PostgreSQL suite: 16 passed including capture/deduplication, automation, history, streaming export, 14k pagination.
- New combined isolated PostgreSQL suite: 8 passed (7 substantive nested tests plus suite), including multiple batches, repeated people, Toronto midnight boundaries, DST start/end, accepted fallback/sent precedence, unsent exclusions, explicit invalid/reversed failures, filter/CSV parity, and automation timestamp parity.
- The first fixture attempt encountered the existing unique campaign/contact constraint; corrected the synthetic fixture to model repeat people across batches rather than illegal duplicates within a batch. Final run passes (`integration.log`).
- Combined browser proof: **10/10 passed**, real date/search/outcome forms, matching CSV, timeline drilldown, reset, refresh, sidebar selection, single-batch navigation and 1440/390/320 widths. No page errors or document overflow. Desktop/mobile screenshots visually reviewed. Aggregate cards precede filters on mobile. Explicit accessible names added to filter selects after the first browser pass.
- Existing single-batch browser suite: **20/20 passed**; evidence copied to `single-batch-regression/` without replacing prior committed screenshots.
- Separate knowledge graph rebuilt to this report directory, preserving existing root graph.

## Preview and reproducibility

Local synthetic preview: `http://127.0.0.1:3194/campaigns/analytics`.

Build safely with inert DB override as in TESTING.md, then run `CRM_ANALYTICS_PREVIEW=1 bash scripts/test-analytics-local.sh`. This creates a fresh Unix-socket-only PostgreSQL cluster, applies migrations locally, runs both analytics suites, seeds labelled synthetic examples, and holds the loopback server until stopped. No project `.env` or real provider.

Browser proof: `node scripts/combined-analytics-browser-proof.mjs`; existing individual report regression: `node scripts/analytics-browser-proof.mjs`.

Production rollout remains a parent-owned approval/verification step. This is reporting-only and does not authorize any email sends, resume or data merge.
