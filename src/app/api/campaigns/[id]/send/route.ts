import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { enqueueCampaign } from '@/lib/email/queue'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { mode, tagIds, scheduledAt, approvalName, approvalNote } = body

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

  if (!approvalName || typeof approvalName !== 'string') {
    return NextResponse.json({ error: 'Approval name is required before enqueueing a production audience' }, { status: 400 })
  }

  try {
    const result = await enqueueCampaign(id, {
      mode: mode === 'tags' ? 'tags' : 'all',
      tagIds: mode === 'tags' ? tagIds || [] : [],
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      approvedBy: approvalName,
      approvalNote,
    })

    return NextResponse.json({
      success: true,
      queued: !result.scheduledAt,
      scheduled: !!result.scheduledAt,
      scheduledAt: result.scheduledAt?.toISOString() ?? null,
      recipientCount: result.recipientCount,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to enqueue campaign' }, { status: 400 })
  }
}
