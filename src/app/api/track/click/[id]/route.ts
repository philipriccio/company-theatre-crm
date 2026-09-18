import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { safeHttpUrl, verifyTrackingToken } from '@/lib/email/tokens'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.nextUrl.searchParams.get('t')

  if (!token) {
    return NextResponse.json({ error: 'Missing URL' }, { status: 400 })
  }

  const verified = verifyTrackingToken(token)
  if (!verified.ok || verified.recipientId !== id) {
    return NextResponse.json({ error: 'Invalid tracking token' }, { status: 400 })
  }

  const target = safeHttpUrl(verified.url)
  if (!target) {
    return NextResponse.json({ error: 'Unsafe redirect target' }, { status: 400 })
  }

  // Record the click (don't await - redirect immediately)
  prisma.campaignRecipient.update({
    where: { id },
    data: { 
      clickedAt: new Date(),
    },
  }).catch(() => {
    // Silently ignore errors
  })

  return NextResponse.redirect(target.toString(), { status: 302 })
}
