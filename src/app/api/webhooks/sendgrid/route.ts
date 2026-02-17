import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// SendGrid webhook event types
interface SendGridEvent {
  email: string
  timestamp: number
  event: 'delivered' | 'open' | 'click' | 'bounce' | 'dropped' | 'spamreport' | 'unsubscribe' | 'group_unsubscribe' | 'group_resubscribe'
  sg_event_id?: string
  sg_message_id?: string
  category?: string[]
  campaign_id?: string
  recipient_id?: string
  url?: string
  reason?: string
  status?: string
  type?: string // bounce type: bounce, blocked, expired
}

export async function POST(request: NextRequest) {
  try {
    const events: SendGridEvent[] = await request.json()

    for (const event of events) {
      const email = event.email?.toLowerCase()
      if (!email) continue

      const timestamp = new Date(event.timestamp * 1000)

      switch (event.event) {
        case 'delivered':
          // Update recipient record if we have one
          if (event.recipient_id) {
            await prisma.campaignRecipient.update({
              where: { id: event.recipient_id },
              data: { deliveredAt: timestamp },
            }).catch(() => {}) // Ignore if not found
          }
          break

        case 'open':
          // Note: We handle open tracking via our own pixel, but this is a backup
          if (event.recipient_id) {
            await prisma.campaignRecipient.update({
              where: { id: event.recipient_id },
              data: { openedAt: timestamp },
            }).catch(() => {})
          }
          break

        case 'click':
          // Note: We handle click tracking via our own redirect, but this is a backup
          if (event.recipient_id) {
            await prisma.campaignRecipient.update({
              where: { id: event.recipient_id },
              data: { clickedAt: timestamp },
            }).catch(() => {})
          }
          break

        case 'bounce':
        case 'dropped':
          // Mark as bounced
          if (event.recipient_id) {
            await prisma.campaignRecipient.update({
              where: { id: event.recipient_id },
              data: { 
                bouncedAt: timestamp,
                bounceType: event.type || event.event,
              },
            }).catch(() => {})
          }

          // For hard bounces, mark contact to avoid future sends
          if (event.type === 'bounce') {
            await prisma.contact.update({
              where: { email },
              data: { 
                solicitation: false,
                metadata: {
                  bounceReason: event.reason,
                  bouncedAt: timestamp.toISOString(),
                },
              },
            }).catch(() => {})
          }
          break

        case 'spamreport':
          // User marked as spam - unsubscribe them
          await prisma.contact.update({
            where: { email },
            data: { 
              unsubscribedAt: timestamp,
              solicitation: false,
              metadata: {
                unsubscribeReason: 'spam_report',
              },
            },
          }).catch(() => {})
          break

        case 'unsubscribe':
        case 'group_unsubscribe':
          // User clicked unsubscribe link in SendGrid footer
          await prisma.contact.update({
            where: { email },
            data: { 
              unsubscribedAt: timestamp,
              solicitation: false,
            },
          }).catch(() => {})
          break

        case 'group_resubscribe':
          // User resubscribed
          await prisma.contact.update({
            where: { email },
            data: { 
              unsubscribedAt: null,
              solicitation: true,
            },
          }).catch(() => {})
          break
      }
    }

    return NextResponse.json({ received: events.length })
  } catch (error) {
    console.error('SendGrid webhook error:', error)
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    )
  }
}

// SendGrid sends a GET to verify the webhook URL
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
