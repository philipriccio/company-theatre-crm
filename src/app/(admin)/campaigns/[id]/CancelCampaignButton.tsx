'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  campaignId: string
  scheduledAt: Date
  recipientCount: number
}

export function CancelCampaignButton({ campaignId, scheduledAt, recipientCount }: Props) {
  const router = useRouter()
  const [cancelling, setCancelling] = useState(false)

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this scheduled campaign? This will return it to draft status.')) {
      return
    }

    setCancelling(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/cancel`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to cancel')
      }

      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to cancel campaign')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 rounded-lg p-4">
        <p className="text-sm font-medium text-blue-800">Scheduled for:</p>
        <p className="text-lg font-bold text-blue-900">
          {new Date(scheduledAt).toLocaleString()}
        </p>
        <p className="text-sm text-blue-700 mt-1">
          {recipientCount.toLocaleString()} recipients queued
        </p>
      </div>

      <button
        onClick={handleCancel}
        disabled={cancelling}
        className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 font-medium"
      >
        {cancelling ? 'Cancelling...' : 'Cancel Scheduled Send'}
      </button>
      
      <p className="text-xs text-gray-500 text-center">
        Cancelling will return this campaign to draft status
      </p>
    </div>
  )
}
