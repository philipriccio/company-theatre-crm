import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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

    const results: Array<{ campaignId: string; status: string }> = []

    for (const campaign of dueCampaigns) {
      try {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'QUEUED' },
        })
        results.push({ campaignId: campaign.id, status: 'queued_for_worker' })
      } catch (error) {
        console.error(`Failed to send campaign ${campaign.id}:`, error)
        results.push({ campaignId: campaign.id, status: 'failed_to_queue' })
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
