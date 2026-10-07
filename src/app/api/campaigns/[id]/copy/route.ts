import { NextRequest, NextResponse } from 'next/server'
import { saveCampaignCopy } from '@/lib/campaign-copy-save'
export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
 try {
  const body=await request.json()
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid text changes')
  return NextResponse.json(await saveCampaignCopy((await params).id,body))
 } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'Unable to save text'},{status:409}) }
}
