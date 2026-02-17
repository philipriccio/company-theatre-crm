# Company Theatre CRM — Technical Spec

**Version:** 0.1 (Draft)  
**Last updated:** 2026-02-17  
**Deadline:** March 31, 2026  
**Author:** Mildred

---

## Overview

A custom email CRM for The Company Theatre, replacing Brevo. Built for flexibility, privacy, and cost efficiency.

**Cost comparison:**
| Solution | Monthly Cost |
|----------|-------------|
| Brevo (18K contacts) | ~$25-50/month |
| Custom CRM + SendGrid | ~$5/month |
| Custom CRM + SES (at scale) | ~$2/month |

---

## Tech Stack

- **Frontend:** Next.js 16 + TypeScript + Tailwind CSS v4
- **Database:** PostgreSQL (via Supabase or self-hosted)
- **Email Provider:** SendGrid API (free tier: 100 emails/day)
- **Hosting:** Railway or Fly.io
- **Auth:** Simple admin auth (single-user, maybe magic link)

---

## Core Features (MVP)

### 1. Contact Management
- [ ] Import contacts from CSV (Keela export: 18,176 contacts)
- [ ] Contact list with search and filters
- [ ] Contact detail view (email, name, tags, engagement history)
- [ ] Add/edit/delete contacts
- [ ] Bulk actions (tag, delete, export)

### 2. Tagging & Segmentation
- [ ] Create/manage tags (e.g., "donor", "subscriber", "press", "jerusalem-attendee")
- [ ] Assign multiple tags per contact
- [ ] Create segments from tag combinations
- [ ] Smart segments (e.g., "opened last 3 campaigns")

### 3. Campaign Builder
- [ ] Create new campaign (subject, from name, content)
- [ ] Rich text editor or Markdown for email body
- [ ] Template system (save/reuse designs)
- [ ] Preview mode (desktop/mobile)
- [ ] Test send to admin email

### 4. Campaign Scheduling & Sending
- [ ] Send immediately or schedule for later
- [ ] Select recipients by segment or tag
- [ ] Batch sending (respect SendGrid rate limits)
- [ ] Queue management

### 5. Tracking & Analytics
- [ ] Open tracking (pixel)
- [ ] Click tracking (link wrapping)
- [ ] Per-campaign stats (sent, delivered, opened, clicked, bounced)
- [ ] Per-contact engagement history
- [ ] Dashboard with overview metrics

### 6. Compliance (CASL/CAN-SPAM)
- [ ] Unsubscribe link in every email (required)
- [ ] Unsubscribe management (one-click, honored immediately)
- [ ] Physical address in footer (required)
- [ ] Suppression list (never email unsubscribed contacts)

---

## Data Model (Draft)

```
contacts
  - id (uuid)
  - email (unique)
  - first_name
  - last_name
  - created_at
  - updated_at
  - unsubscribed_at (nullable)
  - metadata (jsonb)

tags
  - id (uuid)
  - name (unique)
  - color
  - created_at

contact_tags
  - contact_id (fk)
  - tag_id (fk)

campaigns
  - id (uuid)
  - name
  - subject
  - from_name
  - content (html/markdown)
  - status (draft/scheduled/sending/sent)
  - scheduled_at (nullable)
  - sent_at (nullable)
  - created_at

campaign_recipients
  - campaign_id (fk)
  - contact_id (fk)
  - sent_at
  - delivered_at
  - opened_at
  - clicked_at
  - bounced_at

campaign_links
  - id (uuid)
  - campaign_id (fk)
  - original_url
  - click_count
```

---

## Pages / Routes

- `/` — Dashboard (stats overview)
- `/contacts` — Contact list
- `/contacts/[id]` — Contact detail
- `/contacts/import` — CSV import
- `/tags` — Tag management
- `/campaigns` — Campaign list
- `/campaigns/new` — Create campaign
- `/campaigns/[id]` — Campaign detail/edit
- `/campaigns/[id]/preview` — Preview
- `/campaigns/[id]/stats` — Campaign analytics
- `/settings` — SendGrid API key, from address, physical address

