// Fixed conservative pacing: a single serial worker starts at most four sends/sec.
// Delay follows every recipient, including batch boundaries and failed attempts.
export const EMAIL_WORKER_SEND_INTERVAL_MS = 250
export async function paceEmailWorker(wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  await wait(EMAIL_WORKER_SEND_INTERVAL_MS)
}
