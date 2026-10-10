# Audience signup repair — local verified candidate, October 10

## Status
Not deployed; no production contacts changed; no emails, CRM config changes, pushes or external sends. Three isolated worktrees were based on the exact live revisions:

- `../crm-signup-release`: `b70bb993a51220ecf1597000519410e58edcdbbe`
- `../ct-signup-release`: `9bb54379b69b48b259c0103e6b8a2aaf5364d0b9`
- `../jt-signup-release`: `32c8d32e9aebd7cef140dba310688bd844d44e80`

## Implemented
- Dedicated transactional CRM `/api/website-signups` accepts only recognized website/version + explicit opt-in; authenticates a dedicated server-only token, not an admin fallback.
- Both website proxies require protected `CRM_URL`, `CRM_AUTH` (edge Basic authentication) and `CRM_WEBSITE_SIGNUP_TOKEN`; no credential fallback. Only the exact canonical CRM HTTPS origin is accepted, redirects refused, downstream timeout 10 seconds. CRM app needs `CRM_WEBSITE_SIGNUP_TOKEN` only; its existing edge handles Basic auth.
- Production browser origins are canonical HTTPS site and www site; does not compare browser origin to Next internal proxy hostname. Development/test loopback origins are allowed only outside production.
- Bounded JSON bytes (4096), five-second streamed-body deadline, field and consent validation; missing config/downstream rejection/malformed acknowledgement produces an error, never success.
- Single-process, no-PII burst cap: 60 requests/minute for each website process. This is supplemental, not distributed/per-IP protection. Configure the hosting edge per-IP limiter before launch, particularly if deploying replicas; do not treat spoofable forwarded headers as identity.
- Case-insensitive matching; existing names/metadata preserved; concurrent signup serialized with contact/suppression table locks; late tag/evidence failures roll back the whole transaction. No schema migration.
- Existing `solicitation=false` is ambiguous legacy do-not-contact and remains false, even with a new opt-in. Unsubscribe/global suppression always remain blocked. New unsuppressed people become solicitable; existing solicitable people remain so. Review-required requests get recorded as `express_opt_in_needs_review`, HTTP 202 and truthful non-subscription copy. No self-serve resubscribe bypass.
- Append-only ConsentEvidence includes timestamp, normalized email, exact consent text/version, source site and subscribed outcome. Existing `Website Signup` and `Jackpot Website` tag labels retained, so current segments are not split. No IP, campaign URL or visitor PII added to analytics; JT success event fires only for subscribed outcome.
- Both CT form components and JT modal now have unchecked required consent checkboxes, accessible input labels, error/review states. Modal remains reachable on short mobile screens.

## Verification
- `CRM_BROWSER_PROOF=1 ./scripts/test-website-signup-local.sh`: **9 passed, 0 skipped**. Creates fresh Unix-socket-only PostgreSQL, applies existing migrations with zero schema drift, starts loopback CRM HTTP bridge using actual route handler and both actual Next production site servers, tears everything down.
- Browser forms at 1440/390/320 submitted to isolated DB: every new contact proved solicitable; source/tag/consent evidence checked through proxy integration. 202 review-required and 502 downstream error never claim subscribed. No page horizontal overflow. Mobile screenshots visually inspected.
- Concurrent case-normalized duplicates create one contact; separate consent events retained. Global suppression, unsubscribe, legacy no-solicitation preserved. Conflicting legacy case identities refuse; late evidence failure rolls back contact. Canonical/www origins accepted behind internal host; foreign/missing origins rejected. Oversize/malformed bodies and rate limit covered.
- All three production builds and independent typechecks passed. Worktree dependency symlinks initially failed Turbopack; APFS cloned dependency directories resolved this without changing app configuration.
- CRM full offline tests: **25 passed, 2 DB-gated skipped** (DB signup proof run separately above).
- CRM scoped ESLint clean. JT scoped ESLint zero errors, four existing warnings. CT native lint remains blocked by its pre-existing malformed eslint.config.mjs; changed files pass scoped lint using the sibling JT Next flat config. No lint config was changed.
- Knowledge graphs queried before edits and rebuilt afterward. Frontend dependency scope: CT shared modal used from homepage/footer/JT page; newsletter component currently unused by rendered routes but fixed for safe reuse. JT page remains the sole modal owner. CRM route introduces isolated intake only, no campaign/worker behavior changed.

## Deployment dependency order — not executed
1. Protected configuration: generate a new dedicated `CRM_WEBSITE_SIGNUP_TOKEN` via secret store; configure CRM + both websites. Set protected `CRM_AUTH` independently on each website using legitimate edge access (JT currently lacks it; never reuse its retired embedded fallback). `CRM_URL` must be canonical CRM HTTPS URL. None is a NEXT_PUBLIC variable.
2. Deploy CRM intake first; leave provider disabled and admin edge protection intact. Confirm authenticated server-to-server token headers survive edge proxy. Do not add broad public CRM bypass routes.
3. Deploy both websites with updated consent/version + proxy + required config; apply edge abuse throttling. Coordinate all configuration in the rollout, otherwise proxies fail closed.
4. Separately authorized minimal production signup proof must confirm form → contact/tag/evidence, duplicates and suppressed handling without emails. Verify rollback uses previous websites plus CRM configuration, never revives hardcoded credentials. Since old handlers are unsafe, a temporary disabled form is preferable during rollback.
5. Existing historical website contacts need a consent/no-solicitation review; this change deliberately does not bulk reinterpret old records or backfill invented consent.

## Remaining limits
- This proves local end-to-end behavior, not production credentials/routing/DB privileges or live visitor signups.
- Single-process limiter resets on restart; edge/distributed protection remains rollout dependency.
- Table locks serialize intake and ordinary contact/suppression writes briefly; suitable for low-volume theatre list, monitor contention before scaling.
- Explicit opt-in is captured; no confirmation email/double-opt-in or new sending path is implemented. Campaign send readiness remains a separate task.
- Future UTM attribution and preference-centre/product work are not included; source site is reliable now.
