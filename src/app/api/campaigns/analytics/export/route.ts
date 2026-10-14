import { prisma } from '@/lib/db'
import { csvLine, filteredTimestamps } from '@/lib/email/analytics'
import { combinedSelect, combinedWhere, parseCombinedQuery } from '@/lib/email/combined-analytics'
export const dynamic = 'force-dynamic'
// Private admin route: protected by the same authenticated reverse-proxy
// catch-all as individual exports. Never add this to public delivery routes.
export async function GET(request: Request) {
  const query = parseCombinedQuery(new URL(request.url).searchParams)
  const headers = { 'Cache-Control':'no-store, private', 'X-Content-Type-Options':'nosniff' }
  if (query.error) return Response.json({error:query.error},{status:400,headers})
  const where = combinedWhere(query)
  const encoder = new TextEncoder()
  let cursor: string | undefined, started = false
  return new Response(new ReadableStream({async pull(controller) {
    try {
      if (!started) { started=true; controller.enqueue(encoder.encode(csvLine(['Batch ID','Batch','Email','Name','Sent UTC','Current status','Delivery evidence UTC','First recorded open UTC','First recorded click UTC','Bounce UTC','Bounce type','Email unsubscribe UTC','Complaint UTC','Coverage']))) }
      const rows = await prisma.campaignRecipient.findMany({where,select:combinedSelect,orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})})
      if (!rows.length) { controller.close(); return }
      const filtered = await filteredTimestamps(rows,query.excludeLikely)
      controller.enqueue(encoder.encode(filtered.map(r=>csvLine([r.campaignId,r.campaign.name,r.email,r.fullName||[r.firstName,r.lastName].filter(Boolean).join(' '),r.sentAt||r.acceptedAt,r.status,r.deliveredAt,r.openedAt,r.clickedAt,r.bouncedAt,r.bounceType,r.unsubscribedAt,r.complainedAt,r.analyticsVersion===1?'SES opens; signed app clicks':'Historical / partial'])).join('')))
      cursor=rows.at(-1)!.id
    } catch(error) { controller.error(error) }
  }}),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="all-email-analytics.csv"'}})
}
