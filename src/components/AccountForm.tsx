'use client'
/* eslint-disable @next/next/no-location-assign-relative-destination -- Full navigation clears cached private RSC content after authentication changes. */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
export function AccountForm({ mode, email }: { mode: 'login' | 'password'; email?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    const form = event.currentTarget
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Nothing was changed. Please try again.')
      if (mode === 'login') window.location.assign('/')
      else { form.reset(); setNotice('Password changed. You are still signed in here. All other sessions have been signed out.') }
    } catch (failure) { setError(failure instanceof TypeError ? 'Connection lost. Check your connection before trying again. If the change succeeded, your new password will work.' : failure instanceof Error ? failure.message : 'Unable to save. Please try again.') }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="space-y-5" style={{ maxWidth: 480 }}>
    {mode === 'login' ? <label className="block">Email<input className="input w-full" name="email" type="email" autoComplete="username" required maxLength={254} defaultValue={email} /></label> : null}
    {mode === 'login' ? <label className="block">Password<input className="input w-full" name="password" type="password" autoComplete="current-password" required maxLength={256} /></label> : <>
      <label className="block">Current password<input className="input w-full" name="currentPassword" type="password" autoComplete="current-password" required maxLength={256} /></label>
      <p id="password-help">Use 15–128 characters. A few unrelated words work well. Spaces and password managers are welcome.</p>
      <label className="block">New password<input className="input w-full" name="newPassword" type="password" autoComplete="new-password" required aria-describedby="password-help" maxLength={256} /></label>
      <label className="block">Confirm new password<input className="input w-full" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={256} /></label>
    </>}
    {error ? <p role="alert" className="text-red-700">{error} <a href="/login" target="_blank" rel="noopener" className="underline">Open sign-in in a new tab</a></p> : null}
    {notice ? <p role="status" className="text-green-800">{notice}</p> : null}
    <button className="btn-primary px-4 py-3 min-h-11 rounded-lg" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Change password'}</button>
  </form>
}
export function LogoutButton() {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function logout() {
    setBusy(true); setError('')
    try { const result = await fetch('/api/auth/logout', { method: 'POST' }); if (!result.ok) throw new Error(); window.location.assign('/login') }
    catch { setError('Sign-out failed. Please try again.'); setBusy(false) }
  }
  return <div><button className="btn-secondary px-4 py-3 min-h-11 rounded-lg" onClick={logout} disabled={busy}>Sign out</button>{error ? <p role="alert">{error}</p> : null}</div>
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    const form = event.currentTarget
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/auth/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: new FormData(form).get('name') }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save your name. Please try again.')
      const field = form.elements.namedItem('name') as HTMLInputElement
      field.value = result.name
      setNotice('Name saved.'); router.refresh()
    } catch (failure) { setError(failure instanceof TypeError ? 'Connection lost. Your entry is still here. Retry saving or reload to check whether it was saved.' : failure instanceof Error ? failure.message : 'Unable to save your name. Please try again.') }
    finally { setBusy(false) }
  }
  return <form onSubmit={save} className="space-y-5 max-w-lg">
    <label className="block">Name<input className="input w-full" name="name" autoComplete="name" required maxLength={120} defaultValue={name} disabled={busy} onChange={() => { setError(''); setNotice('') }} /></label>
    <label className="block">Email<input className="input w-full" type="email" autoComplete="username" value={email} readOnly aria-describedby="account-email-help" /></label>
    <p id="account-email-help" className="text-sm text-gray-600">Your sign-in email is read-only. Contact your administrator if it needs to change.</p>
    {error ? <p role="alert" className="text-red-700">{error}</p> : null}
    {notice ? <p role="status" className="text-green-800">{notice}</p> : null}
    <button type="submit" className="btn-primary px-4 py-3 min-h-11 rounded-lg" disabled={busy}>{busy ? 'Saving…' : 'Save name'}</button>
  </form>
}
export function OtherSessionsButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function revoke() {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/auth/logout-others', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to sign out other sessions. Please try again.')
      setNotice('Other sessions signed out. You are still signed in here.')
    } catch (failure) { setError(failure instanceof TypeError ? 'Connection lost. We could not confirm sign-out. Please try again.' : failure instanceof Error ? failure.message : 'Unable to sign out other sessions. Please try again.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-3"><button type="button" className="btn-secondary px-4 py-3 min-h-11 rounded-lg" disabled={busy} onClick={revoke}>{busy ? 'Signing out…' : 'Sign out other sessions'}</button>{error ? <p role="alert" className="text-red-700">{error}</p> : null}{notice ? <p role="status" className="text-green-800">{notice}</p> : null}</div>
}
