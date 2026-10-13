# Pre-send rendering repair — October 13, 2026

LOCAL ONLY. Based on worker source `65481398ddc1597c005dc53d4b73424e78a19369` in isolated `projects/crm-presend-repair-20261013`. No production/config/campaign/contact/queue changes, provider calls, emails, pushes or deployment.

## Repairs

1. `wrapLinksForTracking` now decodes HTML character references exactly once in attribute context before URL safety validation, unsubscribe exclusion and signed-target creation. The actual current Mirvish ticket href previously signed literal `&amp;`, causing query keys `amp;utm_medium` and `amp;utm_campaign`; it now signs the same URL an HTML client reads. Numeric/named references, non-ASCII, percent-encoded values, and literal nested `&amp;amp;` preserve their intended single-decode semantics. Credentials/unsafe targets remain excluded; unsubscribe URLs remain untracked, including HTML-encoded path spelling. Existing double-quoted HTTP(S) href matching scope remains unchanged.
2. First-name personalization trims outer whitespace (not internal spaces), then uses `there` for missing/blank names. First-name fallback used by fullName follows the same normalization. Contact data is not rewritten. HTML escaping and single-pass/nonrecursive substitution remain intact.

## Runtime dependency

Promoted **already installed/locked** `entities` 6.0.1 (previously parse5-transitive) to an exact direct dependency. Added it to the worker-only projection. No package upgrade, new package bytes, or dependency installation occurred. This uses established HTML attribute decoding rather than an incomplete hand-written entity table. Existing high-severity Docker audit gate is unchanged.

## Verification

- Baseline negative control: all **5 new substantive tests fail** on original worker source; saved in `baseline.log` (trailing whitespace normalized for Git hygiene).
- Offline unit runner: **31 passed, 3 intentional DB skips**, zero failures.
- Worker projection: **1 passed**; decoder retained, web/build packages absent, all retained version/resolved/integrity bytes unchanged.
- Independent TypeScript: passed.
- Scoped ESLint: passed.
- `git diff --check`: passed.
- Actual disabled worker CLI smoke: passed without database/AWS access.
- Graph touch/dependents checked before repair; graph rebuilt separately in this report directory; original tracked/shared graph preserved.

Tests use synthetic secret/contacts and parse5 attribute parsing as the HTML-reference oracle. Actual email builder is exercised, without invoking a provider or queue. Tests cover current campaign UTM href, decimal/hex/named references, nested entity/percent encoding, quotes/Unicode/ordinary targets, excluded unsubscribe/credentials/non-HTTP links, missing/null/blank/NBSP/named/escaped/multiword first names, actual builder unsubscribe substitution and one-click header preservation.

## Dependencies and remaining acceptance

Affected flow: `email/queue.ts` → `email/message.ts` → `email-template.ts`; shared personalization also serves direct test route. Worker lock projection must ship with source fix. Web preview-only fixes do not repair the separately deployed worker.

No Docker image build, production rollout, inbox rendering or delivery was performed. Parent must reconcile this worker-baseline patch with current web release, obtain rollout authorization when required, verify actual deployed worker package/import behavior, and rerun final-draft pre-send checks. This report does not authorize any send or establish that the first 100 recipients are ready.
