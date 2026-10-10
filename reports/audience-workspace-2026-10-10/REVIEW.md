# Audience workspace — local release, 10 October 2026

## State
Local implementation and proof only. Based on production commit `44ff4a4`; branch `feat/audience-workspace-20261010`. No production database, configuration, AWS, email, push or deployment actions. No schema changes or package installations. Other worktrees are untouched. All screenshots and test records here are synthetic, not the production audience.

## Delivered
- Warm editorial cream/ink/Company-red shell; compact responsive navigation, skip link, mobile menu, reduced-motion support, serif editorial headings. Styles scoped to the admin workspace; subscriber pages retain their separate shell.
- Truthful overview: real counts, actual existing tagged groups, current drafts rather than misleading historic send counts, open/overdue follow-ups, recorded recent signup requests. No invented growth, purchases or attendance. Historic tags are explicitly not independently verified attendance/permission.
- Audience directory with URL-persistent text (name/email/organisation/context), tag, recorded-source, permission, VIP and ordering filters; removable chips, clear-all, stable bounded pagination, honest empty state. Full responsive person cards replace horizontal tables on narrow screens.
- Preset views for all people, existing Jackpot/Company website tags, VIP, recorded opt-in requests needing review, unknown evidence, unsubscribed and suppressed. These are presets, not pretend saved custom segments.
- Shared parameterized SQL projection/predicates/order for list, counts and CSV. Suppression (case-insensitive email) → unsubscribe → no-solicitation → current matching-email consent evidence → unknown. A mailing flag alone is never displayed as proof of consent. Pending opt-in-request discovery is separate from precedence, so blocked requests remain discoverable.
- CSV exports the entire matching audience in matching order, not merely the page. All cells quoted and spreadsheet formula-leading values neutralized; query links encoded with URLSearchParams. Export failures return explicit errors.
- Contact header and existing dossier preserved, with read-only matching/current status and up to 50 most recent consent records; older records remain retained. Personal notes have explicit Save/Cancel; failed saves retain edits and show an inline error. Notes/VIP updates send only changed fields, avoiding stale mailing-flag overwrite. Follow-up completion is scoped to the URL contact.
- Functional Add Person: input validation, case-normalized concurrent duplicate handling and atomic tag writes. Mailing permission always starts off, regardless of submitted flag; no consent is invented and no email is sent.
- Existing tag tools remain available. Removed browser-embedded historical auth fallback from these three affected widgets; same-origin authenticated session is used. Failed mutations no longer pretend success. Tag picker is viewport-bounded and Escape closes it.

## Verification
- Production build: PASS (`build.log`).
- Independent `tsc --noEmit`: PASS (`typecheck.log`). Build alone is insufficient because existing Next configuration ignores type errors.
- Scoped ESLint on every changed TS/TSX file plus new test: PASS, no warnings (`lint.log`).
- Offline full suite: **26 passed / 3 DB-gated skips** (`unit.log`). Gated suites run separately below.
- `CRM_BROWSER_PROOF=1 ./scripts/test-audience-local.sh`: **8 passed / 0 skipped** (`audience-proof.log`). Fresh Unix-socket-only PostgreSQL with existing migrations and zero schema drift; completely torn down afterward.
- Fixture proof: precedence and evidence gaps; blocked opt-in-review discoverability; count/list/CSV predicate parity; SQL-like query text treated literally; creation validation/concurrency/default-off; stale-field preservation; cross-contact follow-up rejection; stable pagination on 14,107 synthetic people. Preset counts plus two list pages measured **62 ms locally** in the final run; not a production performance guarantee.
- Real browser: 1440, 390 and 320 widths across overview/directory/dossier/create; zero document overflow and zero page errors. Actual filter/reload/CSV, Add Person → DB, retained notes on injected HTTP500 → retry → reload, viewport-contained tag picker, mobile navigation tested. Fourteen screenshots saved; desktop and narrow layouts visually inspected.
- Existing campaign inline Subject save → reload works in actual browser; draft remains DRAFT with zero recipients. 1440/320 campaign layouts have no overflow. Invalid unsubscribe page has no admin sidebar (`campaign-inline-*.png`).
- Existing delivery/readiness isolated regression: **23 passed** (`readiness.log`). No real provider used.
- Existing website signup HTTP/DB regression: **8 passed, 1 browser check skipped** (`signup.log`). The website browser proof was established by the prior signup release; this run does not re-claim fresh public-site browser proof. Intake/proxy implementations are unchanged.
- Knowledge graph rebuilt (`graph.log`); generated graph intentionally excluded from release commit.
- `git diff --check`: PASS.

## Review / rollout boundaries
- Release requires parent review and separate deployment approval. This work does not enable sending or change email configuration/approvals.
- No custom saved-segment persistence, audience permission-editing workflow, bulk clean-up/merge, imported consent backfill, purchaser integration, UTM capture, ticket revenue attribution or automated sends.
- Existing manually editable mailing flag remains a separate legacy capability; this increment neither changes it nor treats it as consent proof. Existing standalone edit/import/delete flows were not rewritten.
- Permission classification is conservative and operational, not legal adjudication. Unsupported/other evidence states require review; missing evidence does not prove unlawful historical consent. All suppression rows remain treated as blocks, consistent with current intake behavior.
- Overview shows five nearest open follow-ups; full contact follow-ups remain in dossiers. No dedicated global follow-up management page is claimed.
- Presets/counts and lists are separate reads and can reflect concurrent audience changes; export membership is selected at request time, not an immutable campaign snapshot. Campaign approval/snapshot machinery is unchanged.
- Screenshots show synthetic counts/people; do not represent them as the live database.
