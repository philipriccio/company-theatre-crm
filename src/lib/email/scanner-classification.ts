import type { Prisma } from '@prisma/client'

export const BURST_WINDOW_MS = 2000
export const BURST_DISTINCT_LINKS = 3
export const BURST_REASON = 'behavioral_burst_v1: at least 3 distinct placements within 2 seconds; suspected automation, not proof'
export async function classifyClickBurst(tx: Prisma.TransactionClient, recipientId: string, campaignId: string, now: Date) {
  const where = { recipientId, campaignId, source: 'app', canonical: true, kind: 'CLICKED', occurredAt: { gte: new Date(now.getTime() - BURST_WINDOW_MS), lte: now }, linkKey: { not: null } }
  const placements = await tx.emailAnalyticsEvent.findMany({ where, distinct: ['linkKey'], select: { linkKey: true }, take: BURST_DISTINCT_LINKS })
  if (placements.length < BURST_DISTINCT_LINKS) return
  // Retain every raw event/time/destination. Classify only this burst, never all
  // activity by a recipient: later ordinary clicks must remain visible.
  await tx.emailAnalyticsEvent.updateMany({ where: { ...where, automation: 'unknown' }, data: { automation: 'likely_automated', detail: BURST_REASON } })
}
