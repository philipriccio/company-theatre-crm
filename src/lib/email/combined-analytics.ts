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
