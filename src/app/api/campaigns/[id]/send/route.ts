import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { wrapInTemplate, personalizeContent } from '@/lib/email-template'
import { sendEmail } from '@/lib/sendgrid'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { mode, tagIds, scheduledAt } = body

  // Get campaign
  const campaign = await prisma.campaign.findUnique({
    where: { id },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Campaign already sent' }, { status: 400 })
  }

  // Get recipients based on mode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const whereClause: any = {
    solicitation: true,
    unsubscribedAt: null,
  }

  if (mode === 'tags' && tagIds?.length > 0) {
    whereClause.tags = {
      some: { tagId: { in: tagIds } },
    }
  }

  const contacts = await prisma.contact.findMany({
    where: whereClause,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      fullName: true,
    },
  })

  if (contacts.length === 0) {
    return NextResponse.json({ error: 'No recipients found' }, { status: 400 })
  }

  // If scheduling, queue recipients and set scheduled status
  if (scheduledAt) {
    const scheduledTime = new Date(scheduledAt)
    
    // Create recipient records for all contacts
    await prisma.campaignRecipient.createMany({
      data: contacts.map((contact: { id: string }) => ({
        campaignId: id,
        contactId: contact.id,
      })),
      skipDuplicates: true,
    })

    // Update campaign to scheduled
    await prisma.campaign.update({
      where: { id },
      data: { 
        status: 'SCHEDULED',
        scheduledAt: scheduledTime,
      },
    })

    return NextResponse.json({
      success: true,
      scheduled: true,
      scheduledAt: scheduledTime.toISOString(),
      recipientCount: contacts.length,
    })
  }

  // Otherwise, send immediately
  // Update campaign status
  await prisma.campaign.update({
    where: { id },
    data: { status: 'SENDING' },
  })

  // Get app URL for tracking
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Send emails
  let sent = 0
  let failed = 0

  for (const contact of contacts) {
    // Create recipient record first to get tracking ID
    const recipient = await prisma.campaignRecipient.create({
      data: {
        campaignId: id,
        contactId: contact.id,
      },
    })

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
        campaign_id: id,
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

    // Small delay to avoid rate limits
    if (sent % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  // Update campaign status
  await prisma.campaign.update({
    where: { id },
    data: {
      status: 'SENT',
      sentAt: new Date(),
    },
  })

  return NextResponse.json({
    success: true,
    sent,
    failed,
    total: contacts.length,
  })
}

// Helper to wrap links for click tracking
function wrapLinksForTracking(html: string, recipientId: string, appUrl: string): string {
  // Match href attributes in anchor tags
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match, url) => {
      // Don't track unsubscribe links
      if (url.includes('/unsubscribe/')) {
        return match
      }
      const encodedUrl = encodeURIComponent(url)
      return `href="${appUrl}/api/track/click/${recipientId}?url=${encodedUrl}"`
    }
  )
}
