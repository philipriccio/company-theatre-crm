import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AccountForm, LogoutButton } from '@/components/AccountForm'
import { identity } from '@/lib/auth/store'
import { cookieName } from '@/lib/auth/access'
export default async function AccountPage() {
  const user = await identity((await cookies()).get(cookieName())?.value)
  if (!user) redirect('/login')
  return <div className="p-6 sm:p-10 space-y-6"><Link href="/settings" className="underline">Back to settings</Link><h1 className="text-3xl font-semibold">Your account</h1><p>Signed in as {user.name}. Changing your password signs out your other sessions, but keeps this one open.</p><AccountForm mode="password" email={user.email} /><LogoutButton /></div>
}
