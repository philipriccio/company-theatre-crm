import { NextResponse } from 'next/server'
import { TaskError } from './jt-tasks'
export function taskFailure(error:unknown){return NextResponse.json({error:error instanceof TaskError?error.message:'Could not save or load tasks. Please reload before retrying.'},{status:error instanceof TaskError?error.status:503,headers:{'Cache-Control':'no-store'}})}

export async function taskBody(request:Request){const body=await request.text();if(body.length>50000)throw new TaskError(400,'Task details are too long.');try{return JSON.parse(body)}catch{throw new TaskError(400,'Invalid task details.')}}
