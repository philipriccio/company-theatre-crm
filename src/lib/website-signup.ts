import { createHash, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/db'

export const WEBSITE_SOURCES = {
  'jackpottwins.ca': { version: 'jt-site-signup-v2', tag: 'Jackpot Website' },
  'companytheatre.ca': { version: 'ct-site-signup-v1', tag: 'Website Signup' },
} as const
export const WEBSITE_CONSENT_TEXT = 'I agree to receive emails about The Company Theatre and Jackpot Twins. I can unsubscribe at any time.'
export class WebsiteSignupError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export function authenticateWebsiteSignup(authorization: string | null) {
  const credential = process.env.CRM_WEBSITE_SIGNUP_TOKEN
  if (!credential || credential.length < 32 || /[\r\n]/.test(credential)) throw new WebsiteSignupError(503, 'Signup intake is not configured')
  const digest = (value: string) => createHash('sha256').update(value).digest()
  if (!authorization || !timingSafeEqual(digest(authorization), digest(credential))) throw new WebsiteSignupError(401, 'Unauthorized')
}

export function parseWebsiteSignup(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WebsiteSignupError(400, 'Expected JSON object')
  const body = value as Record<string, unknown>
  if (Object.keys(body).some(key => !['email', 'firstName', 'lastName', 'consent', 'consentVersion', 'source'].includes(key))) throw new WebsiteSignupError(400, 'Unknown field')
  const source = body.source as keyof typeof WEBSITE_SOURCES
  if (typeof source !== 'string' || !Object.hasOwn(WEBSITE_SOURCES, source) || body.consent !== true || body.consentVersion !== WEBSITE_SOURCES[source].version) throw new WebsiteSignupError(400, 'Explicit current consent required')
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) throw new WebsiteSignupError(400, 'Invalid email')
  const name = (key: 'firstName' | 'lastName') => {
    const item = body[key]
    if (item === undefined) return undefined
    if (typeof item !== 'string' || item.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(item)) throw new WebsiteSignupError(400, 'Invalid name')
    return item.trim() || undefined
  }
  return { source, email, firstName: name('firstName'), lastName: name('lastName') }
}

export async function recordWebsiteSignup(input: ReturnType<typeof parseWebsiteSignup>) {
  return prisma.$transaction(async tx => {
    // Without a case-insensitive database constraint, an advisory lock alone cannot
    // protect against the generic contacts/import writers. Short table locks also
    // serialize concurrent suppressions; no network I/O occurs inside this transaction.
    await tx.$executeRaw`LOCK TABLE "Contact", "GlobalSuppression" IN SHARE ROW EXCLUSIVE MODE`
    const matches = await tx.contact.findMany({ where: { email: { equals: input.email, mode: 'insensitive' } }, take: 2 })
    if (matches.length > 1) throw new WebsiteSignupError(409, 'Contact identity requires review')
    const existing = matches[0]
    const suppression = await tx.globalSuppression.findFirst({ where: { email: { equals: input.email, mode: 'insensitive' } } })
    // A legacy false flag may be a deliberate do-not-contact choice. Record the
    // new opt-in for review, but never reinterpret its absent provenance.
    const subscribed = !suppression && !existing?.unsubscribedAt && (!existing || existing.solicitation)
    const { source, ...contactInput } = input
    const settings = WEBSITE_SOURCES[source]
    // Existing contact metadata/names remain authoritative. Provenance lives in the
    // append-only evidence table, rather than overwriting unrelated contact metadata.
    const contact = existing
      ? await tx.contact.update({ where: { id: existing.id }, data: { solicitation: subscribed } })
      : await tx.contact.create({ data: { ...contactInput, fullName: [input.firstName, input.lastName].filter(Boolean).join(' ') || input.email.split('@')[0], solicitation: subscribed } })
    const tag = await tx.tag.upsert({ where: { name: settings.tag }, update: {}, create: { name: settings.tag } })
    await tx.contactTag.upsert({ where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } }, update: {}, create: { contactId: contact.id, tagId: tag.id } })
    await tx.consentEvidence.create({ data: {
      contactId: contact.id, email: input.email, source, status: subscribed ? 'express_opt_in_recorded' : 'express_opt_in_needs_review',
      metadata: { consent: 'express', textVersion: settings.version, consentText: WEBSITE_CONSENT_TEXT, subscribed },
    } })
    return { recorded: true as const, subscribed }
  }, { maxWait: 5000, timeout: 10000 })
}
