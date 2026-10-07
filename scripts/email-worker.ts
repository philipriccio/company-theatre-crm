import 'dotenv/config'
import { getEmailProvider } from '../src/lib/email/providers'
import { claimRecipients, processRecipient, recoverExpiredLeases, updateCampaignCompletions } from '../src/lib/email/queue'

const workerId = process.env.EMAIL_WORKER_ID || `worker-${process.pid}`
const batchSize = Number(process.env.EMAIL_WORKER_BATCH_SIZE || '10')
const leaseSeconds = Number(process.env.EMAIL_WORKER_LEASE_SECONDS || '300')
const idleMs = Number(process.env.EMAIL_WORKER_IDLE_MS || '5000')

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function runOnce() {
  const provider = getEmailProvider()
  if (provider.name === 'disabled') return 0
  await recoverExpiredLeases()
  const recipients = await claimRecipients(workerId, batchSize, leaseSeconds)
  for (const recipient of recipients) {
    await processRecipient(recipient.id, provider, workerId)
  }
  await updateCampaignCompletions()
  return recipients.length
}

async function main() {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100 || !Number.isInteger(leaseSeconds) || leaseSeconds < 30 || !Number.isFinite(idleMs) || idleMs < 100) throw new Error('Invalid worker batch, lease, or idle settings')
  const once = process.argv.includes('--once')
  do {
    const claimed = await runOnce()
    if (once) break
    if (claimed === 0) await sleep(idleMs)
  } while (true)
}

main().catch((error) => {
  console.error('[email-worker] fatal', error)
  process.exit(1)
})
