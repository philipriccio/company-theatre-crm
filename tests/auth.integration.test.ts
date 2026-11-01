import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { authPool, changePassword, identity, login, logout, throttle, updateProfile, logoutOtherSessions, tokenHash } from '../src/lib/auth/store'
import { hashPassword } from '../src/lib/auth/password'
import { guard } from '../src/lib/auth/access'
const enabled = process.env.CRM_AUTH_ISOLATED_PROOF === '1'
test('isolated real-DB auth: credentials, revocation, password races, durable throttling, fail-closed routes', {skip: !enabled}, async () => {
  assert.ok(process.env.DATABASE_URL?.includes('/crm_auth_test?host=/tmp/company-crm-auth.'))
  const password = randomBytes(24).toString('hex'), replacement = randomBytes(24).toString('hex')
  const id = randomUUID(), email = `${id}@example.invalid`
  await authPool.query('INSERT INTO "CrmUser" ("id","email","name","passwordHash") VALUES ($1,$2,$3,$4)',[id,email,'Synthetic Account',await hashPassword(password)])
  try {
    // Exhaust the pool before auditing: failure events must use the transaction's
    // existing connection, not wait for a sixth connection while holding five.
    const held = await Promise.all(Array.from({length:4},()=>authPool.connect()))
    try {
      await assert.rejects(login(`${randomUUID()}@example.invalid`,'wrong'), /not recognised/)
      await assert.rejects(login(email,'wrong'), /not recognised/)
    } finally { held.forEach(client=>client.release()) }

    const first = await login(email,password), second = await login(email,password)
    assert.equal((await identity(first))?.id,id)
    await assert.rejects(changePassword(first,'wrong',replacement),/incorrect/)
    assert.ok(await identity(first)); assert.ok(await identity(second))
    const { POST: accountAction } = await import('../src/app/api/auth/[action]/route')
    process.env.CRM_AUTH_ORIGIN = 'https://crm.example.invalid'
    const secureLogin = await accountAction(new Request('https://crm.example.invalid/api/auth/login', { method:'POST', headers:{origin:'https://crm.example.invalid','content-type':'application/json'}, body:JSON.stringify({email,password}) }), {params:Promise.resolve({action:'login'})})
    assert.equal(secureLogin.status,200)
    const cookie = secureLogin.headers.get('set-cookie') ?? ''
    assert.match(cookie,/__Host-crm-session=/); assert.match(cookie,/HttpOnly/i); assert.match(cookie,/Secure/i); assert.match(cookie,/SameSite=lax/i); assert.match(cookie,/Path=\//); assert.ok(!/Domain=/i.test(cookie))
    process.env.CRM_AUTH_ORIGIN = 'http://127.0.0.1:3257'
    const blocked = await accountAction(new Request('http://127.0.0.1:3257/api/auth/logout',{method:'POST'}),{params:Promise.resolve({action:'logout'})})
    assert.equal(blocked.status,403)

    const fixtureSession = async () => {
      const token=randomBytes(32).toString('hex')
      await authPool.query(`INSERT INTO "CrmSession" ("tokenHash","userId","expiresAt") VALUES ($1,$2,NOW()+INTERVAL '1 day')`,[tokenHash(token),id])
      return token
    }
    const profileRequest = (body: unknown, token = first, origin = 'http://127.0.0.1:3257') => accountAction(new Request('http://127.0.0.1:3257/api/auth/profile', {method:'POST', headers:{origin,'content-type':'application/json',cookie:`crm-local-session=${token}`},body:JSON.stringify(body)}),{params:Promise.resolve({action:'profile'})})
    const profileResponse = await profileRequest({name:'  Renée Synthetic  '})
    assert.equal(profileResponse.status,200)
    assert.equal(profileResponse.headers.get('set-cookie'),null, 'profile must not replace/clear session')
    assert.equal((await profileResponse.json()).name,'Renée Synthetic')
    assert.equal((await identity(first))?.name,'Renée Synthetic')
    assert.equal((await identity(first))?.email,email)
    for (const name of ['', '   ', 'x'.repeat(121), 'bad\nname', 'bad\u202ename', null, 42]) assert.equal((await profileRequest({name})).status,400)
    assert.equal((await profileRequest({name:'Forgery',id:randomUUID(),email:'other@example.invalid',role:'admin'})).status,400)
    assert.equal((await profileRequest({name:'Forgery'},first,'https://attacker.invalid')).status,403)
    assert.equal((await profileRequest({name:'Forgery'},'missing')).status,401)
    const otherId=randomUUID(), otherEmail=`${otherId}@example.invalid`
    await authPool.query('INSERT INTO "CrmUser" ("id","email","name","passwordHash") VALUES ($1,$2,$3,$4)',[otherId,otherEmail,'Other account',await hashPassword(password)])
    try {
      const unrelated=await login(otherEmail,password)
      const revoked=await fixtureSession()
      const signout=await accountAction(new Request('http://127.0.0.1:3257/api/auth/logout-others',{method:'POST',headers:{origin:'http://127.0.0.1:3257',cookie:`crm-local-session=${first}`}}),{params:Promise.resolve({action:'logout-others'})})
      assert.equal(signout.status,200);assert.equal(signout.headers.get('set-cookie'),null)
      assert.ok(await identity(first));assert.equal(await identity(revoked),null);assert.ok(await identity(unrelated))
      await assert.rejects(updateProfile(revoked,'Forbidden'),/session has ended/)
      await assert.rejects(logoutOtherSessions(revoked),/session has ended/)
      assert.equal((await identity(unrelated))?.name,'Other account')
      // Hold the user lock while a profile write starts, then revoke its session.
      // The write must recheck after obtaining the lock, not trust initial identity.
      const pendingToken=await fixtureSession(), lock=await authPool.connect()
      await lock.query('BEGIN');await lock.query('SELECT 1 FROM "CrmUser" WHERE "id"=$1 FOR UPDATE',[id])
      const pending=updateProfile(pendingToken,'Must not persist')
      const rejected=assert.rejects(pending,/session has ended/)
      try {
      for(let attempt=0;attempt<100;attempt++) {
        await lock.query('SELECT pg_stat_clear_snapshot()')
        const waiting=await lock.query(`SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%SELECT "disabled" FROM "CrmUser"%'`)
        if(waiting.rowCount) break
        assert.ok(attempt<99,'profile transaction must be waiting on user lock')
        await new Promise(resolve=>setTimeout(resolve,10))
      }
      await lock.query('DELETE FROM "CrmSession" WHERE "tokenHash"=$1',[ tokenHash(pendingToken)])
      await lock.query('COMMIT')
      } finally { await lock.query('ROLLBACK');lock.release() }
      await rejected
      assert.equal((await identity(first))?.name,'Renée Synthetic')
      const events=await authPool.query('SELECT "kind","details" FROM "CrmAuthEvent" WHERE "userId"=$1',[id])
      for(const kind of ['profile_updated','other_sessions_revoked']) assert.ok(events.rows.some(row=>row.kind===kind))
      assert.ok(!JSON.stringify(events.rows).includes('Renée'))
    } finally {await authPool.query('DELETE FROM "CrmUser" WHERE "id"=$1',[otherId])}
    // Session revocation above deliberately removed second; replace it for the password-race proof.
    const raceSecond=await fixtureSession()
    const alternative = randomBytes(24).toString('hex')
    const race = await Promise.allSettled([changePassword(first,password,replacement), changePassword(raceSecond,password,alternative)])
    assert.equal(race.filter(r=>r.status==='fulfilled').length,1)
    assert.equal(await identity(first),null); assert.equal(await identity(second),null)
    const rotated = race.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<string>
    assert.ok(await identity(rotated.value))
    await assert.rejects(login(email,password),/not recognised/)
    const request = (path:string, method='GET', token=rotated.value, origin='http://127.0.0.1:3257') => new Request(`http://127.0.0.1:3257${path}`,{method,headers:{cookie:`crm-local-session=${token}`, origin}})
    assert.equal(await guard(request('/api/contacts')),null)
    assert.equal((await guard(request('/api/contacts','POST',rotated.value,'https://attacker.invalid')))?.status,403)
    assert.equal((await guard(request('/api/contacts','GET','bad')))?.status,401)
    assert.equal((await guard(new Request('http://127.0.0.1:3257/api/contacts',{headers:{'x-forwarded-user':email,'x-middleware-subrequest':'proxy'}})))?.status,401)
    await logout(rotated.value); assert.equal(await identity(rotated.value),null)
    const key=randomUUID(); await Promise.all(Array.from({length:8},()=>throttle(key,8))); await assert.rejects(throttle(key,8),/Too many/)
    const disabled = await login(email, race[0].status==='fulfilled' ? replacement : alternative)
    await authPool.query(`UPDATE "CrmSession" SET "expiresAt"=NOW()-INTERVAL '1 second' WHERE "userId"=$1`,[id]); assert.equal(await identity(disabled),null)
    const beforeDisabled = await login(email, race[0].status==='fulfilled' ? replacement : alternative)
    await authPool.query('UPDATE "CrmUser" SET "disabled"=true WHERE "id"=$1',[id]); assert.equal(await identity(beforeDisabled),null)
    const auditRows=await authPool.query('SELECT "kind" FROM "CrmAuthEvent"')
    for(const kind of ['login_failed','password_change_failed','logout','password_changed_all_sessions_rotated','throttle_blocked','access_denied']) assert.ok(auditRows.rows.some(row=>row.kind===kind),kind)
    const stored=await authPool.query('SELECT "tokenHash" FROM "CrmSession" WHERE "userId"=$1',[id]); assert.ok(stored.rows.every(row=>row.tokenHash!==first && row.tokenHash!==second))
  } finally { await authPool.query('DELETE FROM "CrmUser" WHERE "id"=$1',[id]); await authPool.end() }
})
