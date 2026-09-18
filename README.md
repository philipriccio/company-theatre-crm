# Company Theatre CRM

Company Theatre-owned contact and campaign system with durable, provider-neutral email delivery.

## Capabilities

- Contact import, search, tags, notes, relationships, and follow-ups
- Campaign and template builder
- Frozen, approved campaign audiences
- Postgres-backed delivery queue with a separate worker
- Recipient leases, transient retries, unknown-outcome quarantine, pause/resume/cancel/retry
- Durable attempts, provider message IDs, normalized events, suppressions, and consent snapshots
- Signed unsubscribe and click tracking with RFC 8058 one-click unsubscribe
- Amazon SES v2 adapter plus signed SNS event ingestion

## Safety state

The durable queue and SES integration are local and **not deployed**. Production must keep `EMAIL_PROVIDER=disabled` until the migration, AWS/DNS configuration, seed tests, and deployment are explicitly approved. See `PROJECT.md`, `TESTING.md`, and `SES-HANDOFF.md`.

## Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS
- PostgreSQL and Prisma
- Amazon SES v2 provider adapter
- Docker/Coolify

## Local development

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Never put credentials in Git or command arguments. Use local ignored environment files and protected production secret entry.

## Verification

```bash
npm test
npx prisma validate
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

## Worker

Run the worker separately from the web process:

```bash
npm run email-worker
```

For a local, non-delivering acceptance test use `EMAIL_PROVIDER=mock`. Production remains inert with `EMAIL_PROVIDER=disabled`.

## Key routes

- `POST /api/campaigns/[id]/send` — freeze approval/audience and enqueue
- `GET /api/campaigns/[id]/status` — recipient delivery-state counts
- `POST /api/campaigns/[id]/pause|resume|cancel|retry` — operational controls
- `POST /api/campaigns/[id]/test` — provider-backed test send
- `GET /api/cron/send-scheduled` — release due scheduled campaigns to the worker
- `POST /api/webhooks/ses` — signed SNS/SES event ingestion
- `POST /api/unsubscribe/[token]` — signed one-click unsubscribe
- `GET /api/track/open/[id]` — open pixel
- `GET /api/track/click/[id]?t=...` — signed click redirect

## License

Private — The Company Theatre
