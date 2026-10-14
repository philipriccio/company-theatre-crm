import assert from 'node:assert/strict'
import test from 'node:test'

test('combined analytics isolated proof', {skip:process.env.CRM_ANALYTICS_PROOF!=='1'}, async t=>{
  const url=new URL(process.env.DATABASE_URL||'')
  assert.equal(url.pathname,'/crm_analytics_test')
  assert.match(url.searchParams.get('host')||'',/^\/tmp\/company-crm-analytics\.[A-Za-z0-9]+$/)
  const {prisma}=await import('../src/lib/db')
  const {parseCombinedQuery,torontoMidnight,combinedSummary,combinedRecipientPage}=await import('../src/lib/email/combined-analytics')
  const {GET:exportCsv}=await import('../src/app/api/campaigns/analytics/export/route')
  const query=(params='')=>parseCombinedQuery(new URLSearchParams(params))
  const prefix='combined-proof'
  const campaigns=await Promise.all(['a','b'].map(x=>prisma.campaign.create({data:{id:`${prefix}-${x}`,name:`Combined ${x}`,subject:'Not sent',content:'<p>Synthetic</p>',createdAt:new Date('2026-01-01Z')}})))
  const contacts=await Promise.all([0,1,2,3].map(i=>prisma.contact.create({data:{id:`${prefix}-contact-${i}`,email:`combined-proof-${i}@example.test`}})))
  const times=['2026-10-14T03:59:59.999Z','2026-10-14T04:00:00Z','2026-10-15T03:59:59.999Z','2026-10-15T04:00:00Z']
  try {
    for(let i=0;i<times.length;i++) await prisma.campaignRecipient.create({data:{id:`${prefix}-${i}`,campaignId:campaigns[i%2].id,contactId:contacts[Math.floor(i/2)].id,email:contacts[Math.floor(i/2)].email,fullName:'Combined Person',status:i===2?'FAILED':'DELIVERED',sentAt:i===1?null:new Date(times[i]),acceptedAt:new Date(times[i]),deliveredAt:new Date(times[i]),openedAt:i===2?new Date(times[i]):null,clickedAt:i===2?new Date(times[i]):null,bouncedAt:i===2?new Date(times[i]):null,bounceType:i===2?'Transient:General':null,analyticsVersion:1}})
    await prisma.campaignRecipient.create({data:{id:`${prefix}-held`,campaignId:campaigns[0].id,contactId:contacts[2].id,email:contacts[2].email,status:'CANCELLED'}})
    await prisma.campaignRecipient.create({data:{id:`${prefix}-unknown`,campaignId:campaigns[0].id,contactId:contacts[3].id,email:contacts[3].email,status:'UNKNOWN'}})
    await t.test('Toronto inclusive send-day boundaries include accepted fallback across batches, not campaign creation',async()=>{
      const q=query('q=combined-proof&from=2026-10-14&to=2026-10-14')
      const report=await combinedSummary(q), page=await combinedRecipientPage(q)
      assert.equal(report.totals.sent,2);assert.equal(report.batches.length,2)
      assert.equal(report.totals.currentDelivered,1);assert.equal(report.totals.deliveryEvidence,2)
      assert.equal(report.totals.bounced,1);assert.equal(report.totals.opened,1)
      assert.deepEqual(page.rows.map(r=>r.id).sort(),[`${prefix}-1`,`${prefix}-2`])
      assert.equal(report.statuses.reduce((n,r)=>n+r._count,0),2)
    })
    await t.test('all-date default includes both batches without deduping repeated people or adding unsent holds/unknown',async()=>{
      const report=await combinedSummary(query('q=combined-proof'))
      assert.equal(report.totals.sent,4)
      assert.equal(report.batches.reduce((n,b)=>n+b.metrics.sent,0),4)
      const all=await combinedSummary(query())
      assert.ok(all.totals.sent>=4)
      assert.equal(all.batches.find(b=>b.id==='analytics-14k'),undefined)
    })
    await t.test('date-only filtering follows the whole Toronto day through DST transitions',async()=>{
      assert.equal(torontoMidnight('2026-03-08').toISOString(),'2026-03-08T05:00:00.000Z')
      assert.equal(torontoMidnight('2026-03-09').toISOString(),'2026-03-09T04:00:00.000Z')
      assert.equal(torontoMidnight('2026-11-01').toISOString(),'2026-11-01T04:00:00.000Z')
      assert.equal(torontoMidnight('2026-11-02').toISOString(),'2026-11-02T05:00:00.000Z')
      assert.equal(query('from=2026-03-08&to=2026-03-08').end!.getTime()-query('from=2026-03-08').start!.getTime(),23*3600000)
      assert.equal(query('from=2026-11-01&to=2026-11-01').end!.getTime()-query('from=2026-11-01').start!.getTime(),25*3600000)
    })
    await t.test('invalid and reversed dates fail closed including export',async()=>{
      for(const value of ['from=2026-02-30','to=bad','from=2026-11-02&to=2026-11-01','from=2026-2-01']) {
        const q=query(value);assert.ok(q.error)
        assert.equal((await combinedRecipientPage(q)).total,0)
        assert.equal((await combinedSummary(q)).totals.sent,0)
        assert.equal((await exportCsv(new Request(`http://localhost?${value}`))).status,400)
      }
    })
    await t.test('search, outcome, date, summary and CSV select exactly the same email evidence',async()=>{
      const search='q=Combined+Person&from=2026-10-14&to=2026-10-14&filter=soft'
      const q=query(search), report=await combinedSummary(q), page=await combinedRecipientPage(q)
      assert.equal(report.totals.sent,1);assert.equal(page.total,1)
      const response=await exportCsv(new Request(`http://localhost?${search}`)), csv=await response.text()
      assert.match(response.headers.get('cache-control')||'',/private/)
      assert.equal(csv.trim().split('\r\n').length,2)
      assert.ok(csv.includes('2026-10-15T03:59:59.999Z'));assert.ok(csv.includes('Transient:General'))
      assert.ok(!csv.includes('2026-10-14T04:00:00.000Z'))
      assert.equal((await combinedRecipientPage(query(search+'&page=999'))).page,1)
    })
    await t.test('sentAt takes precedence over acceptedAt when they cross the boundary',async()=>{
      await prisma.campaignRecipient.update({where:{id:`${prefix}-0`},data:{acceptedAt:new Date('2026-10-14T04:01:00Z')}})
      assert.equal((await combinedRecipientPage(query('q=combined-proof&from=2026-10-14&to=2026-10-14'))).total,2)
    })
    await t.test('likely automation exclusion keeps summaries, list and export timestamps aligned',async()=>{
      await prisma.emailAnalyticsEvent.create({data:{eventKey:'combined-likely',campaignId:campaigns[0].id,recipientId:`${prefix}-2`,kind:'OPENED',source:'synthetic',canonical:true,automation:'likely_automated',occurredAt:new Date(times[2])}})
      const search='q=combined-proof&automation=exclude_likely'
      assert.equal((await combinedSummary(query(search))).totals.opened,0)
      const page=await combinedRecipientPage(query(search))
      assert.equal(page.rows.find(r=>r.id===`${prefix}-2`)?.openedAt,null)
      assert.equal((await combinedRecipientPage(query(search+'&filter=opened'))).total,0)
      const response=await exportCsv(new Request(`http://localhost?${search}&filter=opened`))
      assert.equal((await response.text()).trim().split('\r\n').length,1)
    })
  } finally {await prisma.$disconnect()}
})
