import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { verifyUnsubscribeToken } from '@/lib/email/tokens'
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
    const updated = await tx.contact.update({
      where: { id: existing.id }, data: { unsubscribedAt: existing.unsubscribedAt || now, solicitation: false },
    })
    await recordSuppression({
      email: updated.email, reason: 'unsubscribe', source: 'signed_unsubscribe', contactId: updated.id,
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
