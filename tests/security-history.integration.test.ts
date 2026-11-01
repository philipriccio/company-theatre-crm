import test from 'node:test'
import pg from 'pg'
import { GET as exportContacts } from '../src/app/api/contacts/export/route'
import { NextRequest } from 'next/server'
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { authPool, audit, login, tokenHash, updateProfile } from '../src/lib/auth/store'
import { hashPassword } from '../src/lib/auth/password'
import { history, historyFilter, reviewAlert, exportStarted, businessEvent } from '../src/lib/security/history'
import { guard } from '../src/lib/auth/access'
import { prisma } from '../src/lib/db'
import { recordReview, reviewHash } from '../src/lib/campaign-review'
import { GET, POST } from '../src/app/api/security-history/route'

test('security history: trusted attribution, atomic detection/review, privacy, fail closed and restricted API', {skip:process.env.CRM_AUTH_ISOLATED_PROOF!=='1'},async()=>{
 assert.ok(process.env.DATABASE_URL?.includes('/crm_auth_test?host=/tmp/company-crm-auth.'))
 const id=randomUUID(),email=`history-${id}@example.invalid`,password=randomBytes(24).toString('hex')
 await authPool.query('INSERT INTO "CrmUser" (id,email,name,"passwordHash") VALUES ($1,$2,$3,$4)',[id,email,'Security reviewer',await hashPassword(password)])
 try{
  const token=await login(email,password), cookie=`crm-local-session=${token}`, base='http://127.0.0.1:3257'
  const untrusted=new Request(base+'/api/security-history',{headers:{'x-forwarded-user':id}})
  assert.equal((await GET(untrusted)).status,401)
  const machineId=randomUUID(),machine=`mcrm_${randomBytes(32).toString('hex')}`
  await authPool.query('INSERT INTO "CrmMachineIdentity" (id,name,"tokenHash",scopes,"expiresAt") VALUES ($1,$2,$3,$4,NOW()+INTERVAL \'1 day\')',[machineId,`History ${id}`,tokenHash(machine),['contacts:read','contacts:export','campaigns:read','campaigns:drafts']])
  assert.equal((await GET(new Request(base+'/api/security-history',{headers:{'x-crm-machine-token':machine}}))).status,403)
  assert.equal((await guard(new Request(base+'/api/security-history',{method:'POST',headers:{cookie,origin:'https://attacker.invalid'}})))?.status,403)
  await audit('profile_updated',id,{password:'DO_NOT_STORE',token:'DO_NOT_STORE',body:'DO_NOT_STORE',note:'DO_NOT_STORE',status:200})
  const safe=(await authPool.query('SELECT * FROM "CrmAuthEvent" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1',[id])).rows[0]
  assert.equal(safe.actorType,'human');assert.equal(safe.actorLabel,'Security reviewer');assert.ok(!JSON.stringify(safe).includes('DO_NOT_STORE'))
  await assert.rejects(authPool.query('UPDATE "CrmAuthEvent" SET "kind"=$1 WHERE "id"=$2',['forged',safe.id]),/append-only/)
  await assert.rejects(authPool.query('DELETE FROM "CrmAuthEvent" WHERE "id"=$1',[safe.id]),/append-only/)
  await assert.rejects(audit('forged',randomUUID()),/Unknown security actor/)
  await exportStarted(new Request(base+'/api/contacts/export',{headers:{'x-crm-machine-token':machine}}))
  const exported=(await authPool.query('SELECT * FROM "CrmAuthEvent" WHERE "userId"=$1 AND kind=$2',[machineId,'export_started'])).rows[0]
  assert.equal(exported.actorType,'machine');assert.equal(exported.outcome,'attempt')
  // Concurrent threshold crossing creates one deduplicated alert for this time bucket.
  const subject=tokenHash(randomUUID())
  await Promise.all(Array.from({length:8},()=>audit('login_failed',null,{subject,status:401})))
  const alerts=(await authPool.query('SELECT a.* FROM "CrmSecurityAlert" a JOIN "CrmAuthEvent" e ON e.id=a."eventId" WHERE e.details->>\'subject\'=$1',[subject])).rows
  assert.equal(alerts.length,1);assert.equal(alerts[0].rule,'repeated-login_failed')
  const attempted=(await authPool.query('SELECT "actorType","userId","outcome" FROM "CrmAuthEvent" WHERE details->>\'subject\'=$1 LIMIT 1',[subject])).rows[0]
  assert.equal(attempted.actorType,'unknown');assert.equal(attempted.userId,null);assert.equal(attempted.outcome,'failure')
  const forged=await POST(new Request(base+'/api/security-history',{method:'POST',headers:{cookie,origin:base},body:JSON.stringify({id:alerts[0].id,reviewedBy:'forged'})}))
  assert.equal(forged.status,400)
  const reviews=await Promise.allSettled([reviewAlert(token,alerts[0].id),reviewAlert(token,alerts[0].id)])
  assert.equal(reviews.filter(x=>x.status==='fulfilled').length,1)
  const reviewed=(await authPool.query('SELECT * FROM "CrmSecurityAlert" WHERE id=$1',[alerts[0].id])).rows[0]
  assert.equal(reviewed.reviewedBy,id);assert.equal(reviewed.reviewerName,'Security reviewer');assert.ok(reviewed.reviewedAt)
  await assert.rejects(authPool.query('UPDATE "CrmSecurityAlert" SET "reviewedAt"=NULL WHERE id=$1',[alerts[0].id]),/first alert review/)
  // Audit insertion failure rolls back business mutation and does not claim success.
  const campaign=await prisma.campaign.create({data:{name:'Security synthetic',subject:'Synthetic',content:'Synthetic only',fromName:'Synthetic',fromEmail:'synthetic@example.invalid'}})
  await assert.rejects(prisma.$transaction(async tx=>{await tx.campaign.update({where:{id:campaign.id},data:{subject:'Must rollback'}});await businessEvent(tx,randomUUID(),'campaign_send_approved',campaign.id)}))
  assert.equal((await prisma.campaign.findUniqueOrThrow({where:{id:campaign.id}})).subject,'Synthetic')
  await recordReview(campaign.id,{action:'APPROVE',author:'Forged person',note:'PRIVATE CONTENT',contentHash:reviewHash(campaign)},{id,name:'Security reviewer'})
  const review=await prisma.campaignReview.findFirstOrThrow({where:{campaignId:campaign.id}})
  assert.equal(review.author,'Security reviewer')
  const record=(await authPool.query('SELECT * FROM "CrmAuthEvent" WHERE "resourceId"=$1',[campaign.id])).rows
  assert.equal(record.length,1);assert.equal(record[0].userId,id);assert.equal(record[0].kind,'campaign_review_approve');assert.ok(!JSON.stringify(record).includes('PRIVATE CONTENT'))
  // Account names permit 120 characters; trusted review attribution must accept that bound.
  const longName='R'.repeat(120)
  await updateProfile(token,longName)
  await recordReview(campaign.id,{action:'NOTE',note:'Synthetic bounded-name review',contentHash:reviewHash(campaign)},{id,name:longName})
  assert.equal((await prisma.campaignReview.findFirstOrThrow({where:{campaignId:campaign.id,action:'NOTE'}})).author,longName)
  await updateProfile(token,'Reviewer renamed')
  assert.equal((await authPool.query('SELECT "actorLabel" FROM "CrmAuthEvent" WHERE id=$1',[safe.id])).rows[0].actorLabel,'Security reviewer')
  await Promise.all(Array.from({length:55},()=>audit('history_fixture',id)))
  const page=await history(new URLSearchParams({actor:id,kind:'history_fixture'}))
  assert.equal(page.events.length,50);assert.ok(page.next)
  const older=await history(new URLSearchParams({actor:id,kind:'history_fixture',before:page.next!}))
  assert.equal(older.events.length,5);assert.ok(older.events.every(e=>!page.events.some(p=>p.id===e.id)))
  assert.throws(()=>historyFilter(new URLSearchParams({before:"'; DELETE FROM x"})))
  assert.throws(()=>historyFilter(new URLSearchParams({outcome:'anything'})))
  const response=await GET(new Request(base+'/api/security-history?actor='+id,{headers:{cookie}}))
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store, private')
  assert.ok(!JSON.stringify(await response.json()).includes(password))
  // Owner-only outage injection in this disposable cluster; application remains limited-role.
  const ownerUrl=new URL(process.env.DATABASE_URL!);ownerUrl.username='theatre'
  const owner=new pg.Pool({connectionString:ownerUrl.toString(),max:1})
  try {
   assert.match(id,/^[a-f0-9-]{36}$/)
   await owner.query(`CREATE FUNCTION security_history_failure_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId"='${id}' AND NEW.kind IN ('profile_updated','export_started') THEN RAISE EXCEPTION 'Synthetic audit storage failure'; END IF; RETURN NEW; END $$`)
   await owner.query('CREATE TRIGGER security_history_failure_probe BEFORE INSERT ON "CrmAuthEvent" FOR EACH ROW EXECUTE FUNCTION security_history_failure_probe()')
   await assert.rejects(updateProfile(token,'Must not persist'),/Synthetic audit storage failure/)
   assert.equal((await authPool.query('SELECT name FROM "CrmUser" WHERE id=$1',[id])).rows[0].name,'Reviewer renamed')
   const failedExport=await exportContacts(new NextRequest(base+'/api/contacts/export',{headers:{cookie}}))
   assert.equal(failedExport.status,500);assert.ok(!failedExport.headers.get('content-type')?.includes('text/csv'))
  } finally {
   await owner.query('DROP TRIGGER IF EXISTS security_history_failure_probe ON "CrmAuthEvent"')
   await owner.query('DROP FUNCTION IF EXISTS security_history_failure_probe()')
   await owner.end()
  }
  await prisma.campaign.delete({where:{id:campaign.id}})
  await authPool.query('DELETE FROM "CrmMachineIdentity" WHERE id=$1',[machineId])
 }finally{await authPool.query('DELETE FROM "CrmUser" WHERE id=$1',[id]);await authPool.end();await prisma.$disconnect()}
})
