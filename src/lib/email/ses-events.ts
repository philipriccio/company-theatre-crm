import { Prisma, type EmailProviderEventType } from '@prisma/client'
import { prisma } from '@/lib/db'
import { emailHash } from './tokens'
import type { SnsEnvelope } from './sns'

type SesPayload = Record<string, unknown> & {
  eventType?: string
  notificationType?: string
  mail?: { messageId?: string; timestamp?: string; destination?: string[]; tags?: Record<string, string[]> }
  delivery?: { timestamp?: string }
  bounce?: { bounceType?: string; bounceSubType?: string; timestamp?: string; bouncedRecipients?: Array<{ emailAddress?: string }> }
  complaint?: { timestamp?: string; complainedRecipients?: Array<{ emailAddress?: string }> }
  reject?: { reason?: string }
  open?: { timestamp?: string }
  click?: { timestamp?: string }
}

function mapEventType(raw: string): EmailProviderEventType {
  const normalized = raw.toLowerCase()
  if (normalized === 'send') return 'ACCEPTED'
  if (normalized === 'delivery') return 'DELIVERED'
  if (normalized === 'open') return 'OPENED'
  if (normalized === 'click') return 'CLICKED'
  if (normalized === 'bounce') return 'BOUNCED'
  if (normalized === 'complaint') return 'COMPLAINED'
  if (normalized === 'reject' || normalized === 'rendering failure') return 'REJECTED'
  return 'UNKNOWN'
}

export async function ingestSesNotification(envelope: SnsEnvelope) {
  const payload = JSON.parse(envelope.Message) as SesPayload
  const rawType = payload.eventType || payload.notificationType || 'unknown'
  const eventType = mapEventType(rawType)
  const messageId = payload.mail?.messageId || null
  const taggedRecipientId = payload.mail?.tags?.recipient_id?.[0]
  const recipient = taggedRecipientId
    ? await prisma.campaignRecipient.findUnique({ where: { id: taggedRecipientId } })
    : messageId
      ? await prisma.campaignRecipient.findFirst({ where: { provider: 'ses', providerMessageId: messageId } })
      : null

  const occurredAt = new Date(
    payload.delivery?.timestamp || payload.bounce?.timestamp || payload.complaint?.timestamp
      || payload.open?.timestamp || payload.click?.timestamp || payload.mail?.timestamp || envelope.Timestamp
  )
  const recipientEmail = recipient?.email || payload.bounce?.bouncedRecipients?.[0]?.emailAddress
    || payload.complaint?.complainedRecipients?.[0]?.emailAddress || payload.mail?.destination?.[0]
  const recipientData: Prisma.CampaignRecipientUncheckedUpdateInput = {}
  let suppressReason: string | null = null

  if (eventType === 'DELIVERED') Object.assign(recipientData, { status: 'DELIVERED', deliveredAt: occurredAt })
  if (eventType === 'OPENED') Object.assign(recipientData, { openedAt: occurredAt })
  if (eventType === 'CLICKED') Object.assign(recipientData, { clickedAt: occurredAt })
  if (eventType === 'BOUNCED') {
    const permanent = payload.bounce?.bounceType?.toLowerCase() === 'permanent'
    Object.assign(recipientData, {
      bouncedAt: occurredAt,
      bounceType: [payload.bounce?.bounceType, payload.bounce?.bounceSubType].filter(Boolean).join(':'),
      ...(permanent ? { status: 'FAILED', failedAt: occurredAt, lastErrorClass: 'permanent', lastErrorCode: 'ses_hard_bounce' } : {}),
    })
    if (permanent) suppressReason = 'hard_bounce'
  }
  if (eventType === 'COMPLAINED') {
    Object.assign(recipientData, { status: 'SUPPRESSED', suppressedAt: occurredAt, lastErrorClass: 'suppressed', lastErrorCode: 'complaint' })
    suppressReason = 'complaint'
  }
  if (eventType === 'REJECTED') Object.assign(recipientData, { status: 'FAILED', failedAt: occurredAt, lastErrorClass: 'permanent', lastErrorCode: 'ses_rejected', lastErrorMessage: payload.reject?.reason })

  try {
    await prisma.$transaction(async (tx) => {
      await tx.emailProviderEvent.create({
        data: {
          provider: 'ses', providerEventId: envelope.MessageId, providerMessageId: messageId,
          eventType, campaignId: recipient?.campaignId, recipientId: recipient?.id,
          emailHash: recipientEmail ? emailHash(recipientEmail) : null, occurredAt,
          payload: payload as Prisma.InputJsonValue,
        },
      })
      if (recipient && Object.keys(recipientData).length) {
        await tx.campaignRecipient.update({ where: { id: recipient.id }, data: recipientData })
      }
      if (suppressReason && recipientEmail) {
        const email = recipientEmail.trim().toLowerCase()
        await tx.globalSuppression.upsert({
          where: { email },
          update: { reason: suppressReason, source: 'ses_event', contactId: recipient?.contactId, campaignId: recipient?.campaignId, recipientId: recipient?.id },
          create: { email, emailHash: emailHash(email), reason: suppressReason, source: 'ses_event', contactId: recipient?.contactId, campaignId: recipient?.campaignId, recipientId: recipient?.id },
        })
        if (recipient) {
          await tx.contact.update({ where: { id: recipient.contactId }, data: { solicitation: false, ...(suppressReason === 'complaint' ? { unsubscribedAt: occurredAt } : {}) } })
        }
      }
    })
    return { duplicate: false, eventType, recipientId: recipient?.id || null }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { duplicate: true, eventType, recipientId: recipient?.id || null }
    }
    throw error
  }
}
