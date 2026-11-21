/* eslint-disable @typescript-eslint/no-require-imports -- standalone private Node operator, no TS/runtime bundler dependency */
// Trusted operator only. JSON in, sensitive JSON out through a private pipe.
// NEVER run with a terminal output, tee, shell trace, transcript capture or log sink.
// Input: {email,name,requestId,operator}; optional replacePendingId for explicit rotation.
const pg = require('pg')
const { randomBytes, randomUUID, createHash } = require('node:crypto')
async function main() {
  if (process.argv.length !== 2 || process.stdin.isTTY || process.stdout.isTTY || !process.env.DATABASE_URL) throw new Error()
  const origin = process.env.CRM_AUTH_ORIGIN
  if (!origin || (origin !== 'https://crm.companytheatre.ca' && !(process.env.CRM_AUTH_ISOLATED_PROOF === '1' && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)))) throw new Error()
  let raw = ''
  const timer = setTimeout(() => process.exit(1), 5000)
  for await (const chunk of process.stdin) { raw += chunk; if (Buffer.byteLength(raw) > 4096) throw new Error() }
  clearTimeout(timer)
  const body = JSON.parse(raw)
  if (Object.keys(body).some(k => !['email','name','requestId','operator','replacePendingId'].includes(k))) throw new Error()
  const { email, name, requestId, operator, replacePendingId } = body
  if (typeof email !== 'string' || email !== email.trim().toLowerCase() || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error()
  if (typeof name !== 'string' || !name.trim() || name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new Error()
  if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(requestId) || typeof operator !== 'string' || !operator.trim() || operator.length > 120) throw new Error()
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 10000 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['crm-invite:'+email])
    if ((await client.query('SELECT 1 FROM "CrmUser" WHERE "email"=$1', [email])).rowCount) throw new Error()
    const old = (await client.query('SELECT * FROM "CrmInvitation" WHERE "email"=$1 FOR UPDATE', [email])).rows[0]
    if (old && (old.id === requestId || old.id !== replacePendingId || old.consumedAt)) throw new Error()
    if (!old && replacePendingId) throw new Error()
    const token = randomBytes(32).toString('hex')
    const digest = createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now()+48*60*60*1000).toISOString()
    if (old) await client.query('UPDATE "CrmInvitation" SET "id"=$1,"name"=$2,"tokenHash"=$3,"expiresAt"=$4,"createdAt"=NOW(),"revokedAt"=NULL WHERE "email"=$5', [requestId,name,digest,expiresAt,email])
    else await client.query('INSERT INTO "CrmInvitation" ("id","email","name","tokenHash","expiresAt") VALUES ($1,$2,$3,$4,$5)', [requestId,email,name,digest,expiresAt])
    await client.query('INSERT INTO "CrmAuthEvent" ("id","kind","actorType","actorLabel","outcome","resourceId","details") VALUES ($1,$2,$3,$4,$5,$6,$7)', [randomUUID(),old ? 'invitation_rotated' : 'invitation_issued','operator',operator,'success',requestId,JSON.stringify({invitationId:requestId,previousInvitationId:old?.id ?? null})])
    await client.query('COMMIT')
    process.stdout.write(JSON.stringify({email,name,invitationId:requestId,expiresAt,setupUrl:origin+'/set-password',setupCode:token}))
  } catch { await client.query('ROLLBACK'); throw new Error() }
  finally { client.release(); await pool.end() }
}
main().catch(() => { process.stderr.write('Invitation issuance failed or is uncertain; reconcile metadata before retrying.\n'); process.exitCode=1 })
