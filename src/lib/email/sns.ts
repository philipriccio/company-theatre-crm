import crypto from 'crypto'

export interface SnsEnvelope {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation'
  MessageId: string
  TopicArn: string
  Message: string
  Timestamp: string
  SignatureVersion: '1' | '2'
  Signature: string
  SigningCertURL: string
  Subject?: string
  Token?: string
  SubscribeURL?: string
}

const certificateCache = new Map<string, string>()

export function isTrustedSnsCertificateUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:'
      && /^sns\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?$/.test(url.hostname)
      && /^\/SimpleNotificationService-[A-Za-z0-9_-]+\.pem$/.test(url.pathname)
      && !url.username
      && !url.password
      && !url.port
  } catch {
    return false
  }
}

export function snsCanonicalString(message: SnsEnvelope): string {
  const keys = message.Type === 'Notification'
    ? ['Message', 'MessageId', ...(message.Subject ? ['Subject'] : []), 'Timestamp', 'TopicArn', 'Type']
    : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']

  return keys.map((key) => `${key}\n${String(message[key as keyof SnsEnvelope] || '')}\n`).join('')
}

export async function verifySnsEnvelope(message: SnsEnvelope): Promise<{ ok: true } | { ok: false; reason: string }> {
  const expectedTopic = process.env.AWS_SNS_TOPIC_ARN
  if (!expectedTopic || message.TopicArn !== expectedTopic) return { ok: false, reason: 'unexpected_topic' }
  if (!['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation'].includes(message.Type)) return { ok: false, reason: 'invalid_type' }
  if (!['1', '2'].includes(message.SignatureVersion)) return { ok: false, reason: 'invalid_signature_version' }
  if (!isTrustedSnsCertificateUrl(message.SigningCertURL)) return { ok: false, reason: 'untrusted_certificate_url' }

  try {
    let certificate = certificateCache.get(message.SigningCertURL)
    if (!certificate) {
      const response = await fetch(message.SigningCertURL, { redirect: 'error', signal: AbortSignal.timeout(5000) })
      if (!response.ok) return { ok: false, reason: 'certificate_fetch_failed' }
      certificate = await response.text()
      certificateCache.set(message.SigningCertURL, certificate)
    }

    const algorithm = message.SignatureVersion === '1' ? 'RSA-SHA1' : 'RSA-SHA256'
    const verifier = crypto.createVerify(algorithm)
    verifier.update(snsCanonicalString(message), 'utf8')
    return verifier.verify(certificate, message.Signature, 'base64')
      ? { ok: true }
      : { ok: false, reason: 'invalid_signature' }
  } catch {
    return { ok: false, reason: 'verification_failed' }
  }
}
