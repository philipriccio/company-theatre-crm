import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { classifyClickBurst } from './scanner-classification'
import { prisma } from '@/lib/db'

export async function recordTracking(params: {
  recipientId: string; campaignId?: string; kind: 'OPENED' | 'CLICKED';
  linkKey?: string; linkLabel?: string; targetUrl?: string
}) {
  return prisma.$transaction(async tx => {
    const recipient = await tx.campaignRecipient.findFirst({ where: { id: params.recipientId, ...(params.campaignId ? { campaignId: params.campaignId } : {}) } })
    if (!recipient) return false
    const canonical = params.kind === 'CLICKED' && recipient.analyticsVersion === 1
    // Serialize same-recipient captures so simultaneous scanner requests cannot
    // each observe an incomplete burst. Independent recipients do not block.
    if (canonical) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${recipient.id}, 71419))`
    const now = new Date()
    await tx.emailAnalyticsEvent.create({ data: {
      eventKey: `app:${randomUUID()}`, campaignId: recipient.campaignId, recipientId: recipient.id,
      kind: params.kind, source: 'app', canonical, occurredAt: now,
      linkKey: params.linkKey ?? null, linkLabel: params.linkLabel?.slice(0,180), targetUrl: params.targetUrl,
    } })
    if (canonical) {
      await classifyClickBurst(tx, recipient.id, recipient.campaignId, now)
      await firstTimestamp(tx, recipient.id, 'clickedAt', now)
    }
    return true
  })
}

export async function firstTimestamp(tx: Prisma.TransactionClient, recipientId: string,
  field: 'openedAt' | 'clickedAt' | 'deliveredAt' | 'acceptedAt' | 'sentAt' | 'bouncedAt' | 'unsubscribedAt' | 'complainedAt', at: Date) {
  await tx.campaignRecipient.updateMany({ where: { id: recipientId, OR: [{ [field]: null }, { [field]: { gt: at } }] }, data: { [field]: at } })
}
