import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('worker runtime projection removes web/build dependencies without changing locked package bytes', () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const temp = mkdtempSync(join(tmpdir(), 'crm-worker-runtime-'))
  const original = readFileSync(join(root, 'package-lock.json'), 'utf8')
  try {
    for (const file of ['package.json', 'package-lock.json']) copyFileSync(join(root, file), join(temp, file))
    const result = spawnSync(process.execPath, [join(root, 'scripts/prepare-worker-runtime.mjs')], { cwd: temp, encoding: 'utf8', timeout: 30000 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    const projected = JSON.parse(readFileSync(join(temp, 'package-lock.json'), 'utf8'))
    const source = JSON.parse(original)
    for (const name of ['next', 'react', 'react-dom', 'sharp', 'source-map-js']) assert.equal(projected.packages[`node_modules/${name}`], undefined)
    for (const name of ['@aws-sdk/client-sesv2', '@prisma/client', '@prisma/adapter-pg', 'pg', 'dotenv', 'tsx']) assert.ok(projected.packages[`node_modules/${name}`])
    for (const [path, value] of Object.entries(projected.packages)) {
      if (!path) continue
      for (const field of ['version', 'resolved', 'integrity']) assert.equal(value[field], source.packages[path][field])
    }
    assert.equal(readFileSync(join(root, 'package-lock.json'), 'utf8'), original)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})
