import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AccountForm, LogoutButton, ProfileForm, OtherSessionsButton } from '@/components/AccountForm'
import { identity } from '@/lib/auth/store'
import { cookieName } from '@/lib/auth/access'
export default async function AccountPage() {
  const user = await identity((await cookies()).get(cookieName())?.value)
  if (!user) redirect('/login')
  return <div className="p-6 sm:p-10 space-y-8 max-w-3xl">
    <Link href="/settings" className="underline">Back to settings</Link>
    <h1 className="text-3xl font-semibold">Your account</h1>
    <section aria-labelledby="profile-heading" className="space-y-5"><h2 id="profile-heading" className="text-xl font-semibold">Profile</h2><ProfileForm name={user.name} email={user.email} /></section>
    <section aria-labelledby="password-heading" className="space-y-5 border-t pt-6"><h2 id="password-heading" className="text-xl font-semibold">Password</h2><p>Changing your password signs out your other sessions, but keeps this one open.</p><AccountForm mode="password" /></section>
    <section aria-labelledby="sessions-heading" className="space-y-5 border-t pt-6"><h2 id="sessions-heading" className="text-xl font-semibold">Sessions</h2><p>Sign out on other browsers and devices, or sign out here.</p><OtherSessionsButton /><LogoutButton /></section>
  </div>
}
