import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { NextRequest } from 'next/server'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { authenticateWebsiteSignup, parseWebsiteSignup, recordWebsiteSignup } from '../src/lib/website-signup'
import { POST } from '../src/app/api/website-signups/route'
const payload = { email: ' Visitor@Example.com ', source: 'jackpottwins.ca', consent: true, consentVersion: 'jt-site-signup-v2' }
test('auth and consent fail closed before database access', async () => {
  delete process.env.CRM_WEBSITE_SIGNUP_TOKEN
  assert.throws(() => authenticateWebsiteSignup(null), /not configured/)
  process.env.CRM_WEBSITE_SIGNUP_TOKEN = randomBytes(32).toString('hex')
  authenticateWebsiteSignup(process.env.CRM_WEBSITE_SIGNUP_TOKEN)
  assert.throws(() => authenticateWebsiteSignup('wrong'), /Unauthorized/)
  assert.equal(parseWebsiteSignup(payload).email, 'visitor@example.com')
  for (const value of [{...payload, source:'evil.test'}, {...payload, consent:false}, {...payload, consentVersion:'old'}, {...payload, extra:1}, {...payload,email:'a@example.com,b@example.com'}]) assert.throws(() => parseWebsiteSignup(value))
  for (const [body, status] of [['{',400], [' '.repeat(5000),413], [JSON.stringify({...payload,consent:false}),400]] as const) {
    const res=await POST(new NextRequest('http://localhost/api/website-signups',{method:'POST',headers:{'content-type':'application/json','x-website-signup-token':process.env.CRM_WEBSITE_SIGNUP_TOKEN},body}))
    assert.equal(res.status,status)
  }
})
test('isolated real HTTP website proxy → CRM route → PostgreSQL', {skip:process.env.CRM_ISOLATED_PROOF!=='1'}, async t => {
  const url=new URL(process.env.DATABASE_URL || '')
  assert.equal(url.pathname,'/crm_readiness_test');assert.match(url.searchParams.get('host')||'',/^\/tmp\/company-crm-readiness\./)
  const {prisma}=await import('../src/lib/db')
  const server=createServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req) chunks.push(Buffer.from(chunk))
    const response=await POST(new NextRequest('http://localhost/api/website-signups',{method:'POST',headers:req.headers as Record<string,string>,body:Buffer.concat(chunks)}))
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text())
  })
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const address=server.address() as {port:number}
  const token=process.env.CRM_WEBSITE_SIGNUP_TOKEN=randomBytes(32).toString('hex')
  const call=(input:object)=>fetch(`http://127.0.0.1:${address.port}/api/website-signups`,{method:'POST',headers:{'content-type':'application/json','x-website-signup-token':token},body:JSON.stringify(input)})
  try {
    await t.test('concurrent and case-normalized submissions are one contact, durable evidence',async()=>{
      const results=await Promise.all(Array.from({length:5},()=>call(payload)))
      assert.ok(results.every(r=>r.status===200))
      assert.equal(await prisma.contact.count({where:{email:'visitor@example.com'}}),1)
      assert.equal(await prisma.consentEvidence.count({where:{email:'visitor@example.com'}}),5)
    })
    await t.test('both real proxy implementations: source, tags, fail-closed downstream',async()=>{
      for (const [dir,source,version,tag] of [['jt-signup-release','jackpottwins.ca','jt-site-signup-v2','Jackpot Website'],['ct-signup-release','companytheatre.ca','ct-site-signup-v1','Website Signup']]) {
        const {handleSignup}=await import(`../../${dir}/lib/signup.ts`)
        const email=dir+'@example.com'
        const env={CRM_URL:'https://crm.companytheatre.ca',CRM_AUTH:'synthetic:local-proof',CRM_WEBSITE_SIGNUP_TOKEN:token}
        const request=()=>new Request(`https://${source}/api/signup`,{method:'POST',headers:{origin:`https://${source}`,'content-type':'application/json'},body:JSON.stringify({email,consent:true,consentVersion:version})})
        const fetcher:typeof fetch=async(_url,init)=>fetch(`http://127.0.0.1:${address.port}/api/website-signups`,init)
        const response=await handleSignup(request(),env,fetcher)
        assert.equal(response.status,200);assert.equal((await response.json()).subscribed,true)
        const contact=await prisma.contact.findUniqueOrThrow({where:{email},include:{tags:{include:{tag:true}}}})
        assert.equal(contact.solicitation,true);assert.ok(contact.tags.some(t=>t.tag.name===tag))
        const evidence=await prisma.consentEvidence.findFirstOrThrow({where:{contactId:contact.id}})
        assert.equal(evidence.source,source);assert.equal((evidence.metadata as {textVersion:string}).textVersion,version)
        assert.equal((await handleSignup(request(),{},fetcher)).status,503)
        assert.equal((await handleSignup(request(),env,async()=>new Response('unavailable',{status:503}))).status,502)
        assert.equal((await handleSignup(request(),env,async()=>Response.json({success:true}))).status,502)
      }
    })
    await t.test('legacy no-solicitation, unsubscribe, global suppression remain blocked',async()=>{
      for (const kind of ['manual','unsubscribe','global']) {
        const email=kind+'@example.com'
        const contact=await prisma.contact.create({data:{email:email.toUpperCase(),firstName:'Original',solicitation:kind==='global',...(kind==='unsubscribe'?{unsubscribedAt:new Date()}:{}),metadata:{retain:true}}})
        if(kind==='global')await prisma.globalSuppression.create({data:{email,emailHash:'proof-'+kind,source:'proof',reason:'complaint'}})
        assert.equal((await (await call({...payload,email,firstName:'Replacement'})).json()).subscribed,false)
        const after=await prisma.contact.findUniqueOrThrow({where:{id:contact.id}})
        assert.equal(after.firstName,'Original');assert.deepEqual(after.metadata,{retain:true});assert.equal(after.solicitation,false)
      }
    })
    await t.test('colliding legacy case identities refuse without partial evidence',async()=>{
      await prisma.contact.createMany({data:[{email:'Collision@example.com'},{email:'collision@example.com'}]})
      const before=await prisma.consentEvidence.count()
      assert.equal((await call({...payload,email:'collision@example.com'})).status,409)
      assert.equal(await prisma.consentEvidence.count(),before)
    })
    await t.test('real desktop/mobile forms → HTTP → isolated DB and truthful review/error UI', {skip:process.env.CRM_BROWSER_PROOF!=='1'}, async()=>{
      const require=createRequire(import.meta.url)
      await require('./signup-browser-proof.cjs')(address.port,token,prisma)
    })
    await t.test('late evidence failure rolls back contact and tag transaction',async()=>{
      await prisma.$executeRawUnsafe(`CREATE FUNCTION proof_reject_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rollback'; END $$`)
      await prisma.$executeRawUnsafe(`CREATE TRIGGER proof_reject_consent BEFORE INSERT ON "ConsentEvidence" FOR EACH ROW EXECUTE FUNCTION proof_reject_consent()`)
      try {await assert.rejects(recordWebsiteSignup(parseWebsiteSignup({...payload,email:'rollback@example.com'})));assert.equal(await prisma.contact.count({where:{email:'rollback@example.com'}}),0)}
      finally {await prisma.$executeRawUnsafe('DROP TRIGGER proof_reject_consent ON "ConsentEvidence"');await prisma.$executeRawUnsafe('DROP FUNCTION proof_reject_consent()')}
    })
    await t.test('proxy canonical origins, input limits and bounded burst protection', async()=>{
      for(const [dir,site,version] of [['jt-signup-release','jackpottwins.ca','jt-site-signup-v2'],['ct-signup-release','companytheatre.ca','ct-site-signup-v1']]) {
        const {handleSignup}=await import(`../../${dir}/lib/signup.ts`)
        const env={NODE_ENV:'production',CRM_URL:'https://crm.companytheatre.ca',CRM_AUTH:'synthetic:local-proof',CRM_WEBSITE_SIGNUP_TOKEN:token}
        const req=(origin:string|undefined,body=JSON.stringify({email:'proof@example.com',consent:true,consentVersion:version}))=>new Request('http://internal:3000/api/signup',{method:'POST',headers:{...(origin?{origin}:{}),'content-type':'application/json'},body})
        const mock=async()=>Response.json({recorded:true,subscribed:true})
        assert.equal((await handleSignup(req(undefined),env,mock)).status,403)
        assert.equal((await handleSignup(req('https://evil.test'),env,mock)).status,403)
        assert.equal((await handleSignup(req(`https://${site}`),env,mock)).status,200)
        assert.equal((await handleSignup(req(`https://www.${site}`),env,mock)).status,200)
        assert.equal((await handleSignup(req(`https://${site}`,' '.repeat(4097)),env,mock)).status,413)
        assert.equal((await handleSignup(req(`https://${site}`,'{'),env,mock)).status,400)
        const results:number[]=[];for(let i=0;i<61;i++)results.push((await handleSignup(req(`https://${site}`),{},mock)).status)
        assert.equal(results.at(-1),429)
      }
    })
  } finally {
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))
    await prisma.$disconnect();await (globalThis as unknown as {pool?:{end():Promise<void>}}).pool?.end()
  }
})