---

## API Routes

- `POST /api/contacts/import` — CSV import
- `GET/POST/DELETE /api/contacts`
- `GET/POST/DELETE /api/tags`
- `GET/POST/PUT /api/campaigns`
- `POST /api/campaigns/[id]/send`
- `POST /api/campaigns/[id]/test`
- `GET /api/track/open/[id]` — Tracking pixel
- `GET /api/track/click/[id]` — Link redirect
- `GET /api/unsubscribe/[token]` — Unsubscribe handler

---

## Current Status

**Week 1 Progress (2026-02-17) — MVP COMPLETE! 🎉**
- ✅ Project scaffolded (Next.js 16 + TypeScript + Tailwind)
- ✅ Database schema (Prisma) — Contacts, Tags, Campaigns, Recipients, Templates
- ✅ Local PostgreSQL set up + **14,142 contacts imported**
- ✅ Dashboard with live stats
- ✅ Contacts list — search, filter by tag, pagination
- ✅ Contact detail page — info, tags, email history
- ✅ Contact edit page — full editing capability
- ✅ Tags page — grouped by category (shows, lists, other)
- ✅ Campaigns list — with open/click rate stats
- ✅ Campaign builder — name, subject, preview text, content editor
- ✅ Campaign detail page — preview, stats, send controls
- ✅ Campaign send flow — select all or by tag, test send, bulk send
- ✅ Settings page — SendGrid API key, sender details, CASL compliance
- ✅ Branded email template — responsive HTML with Company Theatre branding
- ✅ SendGrid integration — single + bulk sending with rate limiting
- ✅ Unsubscribe system — API + user-facing page (CASL compliant)
- ✅ Open tracking — 1x1 pixel embedded in emails
- ✅ Click tracking — link wrapping with redirect
- ✅ Templates page — save/reuse email designs
- ✅ Default template seeded

**Next steps:**
1. ✅ SendGrid API key configured
2. ✅ Sender verified (philip@companytheatre.ca)
3. ✅ Campaign scheduling (schedule for later)
4. ✅ Contact import page with CSV upload UI
5. ✅ SendGrid webhook integration (bounces, spam reports)
6. ✅ Docker deployment configuration
7. Test end-to-end email flow
8. Deploy to VPS for production (Railway or Fly.io)

**Week 1 Bonus — Drag & Drop Email Builder:**
- ✅ Block-based template editor
- ✅ 8 block types: Heading, Text, Image, Button, Divider, Spacer, Columns, Social
- ✅ Drag-and-drop reordering with @dnd-kit
- ✅ Properties panel for each block type
- ✅ Live preview mode
- ✅ Export to HTML
- ✅ Save/load templates from database
- ✅ Company Theatre branded header/footer in templates

## Timeline (6 weeks)

| Week | Focus |
|------|-------|
| 1 | Project setup, database schema, contact import |
| 2 | Contact management UI, tagging system |
| 3 | Campaign builder, template system |
| 4 | SendGrid integration, sending logic, scheduling |
| 5 | Tracking (opens/clicks), analytics dashboard |
| 6 | Compliance, testing, deploy to VPS, polish |

---

## Decisions Made

1. **Database:** Self-hosted Postgres on the VPS ✓
2. **Sending address:** `hello@companytheatre.ca` ✓
3. **Templates:** Branded template for MVP, drag-and-drop builder in future phase ✓

## Open Questions

1. **Keela CSV:** Need to review the export format and map fields

---

## Future Enhancements (Post-MVP)

- Drag-and-drop email builder
- A/B testing
- Automation sequences (welcome series, etc.)
- Donor integration (if needed)
- Multi-user access with roles

---

*This spec will evolve. Updated as decisions are made.*
