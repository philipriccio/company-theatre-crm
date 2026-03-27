import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/sendgrid'
import { wrapInTemplate, personalizeContent } from '@/lib/email-template'

interface CampaignContact {
  id: string
  email: string
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
}

const BATCH_SIZE = 50
const BATCH_DELAY_MS = 1500

// Helper to wrap links for click tracking
function wrapLinksForTracking(
  html: string,
  recipientId: string,
  appUrl: string
): string {
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match: string, url: string) => {
      if (url.includes('/unsubscribe/')) {
        return match
      }
      const encodedUrl = encodeURIComponent(url)
      return `href="${appUrl}/api/track/click/${recipientId}?url=${encodedUrl}"`
    }
  )
}

/**
 * Process campaign emails in the background.
 * This function is fire-and-forget — it runs detached from the HTTP request lifecycle.
 */
export function startBackgroundCampaignSend(
  campaignId: string,
  contacts: CampaignContact[]
): void {
  // Detach from the request lifecycle
  setTimeout(async () => {
    await processCampaignEmails(campaignId, contacts)
  }, 0)
}

async function processCampaignEmails(
  campaignId: string,
  contacts: CampaignContact[]
): Promise<void> {
  console.log(
    `[campaign-sender] Starting background send for campaign ${campaignId} — ${contacts.length} recipients`
  )

  // Load campaign data
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  })

  if (!campaign) {
    console.error(
      `[campaign-sender] Campaign ${campaignId} not found, aborting`
    )
    return
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  let sent = 0
  let failed = 0

  // Process in batches
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE)
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(contacts.length / BATCH_SIZE)

    console.log(
      `[campaign-sender] Processing batch ${batchNumber}/${totalBatches} (${batch.length} emails)`
    )

    for (const contact of batch) {
      try {
        // Get existing recipient record (created before background processing started)
        const recipient = await prisma.campaignRecipient.findUnique({
          where: {
            campaignId_contactId: {
              campaignId,
              contactId: contact.id,
            },
          },
        })

        if (!recipient) {
          console.error(
            `[campaign-sender] No recipient record for contact ${contact.id}, skipping`
          )
          failed++
          continue
        }

        // Skip already-sent recipients (in case of retry)
        if (recipient.sentAt) {
          sent++
          continue
        }

        // Generate unsubscribe URL
        const unsubscribeToken = Buffer.from(contact.email).toString(
          'base64url'
        )
        const unsubscribeUrl = `${appUrl}/unsubscribe/${unsubscribeToken}`

        // Generate tracking pixel URL
        const trackingPixelUrl = `${appUrl}/api/track/open/${recipient.id}`

        // Personalize content
        let personalizedContent = personalizeContent(
          campaign.content,
          contact
        )

        // Add tracking pixel
        personalizedContent += `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`

        // Wrap links for click tracking
        personalizedContent = wrapLinksForTracking(
          personalizedContent,
          recipient.id,
          appUrl
        )

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
            campaign_id: campaignId,
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
      } catch (error) {
        console.error(
          `[campaign-sender] Error sending to ${contact.email}:`,
          error
        )
        failed++
      }
    }

    // Delay between batches to respect rate limits
    if (i + BATCH_SIZE < contacts.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  // Update campaign status to SENT
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'SENT',
      sentAt: new Date(),
    },
  })

  console.log(
    `[campaign-sender] Campaign ${campaignId} complete — sent: ${sent}, failed: ${failed}`
  )
}
