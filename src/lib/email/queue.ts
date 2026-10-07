import { selectAudience } from './audience'
import { prisma } from '@/lib/db'
import { CampaignRecipientStatus } from '@prisma/client'
import { canRetry, nextAttemptAt } from './retry'
import { buildCampaignEmail } from './message'
import { getEmailProvider } from './providers'
import { recordSuppression } from './events'
import type { EmailProvider } from './types'

export interface AudienceSelection {
  mode: 'all' | 'tags'
  tagIds?: string[]
  scheduledAt?: Date | null
  approvedBy: string
  approvalNote?: string
}

export async function enqueueCampaign(campaignId: string, selection: AudienceSelection) {
  if (!['all', 'tags'].includes(selection.mode)) throw new Error('Invalid audience mode')
  if (!selection.approvedBy?.trim()) throw new Error('Approval name is required')
  if (selection.scheduledAt && (!Number.isFinite(selection.scheduledAt.getTime()) || selection.scheduledAt <= new Date())) throw new Error('Schedule must be a valid future date')
  const now = new Date()
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw new Error('Campaign not found')
  if (!campaign.subject.trim() || !campaign.content.trim()) throw new Error('Add a subject and email content before approval')
  if (campaign.status !== 'DRAFT') throw new Error('Campaign is not in draft status')
  if (selection.mode === 'tags' && !selection.tagIds?.length) {
    throw new Error('Select at least one tag before enqueueing a tagged audience')
  }

  const { contacts } = await selectAudience(selection.mode, selection.tagIds)

  if (contacts.length === 0) throw new Error('No recipients found')

  await prisma.$transaction(async (tx) => {
    // Atomic draft claim: concurrent approvals cannot refreeze the audience.
    const claimed = await tx.campaign.updateMany({ where: { id: campaignId, status: 'DRAFT' }, data: { status: 'QUEUED' } })
    if (claimed.count !== 1) throw new Error('Campaign is no longer a draft')
    await tx.campaignRecipient.createMany({
      data: contacts.map((contact) => ({
        campaignId,
        contactId: contact.id,
        email: contact.email.toLowerCase(),
        firstName: contact.firstName,
        lastName: contact.lastName,
        fullName: contact.fullName,
        status: 'QUEUED',
        queuedAt: now,
        nextAttemptAt: selection.scheduledAt || now,
      })),
      skipDuplicates: true,
    })

    await tx.consentEvidence.createMany({
      data: contacts.map((contact) => ({
        contactId: contact.id,
        email: contact.email.toLowerCase(),
        source: 'campaign_enqueue',
        status: 'solicitable_snapshot',
        recordedAt: now,
        metadata: { campaignId, mode: selection.mode },
      })),
    })

    await tx.campaign.update({
      where: { id: campaignId },
      data: {
        status: selection.scheduledAt ? 'SCHEDULED' : 'QUEUED',
        scheduledAt: selection.scheduledAt || null,
        audienceMode: selection.mode,
        audienceTagIds: selection.tagIds || [],
        approvedAt: now,
        approvedBy: selection.approvedBy,
        approvalNote: selection.approvalNote || null,
        frozenRecipientCount: contacts.length,
      },
    })
  })

  return { recipientCount: contacts.length, scheduledAt: selection.scheduledAt || null }
}

export interface ClaimedRecipient {
  id: string
  campaignId: string
  contactId: string
  email: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
}

export async function claimRecipients(workerId: string, limit: number, leaseSeconds: number): Promise<ClaimedRecipient[]> {
  return prisma.$queryRaw<ClaimedRecipient[]>`
    WITH due AS (
      SELECT cr."id"
      FROM "CampaignRecipient" cr
      JOIN "Campaign" c ON c."id" = cr."campaignId"
      WHERE cr."status" = 'QUEUED'::"CampaignRecipientStatus"
        AND (cr."nextAttemptAt" IS NULL OR cr."nextAttemptAt" <= timezone('UTC', now()))
        AND (cr."leasedUntil" IS NULL OR cr."leasedUntil" <= timezone('UTC', now()))
        AND c."status" IN ('QUEUED'::"CampaignStatus", 'SCHEDULED'::"CampaignStatus", 'SENDING'::"CampaignStatus")
        AND c."approvedAt" IS NOT NULL
        AND (c."scheduledAt" IS NULL OR c."scheduledAt" <= timezone('UTC', now()))
      ORDER BY cr."queuedAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "CampaignRecipient" cr
    SET "status" = 'SENDING'::"CampaignRecipientStatus",
        "leaseOwner" = ${workerId},
        "leasedUntil" = timezone('UTC', now()) + (${leaseSeconds}::text || ' seconds')::interval
    FROM due
    WHERE cr."id" = due."id"
    RETURNING cr."id", cr."campaignId", cr."contactId", cr."email", cr."firstName", cr."lastName", cr."fullName"
  `
}

export async function recoverExpiredLeases() {
  await prisma.campaignRecipient.updateMany({
    where: { status: 'SENDING', leasedUntil: { lte: new Date() } },
    data: { status: 'UNKNOWN', unknownAt: new Date(), leaseOwner: null, leasedUntil: null, lastErrorClass: 'unknown', lastErrorCode: 'lease_expired', lastErrorMessage: 'Worker lease expired before provider outcome was recorded' },
  })
}

