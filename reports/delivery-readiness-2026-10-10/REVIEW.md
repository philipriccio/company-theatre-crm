# Delivery rollout readiness — 2026-10-10

Status: local reviewable release only. No production changes, provider enablement,
emails, AWS operations, push, or deployment. Base: `b70bb993a51220ecf1597000519410e58edcdbbe`.

## Important correction to older handoffs

The exact currently reported live commit **already contains** the shared SES
exact-recipient allowlist, signed unsubscribe/click tokens, durable worker queue,
SNS signature/topic verification, and bounce/complaint suppression code. Do not
describe those as absent or necessarily undeployed. Their presence is not proof
of configured/working live delivery. The October 7 auth review inspected an older
image and its statement that unsigned unsubscribe is live is now stale.

Parent's current production presence check reports `EMAIL_PROVIDER=disabled`;
SES region/configuration set, SNS topic, AWS worker credentials, token signing
secret, recipient allowlist, and CRM auth application setting absent. AWS account
sandbox/quota/configuration state is unverified; fresh AWS browser requires login.
No exposed historical credentials were used in this work.

## Scoped changes

- Root layout now renders common document/CSS only. Existing admin routes and
  co-located components move unchanged under `(admin)` with the original sidebar
  layout. Route-group names do not change any public URL. This prevents anonymous
  unsubscribe pages from receiving admin navigation or admin link prefetches.
- Subscriber layout supplies noindex/nofollow, no-referrer, independent page title,
  and only a main landmark. It does not load contacts/campaigns or sidebar.
- Disposable DB harness now resolves its own repository root instead of silently
  testing the original dirty checkout when invoked from a worktree.
- Reviewable file-provider router proposal and real Traefik regression harness.
  Old `[^/]+` token regex admitted an encoded-slash path in runtime testing;
  restricted actual token/id alphabet fixes that case. No router is installed.

## Verification

- Production build passes. Independent `tsc --noEmit` passes (build alone skips
  type errors in existing config). Scoped layout ESLint passes; diff check passes.
- Offline unit: 24 passed, 1 isolated-DB test skipped as designed.
- Fresh temporary Postgres harness: 23 passed, including durable queue, suppression,
  uncertainty, retry, concurrent/event ordering, and mock worker CLI behavior.
  Cluster removed after run; no existing database used.
- Real Traefik **3.6.0**, downloaded to temporary directory, file-provider parse
  and **75** method/path/host/encoded-path cases pass. Public/private backends are
  loopback-only disposable stubs. This proves rule selection, not real Basic-auth
  credentials, Docker service identity, TLS, or production entrypoint integration.
- Built app HTML and hydrated browser: unsubscribe invalid-token state has no
  admin sidebar/nav/links; correct noindex/referrer metadata; assets resolve.
  Desktop and 375px screenshots saved; mobile scrollWidth = viewport width.
  Existing `/contacts/import` still renders sidebar/nav without overflow at 375px.
  Invalid-token screen visually reviewed. Valid contact POST behavior is covered
  in isolated database suite, not claimed as a real subscriber/browser proof.
- Knowledge graph touch/dependents reviewed before edits and graph rebuilt after;
  rebuilt artifact kept at `/tmp/tct-delivery-knowledge-graph.json` to avoid noisy
  unrelated tracked-graph churn.

## Public route matrix (proposal only)

| Path | Public methods | Reason |
| --- | --- | --- |
| `/unsubscribe/{token}` | GET, HEAD | Subscriber confirmation UI |
| `/api/unsubscribe/{token}` | GET, HEAD, POST | Status and one-click suppression |
| `/api/track/open/{id}` / `/api/track/click/{token}` | GET, HEAD | Tracking |
| `/_next/static/…` | GET, HEAD | Immutable UI assets, not admin data |
| `/api/webhooks/ses` (exact) | POST | Application verifies AWS signature/topic |

All contacts/campaigns/settings/admin APIs, send/test/cron, website signup/intake,
legacy webhooks and lookalike routes remain behind the existing authenticated
catch-all. The parent owns a separate website-signup proposal; it is deliberately
not opened by this delivery-only router. Assets are public code, not authorization.

## Remaining concrete release/send gates

1. Parent integrates signup work with this reviewed commit if desired. Recheck
   route-group moves against any new UI edits, run combined checks, review exact
   diff; no schema migration is introduced by this patch.
2. Obtain protected AWS access/setup; verify current SES eligibility/quota,
   configuration set, exact signed SNS topic/subscription, sender/DNS alignment,
   least-privilege worker credentials and token signing secret. Keep web provider
   disabled; worker-only SES avoids direct-test bypass of durable event records.
3. Review real service reference, entrypoints and middleware; back up persistent
   router settings/database and prepare rollback. Explicit release approval before
   deploy/router/config changes. Verify production migrations rather than trusting
   old notes. Do not reopen insecure legacy unsigned-token decoding.
4. Deploy with provider disabled, worker stopped. Confirm anonymous admin routes
   stay blocked and invalid public tokens reach application rejection. Validate
   signed unsubscribe with an approved synthetic/contact-state fixture; no automatic
   reactivation. Confirm forged SNS rejected without writes.
5. Finalize sender/reply-to/footer/legal basis and exact creative. `hello` routing
   and no-address-footer send clearance remain separate unresolved items.
6. Obtain approval of exact Philip/Janice recipient addresses, content/version,
   count and round before **any** test. Existing exact-recipient allowlist remains
   mandatory and fail-closed; no wildcard/bulk bypass added. Use reviewed queued
   path for acceptance/delivery event proof, not direct-test endpoint.
7. Run and review separately approved Philip/Janice rounds for actual inbox
   placement/headers/rendering, signed delivery events, and suppression. Offline
   tests do not establish any of these live outcomes. Then request separate approval
   for exact audience/count/content/time of any bulk campaign.

Replay routing: set `TRAEFIK_BINARY` to a local Traefik 3.6 executable and run
`python3 scripts/test-public-email-routing.py`. Test binds loopback port 18379.
Existing production router remains untouched if this proposal is not installed.
