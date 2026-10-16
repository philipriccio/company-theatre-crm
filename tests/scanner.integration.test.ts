import assert from 'node:assert/strict'
import test from 'node:test'
test('behavioral scanner classification and report parity', {skip:process.env.CRM_ANALYTICS_PROOF!=='1'},async t=>{
  const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.pathname,'/crm_analytics_test');assert.match(url.searchParams.get('host')||'',/^\/tmp\/company-crm-analytics\.[A-Za-z0-9]+$/)
  const {prisma}=await import('../src/lib/db')
  const {recordTracking}=await import('../src/lib/email/analytics-capture')
  const {classifyClickBurst}=await import('../src/lib/email/scanner-classification')
  const {analyticsReport,recipientPage,parseAnalyticsQuery}=await import('../src/lib/email/analytics')
  const {combinedSummary,combinedLinks,combinedRecipientPage,parseCombinedQuery}=await import('../src/lib/email/combined-analytics')
  const {GET:batchCsv}=await import('../src/app/api/campaigns/[id]/analytics/export/route')
  const {GET:combinedCsv}=await import('../src/app/api/campaigns/analytics/export/route')
  const ids=['scanner-proof-a','scanner-proof-b']
  const contact=await prisma.contact.create({data:{email:'scanner-proof@example.test'}})
  for(const id of ids){await prisma.campaign.create({data:{id,name:id,subject:'Synthetic',content:'<p>Test</p>'}});await prisma.campaignRecipient.create({data:{id:id+'-r',campaignId:id,contactId:contact.id,email:contact.email,analyticsVersion:1,status:'DELIVERED',sentAt:new Date(),deliveredAt:new Date()}})}
  const capture=(batch:number,n:number)=>recordTracking({recipientId:ids[batch]+'-r',campaignId:ids[batch],kind:'CLICKED',linkKey:`placement-${n}`,targetUrl:`https://example.test/${n}`})
  const params='q=scanner-proof&filter=clicked&automation=exclude_likely'
  try {
    await t.test('concurrent three-placement burst is classified, same-contact other batch remains unknown',async()=>{
      await capture(1,9)
      await Promise.all([1,2,3].map(n=>capture(0,n)))
      const rows=await prisma.emailAnalyticsEvent.findMany({where:{campaignId:ids[0]}})
      assert.equal(rows.length,3);assert.ok(rows.every(e=>e.automation==='likely_automated'&&e.detail?.includes('behavioral_burst_v1')))
      assert.equal((await prisma.emailAnalyticsEvent.findFirstOrThrow({where:{campaignId:ids[1]}})).automation,'unknown')
    })
    await t.test('batch and combined totals, recipient/link filters and CSV exclude same burst, raw retained',async()=>{
      assert.equal((await analyticsReport(ids[0])).summary.clicked,1)
      assert.equal((await analyticsReport(ids[0],true)).summary.clicked,0)
      assert.equal((await recipientPage(ids[0],parseAnalyticsQuery(new URLSearchParams(params)))).total,0)
      const q=parseCombinedQuery(new URLSearchParams(params));assert.equal((await combinedSummary(q)).totals.clicked,1);assert.equal((await combinedRecipientPage(q)).total,1)
      assert.deepEqual((await combinedLinks(q)).map(l=>l.linkKey),['placement-9'])
      const raw=await (await batchCsv(new Request('http://localhost?view=events'),{params:Promise.resolve({id:ids[0]})})).text();assert.ok(raw.includes('behavioral_burst_v1'))
      const filtered=await (await batchCsv(new Request('http://localhost?view=events&automation=exclude_likely'),{params:Promise.resolve({id:ids[0]})})).text();assert.ok(!filtered.includes('scanner-proof@example.test'))
      const csv=await (await combinedCsv(new Request('http://localhost?'+params+'&view=links'))).text();assert.ok(csv.includes('placement-9'));assert.ok(!csv.includes('placement-1'))
    })
    await t.test('later ordinary click remains visible and timestamp updates only filtered view',async()=>{
      await prisma.emailAnalyticsEvent.updateMany({where:{campaignId:ids[0]},data:{occurredAt:new Date(Date.now()-10000)}})
      await capture(0,1)
      assert.equal((await analyticsReport(ids[0],true)).summary.clicked,1)
      assert.equal((await analyticsReport(ids[0],true)).links.reduce((n,l)=>n+l.total,0),1)
      assert.equal((await prisma.emailAnalyticsEvent.count({where:{campaignId:ids[0]}})),4)
    })
    await t.test('repeated one-link requests and slow three-link sequence stay unknown',async()=>{
      const base=new Date('2026-01-01T00:00:00Z')
      for(let n=0;n<3;n++) await prisma.emailAnalyticsEvent.create({data:{eventKey:`scanner-slow-${n}`,recipientId:ids[1]+'-r',campaignId:ids[1],kind:'CLICKED',source:'app',canonical:true,linkKey:`slow-${n}`,occurredAt:new Date(base.getTime()+n*3000)}})
      await prisma.$transaction(tx=>classifyClickBurst(tx,ids[1]+'-r',ids[1],new Date(base.getTime()+6000)))
      await Promise.all([9,9,9].map(n=>capture(1,n)))
      await capture(1,10) // Two distinct rapid links can be ordinary exploration.
      assert.equal(await prisma.emailAnalyticsEvent.count({where:{campaignId:ids[1],automation:'likely_automated'}}),0)
    })
  } finally {await prisma.campaign.deleteMany({where:{id:{in:ids}}});await prisma.contact.delete({where:{id:contact.id}});await prisma.$disconnect()}
})
