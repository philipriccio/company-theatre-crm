import { AccountForm } from '@/components/AccountForm'
export default function LoginPage() {
  return <main className="p-6 sm:p-10 mx-auto" style={{ maxWidth: 560 }}><h1 className="text-3xl font-semibold mb-4">Company Theatre CRM</h1><p className="mb-6">Sign in to your personal account.</p><AccountForm mode="login" /><p className="mt-6 text-sm">Forgotten your password? Ask the CRM administrator for account recovery. There is no public registration.</p></main>
}
