import type { EmailErrorClass } from './types'

export const MAX_DELIVERY_ATTEMPTS = 5

export function retryDelayMs(attemptCount: number): number {
  const base = 60_000
  const cappedPower = Math.min(Math.max(attemptCount, 1), 6)
  return base * 2 ** (cappedPower - 1)
}

export function nextAttemptAt(now: Date, attemptCount: number): Date {
  return new Date(now.getTime() + retryDelayMs(attemptCount))
}

export function canRetry(errorClass: EmailErrorClass, attemptCount: number): boolean {
  return errorClass === 'transient' && attemptCount < MAX_DELIVERY_ATTEMPTS
}
