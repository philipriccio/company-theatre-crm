import { observeAction } from '@/lib/security/history'
import { identity } from '@/lib/auth/store'
import { guard, requestToken } from '@/lib/auth/access'
import { NextRequest, NextResponse } from 'next/server'
import { recordReview } from '@/lib/campaign-review'
async function perform(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const denied = await guard(request)
  if (denied) return denied

  try {
    const body=await request.json()
    if(!body || typeof body!=='object' || Array.isArray(body)) throw Error('Invalid review request')
    const actor=await identity(requestToken(request));if(!actor)return NextResponse.json({error:'Sign in again.'},{status:401})
    return NextResponse.json(await recordReview((await params).id,body,actor))
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'Unable to save review'},{status:400}) }
}

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
 const denied=await guard(request);if(denied)return denied
 return observeAction(request,'campaign_review',(await context.params).id,()=>perform(request,context))
}
