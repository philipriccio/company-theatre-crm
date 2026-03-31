# Company Theatre CRM — Project Overview

*Last updated: 2026-03-30 9:50 PM EST by Mildred*

## 🎯 Vision
Email marketing and contact management CRM for The Company Theatre. Send announcements, track subscribers, manage the theatre's audience database.

## 👤 For Whom
Philip Riccio — Artistic Director of The Company Theatre.

## 🏗️ Current State
**Status:** Deployed, fully functional, ready for March 31 announcement
**URL:** https://crm.companytheatre.ca
**Auth:** Basic auth (Philip/Riccio)
**Coolify UUID:** `xosc4kcg4g88s8s4s80gcgo4`
**GitHub:** `philipriccio/company-theatre-crm` (public, `stable-deploy` branch)
**Database:** PostgreSQL — container `y00oko88kgw44ok80wo0k0cs`, credentials `theatre`/`theatre_prod_2026!`/`company_theatre`

### What's Built
- Contact management (14,142 contacts imported from Keela)
- 87 tags imported (show attendance, mailing lists)
- Campaign builder with HTML editor
- Drag & drop email template builder (8 block types)
- Campaign send flow (select recipients by tag or all)
- Background send with progress tracking
- Test send (uses real contact name from CRM)
- Open tracking (pixel) + click tracking (link wrapping)
- Unsubscribe system (CASL compliant)
- **Tag management:** Remove from tag, add-to-tag search, quick tag button on every contact
- **Personalization:** `{{firstName}}`, `{{lastName}}`, `{{email}}` variables in campaign content
- Visual rebrand (Company Theatre styling)

### Email Campaign — Ready to Send
- **Campaign ID:** `cmn9j5me30000o30j2rtrzwoo`
- **Subject:** "We're back."
- **Content:** Personalized letter from Philip announcing Jackpot Twins
- **Text edits completed:** "And vowed" (not "We vowed"), cut "I couldn't be more thrilled that", added "I couldn't be more grateful to David and Hannah Mirvish", top CTA button added below hero image
- **VIP tag:** 78 contacts tagged for priority send
- **SendGrid:** Upgrade approved — full list send capability confirmed

### SendGrid Setup
- Account: Philip's Twilio/SendGrid account
- Verified sender: philip@companytheatre.ca
- API key configured in Coolify env vars

## 🔧 Technical Stack
- **Framework:** Next.js 16 + TypeScript + Tailwind CSS v4
- **Database:** PostgreSQL via Prisma 6
- **Email:** SendGrid API
- **Hosting:** DigitalOcean via Coolify

## ⚠️ Critical Constraints
1. **CASL compliance** — All emails must have unsubscribe, respect opt-outs
2. **SendGrid verified sender** — philip@companytheatre.ca
3. Don't send campaigns without Philip's approval
4. Don't modify contact data without asking

---

## 📜 History

### Feb 17, 2026 — Built in Single Day
Full CRM built and deployed. Contact import from Keela. Email campaigns via SendGrid.

### Mar 30, 2026 — Launch Prep
- Background send refactor (commit `4a93a33`)
- Test send personalization fix (commit `df2ad2b`)
- Tag management features (remove, add-to-tag search, quick tag)
- VIP list created (78 contacts)
- Campaign text edits (4 changes per Philip's notes)
- Top CTA button added to email
