import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { wrapInTemplate, personalizeContent } from '@/lib/email-template'
import { sendEmail } from '@/lib/sendgrid'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { email } = body

  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  // Get campaign
  const campaign = await prisma.campaign.findUnique({
    where: { id },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Create test contact data
  const testContact = {
    email,
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
  }

  // Generate unsubscribe URL (won't work for test, but shows formatting)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const unsubscribeToken = Buffer.from(email).toString('base64url')
  const unsubscribeUrl = `${appUrl}/unsubscribe/${unsubscribeToken}`

  // Personalize content
  const personalizedContent = personalizeContent(campaign.content, testContact)

  // Wrap in template
  const html = wrapInTemplate({
    content: personalizedContent,
    previewText: campaign.previewText || undefined,
    unsubscribeUrl,
  })

  // Send test email
  const success = await sendEmail({
    to: email,
    from: {
      email: campaign.fromEmail,
      name: campaign.fromName,
    },
    subject: `[TEST] ${campaign.subject}`,
    html,
  })

  if (!success) {
    return NextResponse.json({ error: 'Failed to send test email' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
