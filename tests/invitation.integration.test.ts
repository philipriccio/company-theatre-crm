import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { authPool, tokenHash, login, identity } from '../src/lib/auth/store'
import { acceptInvitation } from '../src/lib/auth/invitation'
import { publicRoute } from '../src/lib/auth/access'
import { POST } from '../src/app/api/auth/[action]/route'
const enabled = process.env.CRM_AUTH_ISOLATED_PROOF === '1'
function issue(input: object): Promise<{email:string; setupUrl:string; setupCode:string; invitationId:string}> {
  return new Promise((resolve,reject) => {
    const child=spawn(process.execPath,['scripts/crm-invite.cjs'],{env:process.env,stdio:['pipe','pipe','pipe']})
    let output=''
    child.stdout.on('data',chunk=>output+=chunk)
    child.stderr.resume()
    child.on('close',code=>code===0 ? resolve(JSON.parse(output)) : reject(new Error('issuance rejected')))
    child.stdin.end(JSON.stringify(input))
  })
}
test('invitation lifecycle, account isolation, expiry, races, bounded API and private issuance', {skip:!enabled}, async () => {
  assert.ok(process.env.DATABASE_URL?.includes('/crm_auth_test?host=/tmp/company-crm-auth.'))
  process.env.CRM_AUTH_ORIGIN='http://127.0.0.1:3257'
  const email=`${randomUUID()}@example.invalid`, requestId=randomUUID(), password=randomBytes(24).toString('hex')
  const input={email,name:'Synthetic Invitee',requestId,operator:'Synthetic operator'}
  const invitation=await issue(input)
  assert.equal(invitation.setupUrl,'http://127.0.0.1:3257/set-password')
  assert.match(invitation.setupCode,/^[a-f0-9]{64}$/)
  assert.equal((await authPool.query('SELECT 1 FROM "CrmUser" WHERE "email"=$1',[email])).rowCount,0)
  const stored=(await authPool.query('SELECT * FROM "CrmInvitation" WHERE "id"=$1',[requestId])).rows[0]
  assert.equal(stored.tokenHash,tokenHash(invitation.setupCode))
  assert.ok(!JSON.stringify(stored).includes(invitation.setupCode))
  assert.ok(stored.expiresAt.getTime()>Date.now()+47*60*60*1000)
  await assert.rejects(issue(input),/issuance rejected/)
  await assert.rejects(issue({...input,requestId:randomUUID()}),/issuance rejected/)
  await assert.rejects(login(email,password),/not recognised/)
  await assert.rejects(acceptInvitation(invitation.setupCode,'short','short'),/15 characters/)
  await assert.rejects(acceptInvitation(invitation.setupCode,password,'other'),/do not match/)
  await assert.rejects(acceptInvitation(randomBytes(32).toString('hex'),password,password),/invalid/)
  const call=(body:object,origin='http://127.0.0.1:3257')=>POST(new Request('http://127.0.0.1:3257/api/auth/invitation',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({action:'invitation'})})
  assert.equal((await call({token:invitation.setupCode,password,confirmation:password},'https://attacker.invalid')).status,403)
  assert.equal((await call({token:invitation.setupCode,password,confirmation:password,email:'forged@example.invalid'})).status,400)
  assert.equal((await call({token:'x'.repeat(9000)})).status,413)
  const attempts=await Promise.allSettled([acceptInvitation(invitation.setupCode,password,password),acceptInvitation(invitation.setupCode,password,password)])
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1)
  assert.equal(attempts.filter(x=>x.status==='rejected').length,1)
  const account=(await authPool.query('SELECT * FROM "CrmUser" WHERE "email"=$1',[email])).rows[0]
  assert.equal(account.name,'Synthetic Invitee')
  assert.equal((await authPool.query('SELECT 1 FROM "CrmSession" WHERE "userId"=$1',[account.id])).rowCount,0)
  const session=await login(email,password)
  assert.equal((await identity(session))?.email,email)
  await assert.rejects(issue({...input,requestId:randomUUID(),replacePendingId:requestId}),/issuance rejected/)
  await assert.rejects(acceptInvitation(invitation.setupCode,password,password),/invalid/)
  assert.ok(await identity(session),'used invitation cannot revoke existing session')

  const secondEmail=`${randomUUID()}@example.invalid`, secondId=randomUUID()
  const second=await issue({...input,email:secondEmail,requestId:secondId})
  const rotated=await issue({...input,email:secondEmail,requestId:randomUUID(),replacePendingId:secondId})
  await assert.rejects(acceptInvitation(second.setupCode,password,password),/invalid/)
  await authPool.query('UPDATE "CrmInvitation" SET "expiresAt"=NOW()-INTERVAL \'1 second\' WHERE "id"=$1',[rotated.invitationId])
  await assert.rejects(acceptInvitation(rotated.setupCode,password,password),/invalid/)
  await authPool.query('UPDATE "CrmInvitation" SET "expiresAt"=NOW()+INTERVAL \'1 hour\',"revokedAt"=NOW() WHERE "id"=$1',[rotated.invitationId])
  await assert.rejects(acceptInvitation(rotated.setupCode,password,password),/invalid/)
  await authPool.query('UPDATE "CrmInvitation" SET "revokedAt"=NULL WHERE "id"=$1',[rotated.invitationId])
  // An operator enrolling this email meanwhile must never be overwritten/re-enabled.
  await authPool.query('INSERT INTO "CrmUser" ("id","email","name","passwordHash","disabled") VALUES ($1,$2,$3,$4,true)',[randomUUID(),secondEmail,'Existing private account','unusable'])
  await assert.rejects(acceptInvitation(rotated.setupCode,password,password),/invalid/)
  assert.equal((await authPool.query('SELECT "disabled" FROM "CrmUser" WHERE "email"=$1',[secondEmail])).rows[0].disabled,true)
  const rateCode=randomBytes(32).toString('hex')
  for(let i=0;i<8;i++) await assert.rejects(acceptInvitation(rateCode,password,password),/invalid/)
  await assert.rejects(acceptInvitation(rateCode,password,password),/Too many/)
  const events=JSON.stringify((await authPool.query('SELECT "details" FROM "CrmAuthEvent" WHERE "kind" LIKE \'invitation%\'')).rows)
  assert.ok(!events.includes(password));assert.ok(!events.includes(invitation.setupCode));assert.ok(!events.includes(rotated.setupCode))
  assert.ok(publicRoute('/set-password','GET'));assert.ok(publicRoute('/api/auth/invitation','POST'))
  assert.equal(publicRoute('/api/auth/invitation','GET'),false);assert.equal(publicRoute('/set-password/other','GET'),false)
  if (process.env.CRM_INVITATION_NARROW_PROOF === '1') {
    await assert.rejects(authPool.query('DELETE FROM "CrmInvitation" WHERE false'),/permission denied/)
    await assert.rejects(authPool.query('DELETE FROM "CrmUser" WHERE false'),/permission denied/)
    await assert.rejects(authPool.query('CREATE TABLE invitation_forbidden (id integer)'),/permission denied/)
  } else {
    await authPool.query('DELETE FROM "CrmUser" WHERE "email"=ANY($1)',[[email,secondEmail]])
    await authPool.query('DELETE FROM "CrmInvitation" WHERE "email"=ANY($1)',[[email,secondEmail]])
  }
  await authPool.end()
})
