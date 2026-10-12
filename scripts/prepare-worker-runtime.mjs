// Build-directory only: project the existing lock onto the worker import closure.
// Offline lock pruning cannot resolve upgrades or silently change package bytes.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const originalLock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const required = ['@aws-sdk/client-sesv2', '@prisma/client', '@prisma/adapter-pg', 'pg', 'dotenv', 'tsx']
const dependencies = Object.fromEntries(required.map(name => {
  assert.ok(manifest.dependencies[name], `Missing worker dependency: ${name}`)
  return [name, manifest.dependencies[name]]
}))
writeFileSync('package.json', JSON.stringify({ name: `${manifest.name}-worker`, version: manifest.version, private: true, dependencies }, null, 2) + '\n')
const result = spawnSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--offline', '--omit=dev', '--omit=peer', '--no-audit'], { stdio: 'inherit' })
assert.ifError(result.error)
assert.equal(result.status, 0, 'Offline worker lock projection failed')
const workerLock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
for (const [path, entry] of Object.entries(workerLock.packages)) {
  if (!path) continue
  const original = originalLock.packages[path]
  assert.ok(original, `Worker projection introduced a package: ${path}`)
  for (const field of ['version', 'resolved', 'integrity']) {
    assert.equal(entry[field], original[field], `Worker projection changed ${field}: ${path}`)
  }
}
for (const name of ['next', 'react', 'react-dom', 'sharp', 'source-map-js']) {
  assert.ok(!workerLock.packages[`node_modules/${name}`], `Web/build-only dependency remains: ${name}`)
}
console.log('Worker lock projected offline; all retained versions and integrity values unchanged.')
