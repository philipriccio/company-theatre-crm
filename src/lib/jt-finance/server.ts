import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { guard, requestToken } from '../auth/access'
import { identity } from '../auth/store'
import { FinanceError, validateState, type State } from './model'
const json=(v:unknown)=>JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue
export function allowedFinanceUser(id:string){return (process.env.JT_FINANCE_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean).includes(id)}
export async function financeActor(request:Request){
 const denied=await guard(request);if(denied)throw new FinanceError(denied.status,'Sign in with an authorised finance account.')
 if(request.headers.has('x-crm-machine-token'))throw new FinanceError(403,'Finance is available to authorised people only.')
 const actor=await identity(requestToken(request));if(!actor||!allowedFinanceUser(actor.id))throw new FinanceError(403,'Finance access has not been enabled for this account.')
 return actor
}
export function financeFailure(e:unknown){return Response.json({error:e instanceof FinanceError?e.message:'Finance is unavailable. Your changes have not been cleared; reload before retrying.'},{status:e instanceof FinanceError?e.status:503,headers:{'Cache-Control':'no-store'}})}
export async function financeRead(){const workspace=await prisma.jtFinanceWorkspace.findUnique({where:{id:'JT'}});if(!workspace)throw new FinanceError(503,'The production budget has not been imported yet.');const history=await prisma.jtFinanceChange.findMany({orderBy:{createdAt:'desc'},take:50,select:{id:true,actorLabel:true,version:true,createdAt:true}});return {version:workspace.version,data:workspace.data,history}}
export async function financeSave(actor:{id:string;name:string},body:unknown){
 const b=body as {requestId:string;version:number;data:State};if(!b||! /^[\w-]{8,128}$/.test(b.requestId)||!Number.isInteger(b.version))throw new FinanceError(400,'Version and request ID required.')
 const hash=createHash('sha256').update(JSON.stringify({actor:actor.id,body})).digest('hex')
 return prisma.$transaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(72120261127::bigint)`
 const user=await tx.crmUser.findUnique({where:{id:actor.id}});if(!user||user.disabled||!allowedFinanceUser(actor.id))throw new FinanceError(403,'Account is not authorised.')
 const replay=await tx.jtFinanceRequest.findUnique({where:{id:b.requestId}});if(replay){if(replay.hash!==hash)throw new FinanceError(409,'Request ID already used for another change.');return replay.result}
 const before=await tx.jtFinanceWorkspace.findUnique({where:{id:'JT'}});if(!before)throw new FinanceError(503,'Budget import required.');if(before.version!==b.version)throw new FinanceError(409,'Someone else changed finance. Your form is preserved. Reload and reconcile before saving.')
 const data=validateState(b.data,(before.data as unknown as State).budget)
 const after=await tx.jtFinanceWorkspace.update({where:{id:'JT'},data:{data:json(data),version:{increment:1}}})
 await tx.jtFinanceChange.create({data:{id:randomUUID(),actorId:actor.id,actorLabel:user.name,version:after.version,before:before.data as Prisma.InputJsonValue,after:json(data)}})
 const result=json({version:after.version,data:after.data});await tx.jtFinanceRequest.create({data:{id:b.requestId,hash,result}});return result
 })
}
