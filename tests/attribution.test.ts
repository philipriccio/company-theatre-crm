import assert from 'node:assert/strict'
import test from 'node:test'
import { attributionContext, attributedUrl, ATTRIBUTION_MARKER } from '../src/lib/email/attribution'
import { buildCampaignEmail } from '../src/lib/email/message'
import { verifyTrackingToken } from '../src/lib/email/tokens'
process.env.EMAIL_TOKEN_SECRET = 'synthetic-attribution-test-secret'
const campaign = { id:'private-batch-id', content:`${ATTRIBUTION_MARKER}<a href="https://jackpottwins.ca/#tickets">Go</a>`, subject:'Synthetic',fromName:'Test',fromEmail:'test@example.test' }
const recipient = { id:'private-recipient', contactId:'private-contact',email:'private@example.test',firstName:'Private Name' }
function destinations(html:string) {
  return [...html.matchAll(/href="([^"]+)"/g)].flatMap(m=>{
    const t = new URL(m[1]).searchParams.get('t')
    if (!t) return []
    const verified=verifyTrackingToken(t);assert.ok(verified.ok);return [verified.url]
  })
}
test('opt-in alone enables non-personal campaign, creative, batch and placement tags',()=>{
  const urls=destinations(buildCampaignEmail(campaign,recipient).html)
  assert.ok(urls.length>=3)
  for(const target of urls) {
    const u=new URL(target)
    assert.equal(u.searchParams.get('utm_medium'),'email')
    assert.match(u.searchParams.get('utm_content')!,/^creative-[a-f0-9]{12}-placement-\d+$/)
    assert.match(u.searchParams.get('utm_id')!,/^batch-[a-f0-9]{12}$/)
    assert.ok(!target.includes('private')); assert.ok(!target.includes('Private'))
  }
  assert.equal(new URL(urls[0]).hash,'#tickets')
  assert.notEqual(new URL(urls[0]).searchParams.get('utm_content'),new URL(urls[1]).searchParams.get('utm_content'))
  assert.deepEqual(destinations(buildCampaignEmail(campaign,{...recipient,id:'different',email:'different@example.test'}).html),urls)
})
test('unopted current approved content retains original destinations',()=>{
  const content=campaign.content.replace(ATTRIBUTION_MARKER,'')
  assert.equal(attributionContext({...campaign,content}),undefined)
  assert.equal(destinations(buildCampaignEmail({...campaign,content},recipient).html)[0],'https://jackpottwins.ca/#tickets')
})
test('preserves explicit UTM values, ordinary query values and anchors',()=>{
  const original=new URL('https://www.mirvish.com/shows/jackpot-twins?utm_campaign=approved&utm_content=authored&a=hello%20world#dates')
  const u=new URL(attributedUrl(original,attributionContext(campaign)!,2))
  assert.equal(u.searchParams.get('utm_campaign'),'approved');assert.equal(u.searchParams.get('utm_content'),'authored')
  assert.equal(u.searchParams.get('a'),'hello world');assert.equal(u.hash,'#dates')
  assert.equal(original.searchParams.get('utm_medium'),null)
})
test('signed, unsubscribe and unrelated destinations are not modified',()=>{
  for(const path of ['/api/unsubscribe/token','/unsubscribe/token','/api/track/click/r?t=x','/?signature=abc','/?X-Amz-Signature=abc']) {
    const u=new URL(path,'https://jackpottwins.ca');assert.equal(attributedUrl(u,attributionContext(campaign)!,1),u.toString())
  }
  const u=new URL('https://other.example/?a=1#x');assert.equal(attributedUrl(u,attributionContext(campaign)!,1),u.toString())
  const html=buildCampaignEmail({...campaign,content:`${ATTRIBUTION_MARKER}<a href="mailto:test@example.test">Mail</a><a href="https://jackpottwins.ca/?signature=abc">Signed</a>`},recipient).html
  assert.ok(html.includes('href="mailto:test@example.test"'));assert.ok(html.includes('href="https://jackpottwins.ca/?signature=abc"'))
})
