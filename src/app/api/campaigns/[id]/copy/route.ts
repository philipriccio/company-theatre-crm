import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { reviewHash } from '@/lib/campaign-review'
import { copyFields } from '@/lib/campaign-copy'
import { inlineEmailPreview } from '@/lib/inline-email-preview'
import { saveCampaignCopy } from '@/lib/campaign-copy-save'
export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}) {
 const c=await prisma.campaign.findUnique({where:{id:(await params).id}})
 if(!c||c.status!=='DRAFT'||c.design!==null)return NextResponse.json({error:'Only unstructured drafts can be edited here'},{status:409})
 return NextResponse.json({hash:reviewHash(c),subject:c.subject,previewText:c.previewText||'',fields:copyFields(c.content),document:inlineEmailPreview(c.content,c.previewText||'')},{headers:{'Cache-Control':'no-store'}})
}
export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
 try {
  const body=await request.json()
  if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid text changes')
  return NextResponse.json(await saveCampaignCopy((await params).id,body))
 } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'Unable to save text',code:error instanceof Error&&error.message.startsWith('This draft changed since')?'STALE_COPY':undefined},{status:409}) }
}