export async function processRecipient(recipientId: string, provider: EmailProvider = getEmailProvider(), workerId?: string) {
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    include: { campaign: true, contact: true },
  })
  if (!recipient || recipient.status !== 'SENDING' || (workerId && recipient.leaseOwner !== workerId)) return
  if (!recipient.leasedUntil || recipient.leasedUntil <= new Date()) return
  if (provider.name === 'disabled') return
  if (!recipient.campaign.approvedAt || !['QUEUED', 'SCHEDULED', 'SENDING'].includes(recipient.campaign.status)
    || (recipient.campaign.scheduledAt && recipient.campaign.scheduledAt > new Date())) {
    await prisma.campaignRecipient.updateMany({
      where: { id: recipient.id, status: 'SENDING', leaseOwner: recipient.leaseOwner },
      data: { status: recipient.campaign.status === 'CANCELLED' ? 'CANCELLED' : 'QUEUED', leasedUntil: null, leaseOwner: null },
    })
    return
  }

  const now = new Date()
  const suppressed = await prisma.globalSuppression.findUnique({ where: { email: recipient.email.toLowerCase() } })
  if (suppressed || !recipient.contact.solicitation || recipient.contact.unsubscribedAt) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: 'SUPPRESSED', suppressedAt: now, leasedUntil: null, leaseOwner: null, lastErrorClass: 'suppressed', lastErrorCode: suppressed?.reason || 'contact_suppressed' },
    })
    await recordSuppression({ email: recipient.email, reason: suppressed?.reason || 'contact_suppressed', source: 'worker_recheck', contactId: recipient.contactId, campaignId: recipient.campaignId, recipientId: recipient.id })
    return
  }

  const message = buildCampaignEmail(recipient.campaign, recipient)
  const result = await provider.send(message)
  const attemptCount = recipient.attemptCount + 1

  if (result.ok) {
    await prisma.$transaction([
      prisma.emailDeliveryAttempt.create({ data: { campaignId: recipient.campaignId, recipientId: recipient.id, provider: result.provider, completedAt: result.acceptedAt, outcome: 'ACCEPTED', providerMessageId: result.messageId } }),
      // Preserve acceptance evidence even if a signed delivery/complaint won the race.
      prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { acceptedAt: result.acceptedAt, sentAt: result.acceptedAt, attemptCount, provider: result.provider, providerMessageId: result.messageId, leasedUntil: null, leaseOwner: null } }),
      prisma.campaignRecipient.updateMany({ where: { id: recipient.id, status: { in: ['SENDING', 'UNKNOWN'] } }, data: { status: 'ACCEPTED' } }),
      prisma.campaign.updateMany({ where: { id: recipient.campaignId, status: { in: ['QUEUED', 'SCHEDULED', 'SENDING'] } }, data: { status: 'SENDING' } }),
    ])
    return
  }

  const retry = canRetry(result.error.class, attemptCount)
  const nextAt = retry ? nextAttemptAt(now, attemptCount) : null
  const status = retry ? 'QUEUED' : result.error.class === 'unknown' ? 'UNKNOWN' : result.error.class === 'suppressed' ? 'SUPPRESSED' : 'FAILED'

  await prisma.$transaction([
    prisma.emailDeliveryAttempt.create({ data: { campaignId: recipient.campaignId, recipientId: recipient.id, provider: result.provider, completedAt: now, outcome: retry ? 'TRANSIENT_FAILURE' : result.error.class === 'unknown' ? 'UNKNOWN' : result.error.class === 'suppressed' ? 'SUPPRESSED' : 'PERMANENT_FAILURE', errorClass: result.error.class, errorCode: result.error.code, errorMessage: result.error.message } }),
    prisma.campaignRecipient.updateMany({
      where: { id: recipient.id, status: 'SENDING', leaseOwner: recipient.leaseOwner },
      data: { status, attemptCount, nextAttemptAt: nextAt, failedAt: status === 'FAILED' ? now : null, unknownAt: status === 'UNKNOWN' ? now : null, suppressedAt: status === 'SUPPRESSED' ? now : null, lastErrorClass: result.error.class, lastErrorCode: result.error.code, lastErrorMessage: result.error.message, leasedUntil: null, leaseOwner: null },
    }),
  ])
}

export async function updateCampaignCompletions() {
  const campaigns = await prisma.campaign.findMany({ where: { status: { in: ['QUEUED', 'SCHEDULED', 'SENDING'] } }, select: { id: true } })
  const terminal: CampaignRecipientStatus[] = ['ACCEPTED', 'DELIVERED', 'FAILED', 'SUPPRESSED', 'UNKNOWN', 'CANCELLED']
  for (const campaign of campaigns) {
    const total = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } })
    if (total === 0) continue
    const remaining = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: { notIn: terminal } } })
    if (remaining > 0) continue
    const failures = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: { in: ['FAILED', 'SUPPRESSED', 'UNKNOWN', 'CANCELLED'] } } })
    await prisma.campaign.updateMany({ where: { id: campaign.id, status: { in: ['QUEUED', 'SCHEDULED', 'SENDING'] } }, data: { status: failures > 0 ? 'COMPLETED_WITH_FAILURES' : 'COMPLETED', completedAt: new Date(), sentAt: new Date() } })
  }
}
