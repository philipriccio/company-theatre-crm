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
  const contact = await prisma.contact.update({
    where: { id: verified.contactId },
    data: { unsubscribedAt: now, solicitation: false },
  })

  await recordSuppression({
    email: contact.email,
    reason: 'unsubscribe',
    source: 'signed_unsubscribe',
    contactId: contact.id,
    metadata: { unsubscribedAt: now.toISOString() },
  })

  return NextResponse.json({
    success: true,
    email: contact.email,
  })
}
