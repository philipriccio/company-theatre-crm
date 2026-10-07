'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { CampaignDefaults } from '@/lib/campaign-settings'

export default function SettingsPage() {
  const [settings, setSettings] = useState<CampaignDefaults | null>(null)
  const [saved, setSaved] = useState<CampaignDefaults | null>(null)
  const [provider, setProvider] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const dirty = settings !== null && JSON.stringify(settings) !== JSON.stringify(saved)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/settings', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error('Settings could not be loaded.')
      setSettings(data.defaults)
      setSaved(data.defaults)
      setProvider(data.delivery.provider)
    } catch {
      setError('Settings could not be loaded. Please try again.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const guardLink = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.('a[href]')
      if (link && !window.confirm('Leave Settings without saving your changes?')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', guardLink, true)
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guardLink, true) }
  }, [dirty])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!settings || saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Your changes were not saved.')
      setSettings(data.defaults)
      setSaved(data.defaults)
      setNotice('Sender defaults saved. Existing drafts are unchanged.')
    } catch (failure) {
      setError(failure instanceof Error && !(failure instanceof TypeError) ? failure.message : 'Your changes were not saved. Check your connection and try again.')
    } finally { setSaving(false) }
  }

  return <div className="p-4 sm:p-8 page-enter max-w-5xl">
    <p className="text-sm font-medium text-stone-500 mb-2">Your email workspace</p>
    <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Settings</h1>
    <p className="text-stone-600 mt-2 mb-8">Set the sender details you want to start each new campaign with.</p>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}{!settings && <button className="btn btn-secondary btn-sm ml-3" onClick={load} disabled={loading}>Try again</button>}</div>}
    {loading ? <p role="status">Loading your settings…</p> : settings && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <form onSubmit={save} className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Sender defaults</h2>
        <p className="text-sm text-stone-600 mt-1 mb-6">These apply to new drafts only. You can adjust them for each campaign.</p>
        <fieldset disabled={saving} className="space-y-5">
          {([
            ['fromName', 'Sender name', 'The name people see in their inbox.', 'text'],
            ['fromEmail', 'Sender email', 'Use an address at companytheatre.ca. Saving does not verify this mailbox.', 'email'],
            ['replyToEmail', 'Send replies to', 'Choose a monitored inbox for audience replies.', 'email'],
          ] as const).map(([key, label, hint, type]) => <div key={key}>
            <label htmlFor={key} className="block text-sm font-medium mb-2">{label}</label>
            <input id={key} type={type} value={settings[key]} required maxLength={key === 'fromName' ? 100 : 254} aria-describedby={`${key}-hint`} className="input w-full" onChange={event => { setSettings({ ...settings, [key]: event.target.value }); setNotice('') }} />
            <p id={`${key}-hint`} className="text-sm text-stone-500 mt-2">{hint}</p>
          </div>)}
        </fieldset>
        <div role="status" aria-live="polite" className="text-sm mt-6 min-h-5 text-stone-600">{saving ? 'Saving…' : dirty ? 'You have unsaved changes.' : notice || 'Up to date.'}</div>
        <button type="submit" className="btn btn-primary btn-md mt-4" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save defaults'}</button>
      </form>
      <aside className="space-y-5">
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Email delivery</h2>
          <span className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-sm font-medium">{provider === 'ses' ? 'Amazon SES selected' : provider === 'mock' ? 'Local simulation' : 'Sending is off'}</span>
          <p className="text-sm text-stone-600 mt-3">{provider === 'ses' ? 'Provider selection alone does not confirm delivery readiness or authorize a send.' : 'You can prepare drafts and preview designs without sending email.'}</p>
          <p className="text-sm text-stone-600 mt-3">Every test and campaign send needs Philip’s approval. Test rounds are limited to Philip and Janice.</p>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold mb-2">Before your first send</h2>
          <p className="text-sm text-stone-600">Review your sender, reply inbox, approved footer and unsubscribe link with the campaign. Footer approval is still outstanding.</p>
          <Link href="/campaigns" className="inline-block text-sm font-medium underline underline-offset-4 mt-4">Go to campaigns</Link>
        </section>
      </aside>
    </div>}
  </div>
}
