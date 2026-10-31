'use client'
/* eslint-disable @next/next/no-location-assign-relative-destination -- Full navigation clears cached private RSC content after authentication changes. */
import { useState } from 'react'
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
    <label className="block">Email<input className="input w-full" name="email" type="email" autoComplete="username" required maxLength={254} defaultValue={email} readOnly={mode === 'password'} /></label>
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
