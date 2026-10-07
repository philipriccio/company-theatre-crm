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

export function wrapLinksForTracking(html: string, recipientId: string, baseUrl = appUrl()): string {
  return html.replace(/href="(https?:\/\/[^\"]+)"/g, (match: string, url: string) => {
    if (url.includes('/unsubscribe/')) return match
    const safe = safeHttpUrl(url)
    if (!safe) return match
    const token = createTrackingToken(recipientId, safe.toString())
    return `href="${baseUrl}/api/track/click/${recipientId}?t=${encodeURIComponent(token)}"`
  })
}

export function buildCampaignEmail(campaign: CampaignData, recipient: RecipientData): EmailMessage {
  const baseUrl = appUrl()
  const unsubscribeUrl = `${baseUrl}/unsubscribe/${createUnsubscribeToken(recipient.contactId)}`
  const oneClickUrl = `${baseUrl}/api/unsubscribe/${createUnsubscribeToken(recipient.contactId)}`
  const trackingPixelUrl = `${baseUrl}/api/track/open/${recipient.id}`

  let personalizedContent = personalizeContent(campaign.content, recipient)
  personalizedContent += `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`
  personalizedContent = wrapLinksForTracking(personalizedContent, recipient.id, baseUrl)

  return {
    to: { email: recipient.email },
    from: { email: campaign.fromEmail, name: campaign.fromName },
    replyTo: { email: campaign.replyToEmail || campaign.fromEmail, name: campaign.fromName },
    subject: campaign.subject,
    html: wrapInTemplate({
      content: personalizedContent,
      previewText: campaign.previewText || undefined,
      unsubscribeUrl,
    }),
    headers: {
      'List-Unsubscribe': `<${oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      'X-Company-Theatre-Campaign-ID': campaign.id,
      'X-Company-Theatre-Recipient-ID': recipient.id,
    },
    metadata: {
      campaign_id: campaign.id,
      recipient_id: recipient.id,
      one_click_unsubscribe_url: oneClickUrl,
    },
  }
}
