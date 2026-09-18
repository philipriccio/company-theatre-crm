import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const campaign = await prisma.campaign.findUnique({ where: { id } })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!['QUEUED', 'SCHEDULED', 'SENDING'].includes(campaign.status)) {
    return NextResponse.json({ error: 'Campaign cannot be paused from its current state' }, { status: 400 })
  }
  await prisma.campaign.update({ where: { id }, data: { status: 'PAUSED', pausedAt: new Date() } })
  return NextResponse.json({ success: true })
}
