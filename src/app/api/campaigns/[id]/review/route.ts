import { NextRequest, NextResponse } from 'next/server'
import { recordReview } from '@/lib/campaign-review'
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    const body=await request.json()
    if(!body || typeof body!=='object' || Array.isArray(body)) throw Error('Invalid review request')
    return NextResponse.json(await recordReview((await params).id,body))
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'Unable to save review'},{status:400}) }
}
