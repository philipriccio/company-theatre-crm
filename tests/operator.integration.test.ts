import test from 'node:test'
import http from 'node:http'
import assert from 'node:assert/strict'
import { randomBytes,randomUUID } from 'node:crypto'
import { authPool, identity, login, cleanupAuth, tokenHash } from '../src/lib/auth/store'
import { operatorAction, operatorMetadata } from '../src/lib/auth/operator'
import { authorizeMachine, requiredMachineScope } from '../src/lib/auth/machine'
import { createOperatorServer } from '../scripts/auth-operator/server'
import { spawn } from 'node:child_process'
import { createRelay, CONTAINER_PIPE } from '../scripts/auth-operator/relay.mjs'
const enabled=process.env.CRM_AUTH_ISOLATED_PROOF==='1'
test('operator enrollment/recovery, protected local HTTP, scoped machine lifecycle and audit', {skip:!enabled}, async()=>{
 assert.ok(process.env.DATABASE_URL?.includes('/crm_auth_test?host=/tmp/company-crm-auth.'))
 const email=`operator-${randomUUID()}@example.invalid`,name=`Machine ${randomUUID()}`,password=randomBytes(24).toString('hex'),next=randomBytes(24).toString('hex'),token=`mcrm_${randomBytes(32).toString('hex')}`,replacement=`mcrm_${randomBytes(32).toString('hex')}`
 const server=createOperatorServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`
 try {
  // Separate processes/pipes and real TCP, not mocked HTTP. Different local
  // ports stand in for isolated host/container namespaces; preserve wire Host.
  const relay=createRelay({container:'a'.repeat(64),port:address.port,connect:()=>spawn(process.execPath,['-e',CONTAINER_PIPE,String(address.port)],{stdio:['pipe','pipe','ignore']})})
  await new Promise<void>(resolve=>relay.server.listen(0,'127.0.0.1',resolve))
  const relayAddress=relay.server.address();assert.ok(relayAddress&&typeof relayAddress!=='string')
  const relayed=(host:string,requestOrigin:string,body:string)=>new Promise<number|undefined>((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:relayAddress.port,path:'/operation',method:'POST',headers:{host,origin:requestOrigin,'content-type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});req.on('error',reject);req.end(body)
  })
  try{
   assert.equal(await relayed(`127.0.0.1:${address.port}`,origin,JSON.stringify({action:'metadata'})),200)
   assert.equal(await relayed('attacker.invalid',origin,'{}'),403)
   assert.equal(await relayed(`127.0.0.1:${address.port}`,'https://attacker.invalid','{}'),403)
   assert.equal(await relayed(`127.0.0.1:${address.port}`,origin,'x'.repeat(8193)),413)
   assert.equal(await relayed(`127.0.0.1:${address.port}`,origin,JSON.stringify({action:'metadata'})),200)
  }finally{relay.stop()}
  assert.equal((await fetch(origin+'/operation',{method:'POST',headers:{origin:'https://attacker.invalid','content-type':'application/json'},body:'{}'})).status,403)
  const wrongHost=await new Promise<number|undefined>((resolve,reject)=>{const request=http.get(origin+'/',{headers:{host:'attacker.invalid'}},response=>{response.resume();resolve(response.statusCode)});request.on('error',reject)})
  assert.equal(wrongHost,403)
  const page=await fetch(origin+'/');assert.match(page.headers.get('content-security-policy')??'',/frame-ancestors 'none'/);assert.ok((await page.text()).includes('type="password"'))
  const enrolled=await fetch(origin+'/operation',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action:'enroll',email,name:'Synthetic operator user',password,confirmPassword:password})});assert.equal(enrolled.status,200)
  await assert.rejects(operatorAction({action:'enroll',email,name:'Duplicate',password,confirmPassword:password},'synthetic-operator'),/already exists/)
  const session=await login(email,password)
  await operatorAction({action:'recover',email,password:next,confirmPassword:next},'synthetic-operator')
  assert.equal(await identity(session),null);await assert.rejects(login(email,password));const recovered=await login(email,next);assert.ok(await identity(recovered))
  await operatorAction({action:'disable-human',email},'synthetic-operator');assert.equal(await identity(recovered),null)
  await operatorAction({action:'machine-issue',name,token,scopes:['contacts:read','campaigns:drafts'],days:30},'synthetic-operator')
  const request=(path:string,method='GET',credential=token)=>new Request(`http://127.0.0.1:3257${path}`,{method,headers:{'x-crm-machine-token':credential}})
  assert.ok(await authorizeMachine(request('/api/contacts')))
  assert.ok(await authorizeMachine(request('/api/campaigns','POST')))
  for(const path of ['/api/campaigns/x/send','/api/campaigns/x/test','/api/campaigns/x/resume','/api/campaigns/x/retry','/api/campaigns/x/review','/api/cron/send-scheduled','/api/auth/password','/api/settings'])await assert.rejects(authorizeMachine(request(path,'POST')),/cannot perform/)
  await assert.rejects(authorizeMachine(request('/api/contacts/export')),/cannot perform/)
  assert.equal(requiredMachineScope('/api/campaigns/x/send','PUT'),null);assert.equal(requiredMachineScope('/api/contacts%2fexport','GET'),null)
  await operatorAction({action:'machine-rotate',name,token:replacement,scopes:['contacts:read'],days:1},'synthetic-operator')
  await assert.rejects(authorizeMachine(request('/api/contacts')),/not recognised/)
  assert.ok(await authorizeMachine(request('/api/contacts','GET',replacement)))
  await assert.rejects(authorizeMachine(request('/api/campaigns','POST',replacement)),/cannot perform/)
  await assert.rejects(authorizeMachine(new Request('http://127.0.0.1:3257/api/contacts',{headers:{'x-crm-machine-token':replacement,cookie:'ambient=1'}})),/cannot be mixed/)
  await authPool.query(`UPDATE "CrmMachineIdentity" SET "expiresAt"=NOW()-INTERVAL '1 second' WHERE "name"=$1`,[name])
  await assert.rejects(authorizeMachine(request('/api/contacts','GET',replacement)),/not recognised/)
  await authPool.query(`UPDATE "CrmMachineIdentity" SET "expiresAt"=NOW()+INTERVAL '1 day' WHERE "name"=$1`,[name])
  await operatorAction({action:'machine-revoke',name},'synthetic-operator');await assert.rejects(authorizeMachine(request('/api/contacts','GET',replacement)),/not recognised/)
  const metadata=JSON.stringify(await operatorMetadata());assert.ok(!metadata.includes(token));assert.ok(!metadata.includes(password));assert.ok(!metadata.includes('tokenHash'));assert.ok(!metadata.includes('passwordHash'))
  const stored=await authPool.query('SELECT "tokenHash" FROM "CrmMachineIdentity" WHERE "name"=$1',[name]);assert.equal(stored.rows[0].tokenHash,tokenHash(replacement))
  const before=await authPool.query('SELECT COUNT(*) FROM "CrmAuthEvent"');await cleanupAuth();const after=await authPool.query('SELECT COUNT(*) FROM "CrmAuthEvent"');assert.ok(Number(after.rows[0].count)>Number(before.rows[0].count))
  const events=await authPool.query('SELECT "kind" FROM "CrmAuthEvent"');for(const kind of ['operator_failed','operator_enroll','operator_recover','operator_disable-human','operator_machine-issue','operator_machine-rotate','operator_machine-revoke','machine_authorized_request','machine_scope_denied','login_failed','auth_housekeeping'])assert.ok(events.rows.some(row=>row.kind===kind),kind)
 } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await authPool.query('DELETE FROM "CrmUser" WHERE "email"=$1',[email]);await authPool.query('DELETE FROM "CrmMachineIdentity" WHERE "name"=$1',[name]);await authPool.end()}
})
