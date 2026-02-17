import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendBulkCampaign } from '@/lib/sendgrid'

export const dynamic = 'force-dynamic'

// This endpoint is called by cron to process scheduled campaigns
export async function GET() {
  try {
    // Find campaigns that are scheduled and due
    const now = new Date()
    const dueCampaigns = await prisma.campaign.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: {
          lte: now,
        },
      },
    })

    if (dueCampaigns.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No campaigns due' })
    }

    const results = []

    for (const campaign of dueCampaigns) {
      try {
        // Mark as sending
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'SENDING' },
        })

        // Get recipients that were queued for this campaign
        const recipients = await prisma.campaignRecipient.findMany({
          where: { campaignId: campaign.id },
          include: { contact: true },
        })

        if (recipients.length === 0) {
          // No recipients queued - mark as sent (empty)
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: 'SENT', sentAt: now },
          })
          results.push({ campaignId: campaign.id, sent: 0, status: 'completed_empty' })
          continue
        }

        // Send emails
        const contacts = recipients.map(r => ({
          id: r.contact.id,
          email: r.contact.email,
          firstName: r.contact.firstName,
          lastName: r.contact.lastName,
          fullName: r.contact.fullName,
        }))

        await sendBulkCampaign(campaign, contacts)

        // Mark as sent
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'SENT', sentAt: now },
        })

        results.push({ campaignId: campaign.id, sent: contacts.length, status: 'completed' })
      } catch (error) {
        console.error(`Failed to send campaign ${campaign.id}:`, error)
        
        // Revert to scheduled status so it can be retried
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'SCHEDULED' },
        })
        
        results.push({ 
          campaignId: campaign.id, 
          status: 'failed', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        })
      }
    }

    return NextResponse.json({ 
      processed: dueCampaigns.length, 
      results 
    })
  } catch (error) {
    console.error('Cron job failed:', error)
    return NextResponse.json(
      { error: 'Failed to process scheduled campaigns' },
      { status: 500 }
    )
  }
}
