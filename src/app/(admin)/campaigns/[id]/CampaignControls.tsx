'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CampaignControls({ campaignId, status }: { campaignId: string; status: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function run(action: 'pause' | 'resume' | 'cancel' | 'retry') {
    if (action === 'cancel' && !confirm('Cancel remaining queued deliveries for this campaign?')) return
    setBusy(action)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/${action}`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `Failed to ${action}`)
      }
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : `Failed to ${action}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2">
      {['QUEUED', 'SCHEDULED', 'SENDING'].includes(status) && (
        <button onClick={() => run('pause')} disabled={!!busy} className="w-full px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 disabled:opacity-50 font-medium">
          {busy === 'pause' ? 'Pausing...' : 'Pause'}
        </button>
      )}
      {status === 'PAUSED' && (
        <button onClick={() => run('resume')} disabled={!!busy} className="w-full px-4 py-2 bg-green-100 text-green-800 rounded-lg hover:bg-green-200 disabled:opacity-50 font-medium">
          {busy === 'resume' ? 'Resuming...' : 'Resume'}
        </button>
      )}
      {['SCHEDULED', 'QUEUED', 'PAUSED'].includes(status) && (
        <button onClick={() => run('cancel')} disabled={!!busy} className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 font-medium">
          {busy === 'cancel' ? 'Cancelling...' : 'Cancel'}
        </button>
      )}
      {['COMPLETED_WITH_FAILURES', 'FAILED'].includes(status) && (
        <button onClick={() => run('retry')} disabled={!!busy} className="w-full px-4 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 disabled:opacity-50 font-medium">
          {busy === 'retry' ? 'Retrying...' : 'Retry transient failures'}
        </button>
      )}
    </div>
  )
}
