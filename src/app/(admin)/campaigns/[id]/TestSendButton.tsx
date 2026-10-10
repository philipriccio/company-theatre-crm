'use client'

import { useEffect, useState } from 'react'

export function TestSendButton({ campaignId }: { campaignId: string }) {
  const [testEmail, setTestEmail] = useState('')
  const [approved, setApproved] = useState(false)
  const [sending, setSending] = useState(false)
  const [provider, setProvider] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/settings', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error()
      const data = await response.json()
      if (active) setProvider(data.delivery.provider)
    }).catch(() => { if (active) setError('Delivery status could not be checked. Reload before testing.') })
    return () => { active = false }
  }, [])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    if (!approved || provider !== 'ses' || sending) return
    setSending(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'The test could not be sent.')
      setNotice('Accepted by the email provider. Check the approved inbox to confirm delivery and appearance.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The test could not be sent.')
    } finally { setSending(false); setApproved(false) }
  }

  return <form onSubmit={send} className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3 min-w-0">
    <h3 className="font-semibold text-stone-900">Approved inbox test</h3>
    <p className="text-sm text-stone-600">Each test sends one email. Tests are limited to Philip and Janice and need Philip’s approval for this content and recipient.</p>
    {provider !== 'ses' && <p role="status" className="text-sm font-medium text-stone-700">{provider === null ? 'Checking delivery status…' : 'Sending is off. You can still review the preview.'}</p>}
    <label className="block text-sm font-medium">Approved test recipient
      <input type="email" required value={testEmail} onChange={event => { setTestEmail(event.target.value); setApproved(false); setNotice('') }} className="input mt-2 w-full min-w-0" placeholder="Philip or Janice’s approved inbox" disabled={sending || provider !== 'ses'} />
    </label>
    <label className="flex gap-2 text-sm text-stone-700 items-start"><input type="checkbox" className="mt-1" checked={approved} onChange={event => setApproved(event.target.checked)} disabled={sending || provider !== 'ses'} />Philip has approved this one-email test now.</label>
    <button type="submit" disabled={sending || !approved || !testEmail || provider !== 'ses'} className="btn btn-primary btn-md w-full">{sending ? 'Sending…' : 'Send approved test'}</button>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="text-sm text-green-800">{notice}</p>}
  </form>
}
