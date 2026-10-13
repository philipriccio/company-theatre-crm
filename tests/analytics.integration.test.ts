import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { NextRequest } from 'next/server'

test('analytics isolated persistence, tracking and reporting', { skip: process.env.CRM_ANALYTICS_PROOF !== '1' }, async t => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.equal(url.pathname,'crm_analytics_test'.replace(/^/,'/'))
  assert.match(url.searchParams.get('host') || '', /^\/tmp\/company-crm-analytics\.[A-Za-z0-9]+$/)
  process.env.EMAIL_TOKEN_SECRET = randomBytes(32).toString('hex')
  const { prisma } = await import('../src/lib/db')
  const { ingestSesNotification: ingest } = await import('../src/lib/email/ses-events')
  const { buildCampaignEmail } = await import('../src/lib/email/message')
  const { createTrackingToken, createOpenToken, createUnsubscribeToken } = await import('../src/lib/email/tokens')
  const { GET: click, HEAD: clickHead } = await import('../src/app/api/track/click/[id]/route')
  const { GET: open } = await import('../src/app/api/track/open/[id]/route')
  const { GET: unsubscribeGet, POST: unsubscribe } = await import('../src/app/api/unsubscribe/[token]/route')
  const { GET: exportCsv } = await import('../src/app/api/campaigns/[id]/analytics/export/route')
  const { analyticsReport, recipientPage, parseAnalyticsQuery, csvCell, rate } = await import('../src/lib/email/analytics')
  const campaign = await prisma.campaign.create({ data: { id:'analytics-proof', name:'Synthetic analytics proof',subject:'No email sent', content:'<a href="https://example.com/tickets?a=1&amp;b=2">Tickets top</a><a href=\'https://example.com/tickets?a=1&amp;b=2\'>Tickets bottom</a><a href="https://example.com/"><img alt="Cast" src="https://example.com/image.jpg"></a>' } })
  const contact = await prisma.contact.create({ data: { email:'analytics@example.test',fullName:'=FORMULA',solicitation:true } })
  const recipient = await prisma.campaignRecipient.create({ data:{ id:'analytics-recipient',campaignId:campaign.id,contactId:contact.id,email:contact.email,fullName:contact.fullName,analyticsVersion:1,status:'SENDING',provider:'ses',providerMessageId:'provider-proof' } })
  let index=0
  const event = (kind:string,at:string,extras:Record<string,unknown>={}) => ({ Type:'Notification' as const,MessageId:`proof-${++index}`,TopicArn:'synthetic',Timestamp:at,SignatureVersion:'1' as const,Signature:'synthetic',SigningCertURL:'https://sns.ca-central-1.amazonaws.com/SimpleNotificationService-test.pem', Message:JSON.stringify({eventType:kind, mail:{messageId:'provider-proof',timestamp:at,tags:{recipient_id:[recipient.id]}}, ...extras}) })
  const context={params:Promise.resolve({id:recipient.id})}
  const target='https://example.com/tickets?a=1&b=2'
  const token=createTrackingToken(recipient.id,target,{campaignId:campaign.id,linkKey:'placement-1',label:'Link 1: Tickets top'})
  const tracked=`http://localhost/api/track/click/${recipient.id}?t=${encodeURIComponent(token)}`
  try {
    await t.test('placement identities distinguish duplicate targets and preserve entity decoding', async()=>{
      const message=buildCampaignEmail(campaign,recipient)
      const links=[...message.html.matchAll(/href="([^"]*\/api\/track\/click\/[^\"]+)"/g)].map(m=>m[1])
      assert.equal(links.length,5) // three authored placements plus both template footer sites
      assert.notEqual(links[0],links[1])
      assert.ok(!message.html.includes('/api/track/open/'))
    })
    await t.test('signed link rejects tamper, recipient and campaign mismatch; HEAD does not count',async()=>{
      assert.equal((await click(new NextRequest(tracked+'x'),context)).status,400)
      assert.equal((await click(new NextRequest(tracked),{params:Promise.resolve({id:'wrong'})})).status,400)
      const wrong=createTrackingToken(recipient.id,target,{campaignId:'wrong',linkKey:'placement-1',label:'wrong'})
      assert.equal((await click(new NextRequest(`http://localhost/?t=${wrong}`),context)).status,404)
      const unsafe=createTrackingToken(recipient.id,'javascript:alert(1)')
      assert.equal((await click(new NextRequest(`http://localhost/?t=${unsafe}`),context)).status,400)
      assert.equal((await clickHead()).status,405)
      assert.equal(await prisma.emailAnalyticsEvent.count(),0)
    })
    await t.test('signed click persists before redirect; repeat clicks are total events, one unique recipient',async()=>{
      for(let i=0;i<2;i++) {
        const response=await click(new NextRequest(tracked),context)
        assert.equal(response.status,302);assert.equal(response.headers.get('location'),target)
        assert.match(response.headers.get('cache-control')||'',/no-store/)
      }
      const report=await analyticsReport(campaign.id)
      assert.equal(report.links[0].total,2);assert.equal(report.links[0].unique,1)
      assert.equal(report.summary.clicked,1)
    })
    await t.test('capture storage failure is explicit 503 and no redirect, not silent evidence loss',async()=>{
      await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_analytics() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic storage failure'; END $$`)
      await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_analytics BEFORE INSERT ON "EmailAnalyticsEvent" FOR EACH ROW EXECUTE FUNCTION reject_analytics()`)
      try { const response=await click(new NextRequest(tracked),context);assert.equal(response.status,503);assert.equal(response.headers.get('location'),null) }
      finally { await prisma.$executeRawUnsafe('DROP TRIGGER reject_analytics ON "EmailAnalyticsEvent"') }
    })
    await t.test('SNS duplicate is idempotent; earlier late event retains first timestamp; mirrors excluded',async()=>{
      const first=event('Open','2026-10-13T15:00:00Z',{open:{timestamp:'2026-10-13T15:00:00Z',isBotEvent:'Likely',ipAddress:'private-ip',userAgent:'private-agent'}})
      assert.equal((await ingest(first)).duplicate,false);assert.equal((await ingest(first)).duplicate,true)
      await ingest(event('Open','2026-10-13T14:00:00Z',{open:{timestamp:'2026-10-13T14:00:00Z',isBotEvent:'Unlikely'}}))
      await ingest(event('Click','2026-10-13T15:01:00Z',{click:{timestamp:'2026-10-13T15:01:00Z',link:tracked,isBotEvent:'Likely'}}))
      const row=await prisma.campaignRecipient.findUniqueOrThrow({where:{id:recipient.id}})
      assert.equal(row.openedAt?.toISOString(),'2026-10-13T14:00:00.000Z')
      assert.equal((await analyticsReport(campaign.id)).links[0].total,2)
      assert.equal(await prisma.emailAnalyticsEvent.count({where:{kind:'CLICKED',canonical:false}}),1)
      const payloads=JSON.stringify(await prisma.emailProviderEvent.findMany())
      assert.ok(!payloads.includes('private-ip'));assert.ok(!payloads.includes('private-agent'));assert.ok(!payloads.includes(token))
    })
    await t.test('signed private pixel rejects unsigned requests and never doubles SES open totals',async()=>{
      assert.equal((await open(new NextRequest('http://localhost'),context)).status,400)
      const token=createOpenToken(recipient.id,campaign.id)
      assert.equal((await open(new NextRequest(`http://localhost/?t=${token}`),context)).status,200)
      assert.equal(await prisma.emailAnalyticsEvent.count({where:{kind:'OPENED',canonical:true}}),2)
    })
    await t.test('delivery evidence survives late acceptance without current-status regression',async()=>{
      await ingest(event('Delivery','2026-10-13T13:01:00Z',{delivery:{timestamp:'2026-10-13T13:01:00Z'}}))
      await ingest(event('Send','2026-10-13T13:00:00Z'))
      const row=await prisma.campaignRecipient.findUniqueOrThrow({where:{id:recipient.id}})
      assert.equal(row.status,'DELIVERED');assert.ok(row.acceptedAt);assert.ok(row.deliveredAt)
    })
    await t.test('unsubscribe GET is scanner-safe; POST attributes exact campaign and is idempotent',async()=>{
      const token=createUnsubscribeToken(contact.id,undefined,{campaignId:campaign.id,recipientId:recipient.id})
      const ctx={params:Promise.resolve({token})}
      assert.equal((await unsubscribeGet(new NextRequest('http://localhost'),ctx)).status,200)
      assert.equal(await prisma.emailAnalyticsEvent.count({where:{kind:'UNSUBSCRIBED'}}),0)
      for(let i=0;i<2;i++) assert.equal((await unsubscribe(new NextRequest('http://localhost',{method:'POST'}),ctx)).status,200)
      assert.equal(await prisma.emailAnalyticsEvent.count({where:{kind:'UNSUBSCRIBED'}}),1)
      assert.ok((await prisma.campaignRecipient.findUniqueOrThrow({where:{id:recipient.id}})).unsubscribedAt)
    })
    await t.test('bounce is final, complaint stays suppressed after late delivery, timestamp evidence retained',async()=>{
      await ingest(event('Bounce','2026-10-13T16:00:00Z',{bounce:{bounceType:'Transient',bounceSubType:'MailboxFull',timestamp:'2026-10-13T16:00:00Z'}}))
      assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({where:{id:recipient.id}})).status,'FAILED')
      await ingest(event('Complaint','2026-10-13T17:00:00Z',{complaint:{timestamp:'2026-10-13T17:00:00Z'}}))
      await ingest(event('Delivery','2026-10-13T13:02:00Z',{delivery:{timestamp:'2026-10-13T13:02:00Z'}}))
      const row=await prisma.campaignRecipient.findUniqueOrThrow({where:{id:recipient.id}})
      assert.equal(row.status,'SUPPRESSED');assert.ok(row.complainedAt);assert.equal(row.deliveredAt?.toISOString(),'2026-10-13T13:01:00.000Z')
    })
    await t.test('filter/export parity and formula-safe CSV; no token/raw metadata leak',async()=>{
      const query=parseAnalyticsQuery(new URLSearchParams('filter=clicked&q=analytics&link=placement-1'))
      const rows=await recipientPage(campaign.id,query);assert.equal(rows.total,1)
      const response=await exportCsv(new Request('http://localhost?filter=clicked&q=analytics&link=placement-1'),{params:Promise.resolve({id:campaign.id})})
      const csv=await response.text();assert.equal(csv.trim().split('\r\n').length,2)
      assert.ok(csv.includes("'=FORMULA"));assert.ok(!csv.includes(token));assert.ok(!csv.includes('private-ip'))
      assert.match(csvCell(' \t=2+2'),/^"'/);assert.equal(rate(0,0),'—')
      assert.equal((await recipientPage(campaign.id,parseAnalyticsQuery(new URLSearchParams('filter=unopened')))).total,0)
    })
    await t.test('prototype keys cannot bypass filter whitelist; automation view is reversible and exports match', async()=>{
      for(const value of ['__proto__','constructor','toString']) assert.equal(parseAnalyticsQuery(new URLSearchParams(`filter=${value}`)).filter,'all')
      const c=await prisma.contact.create({data:{email:'automated@example.test'}})
      const r=await prisma.campaignRecipient.create({data:{campaignId:campaign.id,contactId:c.id,email:c.email,status:'DELIVERED',deliveredAt:new Date(),openedAt:new Date(),analyticsVersion:1}})
      await prisma.emailAnalyticsEvent.create({data:{eventKey:'likely-only',campaignId:campaign.id,recipientId:r.id,kind:'OPENED',source:'ses',occurredAt:new Date(),automation:'likely_automated'}})
      const included=await analyticsReport(campaign.id), excluded=await analyticsReport(campaign.id,true)
      assert.equal(included.summary.opened-excluded.summary.opened,1)
      const query=parseAnalyticsQuery(new URLSearchParams('filter=opened&automation=exclude_likely'))
      assert.equal((await recipientPage(campaign.id,query)).total,1)
      const output=await exportCsv(new Request('http://localhost?filter=opened&automation=exclude_likely'),{params:Promise.resolve({id:campaign.id})})
      assert.ok(!(await output.text()).includes('automated@example.test'))
      const links=await exportCsv(new Request('http://localhost?view=links'),{params:Promise.resolve({id:campaign.id})})
      assert.ok((await links.text()).includes('placement-2')) // zero-click tracked inventory
      const events=await exportCsv(new Request('http://localhost?view=events&filter=clicked'),{params:Promise.resolve({id:campaign.id})})
      const csv=await events.text();assert.ok(csv.includes('Tickets top'));assert.ok(!csv.includes(token))
    })
    await t.test('delivery delay keeps actual event time; late bounce cannot undo complaint suppression',async()=>{
      await ingest(event('DeliveryDelay','2026-10-13T13:00:00Z',{deliveryDelay:{timestamp:'2026-10-13T18:00:00Z'}}))
      const delay=await prisma.emailAnalyticsEvent.findFirstOrThrow({where:{kind:'DELAYED'}})
      assert.equal(delay.occurredAt.toISOString(),'2026-10-13T18:00:00.000Z')
      await ingest(event('Bounce','2026-10-13T16:00:00Z',{bounce:{bounceType:'Transient',timestamp:'2026-10-13T16:00:00Z'}}))
      assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({where:{id:recipient.id}})).status,'SUPPRESSED')
    })
    await t.test('14k recipients use bounded pagination and matching streaming export',async()=>{
      const bulk=await prisma.campaign.create({data:{id:'analytics-14k',name:'Synthetic volume',subject:'Never sent',content:'<p>Fixture</p>'}})
      for(let batch=0;batch<14;batch++) {
        const contacts=Array.from({length:1000},(_,i)=>({id:`volume-${batch*1000+i}`,email:`volume-${String(batch*1000+i).padStart(5,'0')}@example.test`}))
        await prisma.contact.createMany({data:contacts})
        await prisma.campaignRecipient.createMany({data:contacts.map(c=>({id:c.id,contactId:c.id,email:c.email,campaignId:bulk.id,status:'QUEUED'}))})
      }
      const started=performance.now(), result=await recipientPage(bulk.id,parseAnalyticsQuery(new URLSearchParams('page=280')))
      assert.equal(result.total,14000);assert.equal(result.rows.length,50);assert.equal(result.page,280)
      assert.ok(performance.now()-started<2000,'indexed paginated read under 2s locally')
      const report=await analyticsReport(bulk.id);assert.equal(report.summary.delivered,0);assert.equal(report.summary.opened,0)
      const output=await exportCsv(new Request('http://localhost?filter=queued'),{params:Promise.resolve({id:bulk.id})})
      assert.equal((await output.text()).trim().split('\r\n').length,14001)
    })
  } finally { await prisma.$disconnect() }
})
