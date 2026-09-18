export type EmailErrorClass = 'transient' | 'permanent' | 'suppressed' | 'unknown' | 'configuration'

export interface EmailAddress {
  email: string
  name?: string
}

export interface EmailMessage {
  to: EmailAddress
  from: EmailAddress
  replyTo?: EmailAddress
  subject: string
  html: string
  headers?: Record<string, string>
  metadata?: Record<string, string>
}

export interface EmailProviderError {
  class: EmailErrorClass
  code: string
  message: string
  retryAfterSeconds?: number
}

export type EmailProviderResult =
  | { ok: true; provider: string; messageId: string; acceptedAt: Date }
  | { ok: false; provider: string; error: EmailProviderError }

export interface EmailProvider {
  name: string
  send(message: EmailMessage): Promise<EmailProviderResult>
}

export function shouldRetry(errorClass: EmailErrorClass): boolean {
  return errorClass === 'transient'
}

export function classifyProviderError(error: unknown): EmailProviderError {
  if (error && typeof error === 'object') {
    const maybe = error as { statusCode?: number; code?: string; message?: string }
    const status = maybe.statusCode
    if (status === 429 || (status && status >= 500)) {
      return { class: 'transient', code: String(status), message: maybe.message || 'Provider transient failure' }
    }
    if (status && status >= 400) {
      return { class: 'permanent', code: String(status), message: maybe.message || 'Provider rejected message' }
    }
    if (maybe.code) {
      return { class: 'unknown', code: maybe.code, message: maybe.message || 'Provider returned unknown error' }
    }
  }

  return { class: 'unknown', code: 'unknown', message: error instanceof Error ? error.message : 'Unknown provider outcome' }
}
