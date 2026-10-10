'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function RemoveTagButton({ contactId, tagName }: { contactId: string; tagName: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState(false)

  async function handleRemove() {
    setError('')
    setRemoving(true)
    try {
      const response = await fetch('/api/contacts/untag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contactId, tagName }),
      })
      if (!response.ok) throw new Error('Tag not removed')
      router.refresh()
    } catch {setError('Could not remove tag. Please try again.')} finally {setRemoving(false)}
  }

  return (
    <span>{error && <span role="alert" className="text-xs text-red-700">{error}</span>}<button
      onClick={handleRemove}
      disabled={removing}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:text-white hover:bg-red-500 rounded-lg transition-colors border border-red-200 hover:border-red-500 disabled:opacity-50"
      title={`Remove from ${tagName}`}
    >
      {removing ? (
        <span className="animate-spin">⟳</span>
      ) : (
        <>✕ Remove</>
      )}
    </button></span>
  )
}
