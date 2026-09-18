import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { emailHash } from './tokens'

export async function recordSuppression(params: {
  email: string
  reason: string
  source: string
  contactId?: string | null
  campaignId?: string | null
  recipientId?: string | null
  metadata?: Record<string, unknown>
}) {
  const normalized = params.email.trim().toLowerCase()
  await prisma.globalSuppression.upsert({
    where: { email: normalized },
    update: {
      reason: params.reason,
      source: params.source,
      contactId: params.contactId || undefined,
      campaignId: params.campaignId || undefined,
      recipientId: params.recipientId || undefined,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
    create: {
      email: normalized,
      emailHash: emailHash(normalized),
      reason: params.reason,
      source: params.source,
      contactId: params.contactId || undefined,
      campaignId: params.campaignId || undefined,
      recipientId: params.recipientId || undefined,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  })
}
