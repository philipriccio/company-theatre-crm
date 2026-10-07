import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { wrapInTemplate, personalizeContent } from '@/lib/email-template'
import { getEmailProvider } from '@/lib/email/providers'
import { createUnsubscribeToken } from '@/lib/email/tokens'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { email } = body

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  // Get campaign
  const campaign = await prisma.campaign.findUnique({
    where: { id },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Look up real contact data if they exist in the CRM, otherwise use fallback
  const realContact = await prisma.contact.findFirst({
    where: { email: { equals: email.trim(), mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, fullName: true, email: true, solicitation: true, unsubscribedAt: true },
  })

  const suppression = await prisma.globalSuppression.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (!realContact || suppression || !realContact.solicitation || realContact.unsubscribedAt) {
    return NextResponse.json({ error: 'Test recipient must be an existing eligible, unsuppressed contact' }, { status: 400 })
  }
  const testContact = realContact
  const tokenContactId = realContact.id
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const unsubscribeToken = createUnsubscribeToken(tokenContactId)
  const unsubscribeUrl = `${appUrl}/unsubscribe/${unsubscribeToken}`
  const oneClickUrl = `${appUrl}/api/unsubscribe/${unsubscribeToken}`

  // Personalize content
  const personalizedContent = personalizeContent(campaign.content, testContact)

  // Wrap in template
  const html = wrapInTemplate({
    content: personalizedContent,
    previewText: campaign.previewText || undefined,
    unsubscribeUrl,
  })

  // Send test email
  const provider = getEmailProvider()
  const result = await provider.send({
    to: { email: realContact.email },
    from: { email: campaign.fromEmail, name: campaign.fromName },
    replyTo: { email: campaign.replyToEmail || campaign.fromEmail, name: campaign.fromName },
    subject: `[TEST] ${campaign.subject}`,
    html,
    headers: {
      'List-Unsubscribe': `<${oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 500 })
  }

  return NextResponse.json({ success: true, provider: result.provider, messageId: result.messageId })
}
