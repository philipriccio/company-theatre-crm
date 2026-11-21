import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './db'
import { businessEvent } from './security/history'
export const statuses = ['TODO','IN_PROGRESS','WAITING','DONE'] as const
export const owners = ['PHILIP','JANICE','MILDRED'] as const
export class TaskError extends Error { constructor(public status:number,message:string){super(message)} }
function fail(message:string):never{throw new TaskError(400,message)}
export function taskInput(value:unknown,create:boolean){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Invalid task.')
 const b=value as Record<string,unknown>, data:Record<string,unknown>={}
 const allowed=['requestId','title','latestUpdate','owner','status','dueDate','notes','sourceLinks',...(create?['sourceKey','parentId']:['version','archived'])]
 if(Object.keys(b).some(k=>!allowed.includes(k)))fail('Unknown task field.')
 if(typeof b.requestId!=='string'||! /^[a-zA-Z0-9_-]{8,128}$/.test(b.requestId))fail('A request identifier is required.')
 if(!create&&(!Number.isInteger(b.version)||Number(b.version)<1))fail('A task version is required.')
 for(const [key,max] of [['title',300],['latestUpdate',1000],['notes',20000],['sourceKey',250],['parentId',128]] as const){
  if(b[key]!==undefined){if(typeof b[key]!=='string'||(b[key] as string).length>max)fail(`Invalid ${key}.`); data[key]=(b[key] as string).trim()}
 }
 if((create||b.title!==undefined)&&!data.title)fail('Enter a task title.')
 if(b.owner!==undefined){if(b.owner!==null&&!owners.includes(b.owner as typeof owners[number]))fail('Invalid owner.');data.owner=b.owner}
 if(b.status!==undefined){if(!statuses.includes(b.status as typeof statuses[number]))fail('Invalid status.');data.status=b.status}
 if(b.dueDate!==undefined){const d=b.dueDate;if(d!==null&&(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d))fail('Enter a valid date.');data.dueDate=d}
 if(b.sourceLinks!==undefined){if(!Array.isArray(b.sourceLinks)||b.sourceLinks.length>20)fail('Use at most 20 source links.');data.sourceLinks=b.sourceLinks.map(v=>{if(typeof v!=='string'||v.length>2000)fail('Invalid source link.');try{const u=new URL(v);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)fail('Use a public http or https link without credentials.');return u.href}catch{fail('Invalid source link.')}})}
 if(b.archived!==undefined){if(typeof b.archived!=='boolean')fail('Invalid archive state.');data.archivedAt=b.archived?new Date():null}
 return {requestId:b.requestId,version:b.version as number,data}
}
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
export async function saveTask(actorId:string,input:unknown,id?:string){
 const parsed=taskInput(input,!id), hash=createHash('sha256').update(JSON.stringify({actorId,id,input})).digest('hex')
 return prisma.$transaction(async tx=>{
  // Serialise only this small shared task workspace, including uncertain retries.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(72120261121::bigint)`
  const replay=await tx.jtTaskRequest.findUnique({where:{id:parsed.requestId}})
  if(replay){if(replay.hash!==hash)throw new TaskError(409,'This request identifier was already used for different changes.');return replay.result}
  const human=await tx.crmUser.findUnique({where:{id:actorId}}),machine=human?null:await tx.crmMachineIdentity.findUnique({where:{id:actorId}})
  if(!human&&!machine)throw new TaskError(401,'Your account is no longer available.')
  const actorLabel=human?.name||machine?.name||actorId
  const before=id?await tx.jtTask.findUnique({where:{id}}):null
  if(id&&!before)throw new TaskError(404,'Task not found.')
  if(before&&before.version!==parsed.version)throw new TaskError(409,'Someone changed this task. Reload the latest version before saving; your text has been kept.')
  if(!id&&parsed.data.sourceKey&&await tx.jtTask.findUnique({where:{sourceKey:parsed.data.sourceKey as string}}))throw new TaskError(409,'This source task already exists.')
  if(parsed.data.parentId&&!await tx.jtTask.findUnique({where:{id:parsed.data.parentId as string}}))throw new TaskError(400,'Parent task not found.')
  const task=before?await tx.jtTask.update({where:{id},data:{...parsed.data,version:{increment:1}}}):await tx.jtTask.create({data:parsed.data as Prisma.JtTaskCreateInput})
  await tx.jtTaskChange.create({data:{taskId:task.id,actorId,actorLabel,before:before?json(before):Prisma.DbNull,after:json(task)}})
  await businessEvent(tx,actorId,before?'jt_task_updated':'jt_task_created',task.id)
  const result=json(task)
  await tx.jtTaskRequest.create({data:{id:parsed.requestId,hash,result}})
  return result
 })
}
