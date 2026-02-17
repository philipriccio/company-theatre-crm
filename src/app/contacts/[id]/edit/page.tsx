'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Contact {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
  title: string | null
  phone: string | null
  city: string | null
  state: string | null
  country: string | null
  solicitation: boolean
}

export default function EditContactPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [contact, setContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/contacts/${id}`)
      .then(res => res.json())
      .then(data => {
        setContact(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contact) return

    setSaving(true)
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact),
      })
      if (!res.ok) throw new Error('Failed to save')
      router.push(`/contacts/${id}`)
    } catch (error) {
      alert('Failed to save contact')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  if (!contact) {
    return <div className="p-8">Contact not found</div>
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <Link href={`/contacts/${id}`} className="text-indigo-600 hover:text-indigo-800">
          ← Back to Contact
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-gray-900 mb-8">Edit Contact</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <input
                type="text"
                value={contact.firstName || ''}
                onChange={(e) => setContact({ ...contact, firstName: e.target.value || null })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input
                type="text"
                value={contact.lastName || ''}
                onChange={(e) => setContact({ ...contact, lastName: e.target.value || null })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name / Organization
            </label>
            <input
              type="text"
              value={contact.fullName || ''}
              onChange={(e) => setContact({ ...contact, fullName: e.target.value || null })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={contact.phone || ''}
              onChange={(e) => setContact({ ...contact, phone: e.target.value || null })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={contact.city || ''}
                onChange={(e) => setContact({ ...contact, city: e.target.value || null })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State/Province
              </label>
              <input
                type="text"
                value={contact.state || ''}
                onChange={(e) => setContact({ ...contact, state: e.target.value || null })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Country
              </label>
              <input
                type="text"
                value={contact.country || ''}
                onChange={(e) => setContact({ ...contact, country: e.target.value || null })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={contact.solicitation}
                onChange={(e) => setContact({ ...contact, solicitation: e.target.checked })}
                className="rounded text-indigo-600"
              />
              <span className="text-sm text-gray-700">Can receive marketing emails</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <Link
            href={`/contacts/${id}`}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
