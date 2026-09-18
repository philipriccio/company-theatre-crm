import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      sentAt: true,
      completedAt: true,
      createdAt: true,
    },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const [totalRecipients, queued, sending, accepted, delivered, failed, suppressed, unknown] = await Promise.all([
    prisma.campaignRecipient.count({ where: { campaignId: id } }),
    prisma.campaignRecipient.count({ where: { campaignId: id, status: 'QUEUED' } }),
    prisma.campaignRecipient.count({ where: { campaignId: id, status: 'SENDING' } }),
    prisma.campaignRecipient.count({ where: { campaignId: id, status: 'ACCEPTED' } }),
    prisma.campaignRecipient.count({ where: { campaignId: id, status: 'DELIVERED' } }),
    prisma.campaignRecipient.count({ where: { campaignId: id, status: 'FAILED' } }),
    prisma.campaignRecipient.count({ where: { campaignId: id, status: 'SUPPRESSED' } }),
    prisma.campaignRecipient.count({ where: { campaignId: id, status: 'UNKNOWN' } }),
  ])

  return NextResponse.json({
    status: campaign.status,
    totalRecipients,
    queued,
    sending,
    accepted,
    delivered,
    failed,
    suppressed,
    unknown,
    sent: accepted + delivered,
    startedAt: campaign.createdAt.toISOString(),
    completedAt: campaign.completedAt?.toISOString() ?? campaign.sentAt?.toISOString() ?? null,
  })
}
