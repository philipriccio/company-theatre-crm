// No project .env, database connection, AWS credentials, or real provider.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/email-worker.ts', '--once'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  encoding: 'utf8',
  timeout: 15000,
  env: {
    PATH: process.env.PATH,
    DOTENV_CONFIG_PATH: '/dev/null',
    DATABASE_URL: 'postgresql://localhost:1/disabled_worker_no_database',
    EMAIL_PROVIDER: 'disabled',
    EMAIL_WORKER_BATCH_SIZE: '1',
    EMAIL_WORKER_IDLE_MS: '5000',
    EMAIL_WORKER_LEASE_SECONDS: '300',
  },
})
assert.ifError(result.error)
assert.equal(result.status, 0, result.stderr)
assert.equal(result.signal, null)
console.log('PASS: disabled worker exits before database access, with no AWS configuration.')
