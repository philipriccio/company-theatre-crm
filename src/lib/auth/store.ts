import { createHash, randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { hashPassword, verifyPassword } from './password'
const globalAuth = globalThis as unknown as { crmAuthPool?: pg.Pool }
export const authPool = globalAuth.crmAuthPool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000, statement_timeout: 10000 })
export const SESSION_SECONDS = 7 * 24 * 60 * 60
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex')
export type Identity = { id: string; name: string; email: string }
export class AuthError extends Error { constructor(public status: number, message: string) { super(message) } }
export async function audit(kind: string, actorId: string | null = null, details: Record<string, string | number> = {}, connection: pg.Pool | pg.PoolClient = authPool) {
  await connection.query('INSERT INTO "CrmAuthEvent" ("id","userId","kind","details") VALUES ($1,$2,$3,$4)', [randomUUID(), actorId, kind, JSON.stringify(details)])
}
export async function throttle(key: string, limit: number) {
  const result = await authPool.query(`INSERT INTO "CrmAuthThrottle" ("key", "count", "expiresAt") VALUES ($1,1,NOW()+INTERVAL '15 minutes') ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "CrmAuthThrottle"."expiresAt" <= NOW() THEN 1 ELSE "CrmAuthThrottle"."count"+1 END, "expiresAt"=CASE WHEN "CrmAuthThrottle"."expiresAt" <= NOW() THEN NOW()+INTERVAL '15 minutes' ELSE "CrmAuthThrottle"."expiresAt" END RETURNING "count"`, [tokenHash(key)])
  if (result.rows[0].count > limit) {
    if (result.rows[0].count === limit + 1) await audit('throttle_blocked',null,{subject:tokenHash(key)})
    throw new AuthError(429, 'Too many attempts. Please wait 15 minutes before trying again.')
  }
}
export async function identity(token?: string): Promise<Identity | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  const result = await authPool.query(`SELECT u."id", u."name", u."email" FROM "CrmSession" s JOIN "CrmUser" u ON u."id"=s."userId" WHERE s."tokenHash"=$1 AND s."expiresAt">NOW() AND NOT u."disabled"`, [tokenHash(token)])
  return result.rows[0] ?? null
}
async function issue(client: pg.PoolClient, userId: string) {
  const token = randomBytes(32).toString('hex')
  await client.query(`INSERT INTO "CrmSession" ("tokenHash", "userId", "expiresAt") VALUES ($1,$2,NOW()+INTERVAL '7 days')`, [tokenHash(token), userId])
  return token
}
export async function login(emailInput: unknown, password: unknown) {
  const email = typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : ''
  if (!email || email.length > 254 || typeof password !== 'string') throw new AuthError(400, 'Enter your email and password.')
  await throttle('login-global', 120)
  await throttle(`login:${email}`, 8)
  const client = await authPool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query('SELECT * FROM "CrmUser" WHERE "email"=$1 FOR UPDATE', [email])
    const user = result.rows[0]
    // Same work factor for unknown accounts. This is an unusable dummy verifier, not an account credential.
    const valid = await verifyPassword(password, user?.passwordHash ?? `scrypt-v1$${'0'.repeat(48)}$${'0'.repeat(128)}`)
    if (!user || user.disabled || !valid) throw new AuthError(401, 'Email or password not recognised.')
    const token = await issue(client, user.id)
    await client.query('INSERT INTO "CrmAuthEvent" ("id","userId","kind") VALUES ($1,$2,$3)', [randomUUID(), user.id, 'login'])
    await client.query('COMMIT')
    return token
  } catch (error) { await client.query('ROLLBACK'); if (error instanceof AuthError) await audit('login_failed',null,{subject:tokenHash(email),status:error.status},client); throw error } finally { client.release() }
}
export async function changePassword(token: string, current: unknown, replacement: string) {
  const user = await identity(token)
  if (!user) throw new AuthError(401, 'Your session has ended. Sign in again.')
  await throttle(`change:${user.id}`, 8)
  const client = await authPool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query('SELECT * FROM "CrmUser" WHERE "id"=$1 FOR UPDATE', [user.id])
    const locked = result.rows[0]
    const active = await client.query('SELECT 1 FROM "CrmSession" WHERE "tokenHash"=$1 AND "userId"=$2 AND "expiresAt">NOW()', [tokenHash(token), user.id])
    if (!locked || locked.disabled || !active.rowCount) throw new AuthError(401, 'Your session has ended. Sign in again.')
    if (!await verifyPassword(current, locked.passwordHash)) throw new AuthError(400, 'Current password is incorrect. Nothing was changed.')
    if (await verifyPassword(replacement, locked.passwordHash)) throw new AuthError(400, 'Choose a different new password.')
    const encoded = await hashPassword(replacement)
    await client.query('UPDATE "CrmUser" SET "passwordHash"=$1,"passwordChangedAt"=NOW() WHERE "id"=$2', [encoded, user.id])
    await client.query('DELETE FROM "CrmSession" WHERE "userId"=$1', [user.id])
    const next = await issue(client, user.id)
    await client.query('INSERT INTO "CrmAuthEvent" ("id","userId","kind") VALUES ($1,$2,$3)', [randomUUID(), user.id, 'password_changed_all_sessions_rotated'])
    await client.query('COMMIT')
    return next
  } catch (error) { await client.query('ROLLBACK'); if (error instanceof AuthError) await audit('password_change_failed',user.id,{status:error.status},client); throw error } finally { client.release() }
}
export async function logout(token?: string) {
  if (!token) return
  const client = await authPool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query('DELETE FROM "CrmSession" WHERE "tokenHash"=$1 RETURNING "userId"',[tokenHash(token)])
    await client.query('INSERT INTO "CrmAuthEvent" ("id","userId","kind") VALUES ($1,$2,$3)',[randomUUID(),result.rows[0]?.userId ?? null,'logout'])
    await client.query('COMMIT')
  } catch(error) {await client.query('ROLLBACK');throw error} finally {client.release()}
}
// Bounded lifecycle cleanup; never removes security audit evidence.
export async function cleanupAuth() {
  const client=await authPool.connect()
  try {
    await client.query('BEGIN')
    const sessions = await client.query('DELETE FROM "CrmSession" WHERE "tokenHash" IN (SELECT "tokenHash" FROM "CrmSession" WHERE "expiresAt"<NOW() LIMIT 1000)')
    const throttles = await client.query(`DELETE FROM "CrmAuthThrottle" WHERE "key" IN (SELECT "key" FROM "CrmAuthThrottle" WHERE "expiresAt"<NOW()-INTERVAL '1 day' LIMIT 1000)`)
    const counts={sessions:sessions.rowCount ?? 0,throttles:throttles.rowCount ?? 0}
    await client.query('INSERT INTO "CrmAuthEvent" ("id","kind","details") VALUES ($1,$2,$3)',[randomUUID(),'auth_housekeeping',JSON.stringify(counts)])
    await client.query('COMMIT')
    return counts
  } catch(error) {await client.query('ROLLBACK');throw error} finally {client.release()}
}
