import sgMail from '@sendgrid/mail'

// Initialize SendGrid with API key
const apiKey = process.env.SENDGRID_API_KEY
if (apiKey) {
  sgMail.setApiKey(apiKey)
}

export interface EmailParams {
  to: string
  from: {
    email: string
    name: string
  }
  replyTo?: string
  subject: string
  html: string
  trackingSettings?: {
    clickTracking?: { enable: boolean }
    openTracking?: { enable: boolean }
  }
  customArgs?: Record<string, string>
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!apiKey) {
    console.error('SendGrid API key not configured')
    return false
  }

  try {
    await sgMail.send({
      to: params.to,
      from: params.from,
      replyTo: params.replyTo || params.from.email,
      subject: params.subject,
      html: params.html,
      trackingSettings: params.trackingSettings || {
        clickTracking: { enable: true },
        openTracking: { enable: true },
      },
      customArgs: params.customArgs,
    })
    return true
  } catch (error) {
    console.error('SendGrid error:', error)
    return false
  }
}

export async function sendBulkEmails(
  emails: EmailParams[],
  batchSize = 100,
  delayMs = 1000
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  // Process in batches to respect rate limits
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)
    
    const results = await Promise.allSettled(
      batch.map(email => sendEmail(email))
    )

    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        sent++
      } else {
        failed++
      }
    })

    // Delay between batches
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return { sent, failed }
}

// Import these from email-template for bulk campaign sending
import { wrapInTemplate, personalizeContent } from './email-template'
import { prisma } from './db'

interface CampaignContact {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
}

interface Campaign {
  id: string
  subject: string
  fromName: string
  fromEmail: string
  content: string
  previewText?: string | null
}

// Helper to wrap links for click tracking
function wrapLinksForTracking(html: string, recipientId: string, appUrl: string): string {
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match, url) => {
      if (url.includes('/unsubscribe/')) {
        return match
      }
      const encodedUrl = encodeURIComponent(url)
      return `href="${appUrl}/api/track/click/${recipientId}?url=${encodedUrl}"`
    }
  )
}

export async function sendBulkCampaign(
  campaign: Campaign,
  contacts: CampaignContact[]
): Promise<{ sent: number; failed: number }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  let sent = 0
  let failed = 0

  for (const contact of contacts) {
    // Get or create recipient record
    let recipient = await prisma.campaignRecipient.findUnique({
      where: {
        campaignId_contactId: {
          campaignId: campaign.id,
          contactId: contact.id,
        },
      },
    })

    if (!recipient) {
      recipient = await prisma.campaignRecipient.create({
        data: {
          campaignId: campaign.id,
          contactId: contact.id,
        },
      })
    }

    // Generate unsubscribe URL
    const unsubscribeToken = Buffer.from(contact.email).toString('base64url')
    const unsubscribeUrl = `${appUrl}/unsubscribe/${unsubscribeToken}`

    // Generate tracking pixel URL
    const trackingPixelUrl = `${appUrl}/api/track/open/${recipient.id}`

    // Personalize content
    let personalizedContent = personalizeContent(campaign.content, contact)
    
    // Add tracking pixel
    personalizedContent += `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`

    // Wrap links for click tracking
    personalizedContent = wrapLinksForTracking(personalizedContent, recipient.id, appUrl)

    // Wrap in template
    const html = wrapInTemplate({
      content: personalizedContent,
      previewText: campaign.previewText || undefined,
      unsubscribeUrl,
    })

    // Send email
    const success = await sendEmail({
      to: contact.email,
      from: {
        email: campaign.fromEmail,
        name: campaign.fromName,
      },
      subject: campaign.subject,
      html,
      customArgs: {
        campaign_id: campaign.id,
        recipient_id: recipient.id,
      },
    })

    if (success) {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: { sentAt: new Date() },
      })
      sent++
    } else {
      failed++
    }

    // Small delay every 10 emails to avoid rate limits
    if (sent % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return { sent, failed }
}
