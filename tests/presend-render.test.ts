import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFragment } from 'parse5'
import { wrapLinksForTracking, buildCampaignEmail } from '../src/lib/email/message'
import { verifyTrackingToken } from '../src/lib/email/tokens'
import { personalizeContent } from '../src/lib/email-template'

process.env.EMAIL_TOKEN_SECRET = 'synthetic-presend-render-test-secret-only'

function browserHref(html: string): string {
  const node = parseFragment(html).childNodes[0]
  assert.ok('attrs' in node)
  return node.attrs.find(a => a.name === 'href')!.value
}
function target(html: string) {
  const wrapped = wrapLinksForTracking(html, 'synthetic-recipient', 'https://crm.example.com')
  const token = new URL(browserHref(wrapped)).searchParams.get('t')
  assert.ok(token)
  const verified = verifyTrackingToken(token)
  assert.ok(verified.ok)
  assert.equal(verified.recipientId, 'synthetic-recipient')
  return verified.url
}

test('current campaign ticket href preserves real UTM keys after signing', () => {
  const html = '<a href="https://www.mirvish.com/shows/jackpot-twins?utm_source=company_theatre&amp;utm_medium=email&amp;utm_campaign=jackpot_twins_onsale_202610">Tickets</a>'
  const url = new URL(target(html))
  assert.equal(url.toString(), browserHref(html))
  assert.equal(url.searchParams.get('utm_medium'), 'email')
  assert.equal(url.searchParams.has('amp;utm_medium'), false)
})

test('signed destinations match one HTML attribute parse, never repeated decoding', () => {
  for (const href of [
    'https://example.com/?a=1&#38;b=2&#x26;c=3',
    'https://example.com/?name=Ren&eacute;e&amp;place=Montréal',
    'https://example.com/?literal=&amp;amp;foo&amp;encoded=%26amp%3B',
    'https://example.com/?x=&notin;&amp;y=&copy=literal',
    'https://example.com/?q=&quot;quoted&quot;&amp;x=&#39;single&#39;',
    'https://example.com/?ordinary=1&second=2#fragment',
  ]) {
    const html = `<a href="${href}">Link</a>`
    assert.equal(target(html), new URL(browserHref(html)).toString(), href)
  }
})

test('unsubscribe exclusions and unsafe destinations remain untouched', () => {
  for (const href of [
    'https://crm.example.com/unsubscribe/signed?x=1&amp;y=2',
    'https://crm.example.com/&#117;nsubscribe/signed',
    'https://user:pass@example.com',
    'https://user&#58;pass&#64;example.com',
    'javascript:alert(1)', 'mailto:hello@example.com', '{{unsubscribe_url}}',
  ]) {
    const html = `<a href="${href}">Link</a>`
    assert.equal(wrapLinksForTracking(html, 'synthetic-recipient'), html)
  }
})

test('first name trims only outer whitespace and falls back for absent/blank names', () => {
  for (const firstName of [undefined, null, '', '  \t\n ', '\u00a0']) {
    assert.equal(personalizeContent('<p>Hi {{firstName}},</p>', { email: 'test@example.com', firstName }), '<p>Hi there,</p>')
  }
  assert.equal(personalizeContent('Hi {{firstName}},', { email: 'test@example.com', firstName: '  Mary Jane  ' }), 'Hi Mary Jane,')
  assert.equal(personalizeContent('Hi {{firstName}},', { email: 'test@example.com', firstName: ' Élodie ' }), 'Hi Élodie,')
  assert.equal(personalizeContent('Hi {{firstName}},', { email: 'test@example.com', firstName: ' <b>O\'Neil & {{email}} $&</b> ' }), 'Hi &lt;b&gt;O&#39;Neil &amp; {{email}} $&amp;&lt;/b&gt;,')
})

test('actual email builder preserves named greeting and signed unsubscribe without provider calls', () => {
  const message = buildCampaignEmail({ id: 'test-campaign', subject: 'Fixture', fromName: 'Fixture', fromEmail: 'sender@example.com', content: '<!DOCTYPE html><html><body>Hi {{firstName}},<a href="https://example.com/?a=1&amp;b=2">Tickets</a><a href="{{unsubscribe_url}}">Unsubscribe</a></body></html>' }, { id: 'synthetic-recipient', contactId: 'synthetic-contact', email: 'test@example.com', firstName: '  ' })
  assert.match(message.html, /Hi there,/)
  assert.equal(message.html.includes('{{unsubscribe_url}}'), false)
  assert.match(message.html, /href="https:[^"]+\/unsubscribe\//)
  assert.equal(message.headers?.['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
})
