# Next-batch email attribution and scanner reporting — October 15

Local-only release. No production writes, sends, worker/config changes, push or deployment. Current approved content and running batch untouched. No migrations or historical backfill.

## Changed behavior

- New drafts opt into attribution by including exactly `<!-- tct-attribution:v1 -->` in content **before approval**. Existing drafts without that marker preserve their previous generated destinations. Source-content hashing binds the opt-in; never add it to an active/approved source.
- Public Company Theatre/Jackpot Twins and Mirvish destinations receive missing source/medium/campaign tags plus creative/placement (`utm_content`) and batch (`utm_id`). Defaults are `company_theatre`, `email`, `company_theatre_email`. Authored values are preserved. Creative is SHA-256 of unpersonalized content, batch SHA-256 of campaign ID, each truncated to 12 hex characters. No recipient IDs/emails/names are inputs to attribution.
- Existing unrelated query parameters and anchors retained. Arbitrary third-party, unsubscribe, mailto and recognized signed URLs are not decorated. Opted-in already-signed tracking URLs are not wrapped again. This does not sanitize private data that an author explicitly put into a destination; approved authored URLs still need normal review.
- New canonical app clicks on at least three distinct placements within two seconds are classified `likely_automated`, with versioned reason in event detail. Per-recipient advisory serialization prevents parallel requests missing the burst. Scope is recipient AND campaign. Only events within the burst change classification; later ordinary clicks remain unknown. Two links, repeated one-link activity and slower sequences do not trigger the rule.
- No raw event is deleted or deduplicated. Existing raw and filtered report modes, totals, timelines, links, recipient filters/timestamps and CSV all use the same stored classification. UI now explains both provider evidence and behavioral suspicion. Unknown/unlikely is never called human.

## Verification

- Offline: 39 pass, 6 DB-gated skips.
- Isolated PostgreSQL: existing batch analytics 16 checks; combined analytics 10 checks; scanner 5 checks (includes parent test counts). All pass. Fresh temporary Unix-socket cluster, dotenv disabled, provider disabled. Zero schema drift.
- New URL tests exercise opt-in/default stability, entity-safe signing, preserved tags/anchors, different placements, identical per-person attribution, protected destinations and no recipient data.
- Scanner tests exercise concurrent capture, same contact in another batch, raw/filtered batch and combined metrics/list/link/CSV parity, later normal clicks, one/two-link ordinary behavior, and slow multi-link activity.
- Independent TypeScript and scoped ESLint pass. Scoped diff whitespace check passes.
- Default `npm run build` failed because Turbopack rejects the pre-existing node_modules symlink outside this worktree. Explicit `next build --webpack` production build passed; no config workaround committed.
- agent-browser synthetic local QA: 1440px combined report, 320px combined and batch reports; Activity filter submitted successfully, correct cautionary copy, no document overflow. Desktop and batch-mobile screenshots visually inspected. Browser default bundled binary was missing; existing installed Chrome was used without installation. Preview remains at http://127.0.0.1:3197 for parent review.
- Separate dependency graph rebuilt in this report directory; shared dirty graph untouched.

## Rollout and rollback

Do not replace/restart the active worker or modify the active approved source. Parent must independently review, then follow authorized deployment workflow after current send has finished. Deploying this code does not opt any old content into attribution. Prepare a NEW next-batch draft containing marker; review generated destinations and bind final approval to that content. Worker and web need reviewed same release for new sends and capture. Do not start a next batch solely on this implementation request.

No migration required. Rollback web/worker to prior image without restoring data. Captured events and classifications remain; select All recorded activity to include every event. No historical reclassification job is supplied or run.

## Limits

Heuristic only: rapid real exploration can be falsely suspected; single-link scanners and slow scans may remain unknown. Classification covers new app capture, not historical rows or provider mirrors. Evidence query has existing recipient/time index; same-recipient requests are serialized. No Mirvish purchase/revenue integration, GA admin dimensions/key-event configuration, email-client inbox proof or live browser acceptance is claimed.
