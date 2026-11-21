import { guard } from '@/lib/auth/access'
import { actorFor } from '@/lib/security/history'
import { prisma } from '@/lib/db'
import { saveTask } from '@/lib/jt-tasks'
import { taskFailure,taskBody } from '@/lib/jt-task-api'
export async function GET(request:Request){const denied=await guard(request);if(denied)return denied;try{return Response.json({tasks:await prisma.jtTask.findMany({orderBy:[{createdAt:'asc'},{id:'asc'}]})},{headers:{'Cache-Control':'no-store'}})}catch(e){return taskFailure(e)}}
export async function POST(request:Request){const denied=await guard(request);if(denied)return denied;try{return Response.json(await saveTask(await actorFor(request),await taskBody(request)),{status:201})}catch(e){return taskFailure(e)}}
