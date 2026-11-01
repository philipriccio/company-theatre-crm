import { observeAction } from '@/lib/security/history'
import { actorFor, businessEvent } from '@/lib/security/history'
import { guard } from '@/lib/auth/access'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

async function perform(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guard(request)
  if (denied) return denied

  const { id } = await params

  const campaign = await prisma.campaign.findUnique({
    where: { id },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (!['SCHEDULED', 'QUEUED', 'PAUSED'].includes(campaign.status)) {
    return NextResponse.json(
      { error: 'Can only cancel campaigns before active sending has started or while paused' },
      { status: 400 }
    )
  }

  const actor=await actorFor(request)
  await prisma.$transaction(async tx=>{
    await tx.campaignRecipient.updateMany({
      where: { campaignId: id, status: 'QUEUED' },
      data: { status: 'CANCELLED', leasedUntil: null, leaseOwner: null },
    });
    await tx.campaign.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await businessEvent(tx,actor,'campaign_cancel',id)
  })

  return NextResponse.json({ success: true })
}

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
 const denied=await guard(request);if(denied)return denied
 return observeAction(request,'campaign_cancel',(await context.params).id,()=>perform(request,context))
}
