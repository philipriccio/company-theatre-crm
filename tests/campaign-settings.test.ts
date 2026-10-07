import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_CAMPAIGN_DEFAULTS, normalizeCampaignDefaults } from '../src/lib/campaign-settings'

test('sender defaults reject header injection, multiple addresses and configuration secrets', () => {
  for (const value of ['Philip\r\nBcc: other@example.com', 'Name\u0000']) {
    assert.throws(() => normalizeCampaignDefaults({ ...DEFAULT_CAMPAIGN_DEFAULTS, fromName: value }))
  }
  for (const value of ['a@example.com,b@example.com', 'Philip <philip@companytheatre.ca>', 'a@companytheatre.ca.evil.example']) {
    assert.throws(() => normalizeCampaignDefaults({ ...DEFAULT_CAMPAIGN_DEFAULTS, fromEmail: value }))
  }
  assert.throws(() => normalizeCampaignDefaults({ ...DEFAULT_CAMPAIGN_DEFAULTS, apiKey: 'not-a-real-key' }))
  assert.throws(() => normalizeCampaignDefaults({ ...DEFAULT_CAMPAIGN_DEFAULTS, replyToEmail: 'hello@-invalid.example' }))
  assert.deepEqual(normalizeCampaignDefaults({ fromName: ' Company Theatre ', fromEmail: ' Philip@companytheatre.ca ', replyToEmail: 'REPLIES@example.com' }), { fromName: 'Company Theatre', fromEmail: 'philip@companytheatre.ca', replyToEmail: 'replies@example.com' })
})
