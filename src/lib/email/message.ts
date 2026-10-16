import { attributionContext, attributedUrl, isProtectedTrackingUrl, type AttributionContext } from './attribution'
import { decodeHTMLAttribute } from 'entities'
import { wrapInTemplate, personalizeContent } from '@/lib/email-template'
import { createTrackingToken, createUnsubscribeToken, safeHttpUrl } from './tokens'
import type { EmailMessage } from './types'

interface CampaignData {
  id: string
  subject: string
  fromName: string
  fromEmail: string
  replyToEmail?: string | null
  content: string
  previewText?: string | null
}

interface RecipientData {
  id: string
  contactId: string
  email: string
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.BASE_URL || 'https://crm.companytheatre.ca'
}

export function wrapLinksForTracking(html: string, recipientId: string, baseUrl = appUrl(), campaignId?: string, attribution?: AttributionContext): string {
  let position = 0
  // Anchor-local replacement preserves authored HTML, entities and attribute quoting.
  return html.replace(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi, (anchor: string) => {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(anchor)
    if (!href) return anchor
    const safe = safeHttpUrl(decodeHTMLAttribute(href[1] ?? href[2] ?? href[3]))
    if (!safe || safe.pathname.startsWith('/unsubscribe/') || safe.pathname.startsWith('/api/unsubscribe/')) return anchor
    if (attribution && isProtectedTrackingUrl(safe)) return anchor
    position++
    const image = /<img\b/i.test(anchor)
    const alt = /\balt=["']([^"']*)["']/i.exec(anchor)?.[1]
    const text = decodeHTMLAttribute(anchor.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
    const label = `${image ? 'Image' : 'Link'} ${position}: ${(image ? alt : text) || safe.hostname}`.slice(0, 180)
    const placement = campaignId ? { campaignId, linkKey: `placement-${position}`, label } : undefined
    const token = createTrackingToken(recipientId, attribution ? attributedUrl(safe, attribution, position) : safe.toString(), placement)
    return anchor.replace(href[0], `href="${baseUrl}/api/track/click/${recipientId}?t=${encodeURIComponent(token)}"`)
  })
}

export function buildCampaignEmail(campaign: CampaignData, recipient: RecipientData): EmailMessage {
  const baseUrl = appUrl()
  const unsubscribeUrl = `${baseUrl}/unsubscribe/${createUnsubscribeToken(recipient.contactId, undefined, { campaignId: campaign.id, recipientId: recipient.id })}`
  const oneClickUrl = `${baseUrl}/api/unsubscribe/${createUnsubscribeToken(recipient.contactId, undefined, { campaignId: campaign.id, recipientId: recipient.id })}`

  const personalizedContent = personalizeContent(campaign.content, recipient)

  return {
    to: { email: recipient.email },
    from: { email: campaign.fromEmail, name: campaign.fromName },
    replyTo: { email: campaign.replyToEmail || campaign.fromEmail, name: campaign.fromName },
    subject: campaign.subject,
    html: wrapLinksForTracking(wrapInTemplate({
      content: personalizedContent,
      previewText: campaign.previewText || undefined,
      unsubscribeUrl,
    }), recipient.id, baseUrl, campaign.id, attributionContext(campaign)),
    headers: {
      'List-Unsubscribe': `<${oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Company-Theatre-Campaign-ID': campaign.id,
      'X-Company-Theatre-Recipient-ID': recipient.id,
    },
    metadata: {
      analytics_version: '1',
      campaign_id: campaign.id,
      recipient_id: recipient.id,
      one_click_unsubscribe_url: oneClickUrl,
    },
  }
}
