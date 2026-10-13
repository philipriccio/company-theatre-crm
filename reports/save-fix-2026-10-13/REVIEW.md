# Draft-save recovery repair — October 13, 2026

## Scope and diagnosis

Based on live release `2b6f1036dea8f0d3992bc978f4de23c0a1c45973` in isolated worktree `projects/crm-save-fix-20261013`.

**Philip's exact browser failure is not conclusively identified.** Production-build local Chrome and the parent's disposable live QA both save fresh typed changes and retain them after reload. The production endpoint is not generally unable to persist copy.

Demonstrated problems:

1. A stale open page retains its original content hash. A separate format/copy/subject change invalidates that hash. Save repeatedly rejects with 409; the old UI has no recovery action beyond manually copying text and reloading. This is a plausible explanation for an old open tab, not a confirmed diagnosis of Philip's tab.
2. DOM changes with no captured input event are omitted from React's dirty state; the old final DOM read also only visits keys already present in that state. The new observer and complete changed-DOM scan close this loss path.
3. In development StrictMode, iframe load can install listeners before effect replay removes them. Repeated edit after reload displayed changed words but disabled Save. Production baseline did **not** reproduce this lifecycle variant; do not call it the production cause.

## Changed behavior

- Explicit **Load latest and keep my edits** after stale-version rejection. Read-only GET returns the latest editor snapshot.
- Conservative three-way reconciliation: unchanged unique original text identifies the edited field even after HTML offsets move. Independent server subject/preview/other-text changes are preserved. No automatic save is performed; Philip reviews and presses Save.
- Duplicate/removed/independently changed same-field text fails closed. Both versions remain untouched; **Download unsaved text** gives a recoverable plain-text copy before manual reconciliation/reload. This deliberately does not guess which current paragraph an ambiguous edit should overwrite.
- Iframe mutation observation plus actual DOM capture closes missing-input-event cases. Lifecycle attachment now reinstalls correctly on effect replay.
- Save failures remain explicit, with pending words retained. Existing content-hash lock and draft-only rule remain unchanged.

## Verification

- Production webpack build passed; independent `tsc --noEmit` passed; scoped ESLint and `git diff --check` passed.
- Offline unit runner: **29 passed, 3 intentionally DB-gated skipped**. Added three substantive rebase cases covering shifted offsets/independent edits, ambiguity/conflicts, and already-saved changes.
- Real Chrome → local HTTP API → isolated Unix-socket PostgreSQL using a copy of saved campaign HTML:
  - Real keyboard typing saves and reloads from DB.
  - Separate subject update makes tab stale; original stale Save is rejected with no DB overwrite.
  - Explicit recovery preserves pending paragraph **and** new server subject; subsequent Save/reload retains both.
  - DOM replacement without dispatching input is detected, Save enabled, and persisted.
  - Synthetic 500 preserves pending words and visible error.
  - Independent same-field rewrite refuses unsafe rebase and preserves both pending DOM and current DB.
  - Mobile 390px viewport has no horizontal overflow; screenshot visually inspected.
- Baseline production browser confirms fresh/repeated saves work and stale rejection is reproducible. Baseline development browser reproduces missing-listener disabled Save.
- No Safari/WebKit runtime installed; Safari-specific behavior remains unverified.

Reproduce after production build:

```sh
PROOF_FIXED=1 bash scripts/test-copy-save-local.sh
```

Optional `COPY_PROOF_FIXTURE` supplies an existing HTML fixture; default is synthetic. The harness creates/destroys its own database, disables providers/dotenv, and does not read production configuration. Chrome/Playwright runtime paths are the existing Mac installation. Build used `next build --webpack` because shared node_modules symlink is outside Turbopack's root; normal production deployment has an ordinary dependency installation.

## Changed paths

- `src/components/campaigns/InlineCopyPreview.tsx`
- `src/lib/campaign-copy-rebase.ts`
- `src/app/api/campaigns/[id]/copy/route.ts`
- `tests/campaign-copy-rebase.test.ts`
- `tests/save-browser-proof.ts`
- `scripts/test-copy-save-local.sh`
- This report and local verification artifacts.

Graph rebuilt before/after; affected routes/component/helpers identified. Generated graph is not included in the release.

## Boundaries

No production writes, original draft modifications, emails, provider calls, configuration changes, pushes or deployments performed by this subtask. Parent separately owns live verification and release decision. Existing browser tabs must preserve/download/copy visible unsaved text before any reload; deploying code does not replace code already running in an old tab.
