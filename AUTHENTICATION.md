# Personal CRM accounts — staged October 31, 2026

**Local candidate only. No deployment, live account enrollment, production database change, proxy change or email send.** Baseline a5e7ba8 is the October 24 website-signup-label release, including October 22 security patches. Existing production Basic authentication is unchanged.

## User workflow

Sign in using a personal email/password, then Settings → Your account → Change password. Enter current password, new password and confirmation. Password managers, paste, spaces and Unicode work; 15–128 Unicode codepoints (NFC-normalized), no mandatory composition or routine expiry. Password change rotates this browser session and revokes all prior sessions atomically. Failed validation keeps form input. Logout revokes the server session, not just the cookie. Accounts have seven-day absolute sessions, no disruptive short idle logout, and can be disabled centrally. All current human accounts have the same existing CRM capabilities; roles are not invented here.

The local blocklist is deliberately small, **not a comprehensive breached-password check**. Adopt a maintained offline common/compromised-password corpus before public cutover. Do not send raw passwords to any external service.

## Security boundary

- Default-deny Node proxy covers all paths, including extension-like paths and future API routes. Every existing private API also calls the shared guard directly; public exemptions apply only to the proxy, never these private guards. Admin layout/account page validate sessions independently.
- Passwords use salted scrypt N=32768/r=8/p=3, 64-byte key. Tokens use 256-bit random entropy; only SHA-256 token digests persist. Seven-day cookies are HttpOnly, SameSite=Lax, Path=/, and Secure with `__Host-` prefix on HTTPS. The non-Secure local cookie is permitted only for explicitly configured loopback HTTP origins.
- `CRM_AUTH_ORIGIN` is required and exact (no trailing slash). Production requires HTTPS. Incoming proxy username headers are never identity. No shared-account fallback, registration, public reset endpoint or automatic email is introduced.
- All unsafe authenticated requests and login/logout require exact configured Origin, reject cross/same-site Fetch Metadata, and fail closed on missing configuration/database availability. Authentication JSON reads are capped at 8 KiB and five seconds. Existing signed public handlers retain their own validation, limits and capabilities.
- Public exceptions are exact methods/paths: GET/HEAD login/static favicon/assets, signed unsubscribe page and tracking; POST signed webhooks, website signup and scratch intake, login; GET/POST unsubscribe API. No directory-wide API exemption. Public handler code is unchanged.
- Database-backed fixed-window throttling: eight login attempts/account and 120 globally per 15 minutes; eight password-change attempts/user per 15 minutes. No untrusted forwarded-IP limiter. Throttles intentionally do not reset on success. This trades bounded denial-of-service susceptibility for an enforceable small-team ceiling; production edge rate limits and alerting remain desirable.
- User row locking serializes login and password change; change rechecks active session under lock, deletes all previous sessions, then issues one new token in the same transaction. A lost successful response can require signing in with the new password; the form says so.
- Successful login/password-change audit events contain user ID/event/time, no passwords/tokens. Failure counters are hashed keys, not plain email addresses. Add operational retention/monitoring before launch; expired sessions/throttle rows may be safely purged separately, never audit history automatically.
- Legacy state-changing GET `/api/cron/send-scheduled` now returns405; authenticated same-origin POST is the replacement. There is no inferred scheduler approval or machine bypass. Send approval persistence now uses authenticated name/email/ID, not user-supplied `approvalName`; the existing explicit confirmation UI remains.
- CSP intentionally not added blindly: campaign preview/copy editor have existing sandbox/frame requirements. Existing email behavior, delivery-disabled configuration and recipient data are untouched.

## Cutover gates — none executed

1. Obtain rollout approval with a fresh production backup, exact image/source verification, and migration/grant rehearsal using the runtime least-privilege role. Additive migration creates only four auth tables. Keep provider disabled and delivery counts/queue unchanged.
2. Build a reviewed host-owned **masked** enrollment/recovery procedure for named Philip/Janice accounts. It must accept secrets privately, normalize email, call the same hasher and write an account transactionally; recovery must revoke all sessions and audit the action. No enrollment CLI/UI is shipped here. Never put credentials in shell arguments, chat, logs, source or normal environment overrides. This missing protected enrollment/recovery tooling is an explicit launch blocker.
3. Configure exact production `CRM_AUTH_ORIGIN` through protected hosting configuration. Keep the current Basic gate during staged account verification. Verify both users can sign in/change password/logout; do not collect their chosen passwords.
4. Migrate Mildred/Janet machine access separately to a reviewed least-privilege identity/capability with narrow route/method scopes and its own revocation/audit. The current Basic-only admin API clients would receive401 with this candidate. Inventory them first; do not deploy this and discover the break afterward. Website/scratch intake bearer contracts and signed provider endpoints remain unchanged, not general machine admin access.
5. Inventory any caller of the legacy cron GET; approve/rework it explicitly before cutover. Existing standalone worker is not session gated, and remains governed by its own provider/queue controls.
6. Replace small password blocklist with a maintained offline corpus; test protected enrollment and recovery; decide audit/throttle cleanup and alerts; verify production proxy normalization/headers, TLS cookies and protected runtime table grants.
7. Run authenticated human and machine read/write smoke tests without sending mail, signed public-route regression, backups/restore and revocation tests. Only then consider removing the duplicate proxy password prompt under a separately reviewed routing change. Verify every route directly against the app origin cannot bypass auth.

## Rollback

Keep the Basic gate in place. Revert to prior approved application image (a5e7ba8 baseline) without dropping additive auth tables; preserve audit data. This restores Basic-only behavior, not personal-account protection. Do not roll back mailing data or reset any shared database role. Revoke staged sessions explicitly if aborting a cutover. Review live source/image again before any future deployment.

## Local evidence

`npm test`: offline checks, DB suites deliberately skip. `scripts/test-auth-local.sh`: fresh Unix-socket-only PostgreSQL, migration/drift check, real DB races/revocation/throttles. `CRM_AUTH_BROWSER_PROOF=1 scripts/test-auth-local.sh`: production-build Chromium proof at1440/390/320, creates/deletes synthetic account, destroys server/database afterward. Build first with `npm run build -- --webpack` under inert database/email settings in TESTING.md. No credentials emitted. Screenshots include top and scrolled actions on small screens; inner workspace scrolling is expected.

The older readiness harness now creates a real synthetic session before invoking private routes; it still verifies authenticated intake, signed unsubscribe, queue/suppression, idempotency and disabled/mock delivery behavior. Other historical manual/browser harnesses may require equivalent fixture-session upgrades; their past results are not evidence for this release.
