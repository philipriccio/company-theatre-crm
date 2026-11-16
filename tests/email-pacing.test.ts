import assert from 'node:assert/strict'
import test from 'node:test'
import { paceEmailWorker, EMAIL_WORKER_SEND_INTERVAL_MS } from '../src/lib/email/pacing'
import { readFileSync } from 'node:fs'

test('serial worker paces every recipient including batch boundaries at no more than four/sec', async () => {
  const delays: number[] = []
  for (let i = 0; i < 6; i++) await paceEmailWorker(async ms => { delays.push(ms) })
  assert.equal(EMAIL_WORKER_SEND_INTERVAL_MS, 250)
  assert.deepEqual(delays, Array(6).fill(250))
  const source = readFileSync('scripts/email-worker.ts', 'utf8')
  assert.match(source, /await processRecipient\(recipient.id, provider, workerId\)\s+await paceEmailWorker\(\)/)
})
