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

  const actor=await actorFor(_request)
  const result=await prisma.$transaction(async tx=>{
  const retried = await tx.campaignRecipient.updateMany({
    where: { campaignId: id, status: 'FAILED', lastErrorClass: 'transient' },
    data: { status: 'QUEUED', nextAttemptAt: new Date(), failedAt: null, leasedUntil: null, leaseOwner: null },
  })
  if (retried.count > 0 && ['COMPLETED_WITH_FAILURES', 'FAILED'].includes(campaign.status)) {
    await tx.campaign.update({ where: { id }, data: { status: 'QUEUED', completedAt: null } })
  }
  await businessEvent(tx,actor,'campaign_retry',id)
  return retried
  })
  return NextResponse.json({ success: true, retried: result.count })
}

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
 const denied=await guard(request);if(denied)return denied
 return observeAction(request,'campaign_retry',(await context.params).id,()=>perform(request,context))
}
