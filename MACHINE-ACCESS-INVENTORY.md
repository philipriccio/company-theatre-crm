# Machine access inventory and migration — October31

Read-only source/metadata inventory; no production commands or credentials inspected. No Company CRM connector tools were present in this session's tool metadata.

## Observed paths

- `audits/crm-gmail-36360-2026-10-27/analytics-check.py`: privileged SSH/docker `node --import tsx` reads Prisma campaign/recipients, builds messages locally, checks SES account health. This is not a Basic-auth HTTP client and is NOT migrated merely by issuing an app token. Routine CRM list/read/analytics can move to the new API identity. Specialized provider-account/renderer verification remains an operator operation.
- `audits/security-monitor/2026-10-31T0515Z/web.py`: anonymous HTTP/TLS probes of CRM root and `/api/contacts`; deliberately expects unauthenticated boundaries. Keep anonymous; never give scanner full CRM access.
- Existing campaign batch scripts are one-time approved privileged controllers. Do not repoint or rerun these to demonstrate a migration. They remain outside routine machine capabilities; sending still requires its separate explicit authority.
- The application worker uses protected DB/provider configuration and is not a human or machine HTTP session. Do not make its ability to claim an approved queue depend on a browser cookie.
- Website signup/scratch intake use existing dedicated capability authentication. Signed provider events/unsubscribe/tracking retain their existing contracts. Neither is a generic admin bypass.

## Implemented routine machine capabilities

| Scope | Methods/routes | Exclusions |
|---|---|---|
| contacts:read | GET contacts list/search/detail and existing notes/interactions/follow-ups/connections/tags reads | No export without additional scope; no contact deletion, consent changes/import |
| contacts:export | GET `/api/contacts/export` | Explicit additional permission |
| contacts:notes | POST `/api/contacts/:id/notes` | No consent/suppression change |
| campaigns:read | GET campaigns, detail/status/copy, analytics export endpoints | No sending or approval |
| campaigns:drafts | POST campaigns; PUT campaign and copy | Existing DRAFT-only validation; status/approval fields not accepted |

No wildcard scope. Encoded separator/file-extension route tricks fail closed. Machine credentials never authenticate HTML/account/settings/cron routes and never mix with browser cookies or Origin headers. Audit records the scope/method/identity of authorized attempts; it does not falsely claim downstream success.

## Protected client adapter

`npm run crm:machine-request` accepts one bounded JSON object from a trusted host credential broker through stdin; it refuses terminal input and arguments. Fields: `origin` (exact approved CRM HTTPS origin, or loopback local proof), `method`, `path`, `token` (in-memory protected broker value), optional `body`. Broker must retrieve the token by protected store reference and pipe it without shell interpolation, command arguments, transcript output or environment overrides. Adapter rejects redirects and unsupported route/method combinations. It prints only the requested business response, and sanitized generic failure. No token is generated or printed by the adapter.

The private operator UI generates tokens using browser crypto, keeps them masked, and supports explicit private clipboard/password-manager transfer to the approved store before issuing. Store only the protected reference in agent configuration. Issuance, expiry, rotation and revocation use distinct named identities. Choose smallest scope set; contact export is not implied by contacts read.

## Evidence and activation limits

Synthetic real-HTTP tests show machine read200, draft201 with injected SENDING ignored/result DRAFT, send/test/resume/retry/review403, revocation401, and independent human password changes. Protected operator HTTP tests cover Host/Origin rejection and masked UI; database tests cover recovery/session revocation, scopes/rotation/expiry, metadata omission of hashes, and audit retention.

No live named machine identity or broker binding exists yet. A deployment must verify the actual routine agent's protected-store transport, intended workflows, scope-denied behavior and token rotation before removing any old dependency. Source inventory is evidence of inspected scripts, not a claim to have exhaustively found every historical operator script.
