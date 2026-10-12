# Isolated SES worker runtime — 2026-10-12

## Scope and cause

The existing worker image build failed its mandatory runtime audit because it included the complete web dependency set: Next.js critical, sharp/source-map-js high, plus low esbuild. This repair isolates the actual worker runtime; it does not suppress audit findings, update package versions, or fix the web application's advisories.

Base: `e6e6698dfa4003b3d7de524fa63217f7c72a5893`. Worktree: `projects/crm-ses-connect-release`.

Inspected import closure: `scripts/email-worker.ts` → providers/queue → audience, legacy-exclusions, db, retry/types, message → email-template/tokens, and events. External runtime imports are `@aws-sdk/client-sesv2`, `@prisma/client`, `@prisma/adapter-pg`, `pg`, `dotenv`; `tsx` is the CLI interpreter. Other imports are local files or Node builtins. No Next.js/React imports occur in that closure.

## Changes

- `scripts/prepare-worker-runtime.mjs` projects a build-directory manifest onto those six dependencies, prunes the lock offline, and asserts every retained package version/resolved URL/integrity equals the original committed lock. Fails on introduced/changed packages and retained web-only roots.
- Docker worker runtime installs only the projected dependency set; `npm audit --omit=dev --omit=peer --audit-level=high` remains mandatory.
- Separate `worker-client` stage generates Prisma with existing full build dependencies; no Next production build is required for the worker. Prisma CLI/build-only peers are omitted from final runtime. Optional peer entries may remain in the derived lock but installed-module checks prove CLI absence.
- Root `package.json`, `package-lock.json`, application code and web runner/build stages remain unchanged. Only Docker worker dependency/copy paths changed.

## Verification

- Before edit: graph `touch email` and `dependents Dockerfile` (graph does not index Dockerfile); inspected actual imports above. Rebuilt graph: 112 source files, 451 nodes, 3552 edges; generated graph left outside commit.
- `node --test tests/worker-runtime.test.mjs`: PASS. Executes actual offline projection in a temporary directory, checks retained package identities, required/excluded roots, and unchanged source lock.
- `node scripts/test-disabled-worker.mjs`: PASS; existing actual CLI traverses imports then exits before DB access.
- Scoped ESLint of added script/test and `git diff --check`: PASS.
- Existing offline suite: 26 pass, 3 intentional DB skips. Earlier base review had 24/24 isolated DB tests; no queue/application change in this repair.
- Authorized remote `docker build --target worker`: PASS. Final runtime installs 49 packages, versus 116 before isolation. Runtime audit passes with one low esbuild Windows-development-server advisory; no high/critical runtime findings reported.
- Actual final image executed with `--network none`, `EMAIL_PROVIDER=disabled`, dotenv disabled, synthetic unreachable loopback DB, batch=1 and `scripts/email-worker.ts --once`: **exit 0**. This exercises all worker startup imports and confirms inert startup in the real Linux image.
- Separate network-none final-image module resolution: six required runtime roots resolve; `next`, `react`, `react-dom`, `sharp`, `source-map-js`, `prisma` all produce MODULE_NOT_FOUND. Image user is `nextjs`.

Built local-host tag: `tct-crm-worker:ses-connect-runtime-isolation`.
Image ID: `sha256:eed9a90de7e6de60c77ff54c36c8c18998f0706ff59e8cb4b276b9d05bf84743`.
Root-only remote logs: `/root/tct-ses-connect-20261012/worker-repair-build.log` and `worker-repair-smoke.log`.
Only committed base archive plus scoped source files were uploaded; no `.env`, credentials or working-tree extras. Final post-build source adjustment corrects only the Dockerfile explanatory stage-name comment.

## Limits / deployment boundary

No AWS access, real email, database access, service deployment, Coolify configuration change or push. Image is staged and smoke-tested, **not connected to SES**. Web-runtime advisories remain unchanged and require separate reachability/patch review. Keep both web and worker `EMAIL_PROVIDER=disabled` until protected SES setup and separately authorized send proof. Never treat empty allowlist or mock provider as safe production staging.
