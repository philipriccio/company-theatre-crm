import { guard } from '@/lib/auth/access'
import { actorFor } from '@/lib/security/history'
import { prisma } from '@/lib/db'
import { saveTask,TaskError } from '@/lib/jt-tasks'
import { taskFailure,taskBody } from '@/lib/jt-task-api'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){const denied=await guard(request);if(denied)return denied;try{const {id}=await context.params;const task=await prisma.jtTask.findUnique({where:{id}});if(!task)throw new TaskError(404,'Task not found.');return Response.json({task,history:await prisma.jtTaskChange.findMany({where:{taskId:id},orderBy:{createdAt:'desc'}})},{headers:{'Cache-Control':'no-store'}})}catch(e){return taskFailure(e)}}
export async function PATCH(request:Request,context:Context){const denied=await guard(request);if(denied)return denied;try{return Response.json(await saveTask(await actorFor(request),await taskBody(request),(await context.params).id))}catch(e){return taskFailure(e)}}
