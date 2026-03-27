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
      createdAt: true,
    },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Count recipient stats
  const totalRecipients = await prisma.campaignRecipient.count({
    where: { campaignId: id },
  })

  const sent = await prisma.campaignRecipient.count({
    where: {
      campaignId: id,
      sentAt: { not: null },
    },
  })

  // Failed = total minus sent (only meaningful when campaign is done or sending)
  const failed =
    campaign.status === 'SENT' ? totalRecipients - sent : 0

  return NextResponse.json({
    status: campaign.status,
    totalRecipients,
    sent,
    failed,
    startedAt: campaign.createdAt.toISOString(),
    completedAt: campaign.sentAt?.toISOString() ?? null,
  })
}
