import assert from 'node:assert/strict'
import test from 'node:test'
import { randomBytes } from 'node:crypto'
import { NextRequest } from 'next/server'
import type { EmailProvider, EmailProviderResult } from '../src/lib/email/types'

// Default npm test never touches any database. Only the isolated harness enables this suite.
test('isolated PostgreSQL readiness proof', { skip: process.env.CRM_ISOLATED_PROOF !== '1' }, async t => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.equal(url.pathname, '/crm_readiness_test')
  assert.match(url.searchParams.get('host') || '', /^\/tmp\/company-crm-readiness\.[A-Za-z0-9]+$/)
  process.env.EMAIL_TOKEN_SECRET = randomBytes(32).toString('hex')
  process.env.SCRATCH_INTAKE_TOKEN = randomBytes(32).toString('hex')
  process.env.SCRATCH_PROMOTION_IDS = 'local-proof'
  const { prisma } = await import('../src/lib/db')
  const queue = await import('../src/lib/email/queue')
  const { POST: intake } = await import('../src/app/api/intake/scratch/route')
  const { POST: seed } = await import('../src/app/api/campaigns/[id]/test/route')
  const { POST: send } = await import('../src/app/api/campaigns/[id]/send/route')
  const { POST: unsubscribe } = await import('../src/app/api/unsubscribe/[token]/route')
  const { createUnsubscribeToken } = await import('../src/lib/email/tokens')
  const { ingestSesNotification } = await import('../src/lib/email/ses-events')
  const { emailHash } = await import('../src/lib/email/tokens')
  const { CONSENT_VERSION } = await import('../src/lib/scratch-intake')
  const base = { submissionId: 'submission-001', promotionId: 'local-proof', email: ' Entrant@Example.com ' }
  const consent = { granted: true, textVersion: CONSENT_VERSION, capturedAt: new Date().toISOString() }
  const request = (body: unknown, authenticated = true) => new NextRequest('http://localhost/api/intake/scratch', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: `Bearer ${process.env.SCRATCH_INTAKE_TOKEN}` } : {}) }, body: JSON.stringify(body),
  })
  let sends = 0
  const accepted: EmailProvider = { name: 'mock', send: async () => {
    sends++
    return { ok: true, provider: 'mock', messageId: `mock-${sends}`, acceptedAt: new Date() }
  } }
  const makeRecipient = async (suffix: string, options: { solicitation?: boolean; status?: 'PAUSED' | 'CANCELLED' | 'QUEUED'; expired?: boolean } = {}) => {
    const contact = await prisma.contact.create({ data: { email: `${suffix}@example.com`, solicitation: options.solicitation ?? true } })
    const campaign = await prisma.campaign.create({ data: { name: suffix, subject: 'Local proof', content: '<p>Hello {{firstName}}</p>', approvedAt: new Date(), status: options.status || 'QUEUED' } })
    const recipient = await prisma.campaignRecipient.create({ data: {
      campaignId: campaign.id, contactId: contact.id, email: contact.email, status: 'SENDING', leaseOwner: 'proof',
      leasedUntil: new Date(Date.now() + (options.expired ? -60_000 : 300_000)),
    } })
    return { contact, campaign, recipient }
  }
  try {
    await t.test('auth fails closed before writes, including missing configuration', async () => {
      assert.equal((await intake(request(base, false))).status, 401)
      const token = process.env.SCRATCH_INTAKE_TOKEN
      delete process.env.SCRATCH_INTAKE_TOKEN
      assert.equal((await intake(request(base, false))).status, 503)
      process.env.SCRATCH_INTAKE_TOKEN = token
      assert.equal(await prisma.contact.count(), 0)
    })
    await t.test('strict validation rejects coerced consent, unknown fields, unknown promotions and oversized bodies', async () => {
      for (const body of [null, { ...base, marketingConsent: { granted: 'true' } }, { ...base, marketingConsent: { granted: true } },
        { ...base, marketingConsent: { ...consent, capturedAt: '2099-01-01T00:00:00Z' } },
        { ...base, solicitation: true }, { ...base, promotionId: 'not-approved' }]) assert.equal((await intake(request(body))).status, 400)
      assert.equal((await intake(request({ ...base, fullName: 'x'.repeat(17000) }))).status, 413)
      assert.equal(await prisma.scratchEntry.count(), 0)
    })
    await t.test('contest-only intake normalizes identity; concurrent retries create one entry and evidence row', async () => {
      const replies = await Promise.all(Array.from({ length: 5 }, () => intake(request(base))))
      assert.deepEqual(replies.map(r => r.status).sort(), [200, 200, 200, 200, 201])
      const bodies = await Promise.all(replies.map(r => r.json()))
      assert.equal(new Set(bodies.map(r => r.entryId)).size, 1)
      assert.equal(await prisma.consentEvidence.count(), 1)
      const contact = await prisma.contact.findUniqueOrThrow({ where: { email: 'entrant@example.com' } })
      assert.equal(contact.solicitation, false)
      assert.equal(contact.unsubscribedAt, null)
      assert.equal((await intake(request({ ...base, email: 'changed@example.com' }))).status, 409)
      assert.equal(await prisma.contact.count(), 1)
    })
    await t.test('different submission IDs for the same normalized identity do not race-create contacts', async () => {
      const results = await Promise.all([1, 2, 3].map(i => intake(request({ ...base, submissionId: `identity-race-${i}`, email: 'SAME@example.com' }))))
      assert.deepEqual(results.map(r => r.status), [201, 201, 201])
      assert.equal(await prisma.contact.count({ where: { email: 'same@example.com' } }), 1)
      assert.equal(await prisma.scratchEntry.count({ where: { email: 'same@example.com' } }), 3)
    })
    await t.test('failed evidence persistence rolls back the whole intake transaction', async () => {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_fixture_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.email = 'rollback@example.com' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$`)
      await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_fixture_consent BEFORE INSERT ON "ConsentEvidence" FOR EACH ROW EXECUTE FUNCTION reject_fixture_consent()`)
      try {
        assert.equal((await intake(request({ ...base, submissionId: 'rollback-submission', email: 'rollback@example.com' }))).status, 500)
        assert.equal(await prisma.contact.count({ where: { email: 'rollback@example.com' } }), 0)
        assert.equal(await prisma.scratchEntry.count({ where: { submissionId: 'rollback-submission' } }), 0)
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER reject_fixture_consent ON "ConsentEvidence"`)
        await prisma.$executeRawUnsafe('DROP FUNCTION reject_fixture_consent()')
      }
    })
    await t.test('new schema default is nonmarketable; explicit consent has separate evidence', async () => {
      const defaultContact = await prisma.contact.create({ data: { email: 'default@example.com' } })
      assert.equal(defaultContact.solicitation, false)
      assert.equal((await intake(request({ ...base, submissionId: 'submission-optin', email: 'optin@example.com', marketingConsent: consent }))).status, 201)
      const contact = await prisma.contact.findUniqueOrThrow({ where: { email: 'optin@example.com' } })
      assert.equal(contact.solicitation, true)
      const evidence = await prisma.consentEvidence.findFirstOrThrow({ where: { contactId: contact.id } })
      assert.equal(evidence.status, 'express_opt_in_recorded')
      assert.match(JSON.stringify(evidence.metadata), /I agree to receive marketing emails/)
    })
    await t.test('intake preserves existing profiles, consent and all suppressions, including deleted contacts', async () => {
      const unsubscribedAt = new Date('2026-01-01T00:00:00Z')
      await prisma.contact.create({ data: { email: 'suppressed@example.com', fullName: 'Preserved', solicitation: false, unsubscribedAt } })
      for (const email of ['suppressed@example.com', 'deleted@example.com']) {
        await prisma.globalSuppression.create({ data: { email, emailHash: emailHash(email), reason: 'complaint', source: 'fixture' } })
        assert.equal((await intake(request({ ...base, submissionId: `submission-${email.split('@')[0]}`, email, fullName: 'New Name', marketingConsent: consent }))).status, 201)
        assert.equal((await prisma.contact.findUniqueOrThrow({ where: { email } })).solicitation, false)
        assert.equal((await prisma.globalSuppression.findUniqueOrThrow({ where: { email } })).reason, 'complaint')
      }
      const existing = await prisma.contact.findUniqueOrThrow({ where: { email: 'suppressed@example.com' } })
      assert.equal(existing.fullName, 'Preserved')
      assert.equal(existing.unsubscribedAt?.toISOString(), unsubscribedAt.toISOString())
      await intake(request({ ...base, submissionId: 'submission-reconsent', marketingConsent: consent }))
      assert.equal((await prisma.contact.findUniqueOrThrow({ where: { email: 'entrant@example.com' } })).solicitation, false)
      await intake(request({ ...base, submissionId: 'submission-no-withdraw', email: 'optin@example.com' }))
      assert.equal((await prisma.contact.findUniqueOrThrow({ where: { email: 'optin@example.com' } })).solicitation, true)
    })
    await t.test('legacy resubscribe is explicitly refused even when the legacy webhook is enabled', async () => {
      const { POST: legacy } = await import('../src/app/api/webhooks/sendgrid/route')
      process.env.ENABLE_LEGACY_SENDGRID_WEBHOOK = 'true'
      process.env.SENDGRID_WEBHOOK_SIGNATURE = randomBytes(32).toString('hex')
      try {
        const response = await legacy(new NextRequest('http://localhost', { method: 'POST', headers: {
          'x-company-theatre-sendgrid-signature': process.env.SENDGRID_WEBHOOK_SIGNATURE,
        }, body: JSON.stringify([{ email: 'suppressed@example.com', event: 'group_resubscribe', timestamp: Date.now() / 1000 }]) }))
        assert.equal(response.status, 422)
        const contact = await prisma.contact.findUniqueOrThrow({ where: { email: 'suppressed@example.com' } })
        assert.equal(contact.solicitation, false); assert.ok(contact.unsubscribedAt)
      } finally {
        delete process.env.ENABLE_LEGACY_SENDGRID_WEBHOOK
        delete process.env.SENDGRID_WEBHOOK_SIGNATURE
      }
    })
    await t.test('actual Keela importer preserves opt-outs and creates unknown-consent identities as nonmarketable', async () => {
      const { writeFile, unlink } = await import('node:fs/promises')
      const { spawn } = await import('node:child_process')
      const fixturePath = `${url.searchParams.get('host')}/keela-fixture.csv`
      await writeFile(fixturePath, 'Email,Solicitation\nsuppressed@example.com,Yes\nentrant@example.com,Yes\nnew-import@example.com,Yes\n')
      try {
        const exitCode = await new Promise<number | null>((resolve, reject) => {
          const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/import-keela.ts', fixturePath], { stdio: 'ignore', env: process.env })
          child.on('error', reject); child.on('exit', resolve)
        })
        assert.equal(exitCode, 0)
        for (const email of ['suppressed@example.com', 'entrant@example.com', 'new-import@example.com']) {
          assert.equal((await prisma.contact.findUniqueOrThrow({ where: { email } })).solicitation, false)
        }
        assert.ok((await prisma.contact.findUniqueOrThrow({ where: { email: 'suppressed@example.com' } })).unsubscribedAt)
        assert.equal((await prisma.globalSuppression.findUniqueOrThrow({ where: { email: 'suppressed@example.com' } })).reason, 'complaint')
      } finally { await unlink(fixturePath) }
    })
    await t.test('enqueue races freeze exactly one consent snapshot and exclude nonconsenting entrants', async () => {
      await prisma.contact.create({ data: { email: 'flagged@example.com', solicitation: true } })
      await prisma.globalSuppression.create({ data: { email: 'flagged@example.com', emailHash: emailHash('flagged@example.com'), reason: 'hard_bounce', source: 'fixture' } })
      const campaign = await prisma.campaign.create({ data: { name: 'Enqueue', subject: 'Proof', content: 'Proof' } })
      const results = await Promise.allSettled([1, 2].map(() => queue.enqueueCampaign(campaign.id, { mode: 'all', approvedBy: 'Local fixture' })))
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
      const rows = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id } })
      assert.deepEqual(rows.map(r => r.email), ['optin@example.com'])
      assert.equal(await prisma.consentEvidence.count({ where: { source: 'campaign_enqueue' } }), 1)
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED' } })
      const invalid = await send(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ mode: 'typo', approvalName: 'Fixture' }) }), { params: Promise.resolve({ id: campaign.id }) })
      assert.equal(invalid.status, 400)
    })
    await t.test('worker honors suppression, absent consent, pause/cancel, wrong owner and expired leases without sends', async () => {
      const before = sends
      for (const status of ['PAUSED', 'CANCELLED'] as const) {
        const { recipient } = await makeRecipient(status, { status })
        await queue.processRecipient(recipient.id, accepted, 'proof')
        assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })).status, status === 'PAUSED' ? 'QUEUED' : 'CANCELLED')
      }
      const noConsent = await makeRecipient('no-consent', { solicitation: false })
      await queue.processRecipient(noConsent.recipient.id, accepted, 'proof')
      assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: noConsent.recipient.id } })).status, 'SUPPRESSED')
      const suppressed = await makeRecipient('global-suppression')
      await prisma.globalSuppression.create({ data: { email: suppressed.contact.email, emailHash: emailHash(suppressed.contact.email), reason: 'hard_bounce', source: 'fixture' } })
      await queue.processRecipient(suppressed.recipient.id, accepted, 'proof')
      assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: suppressed.recipient.id } })).status, 'SUPPRESSED')
      const expired = await makeRecipient('expired', { expired: true })
      await queue.processRecipient(expired.recipient.id, accepted, 'proof')
      await queue.recoverExpiredLeases()
      assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: expired.recipient.id } })).status, 'UNKNOWN')
      const other = await makeRecipient('wrong-owner')
      await queue.processRecipient(other.recipient.id, accepted, 'other-worker')
      assert.equal(sends, before)
    })
    await t.test('transient failures retry to a bounded limit; uncertain and permanent outcomes never auto-retry', async () => {
      for (const kind of ['transient', 'unknown', 'permanent'] as const) {
        const { recipient } = await makeRecipient(`failure-${kind}`)
        const failure: EmailProvider = { name: 'mock', send: async (): Promise<EmailProviderResult> => ({ ok: false, provider: 'mock', error: { class: kind, code: kind, message: 'Fixture' } }) }
        await queue.processRecipient(recipient.id, failure, 'proof')
        let row = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })
        assert.equal(row.status, kind === 'transient' ? 'QUEUED' : kind === 'unknown' ? 'UNKNOWN' : 'FAILED')
        assert.equal(row.attemptCount, 1)
        assert.equal(!!row.nextAttemptAt, kind === 'transient')
        if (kind === 'transient') {
          await prisma.campaignRecipient.update({ where: { id: row.id }, data: { status: 'SENDING', attemptCount: 4, leaseOwner: 'proof', leasedUntil: new Date(Date.now() + 60_000) } })
          await queue.processRecipient(row.id, failure, 'proof')
          row = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: row.id } })
          assert.equal(row.status, 'FAILED'); assert.equal(row.attemptCount, 5); assert.equal(row.nextAttemptAt, null)
        }
      }
    })
    await t.test('concurrent claims are disjoint and exclude paused, unapproved and future campaigns', async () => {
      const rows = await Promise.all(['claim-a', 'claim-b', 'claim-paused', 'claim-future', 'claim-unapproved'].map(s => makeRecipient(s)))
      for (const row of rows) await prisma.campaignRecipient.update({ where: { id: row.recipient.id }, data: { status: 'QUEUED', leasedUntil: null, leaseOwner: null, nextAttemptAt: new Date(0) } })
      await prisma.campaign.update({ where: { id: rows[2].campaign.id }, data: { status: 'PAUSED' } })
      await prisma.campaign.update({ where: { id: rows[3].campaign.id }, data: { scheduledAt: new Date(Date.now() + 60_000), status: 'SCHEDULED' } })
      await prisma.campaign.update({ where: { id: rows[4].campaign.id }, data: { approvedAt: null } })
      const groups = await Promise.all([queue.claimRecipients('a', 100, 300), queue.claimRecipients('b', 100, 300)])
      const ids = groups.flat().map(r => r.id)
      assert.equal(new Set(ids).size, ids.length)
      assert.ok(ids.includes(rows[0].recipient.id) && ids.includes(rows[1].recipient.id))
      for (const row of rows.slice(2)) assert.equal(ids.includes(row.recipient.id), false)
    })
    await t.test('provider completion cannot undo a pause made during an in-flight send', async () => {
      const { recipient, campaign } = await makeRecipient('pause-during-send')
      await queue.processRecipient(recipient.id, { name: 'mock', send: async message => {
        await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED' } })
        return accepted.send(message)
      } }, 'proof')
      assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, 'PAUSED')
      assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })).status, 'ACCEPTED')
    })
    await t.test('signed unsubscribe persists both contact state and global suppression; test send cannot bypass it', async () => {
      const { contact, campaign } = await makeRecipient('unsubscribe')
      const token = createUnsubscribeToken(contact.id)
      assert.equal((await unsubscribe(new NextRequest('http://localhost', { method: 'POST' }), { params: Promise.resolve({ token }) })).status, 200)
      assert.equal((await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } })).solicitation, false)
      assert.ok(await prisma.globalSuppression.findUnique({ where: { email: contact.email } }))
      const result = await seed(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ email: contact.email }) }), { params: Promise.resolve({ id: campaign.id }) })
      assert.equal(result.status, 400)
    })
    await t.test('SES events reconcile UNKNOWN, deduplicate and never downgrade complaint with late delivery', async () => {
      const { recipient } = await makeRecipient('events')
      await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'UNKNOWN' } })
      const event = (eventType: string, id: string) => ({
        Type: 'Notification' as const, MessageId: id, TopicArn: 'local-fixture', Timestamp: new Date().toISOString(),
        SignatureVersion: '2' as const, Signature: 'local-fixture-not-used', SigningCertURL: 'local-fixture-not-used',
        Message: JSON.stringify({ eventType, mail: { messageId: 'ses-fixture', tags: { recipient_id: [recipient.id] } }, bounce: { bounceType: 'Permanent' } }),
      })
      const notification = event('Send', 'event-send')
      assert.equal((await ingestSesNotification(notification)).duplicate, false)
      assert.equal((await ingestSesNotification(notification)).duplicate, true)
      assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })).status, 'ACCEPTED')
      await ingestSesNotification(event('Delivery', 'event-delivery'))
      await ingestSesNotification(event('Complaint', 'event-complaint'))
      await ingestSesNotification(event('Delivery', 'event-late-delivery'))
      assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })).status, 'SUPPRESSED')
      assert.equal((await prisma.globalSuppression.findUniqueOrThrow({ where: { email: 'events@example.com' } })).reason, 'complaint')
    })
    await t.test('hard bounces suppress and replay without duplicate provider events', async () => {
      const { recipient, contact } = await makeRecipient('hard-bounce-event')
      const notification = {
        Type: 'Notification' as const, MessageId: 'hard-bounce-event', TopicArn: 'local-fixture', Timestamp: new Date().toISOString(),
        SignatureVersion: '2' as const, Signature: 'local-fixture-not-used', SigningCertURL: 'local-fixture-not-used',
        Message: JSON.stringify({ eventType: 'Bounce', mail: { messageId: 'bounce-fixture', tags: { recipient_id: [recipient.id] } }, bounce: { bounceType: 'Permanent' } }),
      }
      await ingestSesNotification(notification)
      assert.equal((await ingestSesNotification(notification)).duplicate, true)
      assert.equal((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })).status, 'FAILED')
      assert.equal((await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } })).solicitation, false)
      assert.equal((await prisma.globalSuppression.findUniqueOrThrow({ where: { email: contact.email } })).reason, 'hard_bounce')
    })
    await t.test('delivery event arriving before provider return is not overwritten by worker acceptance', async () => {
      const { recipient } = await makeRecipient('event-race')
      await queue.processRecipient(recipient.id, { name: 'mock', send: async message => {
        await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } })
        return accepted.send(message)
      } }, 'proof')
      const row = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: recipient.id } })
      assert.equal(row.status, 'DELIVERED')
      assert.equal(row.attemptCount, 1)
      assert.ok(row.providerMessageId && row.acceptedAt)
    })
    await t.test('mock worker CLI traverses approved tagged enqueue through durable acceptance and completion', async () => {
      // Isolate this smoke campaign from intentionally unfinished earlier fixtures.
      await prisma.campaign.updateMany({ data: { status: 'PAUSED' } })
      const contact = await prisma.contact.create({ data: { email: 'worker-cli@example.com', solicitation: true } })
      const tag = await prisma.tag.create({ data: { name: 'worker-cli-proof' } })
      await prisma.contactTag.create({ data: { contactId: contact.id, tagId: tag.id } })
      const campaign = await prisma.campaign.create({ data: { name: 'Worker CLI proof', subject: 'Local only', content: '<p>Hello {{firstName}}</p>' } })
      await queue.enqueueCampaign(campaign.id, { mode: 'tags', tagIds: [tag.id], approvedBy: 'Local fixture' })
      const { spawn } = await import('node:child_process')
      const code = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/email-worker.ts', '--once'], { stdio: 'ignore', env: { ...process.env, EMAIL_PROVIDER: 'mock' } })
        child.on('error', reject); child.on('exit', resolve)
      })
      assert.equal(code, 0)
      const row = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } })
      assert.equal(row.status, 'ACCEPTED'); assert.equal(row.provider, 'mock'); assert.equal(row.attemptCount, 1)
      assert.equal(await prisma.emailDeliveryAttempt.count({ where: { recipientId: row.id, outcome: 'ACCEPTED' } }), 1)
      assert.equal((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, 'COMPLETED')
    })
    await t.test('visual draft save/reopen, immutable approved campaign, and audience parity', async () => {
      const { POST:create } = await import('../src/app/api/campaigns/route')
      const { PUT:update, GET:read } = await import('../src/app/api/campaigns/[id]/route')
      const { selectAudience } = await import('../src/lib/email/audience')
      const design = {name:'Reusable design',styles:{backgroundColor:'#fff',contentBackgroundColor:'#fff',fontFamily:'Arial',maxWidth:600},blocks:[{id:'headline',type:'heading',content:'Saved & reopened',level:1,align:'left',color:'#000'}]}
      const payload = {name:'Workflow proof',subject:'Proof',fromName:'Company',fromEmail:'sender@example.com',replyToEmail:'replies@example.com',previewText:'Preview',content:'',design,status:'SENT'}
      const created = await create(request(payload));assert.equal(created.status,201);const draft = await created.json();assert.equal(draft.status,'DRAFT');assert.deepEqual(draft.design,design);assert.match(draft.content,/Saved &amp; reopened/);assert.ok(!draft.content.includes('"blocks"'))
      const context={params:Promise.resolve({id:draft.id})};assert.equal((await update(request({...payload,subject:'Changed'}),context)).status,200)
      const reopened=await (await read(request({}),context)).json();assert.equal(reopened.subject,'Changed');assert.deepEqual(reopened.design,design);assert.equal(reopened.replyToEmail,'replies@example.com')
      const tagA=await prisma.tag.create({data:{name:'workflow-a'}});const tagB=await prisma.tag.create({data:{name:'workflow-b'}})
      for (const [email,solicitation] of [['workflow-eligible@example.com',true],['workflow-blocked@example.com',true],['workflow-unsub@example.com',false]] as const) await prisma.contact.create({data:{email,solicitation,tags:{create:[{tagId:tagA.id},{tagId:tagB.id}]}}})
      await prisma.globalSuppression.create({data:{email:'workflow-blocked@example.com',emailHash:emailHash('workflow-blocked@example.com'),reason:'UNSUBSCRIBE',source:'proof'}})
      const selection={mode:'tags' as const,tagIds:[tagA.id,tagB.id],approvedBy:'Synthetic proof'}
      const audience=await selectAudience(selection.mode,selection.tagIds);assert.equal(audience.eligible,1);assert.equal(audience.excluded,2)
      const queued=await queue.enqueueCampaign(draft.id,selection);assert.equal(queued.recipientCount,audience.eligible)
      assert.equal((await update(request({...payload,subject:'Forbidden'}),context)).status,409)
      assert.equal((await prisma.campaign.findUniqueOrThrow({where:{id:draft.id}})).subject,'Changed')
    })
    await t.test('copy edits reject stale and non-draft saves and preserve approved references', async () => {
      const {saveCampaignCopy}=await import('../src/lib/campaign-copy-save')
      const {copyFields}=await import('../src/lib/campaign-copy')
      const {reviewHash,recordReview,reviewState}=await import('../src/lib/campaign-review')
      const c=await prisma.campaign.create({data:{name:'Copy proof',subject:'Original',content:'<p>Hello <strong>friends</strong></p>'}})
      const hash=reviewHash(c)
      await recordReview(c.id,{action:'APPROVE',author:'Synthetic QA',contentHash:hash})
      const reference=await prisma.campaignReview.findFirstOrThrow({where:{campaignId:c.id,action:'APPROVE'}})
      const payload={contentHash:hash,subject:'New subject',previewText:'New preview',edits:[{id:copyFields(c.content)[0].id,text:'Hello everyone'}]}
      await saveCampaignCopy(c.id,payload)
      const changed=await prisma.campaign.findUniqueOrThrow({where:{id:c.id}})
      assert.equal(changed.subject,'New subject');assert.equal(copyFields(changed.content)[0].text,'Hello everyone')
      assert.equal(reviewState([reference],reviewHash(changed)),'Draft')
      assert.deepEqual((await prisma.campaignReview.findUniqueOrThrow({where:{id:reference.id}})).snapshot,reference.snapshot)
      await assert.rejects(saveCampaignCopy(c.id,payload),/changed/)
      await prisma.campaign.update({where:{id:c.id},data:{status:'QUEUED'}})
      await assert.rejects(saveCampaignCopy(c.id,{...payload,contentHash:reviewHash(changed)}),/Only drafts/)
      await prisma.campaign.update({where:{id:c.id},data:{status:'DRAFT',design:{blocks:[],styles:{}}}})
      const structured=await prisma.campaign.findUniqueOrThrow({where:{id:c.id}})
      await assert.rejects(saveCampaignCopy(c.id,{...payload,contentHash:reviewHash(structured)}),/visual editor/)
      assert.equal(await prisma.campaignRecipient.count({where:{campaignId:c.id}}),0)
    })
    await t.test('review approval preserves immutable version, rejects stale approval, and copies safely', async () => {
      const {recordReview,reviewHash,reviewState}=await import('../src/lib/campaign-review')
      const c=await prisma.campaign.create({data:{name:'Review proof',subject:'Original',content:'<p>Original</p>'}})
      const hash=reviewHash(c)
      await recordReview(c.id,{action:'SUBMIT',author:'Mildred',contentHash:hash})
      await recordReview(c.id,{action:'CHANGES',author:'Philip',note:'Bigger headline',contentHash:hash})
      await recordReview(c.id,{action:'APPROVE',author:'Philip',contentHash:hash})
      const ref=await prisma.campaignReview.findFirstOrThrow({where:{campaignId:c.id,action:'APPROVE'}})
      assert.ok(ref.snapshot)
      assert.equal((await prisma.campaign.findUniqueOrThrow({where:{id:c.id}})).approvedAt,null)
      assert.equal(await prisma.campaignRecipient.count({where:{campaignId:c.id}}),0)
      await assert.rejects(prisma.campaignReview.update({where:{id:ref.id},data:{note:'Overwrite'}}))
      await prisma.campaign.update({where:{id:c.id},data:{subject:'Revised'}})
      await assert.rejects(recordReview(c.id,{action:'APPROVE',author:'Philip',contentHash:hash}),/changed/)
      const changed=await prisma.campaign.findUniqueOrThrow({where:{id:c.id}})
      assert.equal(reviewState([ref],reviewHash(changed)),'Draft')
      const copy=await recordReview(c.id,{action:'COPY',referenceId:ref.id})
      const copied=await prisma.campaign.findUniqueOrThrow({where:{id:copy.id}})
      assert.equal(copied.subject,'Original');assert.equal(copied.status,'DRAFT');assert.equal(copied.approvedAt,null)
      assert.equal(await prisma.campaignReview.count({where:{campaignId:copied.id}}),0)
      await assert.rejects(recordReview(c.id,{action:'CHANGES',author:'Philip',note:'',contentHash:reviewHash(changed)}),/notes/)
    })
  } finally {
    await prisma.$disconnect()
    const shared = globalThis as unknown as { pool?: { end(): Promise<void> } }
    await shared.pool?.end()
  }
})
