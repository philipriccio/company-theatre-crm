import assert from 'node:assert/strict'
import test from 'node:test'
import { canRetry } from '../src/lib/email/retry'
import { shouldRetry } from '../src/lib/email/types'
import { createTrackingToken, createUnsubscribeToken, safeHttpUrl, verifyTrackingToken, verifyUnsubscribeToken } from '../src/lib/email/tokens'
import { isTrustedSnsCertificateUrl, snsCanonicalString, type SnsEnvelope } from '../src/lib/email/sns'

process.env.EMAIL_TOKEN_SECRET = 'test-secret-at-least-32-characters-long'

test('unsubscribe tokens do not expose raw email and reject tampering', () => {
  const token = createUnsubscribeToken('contact_123')
  assert.equal(token.includes('person@example.com'), false)
  assert.deepEqual(verifyUnsubscribeToken(token), { ok: true, contactId: 'contact_123' })
  assert.equal(verifyUnsubscribeToken(`${token}x`).ok, false)
})

test('unsubscribe token expiry is enforced', () => {
  const token = createUnsubscribeToken('contact_123', 60 * 24 * 60 * 60)
  const future = new Date(Date.now() + 61 * 24 * 60 * 60 * 1000)
  assert.deepEqual(verifyUnsubscribeToken(token, future), { ok: false, reason: 'expired' })
})

test('unsafe redirects are rejected', () => {
  assert.equal(safeHttpUrl('https://companytheatre.ca/tickets')?.toString(), 'https://companytheatre.ca/tickets')
  assert.equal(safeHttpUrl('javascript:alert(1)'), null)
  assert.equal(safeHttpUrl('https://user:pass@example.com'), null)
})

test('tracking tokens bind recipient and target', () => {
  const token = createTrackingToken('recipient_1', 'https://companytheatre.ca/show')
  assert.deepEqual(verifyTrackingToken(token), { ok: true, recipientId: 'recipient_1', url: 'https://companytheatre.ca/show' })
  assert.equal(verifyTrackingToken(token.replace('v1.', 'v1x.')).ok, false)
})

test('retry classification retries only transient failures', () => {
  assert.equal(shouldRetry('transient'), true)
  assert.equal(shouldRetry('unknown'), false)
  assert.equal(shouldRetry('permanent'), false)
  assert.equal(canRetry('transient', 1), true)
  assert.equal(canRetry('transient', 5), false)
  assert.equal(canRetry('unknown', 1), false)
})

test('SNS certificate URLs reject SSRF and non-AWS hosts', () => {
  assert.equal(isTrustedSnsCertificateUrl('https://sns.ca-central-1.amazonaws.com/SimpleNotificationService-test.pem'), true)
  assert.equal(isTrustedSnsCertificateUrl('http://sns.ca-central-1.amazonaws.com/SimpleNotificationService-test.pem'), false)
  assert.equal(isTrustedSnsCertificateUrl('https://sns.ca-central-1.amazonaws.com.evil.example/SimpleNotificationService-test.pem'), false)
  assert.equal(isTrustedSnsCertificateUrl('https://sns.ca-central-1.amazonaws.com/latest/meta-data'), false)
})

test('SNS notification canonicalization follows AWS field order', () => {
  const envelope: SnsEnvelope = {
    Type: 'Notification', MessageId: 'message-1', TopicArn: 'arn:aws:sns:ca-central-1:123:topic',
    Message: '{"eventType":"Delivery"}', Timestamp: '2026-09-17T20:00:00.000Z',
    SignatureVersion: '2', Signature: 'signature',
    SigningCertURL: 'https://sns.ca-central-1.amazonaws.com/SimpleNotificationService-test.pem',
    Subject: 'SES event',
  }
  assert.equal(snsCanonicalString(envelope), [
    'Message', envelope.Message,
    'MessageId', envelope.MessageId,
    'Subject', envelope.Subject,
    'Timestamp', envelope.Timestamp,
    'TopicArn', envelope.TopicArn,
    'Type', envelope.Type,
    '',
  ].join('\n'))
})
