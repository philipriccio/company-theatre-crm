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

test('tokens reject appended unsigned segments', () => {
  assert.equal(verifyUnsubscribeToken(`${createUnsubscribeToken('contact')}.extra`).ok, false)
  assert.equal(verifyTrackingToken(`${createTrackingToken('recipient', 'https://example.com')}.extra`).ok, false)
})

test('SES SDK v3 errors use metadata status; network uncertainty stays nonretryable', async () => {
  const { classifyProviderError } = await import('../src/lib/email/types')
  assert.equal(classifyProviderError({ name: 'TooManyRequestsException', $metadata: { httpStatusCode: 429 } }).class, 'transient')
  assert.equal(classifyProviderError({ name: 'ServiceUnavailableException', $metadata: { httpStatusCode: 503 } }).class, 'transient')
  assert.equal(classifyProviderError({ name: 'MessageRejected', $metadata: { httpStatusCode: 400 } }).class, 'permanent')
  assert.equal(classifyProviderError({ code: 'ECONNRESET' }).class, 'unknown')
})

test('SES adapter excludes signed unsubscribe URLs from restricted SES tags and preserves unsubscribe header', async t => {
  const oldAllowlist = process.env.EMAIL_SES_RECIPIENT_ALLOWLIST
  process.env.EMAIL_SES_RECIPIENT_ALLOWLIST = 'fixture@example.com'
  t.after(() => {
    if (oldAllowlist === undefined) delete process.env.EMAIL_SES_RECIPIENT_ALLOWLIST
    else process.env.EMAIL_SES_RECIPIENT_ALLOWLIST = oldAllowlist
  })
  const { SesEmailProvider } = await import('../src/lib/email/providers')
  type Client = import('@aws-sdk/client-sesv2').SESv2Client
  type Command = import('@aws-sdk/client-sesv2').SendEmailCommand
  let command: Command | undefined
  const client = { send: async (input: Command) => { command = input; return { MessageId: 'local-fixture' } } } as unknown as Client
  const provider = new SesEmailProvider(client)
  const result = await provider.send({ to: { email: 'fixture@example.com' }, from: { email: 'sender@example.com' }, subject: 'Local fixture', html: '<p>Proof</p>',
    headers: { 'List-Unsubscribe': '<https://example.com/unsubscribe/signed>' },
    metadata: { campaign_id: 'campaign_1', recipient_id: 'recipient_1', one_click_unsubscribe_url: 'https://example.com/unsubscribe/signed' },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(command?.input.EmailTags, [{ Name: 'campaign_id', Value: 'campaign_1' }, { Name: 'recipient_id', Value: 'recipient_1' }])
  assert.equal(command?.input.Content?.Simple?.Headers?.[0].Name, 'List-Unsubscribe')
})

test('SNS signature verification rejects wrong topics and tampered payloads without external fetches', async t => {
  const crypto = await import('node:crypto')
  const { verifySnsEnvelope } = await import('../src/lib/email/sns')
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const oldTopic = process.env.AWS_SNS_TOPIC_ARN
  process.env.AWS_SNS_TOPIC_ARN = 'arn:aws:sns:ca-central-1:123:local-proof'
  let fetches = 0
  t.mock.method(globalThis, 'fetch', async () => { fetches++; return new Response(publicKey.export({ type: 'spki', format: 'pem' }).toString()) })
  const envelope: SnsEnvelope = {
    Type: 'Notification', MessageId: 'local-signed-fixture', TopicArn: process.env.AWS_SNS_TOPIC_ARN,
    Message: '{"eventType":"Delivery"}', Timestamp: new Date().toISOString(), SignatureVersion: '2', Signature: '',
    SigningCertURL: 'https://sns.ca-central-1.amazonaws.com/SimpleNotificationService-local-proof.pem',
  }
  envelope.Signature = crypto.sign('RSA-SHA256', Buffer.from(snsCanonicalString(envelope)), privateKey).toString('base64')
  try {
    assert.deepEqual(await verifySnsEnvelope({ ...envelope, TopicArn: 'wrong-topic' }), { ok: false, reason: 'unexpected_topic' })
    assert.equal(fetches, 0)
    assert.deepEqual(await verifySnsEnvelope(envelope), { ok: true })
    assert.deepEqual(await verifySnsEnvelope({ ...envelope, Message: 'tampered' }), { ok: false, reason: 'invalid_signature' })
    assert.equal(fetches, 1)
  } finally {
    if (oldTopic === undefined) delete process.env.AWS_SNS_TOPIC_ARN
    else process.env.AWS_SNS_TOPIC_ARN = oldTopic
  }
})

test('contact personalization cannot inject HTML or recursively substitute template tokens', async () => {
  const { personalizeContent } = await import('../src/lib/email-template')
  const result = personalizeContent('<p>{{fullName}} {{email}}</p>', { fullName: '<a href="https://evil.example">{{email}} $&</a>', email: 'fixture@example.com' })
  assert.equal(result, '<p>&lt;a href=&quot;https://evil.example&quot;&gt;{{email}} $&amp;&lt;/a&gt; fixture@example.com</p>')
})
