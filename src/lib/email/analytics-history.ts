import { prisma } from '@/lib/db'
import { safeHttpUrl, verifyTrackingToken } from './tokens'
import { firstTimestamp } from './analytics-capture'

// Backfill only actual retained provider evidence. No inferred events from flags.
export async function backfillAnalyticsBatch(cursor?: string, apply = false, limit = 250) {
  const rows = await prisma.emailProviderEvent.findMany({ where: { provider: 'ses', recipientId: { not: null } },
    include: { recipient: { select: { id: true, campaignId: true, analyticsVersion: true } } },
    orderBy: { id: 'asc' }, take: Math.max(1,Math.min(limit,500)), ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
  let recoverable=0, inserted=0
  for (const row of rows) {
    if (!row.recipient || !row.campaignId || row.campaignId !== row.recipient.campaignId) continue
    const payload=(row.payload && typeof row.payload==='object' && !Array.isArray(row.payload) ? row.payload : {}) as Record<string,unknown>
    const record=(value:unknown): Record<string,unknown> => value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {}
    const click=record(payload.click), open=record(payload.open), delay=record(payload.deliveryDelay)
    const rawType=String(payload.eventType || payload.notificationType || '').toLowerCase()
    const kind=rawType==='deliverydelay'?'DELAYED':row.eventType
    const occurredAt=kind==='DELAYED' && typeof delay.timestamp==='string' && Number.isFinite(Date.parse(delay.timestamp)) ? new Date(delay.timestamp) : row.occurredAt
    const canonical=kind!=='CLICKED' || row.recipient.analyticsVersion!==1
    let targetUrl:string|undefined, linkKey:string|undefined, linkLabel:string|undefined
    if(typeof click.link==='string') {
      const url=safeHttpUrl(click.link)
      const signed=url?.searchParams.get('t')
      if(signed) {
        try {
          const verified=verifyTrackingToken(signed)
          if(verified.ok && verified.recipientId===row.recipientId && (!verified.placement || verified.placement.campaignId===row.campaignId)) {
            targetUrl=safeHttpUrl(verified.url)?.toString();linkKey=verified.placement?.linkKey;linkLabel=verified.placement?.label
          }
        } catch { /* Missing historical signing secret: preserve event, not opaque token URL. */ }
      } else if(url) targetUrl=url.toString()
    }
    // Never carry signed URL/token metadata into normalized historical reports.
    if(targetUrl) {
      const url=new URL(targetUrl)
      for(const key of [...url.searchParams.keys()]) if(/token|signature|secret|password|auth|api.?key/i.test(key)) url.searchParams.delete(key)
      targetUrl=url.toString()
    }
    const classification=open.isBotEvent || click.isBotEvent
    const bounce=record(payload.bounce)
    const detail=kind==='BOUNCED' ? [bounce.bounceType || payload.bounceType,bounce.bounceSubType || payload.bounceSubType].filter(v=>typeof v==='string').join(':').slice(0,200) : undefined
    recoverable++
    if(!apply) continue
    await prisma.$transaction(async tx=>{
      const result=await tx.emailAnalyticsEvent.createMany({skipDuplicates:true,data:[{
        eventKey:`ses:${row.providerEventId}`,campaignId:row.campaignId!,recipientId:row.recipientId!,kind,source:'ses',canonical,occurredAt,
        automation:classification==='Likely'?'likely_automated':classification==='Unlikely'?'unlikely_automated':'unknown',targetUrl,linkKey,linkLabel,detail,
      }]})
      inserted+=result.count
      // Earliest canonical evidence may improve old latest-event flags, without
      // changing delivery status, contacts, suppression, approvals or sends.
      if(canonical && kind==='OPENED') await firstTimestamp(tx,row.recipientId!,'openedAt',occurredAt)
      if(canonical && kind==='CLICKED') await firstTimestamp(tx,row.recipientId!,'clickedAt',occurredAt)
      if(kind==='DELIVERED') await firstTimestamp(tx,row.recipientId!,'deliveredAt',occurredAt)
      if(kind==='COMPLAINED') await firstTimestamp(tx,row.recipientId!,'complainedAt',occurredAt)
      if(kind==='BOUNCED') await firstTimestamp(tx,row.recipientId!,'bouncedAt',occurredAt)
    })
  }
  return { scanned:rows.length,recoverable,inserted,cursor:rows.at(-1)?.id }
}
