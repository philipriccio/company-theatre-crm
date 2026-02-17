'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  campaignId: string
}

export function DuplicateCampaignButton({ campaignId }: Props) {
  const router = useRouter()
  const [duplicating, setDuplicating] = useState(false)

  const handleDuplicate = async () => {
    setDuplicating(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/duplicate`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to duplicate')
      }

      const data = await res.json()
      router.push(`/campaigns/${data.id}`)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to duplicate campaign')
    } finally {
      setDuplicating(false)
    }
  }

  return (
    <button
      onClick={handleDuplicate}
      disabled={duplicating}
      className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
      title="Duplicate campaign"
    >
      {duplicating ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Duplicating...
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Duplicate
        </span>
      )}
    </button>
  )
}
