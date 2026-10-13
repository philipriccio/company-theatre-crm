# Email analytics research and acceptance brief

Reviewed 2026-10-13. Primary public documentation, not competitor account access. This is product/design evidence, not proof that our implementation or production setup works.

## Primary sources

1. [Mailchimp: About Email Reports](https://mailchimp.com/help/about-email-campaign-reports/) — overview, unique recipients versus total activity, activity drilldowns/export, link performance, first-24-hour chart, complaints and unsubscribe attribution.
2. [Mailchimp: Bot activity](https://mailchimp.com/help/about-bot-activity/) — filtering does not delete underlying evidence; security scanners and privacy prefetch inflate counts; show filtering state consistently.
3. [Mailchimp: Apple privacy FAQ](https://mailchimp.com/help/apple-privacy-faq/) — preload can register opens without reading; missing image loads can hide reading; device/location/open-based automation conclusions are unreliable.
4. [Postmark: Stats API](https://postmarkapp.com/developer/api/stats-api) — separate unique and total opens/clicks, delivery problems, date ranges and explicit timezone; link-specific activity and aggregate time series.
5. [AWS SES event data](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html) — signed event payload semantics, open/click timestamps, click link/tags, optional isBotEvent Likely/Unlikely, bounce types, delivery delay, complaint information.
6. [AWS SES metrics FAQ](https://docs.aws.amazon.com/ses/latest/dg/faqs-metrics.html) — 60-day provider collection window; tracking inaccuracies from caching/privacy; one-recipient-per-send for attribution; ses:tags for link placement; ses:no-track to avoid duplicate click instrumentation; only HTML links/open pixels are tracked.

## Decisions for Company Theatre

- The question is who received, who has a recorded open, who has no recorded open, who bounced, and who clicked each specific link. Every headline needs a useful drilldown and matching export.
- Default reporting must distinguish recorded evidence from human reading. Never label lack of an event as proof of not reading; never label a click as a ticket purchase. No conversion/revenue claim without a separate verified integration.
- Store immutable event evidence, preserve earliest timestamps, tolerate out-of-order notifications and duplicate SNS deliveries. Counters alone are insufficient.
- Choose one canonical engagement source for each message/version. App redirects plus SES wrappers must not count twice. Keep provenance and explicit legacy coverage limitations.
- Distinct placements matter: hero image, top CTA, lower CTA, signature, footer sites, Instagram, lower photo. Repeated destination URLs must not erase placement identity. Preserve URL query semantics exactly.
- Show recorded unique recipients and total activity separately. Rates must state denominator; zero denominator is unavailable, not an invented percentage. Queued, suppressed and unknown legacy recipients must not appear as successfully delivered or no-open delivered recipients.
- Bot filtering is explainable and reversible. Provider Likely means likely automated; Unlikely is not proof of human action; absent classification is unknown. Do not market UA heuristics as reliable Apple MPP identification.
- Explicitly distinguish a delivery delay (retrying at provider) from final transient/soft bounce (SES has stopped retries). Hard bounce and complaint remain conservative suppression signals; reporting cannot re-enable anyone.
- Unsubscribes need campaign attribution from the link used, not a current global contact flag retroactively assigned to every campaign. Legacy unattributed unsubscribes remain unattributed.
- Tables should support search, useful filters, pagination and CSV; recipient details show a timeline and link activity. Charts require accessible text equivalents and explicit timezone.
- Campaign comparison uses the same definitions and evidence coverage. Empty/draft/test/legacy reports must be truthful; exclude test data by default when there is explicit test identification, not invented classification.
- No unnecessary IP/geolocation/device profiling. Never expose raw event payloads, signed tracking tokens or credentials in report pages/CSV.

## Acceptance cases owned by parent QA

1. A recipient with two recorded opens and three clicks across two placements yields one unique opener, one unique clicker, two opens and three clicks; placements remain distinct even with identical URLs.
2. Mirrored provider events do not double canonical totals. Duplicate SNS IDs do not add activity. Older arrivals update first timestamp correctly without reviving bounced/suppressed delivery.
3. Queued/suppressed/unknown rows are excluded from delivered-no-open. An unobserved old campaign is labelled incomplete rather than zero engagement.
4. Click URL preserves escaped query strings, anchors and non-ASCII text. Unsubscribe/mailto are not counted as ticket engagement.
5. Tampered/wrong-recipient tokens reject; malformed tracking cannot leak personal data; HEAD must not generate engagement; analytics exports stay behind admin auth and no-store.
6. Export rows match filters, encode commas/newlines safely and neutralize spreadsheet formulas. No raw payload, token URL or private network identifier leaks.
7. Desktop and 320/390px mobile: usable filters, readable cards/timeline, controlled table overflow, visible keyboard focus and empty/error feedback.
8. At least 14k synthetic recipients: bounded pagination, stable order, no browser full-audience download; aggregate queries not unbounded per-recipient N+1.
9. Actual builder → public handler → isolated database → report/API/export proof; synthetic payload tests alone are insufficient.
10. Existing draft save/review, queue/suppression and unsubscribe safety regressions pass. No production data mutation or email delivery during development.

## Deployment-specific known facts to preserve

Read source and local deployment evidence separately. Web base ba09b6e and worker base 6548139 differ. Current public routing deliberately excludes unsigned open pixel endpoint; changing to app-canonical signed pixels requires a narrow reviewed routing proposal plus approved production rollout. No reporting implementation alone proves live event collection. Existing rendering repair 4ceeacc is local only and must be integrated without dropping worker runtime isolation or draft-save fixes.
