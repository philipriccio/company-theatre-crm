# Amazon SES handoff — Company Theatre CRM

The SES adapter and durable queue have local regression proof, not live delivery proof. See `reports/JT-CAMPAIGN-READINESS-2026-10-07.md` for current source/build/content/access-control blockers. Do not enable sending until every gate below is verified.

## Philip's first required step

Create or select a Company Theatre-owned AWS account with billing and MFA, then make SES available in **Canada Central (`ca-central-1`)**. Do not send credentials in chat. Add them later through the protected Coolify secret interface.

## AWS setup

1. In SES `ca-central-1`, verify `companytheatre.ca` as a domain identity using Easy DKIM.
2. Configure a custom MAIL FROM subdomain such as `bounce.companytheatre.ca`.
3. Create configuration set `company-theatre-campaigns`.
4. Create an SNS topic in `ca-central-1` for SES events and subscribe the HTTPS endpoint:
   `https://crm.companytheatre.ca/api/webhooks/ses`
5. Publish at least send/acceptance, delivery, bounce, complaint, reject, open, and click events from the configuration set to the SNS topic.
6. Complete the SNS subscription confirmation in AWS. The CRM deliberately refuses to follow confirmation URLs automatically.
7. Request SES production access for **Marketing** email. State that the list is Company Theatre's own consent-based audience, hard bounces and complaints are immediately suppressed, every message has visible and RFC 8058 one-click unsubscribe, and sending will ramp from an internal seed list.
8. Request a daily recipient quota above the current solicitable audience plus test traffic. Use shared IPs; a dedicated IP is not justified at this volume.

## DNS change set

Publish the exact Easy DKIM records AWS provides. Add the custom MAIL FROM MX and SPF records AWS provides without replacing Google Workspace mail records. Keep the legacy SendGrid records until SES seed tests pass. DMARC should remain monitored during the first proof and be tightened only after alignment is verified.

## Least-privilege application identity

Create a dedicated IAM principal for the CRM worker. Limit it to `ses:SendEmail` and `ses:SendRawEmail` in `ca-central-1` for the verified Company Theatre identity/configuration set. The web app does not need AWS send credentials; only the separate worker does.

## Protected production settings

Configure these through Coolify's protected environment UI, never in Git or chat:

- `EMAIL_PROVIDER=ses`
- `AWS_SES_REGION=ca-central-1`
- `AWS_SES_CONFIGURATION_SET=company-theatre-campaigns`
- `AWS_SNS_TOPIC_ARN` set to the exact event topic ARN
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for the dedicated worker identity
- `EMAIL_TOKEN_SECRET` as a randomly generated value of at least 32 characters, shared by web and worker

Keep `EMAIL_PROVIDER=disabled` until the database migration, web app, and separate worker are deployed and the seed test is authorized.

## Cutover proof

1. Take a fresh Postgres backup and export both solicitable and suppressed contacts.
2. Apply the migration with the worker stopped.
3. Verify legacy unresolved recipients are `UNKNOWN`; none may be queued automatically.
4. Deploy the web app with `EMAIL_PROVIDER=disabled`.
5. Deploy the separate worker service, also disabled, and verify health/logging.
6. Enable SES for a manually approved internal seed campaign only.
7. Prove acceptance, delivery, hard bounce, complaint, unsubscribe, signed webhook rejection, duplicate event idempotency, pause/resume/cancel, retry, and crash-after-provider-acceptance behavior.
8. Verify Gmail, Outlook/Hotmail, Yahoo, Apple, and Company Theatre inbox placement and headers.
9. Ramp an engaged segment first. Stop on reputation warnings, unexpected `UNKNOWN` outcomes, or abnormal bounce/complaint rates.

No full-list send occurs without Philip's explicit campaign approval.
