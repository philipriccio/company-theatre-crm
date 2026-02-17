# Company Theatre CRM

Custom email CRM for The Company Theatre, built to replace Brevo with better control and lower costs.

## Features

- **Contact Management**: Import, search, and manage 14,000+ contacts
- **Tagging System**: 87 tags for segmentation (show attendance, mailing lists, donors)
- **Campaign Builder**: Drag-and-drop email template editor with 8 block types
- **Scheduling**: Send immediately or schedule for later
- **Tracking**: Open rates, click tracking, and engagement history
- **Compliance**: CASL/CAN-SPAM compliant with one-click unsubscribe

## Tech Stack

- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS v4
- **Database**: PostgreSQL with Prisma ORM
- **Email**: SendGrid API
- **Deployment**: Docker / Railway / Fly.io

## Local Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database and SendGrid credentials

# Run database migrations
npx prisma migrate dev

# Start dev server
npm run dev
```

## Production Deployment

### Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# Run migrations
docker-compose exec crm npx prisma migrate deploy
```

### Railway / Fly.io

1. Connect your repository
2. Set environment variables:
   - `DATABASE_URL`
   - `SENDGRID_API_KEY`
   - `NEXT_PUBLIC_APP_URL`
3. Deploy

## SendGrid Setup

1. Create a SendGrid account
2. Verify your sender domain or email address
3. Generate an API key with full access
4. (Optional) Set up Event Webhook for bounce handling:
   - URL: `https://your-domain.com/api/webhooks/sendgrid`
   - Events: delivered, open, click, bounce, dropped, spamreport, unsubscribe

## DNS Records

For email deliverability, add these DNS records:

| Type | Host | Value |
|------|------|-------|
| CNAME | em5541 | u27917687.wl183.sendgrid.net |
| TXT | _dmarc | v=DMARC1; p=none; rua=mailto:dmarc@companytheatre.ca |

Note: Skip DKIM records if using Google Workspace (to avoid conflicts).

## Scheduled Campaigns

A cron job runs every minute to process scheduled campaigns. In Docker, this is handled by the `cron` service. For Railway/Fly.io, set up an external cron to hit:

```
GET /api/cron/send-scheduled
```

## API Routes

- `GET/POST /api/contacts` - Contact management
- `POST /api/contacts/import` - CSV import
- `GET/POST /api/campaigns` - Campaign management
- `POST /api/campaigns/[id]/send` - Send or schedule campaign
- `POST /api/campaigns/[id]/test` - Send test email
- `GET /api/cron/send-scheduled` - Process scheduled campaigns
- `POST /api/webhooks/sendgrid` - SendGrid event webhooks
- `GET /api/track/open/[id]` - Open tracking pixel
- `GET /api/track/click/[id]` - Click tracking redirect
- `GET /api/unsubscribe/[token]` - Unsubscribe handler

## License

Private - The Company Theatre
