import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { authPool, AuthError, identity } from '../auth/store'
import { requestToken } from '../auth/access'
import { authorizeMachine } from '../auth/machine'
export async function actorFor(request: Request) {
  if (request.headers.has('x-crm-machine-token')) return authorizeMachine(request, false)
  const actor = await identity(requestToken(request))
  if (!actor) throw new AuthError(401, 'Sign in again.')
  return actor.id
}
export async function businessEvent(tx: Prisma.TransactionClient, actorId: string | null, kind: string, resourceId: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(resourceId)) throw new Error('Invalid audit resource')
  await tx.$executeRaw`INSERT INTO "CrmAuthEvent" ("id","userId","kind","resourceId") VALUES (${randomUUID()},${actorId},${kind},${resourceId})`
}
export async function exportStarted(request: Request, resourceId = 'audience') {
  const actorId = await actorFor(request)
  // Recorded before releasing any bytes. This is initiation, NOT proof of download completion.
  await authPool.query('INSERT INTO "CrmAuthEvent" ("id","userId","kind","resourceId") VALUES ($1,$2,$3,$4)', [randomUUID(), actorId, 'export_started', /^[a-zA-Z0-9_-]{1,128}$/.test(resourceId) ? resourceId : 'analytics'])
}
export function historyFilter(params: URLSearchParams) {
  const eventId=params.get('eventId')||''
  if(eventId&&!/^[a-zA-Z0-9_-]{1,128}$/.test(eventId))throw new AuthError(400,'Invalid event ID.')
  const outcome = params.get('outcome') || ''
  if (outcome && !['success','failure','attempt','unknown'].includes(outcome)) throw new AuthError(400, 'Invalid outcome filter.')
  const kind = params.get('kind') || ''
  if (kind && !/^[a-z_-]{1,80}$/.test(kind)) throw new AuthError(400, 'Invalid event filter.')
  const actor = params.get('actor') || ''
  if (actor && !/^[a-zA-Z0-9_-]{1,128}$/.test(actor)) throw new AuthError(400, 'Use a valid actor ID.')
  const before = params.get('before') || ''
  if (before && !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z\|[a-zA-Z0-9_-]{1,128}$/.test(before)) throw new AuthError(400, 'Invalid page cursor.')
  if (before && !Number.isFinite(Date.parse(before.split('|')[0]))) throw new AuthError(400, 'Invalid page cursor.')
  const since = params.get('since') || ''
  if (since && (!/^\d{4}-\d\d-\d\d$/.test(since) || !Number.isFinite(Date.parse(since)))) throw new AuthError(400,'Invalid start date.')
  return { outcome, kind, actor, before, since, eventId }
}
export async function history(params: URLSearchParams) {
  const f = historyFilter(params), [stamp, cursor] = f.before.split('|')
  const [events, alerts, coverage] = await Promise.all([
    authPool.query(`SELECT "id","userId","actorType","actorLabel","kind","outcome","resourceId","createdAt" AT TIME ZONE 'UTC' AS "createdAt" FROM "CrmAuthEvent" WHERE ($1='' OR "outcome"=$1) AND ($2='' OR "kind"=$2) AND ($3='' OR "userId"=$3) AND ($4::timestamp IS NULL OR ("createdAt","id")<($4::timestamp,$5)) AND ($6::timestamp IS NULL OR "createdAt">=$6::timestamp) AND ($7='' OR "id"=$7) ORDER BY "createdAt" DESC,"id" DESC LIMIT 51`,[f.outcome,f.kind,f.actor,stamp||null,cursor||'',f.since||null,f.eventId]),
    authPool.query(`SELECT "id","eventId","rule","reason","reviewedBy","reviewerName","createdAt" AT TIME ZONE 'UTC' AS "createdAt","reviewedAt" AT TIME ZONE 'UTC' AS "reviewedAt" FROM "CrmSecurityAlert" ORDER BY ("reviewedAt" IS NULL) DESC,"createdAt" DESC LIMIT 50`),
    authPool.query(`SELECT "startedAt" AT TIME ZONE 'UTC' AS "startedAt" FROM "CrmSecurityCoverage" WHERE "id"=$1`,['security-history-v1']),
  ])
  const rows=events.rows.slice(0,50), last=rows.at(-1)
  return {events:rows,alerts:alerts.rows,startedAt:coverage.rows[0]?.startedAt??null,next:events.rows.length>50?`${last.createdAt.toISOString()}|${last.id}`:null}
}
export async function reviewAlert(token: string, id: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new AuthError(400,'Invalid alert.')
  const actor=await identity(token)
  if(!actor)throw new AuthError(401,'Sign in again.')
  const client=await authPool.connect()
  try {
    await client.query('BEGIN')
    // Same lock order as account changes: user then live session. No request actor accepted.
    const activeUser=await client.query('SELECT 1 FROM "CrmUser" WHERE "id"=$1 AND NOT "disabled" FOR NO KEY UPDATE',[actor.id])
    const { tokenHash } = await import('../auth/store')
    const session=await client.query('SELECT 1 FROM "CrmSession" WHERE "userId"=$1 AND "tokenHash"=$2 AND "expiresAt">NOW() FOR UPDATE',[actor.id,tokenHash(token)])
    if(!activeUser.rowCount||!session.rowCount)throw new AuthError(401,'Sign in again.')
    const result=await client.query(`UPDATE "CrmSecurityAlert" SET "reviewedAt"=timezone('UTC',clock_timestamp()),"reviewedBy"=$1,"reviewerName"=$2 WHERE "id"=$3 AND "reviewedAt" IS NULL RETURNING "id"`,[actor.id,actor.name,id])
    if(!result.rowCount)throw new AuthError(409,'Alert missing or already reviewed. Refresh the history.')
    await client.query('INSERT INTO "CrmAuthEvent" (id,"userId",kind,"resourceId") VALUES ($1,$2,$3,$4)',[randomUUID(),actor.id,'security_alert_reviewed',id])
    await client.query('COMMIT')
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

export async function requestEvent(request: Request, kind: string, resourceId: string) {
 const actorId=await actorFor(request)
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(resourceId))throw new AuthError(400,'Invalid resource ID.')
 await authPool.query('INSERT INTO "CrmAuthEvent" ("id","userId","kind","resourceId") VALUES ($1,$2,$3,$4)',[randomUUID(),actorId,kind,resourceId])
}
// Request outcomes are distinct from committed mutation events; a failed HTTP request
// is never treated as proof that an external provider did not receive a message.
export async function observeAction(request: Request, kind: string, resourceId: string, operation:()=>Promise<Response>) {
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(resourceId))throw new AuthError(400,'Invalid resource ID.')
 const actorId=await actorFor(request)
 const write=async(event:string,status?:number)=>authPool.query('INSERT INTO "CrmAuthEvent" ("id","userId","kind","resourceId","details") VALUES ($1,$2,$3,$4,$5)',[randomUUID(),actorId,event,resourceId,JSON.stringify(status?{status}:{})])
 await write(`${kind}_requested`)
 try{
  const response=await operation()
  if(!response.ok)await write(`${kind}_request_failed`,response.status)
  return response
 }catch{
  // If recording also fails, let the framework return an error; never claim success.
  await write(`${kind}_request_failed`,503)
  return Response.json({error:'The request could not be completed. Refresh the history before retrying.'},{status:503,headers:{'Cache-Control':'no-store'}})
 }
}
