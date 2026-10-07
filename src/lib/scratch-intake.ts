import { createHash, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'

export const CONSENT_VERSION = 'company-theatre-marketing-v1'
export const CONSENT_TEXT = 'I agree to receive marketing emails from The Company Theatre, including news, productions and ticket offers. I can unsubscribe at any time.'
export class IntakeError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function authenticateIntake(authorization: string | null) {
  const token = process.env.SCRATCH_INTAKE_TOKEN
  if (!token || token.length < 32 || !process.env.SCRATCH_PROMOTION_IDS?.trim()) {
    throw new IntakeError(503, 'Intake is not configured')
  }
  const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  const digest = (value: string) => createHash('sha256').update(value).digest()
  if (!supplied || !timingSafeEqual(digest(supplied), digest(token))) throw new IntakeError(401, 'Unauthorized')
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IntakeError(400, 'Expected JSON object')
  return value as Record<string, unknown>
}
function fields(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new IntakeError(400, 'Unknown field')
}
export function parseIntake(value: unknown) {
  const body = object(value)
  fields(body, ['submissionId', 'promotionId', 'email', 'fullName', 'marketingConsent'])
  if (typeof body.submissionId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(body.submissionId)) throw new IntakeError(400, 'Invalid submissionId')
  if (typeof body.promotionId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(body.promotionId)
    || !process.env.SCRATCH_PROMOTION_IDS?.split(',').map(s => s.trim()).includes(body.promotionId)) throw new IntakeError(400, 'Invalid promotionId')
  if (typeof body.email !== 'string') throw new IntakeError(400, 'Invalid email')
  const email = body.email.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new IntakeError(400, 'Invalid email')
  if (body.fullName !== undefined && (typeof body.fullName !== 'string' || body.fullName.trim().length > 200)) throw new IntakeError(400, 'Invalid fullName')
  const consent = body.marketingConsent === undefined ? { granted: false } : object(body.marketingConsent)
  fields(consent, consent.granted === true ? ['granted', 'textVersion', 'capturedAt'] : ['granted'])
  if (typeof consent.granted !== 'boolean') throw new IntakeError(400, 'Consent granted must be boolean')
  let capturedAt: string | null = null
  if (consent.granted) {
    if (consent.textVersion !== CONSENT_VERSION || typeof consent.capturedAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(consent.capturedAt)) throw new IntakeError(400, 'Invalid consent evidence')
    const date = new Date(consent.capturedAt)
    if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300_000) throw new IntakeError(400, 'Invalid consent timestamp')
    capturedAt = date.toISOString()
  }
  return { submissionId: body.submissionId, promotionId: body.promotionId, email,
    fullName: typeof body.fullName === 'string' ? body.fullName.trim() || null : null,
    marketingConsent: consent.granted, textVersion: consent.granted ? CONSENT_VERSION : null, capturedAt }
}

export async function recordScratchEntry(input: ReturnType<typeof parseIntake>) {
  const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  return prisma.$transaction(async tx => {
    // Serialize retries first, then identity matching. Locks exist only for this transaction.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`scratch:submission:${input.submissionId}`}, 0))`
    const previous = await tx.scratchEntry.findUnique({ where: { submissionId: input.submissionId } })
    if (previous) {
      if (previous.payloadHash !== payloadHash) throw new IntakeError(409, 'Submission ID payload conflict')
      return { entryId: previous.id, replayed: true, marketingConsentRecorded: previous.marketingConsent }
    }
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`scratch:email:${input.email}`}, 0))`
    const matches = await tx.contact.findMany({ where: { email: { equals: input.email, mode: 'insensitive' } }, take: 2 })
    if (matches.length > 1) throw new IntakeError(409, 'Contact identity requires review')
    const suppressed = await tx.globalSuppression.findUnique({ where: { email: input.email } })
    const contact = matches[0] || await tx.contact.create({ data: {
      email: input.email, fullName: input.fullName, solicitation: input.marketingConsent && !suppressed,
    } })
    const entry = await tx.scratchEntry.create({ data: {
      submissionId: input.submissionId, promotionId: input.promotionId, email: input.email,
      fullName: input.fullName, contactId: contact.id, payloadHash, marketingConsent: input.marketingConsent,
    } })
    await tx.consentEvidence.create({ data: {
      contactId: contact.id, email: input.email, source: 'scratch_intake',
      status: input.marketingConsent ? 'express_opt_in_recorded' : 'not_granted',
      metadata: { entryId: entry.id, promotionId: input.promotionId, textVersion: input.textVersion,
        consentText: input.marketingConsent ? CONSENT_TEXT : null, capturedAt: input.capturedAt },
    } })
    return { entryId: entry.id, replayed: false, marketingConsentRecorded: input.marketingConsent }
  })
}
