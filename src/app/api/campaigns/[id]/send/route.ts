import { authorizeMachine } from '@/lib/auth/machine'
import { parseSendApproval } from '@/lib/email/send-approval'
import { observeAction } from '@/lib/security/history'
import { guard, requestToken } from '@/lib/auth/access'
import { identity } from '@/lib/auth/store'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { enqueueCampaign } from '@/lib/email/queue'

async function perform(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await guard(request)
  if (denied) return denied

  const { id } = await params
  const body = await request.json()
  const { mode, tagIds, excludeTagIds, scheduledAt, approvalName, approvalNote } = body

  if (!['all', 'tags'].includes(mode) || (mode === 'tags' && (!Array.isArray(tagIds) || !tagIds.length || !tagIds.every((id: unknown) => typeof id === 'string' && id.length > 0)))) {
    return NextResponse.json({ error: 'Explicit valid audience mode and tag IDs are required' }, { status: 400 })
  }

  // Get campaign
  const campaign = await prisma.campaign.findUnique({
    where: { id },
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Campaign already sent' }, { status: 400 })
  }

  if (!approvalName || typeof approvalName !== 'string' || !approvalName.trim()) {
    return NextResponse.json({ error: 'Approval name is required before enqueueing a production audience' }, { status: 400 })
  }

  try {
    const machineId = request.headers.has('x-crm-machine-token') ? await authorizeMachine(request, false) : null
    const actor = machineId ? null : await identity(requestToken(request))
    if (!machineId && !actor) return NextResponse.json({ error: 'Sign in again before approving delivery.' }, { status: 401 })
    const sendApproval = machineId ? parseSendApproval(body.sendApproval) : undefined
    if (machineId && (mode !== 'tags' || scheduledAt || typeof approvalNote !== 'string' || !approvalNote.trim() || approvalNote.length > 2000)) {
      return NextResponse.json({error:'Machine sends require an explicit tagged audience, immediate send and approval note.'},{status:400})
    }
    const result = await enqueueCampaign(id, {
      mode: mode === 'tags' ? 'tags' : 'all',
      tagIds: mode === 'tags' ? tagIds || [] : [],
      excludeTagIds,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      approvedBy: machineId ? `Machine [${machineId}]; approval reported from ${sendApproval!.approvedBy}` : `${actor!.name} <${actor!.email}> [${actor!.id}]`,
      approvalNote: machineId ? `[${sendApproval!.reference}] ${approvalNote}` : approvalNote,
      securityActorId: machineId ?? actor!.id,
      sendApproval,
    })

    return NextResponse.json({
      success: true,
      queued: !result.scheduledAt,
      scheduled: !!result.scheduledAt,
      scheduledAt: result.scheduledAt?.toISOString() ?? null,
      recipientCount: result.recipientCount,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to enqueue campaign' }, { status: 400 })
  }
}

export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
 const denied=await guard(request);if(denied)return denied
 return observeAction(request,'campaign_send',(await context.params).id,()=>perform(request,context))
}
