import { NextRequest, NextResponse } from 'next/server'
import { safeHttpUrl, verifyTrackingToken } from '@/lib/email/tokens'
import { recordTracking } from '@/lib/email/analytics-capture'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer' }
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.nextUrl.searchParams.get('t')
  if (!token || token.length > 16000) return NextResponse.json({ error: 'Invalid tracking token' }, { status: 400, headers })
  const verified = verifyTrackingToken(token)
  if (!verified.ok || verified.recipientId !== id) return NextResponse.json({ error: 'Invalid tracking token' }, { status: 400, headers })
  const target = safeHttpUrl(verified.url)
  if (!target) return NextResponse.json({ error: 'Unsafe redirect target' }, { status: 400, headers })
  try {
    const recorded = await recordTracking({ recipientId: id, campaignId: verified.placement?.campaignId, kind: 'CLICKED',
      linkKey: verified.placement?.linkKey, linkLabel: verified.placement?.label, targetUrl: target.toString() })
    if (!recorded) return NextResponse.json({ error: 'Link not found' }, { status: 404, headers })
  } catch {
    // Fail explicitly and allow retry; never falsely claim evidence was recorded.
    return NextResponse.json({ error: 'This link is temporarily unavailable. Please retry.' }, { status: 503, headers: { ...headers, 'Retry-After': '5' } })
  }
  return new NextResponse(null, { status: 302, headers: { ...headers, Location: target.toString() } })
}
export async function HEAD() { return new NextResponse(null, { status: 405, headers }) }
