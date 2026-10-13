# Email analytics — local design

Research: [RESEARCH.md](RESEARCH.md), supplied by parent from fresh primary Mailchimp/AWS documentation.

## Questions answered

- Who has an open recorded? Who has confirmed delivery but no included open recorded?
- Who bounced (permanent vs transient/final), failed, was suppressed, complained, or unsubscribed from this email?
- Which person clicked which placement, including repeated buttons/images sharing one destination?
- How many unique recipients vs total captured events, first/last timestamps, and daily trends?
- How do campaigns compare without inventing unavailable historical totals or delivery evidence?

## Evidence model

Additive `EmailAnalyticsEvent` ledger: campaign/recipient, event kind, source, canonical flag, occurrence/receipt timestamps, optional placement/destination, provider automation classification and minimal outcome detail. No raw IP, user agent, headers, signed token, or full provider payload is retained in newly ingested provider records. Existing audit rows are not destroyed. `eventKey` gives SNS notification and unsubscribe idempotency. App redirect requests are individually recorded; repeated requests are separate recorded events, not unique people.

New messages: SES signed notifications are canonical opens; persisted app redirects are canonical clicks. SES click mirrors remain inspectable but do not inflate totals. Private app pixels are no longer emitted in new messages. Historical signed open route is hardened and remains private; no new public route is required. Old signed click and unsubscribe tokens continue to validate. Recipient `analyticsVersion=1` is written before dispatch; no provider is enabled by this release.

Legacy recipients retain their historical first-open/click flags. SES clicks remain their canonical source. Missing repeat counts and destination evidence are never fabricated. Recoverable old signed provider rows need the separately rehearsed historical backfill; a missing new ledger is not evidence no historical activity occurred.

First timestamps are conditional database updates, preserving earliest event time under late/out-of-order delivery. Late acceptance/delivery cannot regress failed/suppressed state; complaints remain suppressed after a late bounce/reject. SES transient bounce is final for that delivery, not a still-retrying state. DeliveryDelay is separately recorded with its actual delay timestamp.

## Metrics and confidence

- Recipient totals are frozen recipient rows, not current contact-list size.
- Delivery means receiving-mail-server acceptance, not inbox placement. Acceptance alone never supplies delivery denominator.
- Open/click rates count engaged **confirmed-delivered** recipients / confirmed-delivered recipients. Zero denominator is `—`.
- Current statuses and historical evidence can overlap (a complaint can follow delivery).
- “No open recorded” excludes current non-delivered status, bounced, complained and campaign-unsubscribed recipients. With the automation view active, it means no **included** open evidence.
- All recorded activity remains the default. Optional exclusion removes only AWS `Likely` events. AWS `Unlikely` is “unlikely automated,” not “human.” Missing classification and app clicks remain unknown. Filtering is reversible and applied to unique totals, captured totals, trend, recipient filters/timestamps and corresponding CSV exports.
- Captured total event counts may be lower than historical unique flags because old first-event fields cannot reconstruct missing ledger rows. Reports label partial coverage.
- No purchase/revenue attribution, geolocation, device inference, heatmap, or fabricated human-read claims.

## Placement identity and rendering

Signed click tokens bind recipient, campaign, original decoded URL, stable ordinal placement and readable label. Complete final HTML is wrapped, including default-template footer sites. HTML entities are decoded once before signing. Authored quoting is supported; mailto/unsafe schemes and unsubscribe destinations are excluded. Repeated identical URLs retain separate positions. Full-document campaign HTML remains authored HTML; no DOM serialization changes its design. Zero-click inventory is shown only where new tracking exists; legacy rows are not retroactively assigned placements.

## Reports, privacy and performance

Server-rendered admin views use bounded recipient/event pagination (50/100 rows), database aggregation and explicit America/Toronto dates. Comparison loads 20 campaigns. CSV people/events stream in 500-row chunks; filters match the explorer. All user-supplied cells are quoted and spreadsheet formula prefixes neutralized. API exports are no-store/private, no tokens/raw metadata returned. Timelines validate campaign+recipient scope.

Existing authenticated reverse-proxy admin catch-all protects report pages and exports. No new public auth exception is proposed. Public signed click requests persist before redirect; persistence failure is an explicit retryable 503, not silently dropped evidence. HEAD does not record clicks. Unsubscribe GET remains read-only; POST records contact suppression and attributed campaign event atomically.
