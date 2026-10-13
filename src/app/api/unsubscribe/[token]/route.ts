import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { verifyUnsubscribeToken } from '@/lib/email/tokens'
import { firstTimestamp } from '@/lib/email/analytics-capture'
import { recordSuppression } from '@/lib/email/events'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const verified = verifyUnsubscribeToken(token)
  
  if (!verified.ok) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const contact = await prisma.contact.findUnique({
    where: { id: verified.contactId },
    select: { id: true, email: true, unsubscribedAt: true },
  })

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  return NextResponse.json({
    email: contact.email,
    alreadyUnsubscribed: !!contact.unsubscribedAt,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const verified = verifyUnsubscribeToken(token)
  
  if (!verified.ok) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const now = new Date()
  const contact = await prisma.$transaction(async tx => {
    const existing = await tx.contact.findUnique({ where: { id: verified.contactId } })
    if (!existing) return null
    if (verified.attribution) {
      const recipient = await tx.campaignRecipient.findFirst({ where: { id: verified.attribution.recipientId, campaignId: verified.attribution.campaignId, contactId: existing.id } })
      if (!recipient) throw new Error('Invalid unsubscribe attribution')
      await firstTimestamp(tx, recipient.id, 'unsubscribedAt', now)
      await tx.emailAnalyticsEvent.upsert({ where: { eventKey: `unsubscribe:${recipient.id}` }, update: {}, create: {
        eventKey: `unsubscribe:${recipient.id}`, campaignId: recipient.campaignId, recipientId: recipient.id,
        kind: 'UNSUBSCRIBED', source: 'unsubscribe', occurredAt: now,
      } })
    }
    const updated = await tx.contact.update({
      where: { id: existing.id }, data: { unsubscribedAt: existing.unsubscribedAt || now, solicitation: false },
    })
    await recordSuppression({
      email: updated.email, reason: 'unsubscribe', source: 'signed_unsubscribe', contactId: updated.id,
      campaignId: verified.attribution?.campaignId, recipientId: verified.attribution?.recipientId,
      metadata: { unsubscribedAt: updated.unsubscribedAt!.toISOString() },
    }, tx)
    return updated
  })
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  return NextResponse.json({
    success: true,
    email: contact.email,
  })
}
