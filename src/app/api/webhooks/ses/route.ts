import { NextRequest, NextResponse } from 'next/server'
import { verifySnsEnvelope, type SnsEnvelope } from '@/lib/email/sns'
import { ingestSesNotification } from '@/lib/email/ses-events'

export async function POST(request: NextRequest) {
  let envelope: SnsEnvelope
  try {
    envelope = await request.json() as SnsEnvelope
  } catch {
    return NextResponse.json({ error: 'Invalid SNS message' }, { status: 400 })
  }

  const verification = await verifySnsEnvelope(envelope)
  if (!verification.ok) return NextResponse.json({ error: 'Invalid SNS signature' }, { status: 401 })

  if (envelope.Type !== 'Notification') {
    return NextResponse.json({ error: 'SNS subscription confirmation must be completed manually in AWS' }, { status: 403 })
  }

  try {
    const result = await ingestSesNotification(envelope)
    return NextResponse.json({ received: true, ...result })
  } catch (error) {
    console.error('SES event ingestion failed:', error)
    return NextResponse.json({ error: 'Failed to process SES event' }, { status: 500 })
  }
}
