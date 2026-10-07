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

  if (!['SCHEDULED', 'QUEUED', 'PAUSED'].includes(campaign.status)) {
    return NextResponse.json(
      { error: 'Can only cancel campaigns before active sending has started or while paused' },
      { status: 400 }
    )
  }

  await prisma.$transaction([
    prisma.campaignRecipient.updateMany({
      where: { campaignId: id, status: 'QUEUED' },
      data: { status: 'CANCELLED', leasedUntil: null, leaseOwner: null },
    }),
    prisma.campaign.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    }),
  ])

  return NextResponse.json({ success: true })
}
