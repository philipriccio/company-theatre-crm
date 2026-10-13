import { Prisma } from '@prisma/client'
import { linkInventory } from './link-inventory'
import { wrapInTemplate } from '@/lib/email-template'
import { prisma } from '@/lib/db'

export const FILTERS = {
  all: 'Everyone', delivered: 'Delivered', opened: 'Open recorded', unopened: 'Delivered · no open recorded',
  clicked: 'Click recorded', bounced: 'Any bounce', hard: 'Hard bounce', soft: 'Soft bounce (final)',
  failed: 'Failed', unknown: 'Unknown delivery', suppressed: 'Suppressed', unsubscribed: 'Unsubscribed from this email',
  complaint: 'Spam complaint', queued: 'Queued / sending', accepted: 'Accepted, delivery unconfirmed',
} as const
export type AnalyticsFilter = keyof typeof FILTERS
export function parseAnalyticsQuery(params: URLSearchParams) {
  const raw = params.get('filter') || 'all'
  return { q: (params.get('q') || '').trim().slice(0,200), filter: (Object.hasOwn(FILTERS, raw) ? raw : 'all') as AnalyticsFilter,
    page: Math.max(1, Math.min(100000, Number.parseInt(params.get('page') || '1', 10) || 1)),
    link: (params.get('link') || '').slice(0,200), excludeLikely: params.get('automation') === 'exclude_likely' }
}
export function engagementWhere(kind: 'OPENED' | 'CLICKED', excludeLikely: boolean): Prisma.CampaignRecipientWhereInput {
  const field = kind === 'OPENED' ? 'openedAt' : 'clickedAt'
  if (!excludeLikely) return { [field]: { not: null } }
  return { OR: [
    { analyticsEvents: { some: { kind, canonical: true, automation: { not: 'likely_automated' } } } },
    { [field]: { not: null }, analyticsEvents: { none: { kind, canonical: true } } },
  ] }
}
export type AnalyticsQuery = ReturnType<typeof parseAnalyticsQuery>
export function recipientWhere(campaignId: string, query: AnalyticsQuery): Prisma.CampaignRecipientWhereInput {
  const where: Prisma.CampaignRecipientWhereInput = { campaignId }
  const conditions: Prisma.CampaignRecipientWhereInput[] = []
  if (query.q) conditions.push({ OR: ['email','firstName','lastName','fullName'].map(field => ({ [field]: { contains: query.q, mode: 'insensitive' } })) })
  const filters: Record<AnalyticsFilter, Prisma.CampaignRecipientWhereInput> = {
    all: {}, delivered: { deliveredAt: { not: null } }, opened: engagementWhere('OPENED', query.excludeLikely),
    unopened: { status: 'DELIVERED', deliveredAt: { not: null }, bouncedAt: null, complainedAt: null, unsubscribedAt: null, NOT: engagementWhere('OPENED', query.excludeLikely) }, clicked: engagementWhere('CLICKED', query.excludeLikely),
    bounced: { bouncedAt: { not: null } }, hard: { bouncedAt: { not: null }, bounceType: { startsWith: 'Permanent', mode: 'insensitive' } },
    soft: { bouncedAt: { not: null }, bounceType: { startsWith: 'Transient', mode: 'insensitive' } },
    failed: { status: 'FAILED' }, unknown: { status: 'UNKNOWN' }, suppressed: { status: 'SUPPRESSED' },
    unsubscribed: { unsubscribedAt: { not: null } }, complaint: { OR: [{ complainedAt: { not: null } }, { lastErrorCode: 'complaint' }] },
    queued: { status: { in: ['QUEUED','SENDING'] } }, accepted: { acceptedAt: { not: null }, deliveredAt: null, bouncedAt: null, status: 'ACCEPTED' },
  }
  conditions.push(filters[query.filter])
  if (query.link) conditions.push({ analyticsEvents: { some: { canonical: true, kind: 'CLICKED', linkKey: query.link, ...(query.excludeLikely ? { automation: { not: 'likely_automated' } } : {}) } } })
  where.AND = conditions
  return where
}
export const recipientSelect = {
  id: true, email: true, firstName: true, lastName: true, fullName: true, status: true,
  acceptedAt: true, deliveredAt: true, openedAt: true, clickedAt: true, bouncedAt: true, bounceType: true,
  unsubscribedAt: true, complainedAt: true, analyticsVersion: true,
} satisfies Prisma.CampaignRecipientSelect
export async function recipientPage(campaignId: string, query: AnalyticsQuery) {
  const where = recipientWhere(campaignId, query)
  const total = await prisma.campaignRecipient.count({ where })
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / 50)))
  const rows = await prisma.campaignRecipient.findMany({ where, select: recipientSelect, orderBy: [{ email: 'asc' }, { id: 'asc' }], take: 50, skip: (page-1)*50 })
  return { total, page, pages: Math.max(1, Math.ceil(total/50)), rows: await filteredTimestamps(rows, query.excludeLikely) }
}
export async function filteredTimestamps<T extends { id: string; openedAt: Date | null; clickedAt: Date | null }>(rows: T[], excludeLikely: boolean): Promise<T[]> {
  if (!excludeLikely || !rows.length) return rows
  const groups = await prisma.emailAnalyticsEvent.groupBy({
    by: ['recipientId','kind','automation'], where: { recipientId: { in: rows.map(r=>r.id) }, canonical: true, kind: { in: ['OPENED','CLICKED'] } }, _min: { occurredAt: true },
  })
  return rows.map(row => {
    const result = { ...row }
    for (const kind of ['OPENED','CLICKED']) {
      const recorded = groups.filter(e=>e.recipientId===row.id && e.kind===kind)
      if (!recorded.length) continue // preserve historical flags with unknown classification
      const included = recorded.filter(e=>e.automation!=='likely_automated').flatMap(e=>e._min.occurredAt ? [e._min.occurredAt] : [])
      const first = included.length ? new Date(Math.min(...included.map(d=>d.getTime()))) : null
      if(kind==='OPENED') result.openedAt=first; else result.clickedAt=first
    }
    return result
  })
}
export type Summary = { total: number; accepted: number; delivered: number; opened: number; clicked: number; deliveredOpened: number; deliveredClicked: number; bounced: number; unsubscribed: number; complaints: number; legacy: number }
export async function analyticsSummary(campaignId: string, excludeLikely = false) {
  const open = excludeLikely ? Prisma.sql`("openedAt" IS NOT NULL AND (EXISTS (SELECT 1 FROM "EmailAnalyticsEvent" e WHERE e."recipientId"=r.id AND e.canonical=true AND e.kind='OPENED' AND e.automation<>'likely_automated') OR NOT EXISTS (SELECT 1 FROM "EmailAnalyticsEvent" e WHERE e."recipientId"=r.id AND e.canonical=true AND e.kind='OPENED')))` : Prisma.sql`"openedAt" IS NOT NULL`
  const click = excludeLikely ? Prisma.sql`("clickedAt" IS NOT NULL AND (EXISTS (SELECT 1 FROM "EmailAnalyticsEvent" e WHERE e."recipientId"=r.id AND e.canonical=true AND e.kind='CLICKED' AND e.automation<>'likely_automated') OR NOT EXISTS (SELECT 1 FROM "EmailAnalyticsEvent" e WHERE e."recipientId"=r.id AND e.canonical=true AND e.kind='CLICKED')))` : Prisma.sql`"clickedAt" IS NOT NULL`
  const [summary] = await prisma.$queryRaw<Summary[]>`
    SELECT count(*)::int AS total,
    count(*) FILTER (WHERE "acceptedAt" IS NOT NULL OR "sentAt" IS NOT NULL)::int AS accepted,
    count(*) FILTER (WHERE "deliveredAt" IS NOT NULL)::int AS delivered,
    count(*) FILTER (WHERE ${open})::int AS opened,
    count(*) FILTER (WHERE ${click})::int AS clicked,
    count(*) FILTER (WHERE "deliveredAt" IS NOT NULL AND ${open})::int AS "deliveredOpened",
    count(*) FILTER (WHERE "deliveredAt" IS NOT NULL AND ${click})::int AS "deliveredClicked",
    count(*) FILTER (WHERE "bouncedAt" IS NOT NULL)::int AS bounced,
    count(*) FILTER (WHERE "unsubscribedAt" IS NOT NULL)::int AS unsubscribed,
    count(*) FILTER (WHERE "complainedAt" IS NOT NULL OR "lastErrorCode" = 'complaint')::int AS complaints,
    count(*) FILTER (WHERE "analyticsVersion" IS NULL)::int AS legacy
    FROM "CampaignRecipient" r WHERE "campaignId" = ${campaignId}`
  return summary
}
export async function analyticsReport(campaignId: string, excludeLikely = false) {
  const [summary, statuses, events, links, trend, campaign] = await Promise.all([
    analyticsSummary(campaignId, excludeLikely),
    prisma.campaignRecipient.groupBy({ by: ['status'], where: { campaignId }, _count: true }),
    prisma.emailAnalyticsEvent.groupBy({ by: ['kind','canonical','automation'], where: { campaignId, ...(excludeLikely ? { automation: { not: 'likely_automated' } } : {}) }, _count: true }),
    prisma.$queryRaw<Array<{ linkKey: string | null; targetUrl: string | null; label: string | null; total: number; unique: number; first: Date; last: Date }>>`
      SELECT "linkKey", "targetUrl", max("linkLabel") AS label, count(*)::int AS total,
      count(DISTINCT "recipientId")::int AS unique, min("occurredAt") AS first, max("occurredAt") AS last
      FROM "EmailAnalyticsEvent" WHERE "campaignId"=${campaignId} AND canonical=true AND kind='CLICKED' AND (${!excludeLikely} OR automation <> 'likely_automated')
      GROUP BY "linkKey", "targetUrl" ORDER BY total DESC, "linkKey" ASC LIMIT 250`,
    prisma.$queryRaw<Array<{ day: string; opened: number; clicked: number }>>`
      SELECT to_char("occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Toronto', 'YYYY-MM-DD') AS day,
      count(*) FILTER (WHERE kind='OPENED')::int AS opened, count(*) FILTER (WHERE kind='CLICKED')::int AS clicked
      FROM "EmailAnalyticsEvent" WHERE "campaignId"=${campaignId} AND canonical=true AND kind IN ('OPENED','CLICKED') AND (${!excludeLikely} OR automation <> 'likely_automated')
      GROUP BY day ORDER BY day DESC LIMIT 30`,
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { content: true, previewText: true } }),
  ])
  // Campaign content is frozen once approved/sent. Inventory never claims zero
  // clicks for legacy placements whose tracking identities were not captured.
  const inventory = campaign && summary.legacy < summary.total ? linkInventory(wrapInTemplate({ content: campaign.content, previewText: campaign.previewText || undefined, unsubscribeUrl: '#' })) : []
  const rows: Array<{ linkKey: string | null; targetUrl: string | null; label: string | null; total: number; unique: number; first: Date | null; last: Date | null }> = [...links]
  for (const link of inventory) if (!rows.some(r => r.linkKey === link.linkKey)) rows.push({ ...link, total: 0, unique: 0, first: null, last: null })
  return { summary, statuses, events, links: rows, trend: trend.reverse() }
}
export function csvCell(value: unknown): string {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? '')
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) || /^[\t\r\n]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}
export function csvLine(values: unknown[]) { return values.map(csvCell).join(',') + '\r\n' }
export function rate(n: number, d: number) { return d ? `${(n / d * 100).toFixed(1)}%` : '—' }
