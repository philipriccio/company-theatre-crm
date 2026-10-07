import assert from 'node:assert/strict'
import test from 'node:test'
import type { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2'
import { DisabledEmailProvider, MockEmailProvider, SesEmailProvider } from '../src/lib/email/providers'
import type { EmailMessage } from '../src/lib/email/types'

const message: EmailMessage = {
  to: { email: 'seed.one@example.com' }, from: { email: 'sender@example.com' },
  subject: 'Offline fixture', html: '<p>No email leaves this test.</p>',
}

test('SES exact-recipient guard fails closed before SDK send and permits only normalized seed addresses', async t => {
  const oldAllowlist = process.env.EMAIL_SES_RECIPIENT_ALLOWLIST
  t.after(() => {
    if (oldAllowlist === undefined) delete process.env.EMAIL_SES_RECIPIENT_ALLOWLIST
    else process.env.EMAIL_SES_RECIPIENT_ALLOWLIST = oldAllowlist
  })
  const calls: SendEmailCommand[] = []
  const client = { send: async (command: SendEmailCommand) => {
    calls.push(command)
    return { MessageId: 'offline-seed-fixture' }
  } } as unknown as SESv2Client
  const provider = new SesEmailProvider(client)

  for (const allowlist of [undefined, '', ' ', ',', 'seed.one@example.com,',
    'seed.one@example.com,,seed.two@example.com', '*@example.com', 'example.com',
    'Seed <seed.one@example.com>', 'seed.one@example.com;seed.two@example.com',
    'seed.one@example.com\r\nBcc: outsider@example.com', 'seed.one@example.com\n',
    'seed.one@-example.com', 'seed..one@example.com', 'seed.one@example.com,invalid', 'seed.one@exampKe.com']) {
    if (allowlist === undefined) delete process.env.EMAIL_SES_RECIPIENT_ALLOWLIST
    else process.env.EMAIL_SES_RECIPIENT_ALLOWLIST = allowlist
    const result = await provider.send(message)
    assert.equal(result.ok, false, `configuration should refuse: ${JSON.stringify(allowlist)}`)
    if (!result.ok) {
      assert.equal(result.error.class, 'configuration')
      assert.equal(result.error.code, 'ses_recipient_allowlist_invalid')
    }
    assert.equal(calls.length, 0)
  }

  process.env.EMAIL_SES_RECIPIENT_ALLOWLIST = ' SEED.ONE@EXAMPLE.COM , seed.two@example.com '
  for (const email of ['outsider@example.com', 'seed.one+tag@example.com', 'seed.one@example.com.evil.test',
    'Seed <seed.one@example.com>', 'seed.one@example.com,outsider@example.com',
    'seed.one@example.com;outsider@example.com', 'seed.one@example.com\r\nBcc: outsider@example.com',
    'seed.one@example.com\n', 'seed.one@example.com\u0000', 'seed.one＠example.com',
    '"seed.one"@example.com', '*@example.com', '']) {
    const result = await provider.send({ ...message, to: { email } })
    assert.equal(result.ok, false, `recipient should refuse: ${JSON.stringify(email)}`)
    if (!result.ok) assert.equal(result.error.code, 'ses_recipient_not_allowlisted')
    assert.equal(calls.length, 0)
  }

  for (const email of [' SEED.ONE@Example.COM ', 'seed.two@example.com']) {
    assert.equal((await provider.send({ ...message, to: { email } })).ok, true)
  }
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map(call => call.input.Destination?.ToAddresses), [
    ['seed.one@example.com'], ['seed.two@example.com'],
  ])

  // No cached approval: removing the allowlist blocks this same provider instance.
  delete process.env.EMAIL_SES_RECIPIENT_ALLOWLIST
  assert.equal((await provider.send(message)).ok, false)
  assert.equal(calls.length, 2)
  assert.equal((await new MockEmailProvider().send(message)).ok, true)
  const disabled = await new DisabledEmailProvider().send()
  assert.equal(disabled.ok, false)
  if (!disabled.ok) assert.equal(disabled.error.code, 'email_provider_disabled')
})
