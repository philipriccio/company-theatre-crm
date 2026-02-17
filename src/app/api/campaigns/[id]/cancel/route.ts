import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const campaign = await prisma.campaign.findUnique({
    where: { id },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.status !== 'SCHEDULED') {
    return NextResponse.json(
      { error: 'Can only cancel scheduled campaigns' },
      { status: 400 }
    )
  }

  // Delete queued recipients
  await prisma.campaignRecipient.deleteMany({
    where: { campaignId: id },
  })

  // Reset campaign to draft
  await prisma.campaign.update({
    where: { id },
    data: {
      status: 'DRAFT',
      scheduledAt: null,
    },
  })

  return NextResponse.json({ success: true })
}
