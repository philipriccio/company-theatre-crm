import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { engagementWhere, filteredTimestamps, parseAnalyticsQuery, recipientSelect, recipientWhere } from './analytics'

export const REPORT_TIMEZONE = 'America/Toronto'
// Convert a calendar midnight in Toronto, not a fixed UTC offset. This includes
// 23/25-hour DST days correctly and does not depend on the server timezone.
export function torontoMidnight(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Enter dates as YYYY-MM-DD.')
  const utc = new Date(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== day || +day.slice(0,4) < 1900 || +day.slice(0,4) > 9998) throw new Error('Enter a valid calendar date.')
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIMEZONE, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' })
  let candidate = utc.getTime()
  for (let i=0;i<3;i++) {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map(p=>[p.type,p.value]))
    const localAsUtc = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`)
    candidate += utc.getTime() - localAsUtc
  }
  return new Date(candidate)
}
export function parseCombinedQuery(params: URLSearchParams) {
  const from = params.get('from') || '', to = params.get('to') || ''
  let start: Date | undefined, end: Date | undefined, error: string | null = null
  try {
    if (from) start = torontoMidnight(from)
    if (to) {
      torontoMidnight(to)
      const next = new Date(`${to}T00:00:00Z`)
      next.setUTCDate(next.getUTCDate()+1)
      end = torontoMidnight(next.toISOString().slice(0,10))
    }
    if (from && to && from > to) throw new Error('The start date must be on or before the end date.')
  } catch (e) { error = e instanceof Error ? e.message : 'Invalid date range.' }
  return { ...parseAnalyticsQuery(params), from, to, start, end, error }
}
export type CombinedQuery = ReturnType<typeof parseCombinedQuery>
export function combinedWhere(query: CombinedQuery): Prisma.CampaignRecipientWhereInput {
  // Invalid filters fail closed; never silently show/export every recipient.
  if (query.error) return { id: { in: [] } }
  const base = recipientWhere('', query)
  delete base.campaignId
  const range = { ...(query.start ? { gte: query.start } : {}), ...(query.end ? { lt: query.end } : {}), not: null }
  return { AND: [base, { OR: [{ sentAt: range }, { sentAt: null, acceptedAt: range }] }] }
}
export const combinedSelect = { ...recipientSelect, sentAt:true, campaignId:true, campaign: { select: { name:true } } } satisfies Prisma.CampaignRecipientSelect
export async function combinedRecipientPage(query: CombinedQuery) {
  const where = combinedWhere(query)
  const total = await prisma.campaignRecipient.count({ where })
  const pages = Math.max(1, Math.ceil(total/50)), page = Math.min(query.page,pages)
  const rows = await prisma.campaignRecipient.findMany({ where, select:combinedSelect, orderBy:[{email:'asc'},{id:'asc'}], take:50, skip:(page-1)*50 })
  return { total, page, pages, rows: await filteredTimestamps(rows,query.excludeLikely) }
}
export async function combinedSummary(query: CombinedQuery) {
  const where = combinedWhere(query)
  const metrics = {
    sent: {},
    currentDelivered: { status:'DELIVERED', deliveredAt:{not:null}, bouncedAt:null },
    deliveryEvidence: { deliveredAt:{not:null} },
    opened: engagementWhere('OPENED',query.excludeLikely),
    clicked: engagementWhere('CLICKED',query.excludeLikely),
    bounced: { bouncedAt:{not:null} },
    unsubscribed: { unsubscribedAt:{not:null} },
    complaints: { OR:[{complainedAt:{not:null}},{lastErrorCode:'complaint'}] },
    legacy: { analyticsVersion:null },
  } satisfies Record<string,Prisma.CampaignRecipientWhereInput>
  type Metric = keyof typeof metrics
  // Fixed number of grouped queries regardless of number of batches. No N+1
  // campaign summaries and no unbounded recipient/event loading into React.
  const groups = await Promise.all(Object.entries(metrics).map(async ([key,condition]) => ({key:key as Metric, rows:await prisma.campaignRecipient.groupBy({by:['campaignId'], where:{AND:[where,condition]},_count:true})})))
  const ids = groups[0].rows.map(r=>r.campaignId)
  const [campaigns,statuses] = await Promise.all([
    prisma.campaign.findMany({where:{id:{in:ids}},select:{id:true,name:true,status:true},orderBy:[{createdAt:'desc'},{id:'desc'}]}),
    prisma.campaignRecipient.groupBy({by:['status'],where,_count:true}),
  ])
  const totals = Object.fromEntries(groups.map(g=>[g.key,g.rows.reduce((sum,r)=>sum+r._count,0)])) as Record<Metric,number>
  const indexed = new Map(groups.map(g=>[g.key,new Map(g.rows.map(r=>[r.campaignId,r._count]))]))
  const batches = campaigns.map(c=>({...c, metrics:Object.fromEntries(groups.map(g=>[g.key,indexed.get(g.key)?.get(c.id)||0])) as Record<Metric,number>}))
  return { totals,batches,statuses }
}

// SQL twin of combinedWhere for database-side DISTINCT click aggregation. Keep
// filter parity covered by the isolated integration suite; all values are bound.
function combinedRecipientSql(query: CombinedQuery): Prisma.Sql {
  if (query.error) return Prisma.sql`false`
  const engagement = (kind: 'OPENED' | 'CLICKED') => {
    const field = kind === 'OPENED' ? Prisma.sql`r."openedAt"` : Prisma.sql`r."clickedAt"`
    if (!query.excludeLikely) return Prisma.sql`${field} IS NOT NULL`
    return Prisma.sql`(EXISTS (SELECT 1 FROM "EmailAnalyticsEvent" a WHERE a."recipientId"=r.id AND a.canonical=true AND a.kind=${kind} AND a.automation<>'likely_automated') OR (${field} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "EmailAnalyticsEvent" a WHERE a."recipientId"=r.id AND a.canonical=true AND a.kind=${kind})))`
  }
  const filters: Record<CombinedQuery['filter'], Prisma.Sql> = {
    all: Prisma.sql`true`, delivered: Prisma.sql`r."deliveredAt" IS NOT NULL`,
    opened: engagement('OPENED'), clicked: engagement('CLICKED'),
    unopened: Prisma.sql`r.status='DELIVERED' AND r."deliveredAt" IS NOT NULL AND r."bouncedAt" IS NULL AND r."complainedAt" IS NULL AND r."unsubscribedAt" IS NULL AND NOT (${engagement('OPENED')})`,
    bounced: Prisma.sql`r."bouncedAt" IS NOT NULL`,
    hard: Prisma.sql`r."bouncedAt" IS NOT NULL AND r."bounceType" ILIKE 'Permanent%'`,
    soft: Prisma.sql`r."bouncedAt" IS NOT NULL AND r."bounceType" ILIKE 'Transient%'`,
    failed: Prisma.sql`r.status='FAILED'`, unknown: Prisma.sql`r.status='UNKNOWN'`, suppressed: Prisma.sql`r.status='SUPPRESSED'`,
    unsubscribed: Prisma.sql`r."unsubscribedAt" IS NOT NULL`,
    complaint: Prisma.sql`r."complainedAt" IS NOT NULL OR r."lastErrorCode"='complaint'`,
    queued: Prisma.sql`r.status IN ('QUEUED','SENDING')`,
    accepted: Prisma.sql`r."acceptedAt" IS NOT NULL AND r."deliveredAt" IS NULL AND r."bouncedAt" IS NULL AND r.status='ACCEPTED'`,
  }
  const parts = [Prisma.sql`COALESCE(r."sentAt",r."acceptedAt") IS NOT NULL`, Prisma.sql`(${filters[query.filter]})`]
  if (query.start) parts.push(Prisma.sql`COALESCE(r."sentAt",r."acceptedAt") >= ${query.start}`)
  if (query.end) parts.push(Prisma.sql`COALESCE(r."sentAt",r."acceptedAt") < ${query.end}`)
  if (query.q) {
    const pattern = `%${query.q}%` // Same ILIKE pattern semantics as Prisma contains.
    parts.push(Prisma.sql`(r.email ILIKE ${pattern} OR r."firstName" ILIKE ${pattern} OR r."lastName" ILIKE ${pattern} OR r."fullName" ILIKE ${pattern})`)
  }
  if (query.link) parts.push(Prisma.sql`EXISTS (SELECT 1 FROM "EmailAnalyticsEvent" a WHERE a."recipientId"=r.id AND a.canonical=true AND a.kind='CLICKED' AND a."linkKey"=${query.link} AND (${!query.excludeLikely} OR a.automation<>'likely_automated'))`)
  return Prisma.join(parts, ' AND ')
}
export type CombinedLink = { linkKey: string | null; targetUrl: string | null; label: string | null; total: number; unique: number; batches: number; first: Date; last: Date }
export async function combinedLinks(query: CombinedQuery, offset = 0, limit = 100, after?: CombinedLink | null) {
  // No recipient/event arrays loaded into application memory. Group identity
  // includes placement, destination AND label, so different CTAs stay separate.
  const identity = Prisma.sql`ROW(e."linkKey" IS NULL, COALESCE(e."linkKey",''), e."targetUrl" IS NULL, COALESCE(e."targetUrl",''), e."linkLabel" IS NULL, COALESCE(e."linkLabel",''))`
  const cursor = after ? Prisma.sql`HAVING ${identity} > ROW(${after.linkKey===null}, ${after.linkKey??''}, ${after.targetUrl===null}, ${after.targetUrl??''}, ${after.label===null}, ${after.label??''})` : Prisma.empty
  const order = after === undefined ? Prisma.sql`total DESC, e."linkKey" ASC NULLS LAST, e."targetUrl" ASC NULLS LAST, e."linkLabel" ASC NULLS LAST` : Prisma.sql`${identity}`
  return prisma.$queryRaw<CombinedLink[]>`
    SELECT e."linkKey", e."targetUrl", e."linkLabel" AS label,
      count(*)::int AS total, count(DISTINCT e."recipientId")::int AS unique,
      count(DISTINCT e."campaignId")::int AS batches,
      min(e."occurredAt") AS first, max(e."occurredAt") AS last
    FROM "EmailAnalyticsEvent" e JOIN "CampaignRecipient" r ON r.id=e."recipientId"
    WHERE e.canonical=true AND e.kind='CLICKED' AND (${!query.excludeLikely} OR e.automation<>'likely_automated')
      AND (${combinedRecipientSql(query)})
    GROUP BY e."linkKey", e."targetUrl", e."linkLabel"
    ${cursor}
    ORDER BY ${order}
    LIMIT ${Math.max(1,Math.min(501,limit))} OFFSET ${Math.max(0,offset)}`
}
