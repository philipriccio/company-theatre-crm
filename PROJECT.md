# Company Theatre CRM — Project Overview

## 🎯 Vision
Email marketing and contact management CRM for The Company Theatre, Philip's boutique theatre company in Toronto. Send announcements, track subscribers, manage the theatre's audience database.

## 👤 For Whom
Philip Riccio — Artistic Director of The Company Theatre. Needs to send email campaigns for show announcements, especially the upcoming Jackpot Twins production (March 31, 2026 announcement).

## 🏗️ Current State (Feb 21, 2026)
**Status:** Deployed, functional
**URL:** https://crm.companytheatre.ca
**Auth:** Basic auth

### What's Built
- Contact management (14,142 contacts imported from Keela)
- 87 tags imported (show attendance, mailing lists)
- Campaign builder with HTML editor
- Drag & drop email template builder (8 block types)
- Campaign send flow (select recipients by tag)
- Test send functionality
- Open tracking (pixel) + click tracking (link wrapping)
- Unsubscribe system (CASL compliant)

### Pending
- Create hello@companytheatre.ca for sends
- Full production testing before March 31 campaign

## 📜 History

### Feb 17, 2026 — Built in Single Day
- Full CRM built and deployed in one sprint
- Contact import from Keela export
- Email campaign functionality via SendGrid
- Deployed to DigitalOcean + Coolify

## 🔧 Technical Stack
- **Framework:** Next.js 16 + TypeScript + Tailwind CSS v4
- **Database:** PostgreSQL via Prisma 6
- **Email:** SendGrid API
- **Hosting:** DigitalOcean via Coolify

## ⚠️ Critical Constraints
1. **March 31, 2026 deadline** — Must be ready for Jackpot Twins announcement
2. **CASL compliance** — All emails must have unsubscribe, respect opt-outs
3. **SendGrid verified sender** — philip@companytheatre.ca is verified

## 🚫 What NOT to Do
- Don't send campaigns without Philip's approval
- Don't modify contact data without asking
- Don't change email sender address without DNS verification

---
*Last updated: 2026-02-21 by Mildred*
