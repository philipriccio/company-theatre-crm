import { randomUUID } from 'node:crypto'
import { authPool, AuthError, cleanupAuth, tokenHash, audit } from './store'
import { hashPassword, passwordError } from './password'
import { MACHINE_SCOPES } from './machine'
export async function operatorMetadata() {
  const [users,machines] = await Promise.all([
    authPool.query('SELECT "id","email","name","disabled","createdAt","passwordChangedAt" FROM "CrmUser" ORDER BY "name"'),
    authPool.query('SELECT "id","name","scopes","disabled","createdAt","expiresAt" FROM "CrmMachineIdentity" ORDER BY "name"'),
  ])
  const target = new URL(process.env.DATABASE_URL ?? '')
  return {target:{host:target.hostname,database:target.pathname.slice(1)},users:users.rows,machines:machines.rows,availableScopes:MACHINE_SCOPES}
}
export async function operatorAction(body: Record<string,unknown>, operator: string) {
  const action = body.action
  if (!['enroll','recover','disable-human','machine-issue','machine-rotate','machine-revoke','cleanup'].includes(String(action))) throw new AuthError(400,'Unknown operation.')
  if (action === 'cleanup') return cleanupAuth()
  const client=await authPool.connect()
  try {
    await client.query('BEGIN')
    let actorId:string
    if (action==='enroll' || action==='recover' || action==='disable-human') {
      const email=typeof body.email==='string'?body.email.trim().toLowerCase():''
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) throw new AuthError(400,'Enter a valid account email.')
      const found=await client.query('SELECT "id" FROM "CrmUser" WHERE "email"=$1 FOR UPDATE',[email])
      if (action==='enroll' && found.rowCount) throw new AuthError(409,'Account already exists; use explicit recovery if required.')
      if (action!=='enroll' && !found.rowCount) throw new AuthError(404,'Account not found.')
      actorId=found.rows[0]?.id ?? randomUUID()
      if (action==='disable-human') {
        await client.query('UPDATE "CrmUser" SET "disabled"=true WHERE "id"=$1',[actorId])
      } else {
        const issue=passwordError(body.password)
        if(issue)throw new AuthError(400,issue)
        if(body.password!==body.confirmPassword)throw new AuthError(400,'Passwords do not match.')
        const hash=await hashPassword(body.password as string)
        if(action==='enroll') {
          const name=typeof body.name==='string'?body.name.trim():''
          if(!name||name.length>100)throw new AuthError(400,'Enter a name of at most 100 characters.')
          await client.query('INSERT INTO "CrmUser" ("id","email","name","passwordHash") VALUES ($1,$2,$3,$4)',[actorId,email,name,hash])
        } else await client.query('UPDATE "CrmUser" SET "passwordHash"=$1,"disabled"=false,"passwordChangedAt"=NOW() WHERE "id"=$2',[hash,actorId])
      }
      await client.query('DELETE FROM "CrmSession" WHERE "userId"=$1',[actorId])
    } else {
      const name=typeof body.name==='string'?body.name.trim():''
      if(!/^[a-zA-Z][a-zA-Z0-9 _-]{1,79}$/.test(name))throw new AuthError(400,'Use a machine name of 2–80 letters, numbers, spaces, hyphens or underscores.')
      const found=await client.query('SELECT "id" FROM "CrmMachineIdentity" WHERE "name"=$1 FOR UPDATE',[name])
      if(action==='machine-issue' && found.rowCount)throw new AuthError(409,'Machine identity already exists; rotate explicitly.')
      if(action!=='machine-issue' && !found.rowCount)throw new AuthError(404,'Machine identity not found.')
      actorId=found.rows[0]?.id ?? randomUUID()
      if(action==='machine-revoke') await client.query('UPDATE "CrmMachineIdentity" SET "disabled"=true WHERE "id"=$1',[actorId])
      else {
        if(typeof body.token!=='string'||!/^mcrm_[a-f0-9]{64}$/.test(body.token))throw new AuthError(400,'Generate a new 256-bit machine credential in this private form.')
        if(!Array.isArray(body.scopes)||!body.scopes.length||body.scopes.some(scope=>!MACHINE_SCOPES.includes(scope)))throw new AuthError(400,'Select at least one supported scope.')
        if(!Number.isInteger(body.days)||Number(body.days)<1||Number(body.days)>90)throw new AuthError(400,'Expiry must be 1–90 days.')
        const expires=new Date(Date.now()+Number(body.days)*86400000)
        if(action==='machine-issue')await client.query('INSERT INTO "CrmMachineIdentity" ("id","name","tokenHash","scopes","expiresAt") VALUES ($1,$2,$3,$4,$5)',[actorId,name,tokenHash(body.token),[...new Set(body.scopes)],expires])
        else await client.query('UPDATE "CrmMachineIdentity" SET "tokenHash"=$1,"scopes"=$2,"expiresAt"=$3,"disabled"=false WHERE "id"=$4',[tokenHash(body.token),[...new Set(body.scopes)],expires,actorId])
      }
    }
    await client.query('INSERT INTO "CrmAuthEvent" ("id","userId","kind","details") VALUES ($1,$2,$3,$4)',[randomUUID(),actorId,`operator_${action}`,JSON.stringify({operator})])
    await client.query('COMMIT')
    return {ok:true,action,id:actorId}
  } catch(error) {await client.query('ROLLBACK');if(error instanceof AuthError)await audit('operator_failed',null,{operation:String(action),operator,status:error.status});throw error} finally {client.release()}
}
