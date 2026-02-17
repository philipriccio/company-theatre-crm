import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// Simple token encoding/decoding (in production, use proper encryption)
function decodeToken(token: string): string | null {
  try {
    return Buffer.from(token, 'base64url').toString('utf-8')
  } catch {
    return null
  }
}

export function encodeUnsubscribeToken(email: string): string {
  return Buffer.from(email).toString('base64url')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const email = decodeToken(token)
  
  if (!email) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  // Check if contact exists
  const contact = await prisma.contact.findUnique({
    where: { email },
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
  const email = decodeToken(token)
  
  if (!email) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  // Unsubscribe the contact
  const contact = await prisma.contact.update({
    where: { email },
    data: { unsubscribedAt: new Date() },
  })

  return NextResponse.json({
    success: true,
    email: contact.email,
  })
}
