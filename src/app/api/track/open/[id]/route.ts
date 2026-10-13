import { NextRequest, NextResponse } from 'next/server'
import { verifyOpenToken } from '@/lib/email/tokens'
import { recordTracking } from '@/lib/email/analytics-capture'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer' }
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const token = request.nextUrl.searchParams.get('t')
  const verified = token && token.length < 4000 ? verifyOpenToken(token) : null
  if (!verified || verified.recipientId !== id) return new NextResponse(null, { status: 400, headers })
  try {
    const recorded = await recordTracking({ ...verified, kind: 'OPENED' })
    if (!recorded) return new NextResponse(null, { status: 404, headers })
  } catch { return new NextResponse(null, { status: 503, headers }) }
  return new NextResponse(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'), { headers: { ...headers, 'Content-Type': 'image/gif' } })
}
export async function HEAD() { return new NextResponse(null, { status: 405, headers }) }
