import { randomUUID } from 'node:crypto'
import { authPool, AuthError, audit, throttle, tokenHash } from './store'
import { hashPassword, passwordError } from './password'

const invalid = () => new AuthError(400, 'This invitation is invalid, expired or already used. Ask Mildred for a new invitation.')
// No account exists before acceptance. Existing accounts are never reset or re-enabled.
export async function acceptInvitation(token: unknown, password: unknown, confirmation: unknown) {
  await throttle('invitation-global', 120)
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw invalid()
  await throttle(`invitation:${tokenHash(token)}`, 8)
  const issue = passwordError(password)
  if (issue) throw new AuthError(400, issue)
  if (password !== confirmation) throw new AuthError(400, 'The passwords do not match.')
  const client = await authPool.connect()
  try {
    await client.query('BEGIN')
    const invitation = (await client.query('SELECT * FROM "CrmInvitation" WHERE "tokenHash"=$1 FOR UPDATE', [tokenHash(token)])).rows[0]
    if (!invitation || invitation.consumedAt || invitation.revokedAt) throw invalid()
    // Check database time under the lock, and again after hashing (expiry is strict).
    const available = await client.query('SELECT 1 FROM "CrmInvitation" WHERE "id"=$1 AND "expiresAt">clock_timestamp()', [invitation.id])
    if (!available.rowCount) throw invalid()
    const existing = await client.query('SELECT 1 FROM "CrmUser" WHERE "email"=$1', [invitation.email])
    if (existing.rowCount) throw invalid()
    const encoded = await hashPassword(password as string)
    const consumed = await client.query('UPDATE "CrmInvitation" SET "consumedAt"=clock_timestamp() WHERE "id"=$1 AND "expiresAt">clock_timestamp() RETURNING "id"', [invitation.id])
    if (!consumed.rowCount) throw invalid()
    const userId = randomUUID()
    await client.query('INSERT INTO "CrmUser" ("id","email","name","passwordHash") VALUES ($1,$2,$3,$4)', [userId, invitation.email, invitation.name, encoded])
    await audit('invitation_accepted', userId, { invitationId: invitation.id }, client)
    await client.query('COMMIT')
    // Deliberately no auto-login: use the normal session-issuing login boundary.
  } catch (error) {
    await client.query('ROLLBACK')
    if (error instanceof AuthError) { await audit('invitation_failed', null, { status: error.status }, client); throw error }
    // A private operator creating this email concurrently must not be overwritten.
    if ((error as { code?: string }).code === '23505') throw invalid()
    throw error
  } finally { client.release() }
}
