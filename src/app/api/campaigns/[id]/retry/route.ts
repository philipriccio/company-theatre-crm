import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaign = await prisma.campaign.findUnique({ where: { id } })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const result = await prisma.campaignRecipient.updateMany({
    where: { campaignId: id, status: 'FAILED', lastErrorClass: 'transient' },
    data: { status: 'QUEUED', nextAttemptAt: new Date(), failedAt: null, leasedUntil: null, leaseOwner: null },
  })
  if (result.count > 0 && ['COMPLETED_WITH_FAILURES', 'FAILED'].includes(campaign.status)) {
    await prisma.campaign.update({ where: { id }, data: { status: 'QUEUED', completedAt: null } })
  }
  return NextResponse.json({ success: true, retried: result.count })
}
