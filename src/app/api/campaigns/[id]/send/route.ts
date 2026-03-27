import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { startBackgroundCampaignSend } from '@/lib/campaign-sender'

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

  // Send immediately — create recipients, set status, start background processing

  // Create all recipient records upfront
  await prisma.campaignRecipient.createMany({
    data: contacts.map((contact: { id: string }) => ({
      campaignId: id,
      contactId: contact.id,
    })),
    skipDuplicates: true,
  })

  // Update campaign status to SENDING
  await prisma.campaign.update({
    where: { id },
    data: { status: 'SENDING' },
  })

  // Start background email processing (fire-and-forget)
  startBackgroundCampaignSend(id, contacts)

  // Return immediately
  return NextResponse.json({
    success: true,
    queued: true,
    recipientCount: contacts.length,
  })
}
