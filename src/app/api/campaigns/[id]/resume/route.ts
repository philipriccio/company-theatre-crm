import { observeAction } from '@/lib/security/history'
import { actorFor, businessEvent } from '@/lib/security/history'
import { guard } from '@/lib/auth/access'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

async function perform(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guard(_request)
  if (denied) return denied

  const { id } = await params
  const campaign = await prisma.campaign.findUnique({ where: { id } })
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status !== 'PAUSED') {
    return NextResponse.json({ error: 'Only paused campaigns can be resumed' }, { status: 400 })
  }
  const actor=await actorFor(_request)
  await prisma.$transaction(async tx=>{
  await tx.campaign.update({ where: { id }, data: { status: campaign.scheduledAt && campaign.scheduledAt > new Date() ? 'SCHEDULED' : 'QUEUED', pausedAt: null } })
    await businessEvent(tx,actor,'campaign_resume',id)
  })
  return NextResponse.json({ success: true })
}

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
 const denied=await guard(request);if(denied)return denied
 return observeAction(request,'campaign_resume',(await context.params).id,()=>perform(request,context))
}
