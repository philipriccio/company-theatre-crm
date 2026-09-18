import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaign = await prisma.campaign.findUnique({ where: { id } })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status !== 'PAUSED') {
    return NextResponse.json({ error: 'Only paused campaigns can be resumed' }, { status: 400 })
  }
  await prisma.campaign.update({ where: { id }, data: { status: campaign.scheduledAt && campaign.scheduledAt > new Date() ? 'SCHEDULED' : 'QUEUED', pausedAt: null } })
  return NextResponse.json({ success: true })
}
