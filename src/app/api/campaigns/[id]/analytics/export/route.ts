import { prisma } from '@/lib/db'
import { analyticsReport, filteredTimestamps, csvLine, parseAnalyticsQuery, recipientSelect, recipientWhere } from '@/lib/email/analytics'
export const dynamic = 'force-dynamic'
// Auth: same reverse-proxy authenticated admin catch-all as /api/contacts/export.
// This route MUST NOT be included in public tracking/unsubscribe exceptions.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const campaign = await prisma.campaign.findUnique({ where: { id }, select: { id: true } })
  if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404, headers: { 'Cache-Control': 'no-store, private' } })
  const query = parseAnalyticsQuery(new URL(request.url).searchParams)
  const where = recipientWhere(id, query)
  const view = new URL(request.url).searchParams.get('view')
  const responseHeaders = { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="email-analytics.csv"', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' }
  if (view === 'links') {
    const report = await analyticsReport(id, query.excludeLikely)
    return new Response(csvLine(['Placement','Label','Destination','Unique recipients','Total clicks','First UTC','Last UTC']) + report.links.map(l => csvLine([l.linkKey,l.label,l.targetUrl,l.unique,l.total,l.first,l.last])).join(''), { headers: responseHeaders })
  }
  if (view === 'events') {
    let eventCursor: string | undefined
    let header = false
    const encoder = new TextEncoder()
    return new Response(new ReadableStream({ async pull(controller) {
      try {
        if (!header) { header = true; controller.enqueue(encoder.encode(csvLine(['Email','Event','Source','Counted in totals','Occurred UTC','Automation evidence','Placement','Label','Destination','Detail']))) }
        const rows = await prisma.emailAnalyticsEvent.findMany({
          where: { campaignId: id, recipient: where, ...(query.excludeLikely ? { automation: { not: 'likely_automated' } } : {}), ...(query.link ? { linkKey: query.link } : {}) },
          select: { id: true, kind: true, source: true, canonical: true, occurredAt: true, automation: true, linkKey: true, linkLabel: true, targetUrl: true, detail: true, recipient: { select: { email: true } } },
          orderBy: { id: 'asc' }, take: 500, ...(eventCursor ? { cursor: { id: eventCursor }, skip: 1 } : {}),
        })
        if (!rows.length) { controller.close(); return }
        controller.enqueue(encoder.encode(rows.map(e => csvLine([e.recipient.email,e.kind,e.source,e.canonical,e.occurredAt,e.automation,e.linkKey,e.linkLabel,e.targetUrl,e.detail])).join('')))
        eventCursor = rows[rows.length-1].id
      } catch (error) { controller.error(error) }
    } }), { headers: responseHeaders })
  }
  let cursor: string | undefined
  let started = false
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (!started) {
          started = true
          controller.enqueue(encoder.encode(csvLine(['Email','Name','Delivery status','Accepted UTC','Delivered UTC','First recorded open UTC','First recorded click UTC','Bounce UTC','Bounce type','Campaign unsubscribe UTC','Complaint UTC','Coverage'])))
        }
        const rows = await prisma.campaignRecipient.findMany({ where, select: recipientSelect, orderBy: { id: 'asc' }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
        if (!rows.length) { controller.close(); return }
        const filteredRows = await filteredTimestamps(rows, query.excludeLikely)
        controller.enqueue(encoder.encode(filteredRows.map(r => csvLine([r.email, r.fullName || [r.firstName,r.lastName].filter(Boolean).join(' '), r.status, r.acceptedAt, r.deliveredAt, r.openedAt, r.clickedAt, r.bouncedAt, r.bounceType, r.unsubscribedAt, r.complainedAt, r.analyticsVersion === 1 ? 'SES opens; signed app clicks' : 'Historical / partial evidence'])).join('')))
        cursor = rows[rows.length-1].id
      } catch (error) { controller.error(error) }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="email-recipients.csv"', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } })
}
