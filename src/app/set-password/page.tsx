'use client'
import { useState, type FormEvent } from 'react'

export default function SetPasswordPage() {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/auth/invitation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: String(data.get('code') || '').trim(), password: data.get('password'), confirmation: data.get('confirmation') }) })
      const result = await response.json()
      if (!response.ok) { setError(result.error || 'Account setup failed. Please try again.'); return }
      form.reset(); setDone(true)
    } catch { setError('We could not confirm account setup. Try signing in with your chosen password before requesting another invitation.') }
    finally { setBusy(false) }
  }
  return <main className="min-h-screen bg-gray-50 px-4 py-12 text-gray-900">
    <section className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="mb-2 text-sm text-gray-600">The Company Theatre</p>
      <h1 className="mb-4 text-2xl font-semibold">{done ? 'Your account is ready' : 'Set up your CRM account'}</h1>
      {done ? <><p className="mb-5">Your password has been saved. Sign in to open the shared JT To Do list.</p><a className="inline-block rounded bg-blue-700 px-4 py-3 text-white" href="/login">Sign in</a></> : <>
        <p className="mb-5 text-sm text-gray-600">Choose your own password: 15–128 characters. A few unrelated words work well. This invitation can be used once.</p>
        <form onSubmit={submit}>
          <label className="mb-4 block">Setup code<input required name="code" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} className="mt-1 w-full rounded border border-gray-400 p-3" disabled={busy} /><span className="mt-1 block text-sm text-gray-600">Paste the one-time code from your invitation email.</span></label>
          <label className="mb-4 block">New password<input required name="password" type="password" autoComplete="new-password" className="mt-1 w-full rounded border border-gray-400 p-3" disabled={busy} /></label>
          <label className="mb-4 block">Confirm password<input required name="confirmation" type="password" autoComplete="new-password" className="mt-1 w-full rounded border border-gray-400 p-3" disabled={busy} /></label>
          <button disabled={busy} className="w-full rounded bg-blue-700 p-3 font-medium text-white disabled:opacity-50">{busy ? 'Saving…' : 'Set password'}</button>
        </form>
      </>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </section>
  </main>
}
