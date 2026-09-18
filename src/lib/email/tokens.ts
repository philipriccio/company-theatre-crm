import crypto from 'crypto'

const VERSION = 'v1'
const MIN_VALID_SECONDS = 60 * 24 * 60 * 60

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function secret(): string {
  const value = process.env.EMAIL_TOKEN_SECRET
  if (!value || value.length < 32) {
    throw new Error('EMAIL_TOKEN_SECRET must be set to at least 32 characters before creating signed email tokens')
  }
  return value
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url')
}

export function createUnsubscribeToken(contactId: string, validForSeconds = 180 * 24 * 60 * 60): string {
  if (validForSeconds < MIN_VALID_SECONDS) {
    throw new Error('Unsubscribe token validity must be at least 60 days')
  }
  const expiresAt = Math.floor(Date.now() / 1000) + validForSeconds
  const payload = base64url(JSON.stringify({ v: VERSION, cid: contactId, exp: expiresAt, purpose: 'unsubscribe' }))
  return `${VERSION}.${payload}.${sign(payload)}`
}

export function verifyUnsubscribeToken(token: string, now = new Date()): { ok: true; contactId: string } | { ok: false; reason: string } {
  const [version, payload, signature] = token.split('.')
  if (version !== VERSION || !payload || !signature) return { ok: false, reason: 'malformed' }
  const expected = sign(payload)
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return { ok: false, reason: 'tampered' }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return { ok: false, reason: 'tampered' }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { cid?: string; exp?: number; purpose?: string }
    if (decoded.purpose !== 'unsubscribe' || !decoded.cid || !decoded.exp) return { ok: false, reason: 'invalid_payload' }
    if (decoded.exp < Math.floor(now.getTime() / 1000)) return { ok: false, reason: 'expired' }
    return { ok: true, contactId: decoded.cid }
  } catch {
    return { ok: false, reason: 'invalid_payload' }
  }
}

export function emailHash(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

export function createTrackingToken(recipientId: string, targetUrl: string): string {
  const payload = base64url(JSON.stringify({ v: VERSION, rid: recipientId, url: targetUrl, purpose: 'click' }))
  return `${VERSION}.${payload}.${sign(payload)}`
}

export function verifyTrackingToken(token: string): { ok: true; recipientId: string; url: string } | { ok: false; reason: string } {
  const [version, payload, signature] = token.split('.')
  if (version !== VERSION || !payload || !signature) return { ok: false, reason: 'malformed' }
  const expected = sign(payload)
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return { ok: false, reason: 'tampered' }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return { ok: false, reason: 'tampered' }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { rid?: string; url?: string; purpose?: string }
    if (decoded.purpose !== 'click' || !decoded.rid || !decoded.url) return { ok: false, reason: 'invalid_payload' }
    return { ok: true, recipientId: decoded.rid, url: decoded.url }
  } catch {
    return { ok: false, reason: 'invalid_payload' }
  }
}

export function safeHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname || url.username || url.password) return null
    return url
  } catch {
    return null
  }
}
