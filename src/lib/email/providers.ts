import crypto from 'crypto'
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2'
import type { EmailMessage, EmailProvider, EmailProviderResult } from './types'
import { classifyProviderError } from './types'

export class DisabledEmailProvider implements EmailProvider {
  name = 'disabled'

  async send(): Promise<EmailProviderResult> {
    return {
      ok: false,
      provider: this.name,
      error: {
        class: 'configuration',
        code: 'email_provider_disabled',
        message: 'Email provider is disabled. Set EMAIL_PROVIDER=mock for tests or configure SES before sending.',
      },
    }
  }
}

export class MockEmailProvider implements EmailProvider {
  name = 'mock'

  async send(message: EmailMessage): Promise<EmailProviderResult> {
    const messageId = crypto
      .createHash('sha256')
      .update(`${message.to.email}:${message.subject}:${Date.now()}`)
      .digest('hex')
      .slice(0, 32)

    return { ok: true, provider: this.name, messageId: `mock-${messageId}`, acceptedAt: new Date() }
  }
}

export class SesEmailProvider implements EmailProvider {
  name = 'ses'
  private readonly client: SESv2Client

  constructor(client?: SESv2Client) {
    this.client = client || new SESv2Client({ region: process.env.AWS_SES_REGION || 'ca-central-1', maxAttempts: 1 })
  }

  async send(message: EmailMessage): Promise<EmailProviderResult> {
    // Seed-only safety boundary; an allowlisted recipient is not send approval.
    const entries = (process.env.EMAIL_SES_RECIPIENT_ALLOWLIST || '').split(',').map(normalizeSeedEmail)
    if (entries.some(email => email === null)) {
      return {
        ok: false,
        provider: this.name,
        error: { class: 'configuration', code: 'ses_recipient_allowlist_invalid', message: 'SES requires a nonempty comma-separated allowlist of exact email addresses.' },
      }
    }
    const recipient = normalizeSeedEmail(message.to.email)
    if (!recipient || !entries.includes(recipient)) {
      return {
        ok: false,
        provider: this.name,
        error: { class: 'configuration', code: 'ses_recipient_not_allowlisted', message: 'SES recipient is not an exact allowlisted test address.' },
      }
    }
    const configurationSetName = process.env.AWS_SES_CONFIGURATION_SET

    try {
      const response = await this.client.send(new SendEmailCommand({
        FromEmailAddress: formatAddress(message.from),
        Destination: { ToAddresses: [recipient] },
        ReplyToAddresses: message.replyTo ? [formatAddress(message.replyTo)] : undefined,
        ConfigurationSetName: configurationSetName || undefined,
        EmailTags: Object.entries(message.metadata || {})
          .filter(([name, value]) => /^[A-Za-z0-9_-]{1,256}$/.test(name) && /^[A-Za-z0-9_-]{1,256}$/.test(value))
          .map(([Name, Value]) => ({ Name, Value })),
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: message.html, Charset: 'UTF-8' } },
            Headers: Object.entries(message.headers || {}).map(([Name, Value]) => ({ Name, Value })),
          },
        },
      }))

      if (!response.MessageId) {
        return {
          ok: false,
          provider: this.name,
          error: { class: 'unknown', code: 'missing_message_id', message: 'SES accepted the request without returning a message ID' },
        }
      }

      return { ok: true, provider: this.name, messageId: response.MessageId, acceptedAt: new Date() }
    } catch (error) {
      return { ok: false, provider: this.name, error: classifyProviderError(error) }
    }
  }
}

// Intentionally conservative: bare ASCII mailboxes only, not display names,
// header syntax, wildcards, quoted local parts, or domain-wide patterns.
function normalizeSeedEmail(value: string): string | null {
  if ([...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) > 126)) return null
  const email = value.trim().toLowerCase()
  if (email.length > 254) return null
  const parts = email.split('@')
  if (parts.length !== 2) return null
  const [local, domain] = parts
  if (local.length > 64 || !/^[a-z0-9_+-]+(?:\.[a-z0-9_+-]+)*$/.test(local)) return null
  const labels = domain.split('.')
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null
  return email
}

function formatAddress(address: { email: string; name?: string }): string {
  const email = address.email.replace(/[\r\n]/g, '').trim()
  const name = address.name?.replace(/[\r\n]/g, '').replace(/"/g, '\\"').trim()
  return name ? `"${name}" <${email}>` : email
}

export function getEmailProvider(): EmailProvider {
  switch ((process.env.EMAIL_PROVIDER || 'disabled').toLowerCase()) {
    case 'mock':
      return new MockEmailProvider()
    case 'ses':
      return new SesEmailProvider()
    default:
      return new DisabledEmailProvider()
  }
}
