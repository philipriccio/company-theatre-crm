import test from 'node:test'
import assert from 'node:assert/strict'
import { passwordError, hashPassword, verifyPassword } from '../src/lib/auth/password'
import { publicRoute, sameOrigin } from '../src/lib/auth/access'
import commonPasswords from '../security/common-passwords.json'
import { randomBytes } from 'node:crypto'
test('passwords permit long Unicode/passphrases without composition rules; reject short/common values', async () => {
  assert.ok(commonPasswords.length >= 90000)
  const longCommon=commonPasswords.find(value=>[...value].length>=15)
  assert.ok(longCommon); assert.ok(passwordError(longCommon))
  assert.ok(passwordError('short'))
  assert.ok(passwordError('123456789012345'))
  assert.equal(passwordError('unrelated calm theatre window'), null)
  assert.equal(passwordError('🪟'.repeat(14)+'a'), null)
  assert.ok(passwordError('🪟'.repeat(14)))
  assert.ok(passwordError('🪟'.repeat(129)))
  const value = randomBytes(24).toString('hex')
  const encoded = await hashPassword(value)
  assert.equal(await verifyPassword(value, encoded), true)
  assert.equal(await verifyPassword(value+'x', encoded), false)
  const composed = 'café calm theatre window'
  assert.equal(await verifyPassword(composed.normalize('NFD'), await hashPassword(composed)), true)
})
test('public exemptions match exact routes and methods, not prefixes or file extensions', () => {
  for (const [path, method] of [['/api/website-signups','POST'],['/api/webhooks/ses','POST'],['/api/unsubscribe/token','POST'],['/api/track/open/token','GET'],['/unsubscribe/token','GET']]) assert.equal(publicRoute(path,method),true)
  for (const [path, method] of [['/api/website-signups/extra','POST'],['/api/webhooks/ses','GET'],['/api/contacts.js','GET'],['/contacts.png','GET'],['/api/cron/send-scheduled','GET'],['/api/contacts','OPTIONS'],['/login','POST'],['/api/auth/password','POST']]) assert.equal(publicRoute(path,method),false)
  process.env.CRM_AUTH_ORIGIN='http://127.0.0.1:3257'
  assert.equal(sameOrigin(new Request('http://127.0.0.1:3257/api/settings',{headers:{origin:'https://attacker.invalid'}})),false)
  assert.equal(sameOrigin(new Request('http://127.0.0.1:3257/api/settings',{headers:{origin:process.env.CRM_AUTH_ORIGIN}})),true)
})
