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
    this.client = client || new SESv2Client({ region: process.env.AWS_SES_REGION || 'ca-central-1' })
  }

  async send(message: EmailMessage): Promise<EmailProviderResult> {
    const configurationSetName = process.env.AWS_SES_CONFIGURATION_SET

    try {
      const response = await this.client.send(new SendEmailCommand({
        FromEmailAddress: formatAddress(message.from),
        Destination: { ToAddresses: [message.to.email] },
        ReplyToAddresses: message.replyTo ? [formatAddress(message.replyTo)] : undefined,
        ConfigurationSetName: configurationSetName || undefined,
        EmailTags: Object.entries(message.metadata || {})
          .filter(([name]) => /^[A-Za-z0-9_-]{1,256}$/.test(name))
          .map(([Name, value]) => ({ Name, Value: value.slice(0, 256) })),
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
