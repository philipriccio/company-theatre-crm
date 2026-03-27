'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Tag {
  id: string
  name: string
  count: number
}

interface Props {
  campaignId: string
  tags: Tag[]
  totalSubscribed: number
}

interface SendProgress {
  status: string
  totalRecipients: number
  sent: number
  failed: number
  completedAt: string | null
}

export function SendFlowClient({ campaignId, tags, totalSubscribed }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<'all' | 'tags'>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [progress, setProgress] = useState<SendProgress | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedCount =
    mode === 'all'
      ? totalSubscribed
      : tags
          .filter((t) => selectedTags.includes(t.id))
          .reduce((sum, t) => sum + t.count, 0)

  const handleTagToggle = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    )
  }

  // Poll for campaign status during sending
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/status`)
      if (!res.ok) return
      const data: SendProgress = await res.json()
      setProgress(data)

      if (data.status === 'SENT') {
        // Stop polling — sending is complete
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }
    } catch {
      // Ignore poll errors, will retry
    }
  }, [campaignId])

  // Start polling when sending begins
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
    }
  }, [])

  const handleConfirmedSend = async () => {
    if (confirmText.toUpperCase() !== 'SEND') return

    setSending(true)
    try {
      const body: Record<string, unknown> = {
        mode,
        tagIds: mode === 'tags' ? selectedTags : undefined,
      }

      if (sendMode === 'schedule' && scheduledDate && scheduledTime) {
        body.scheduledAt = new Date(
          `${scheduledDate}T${scheduledTime}`
        ).toISOString()
      }

      const res = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Failed to send')

      const result = await res.json()

      if (result.scheduled) {
        // Scheduled — redirect immediately
        router.push(`/campaigns/${campaignId}`)
        router.refresh()
        return
      }

      if (result.queued) {
        // Sending in background — start polling for progress
        setProgress({
          status: 'SENDING',
          totalRecipients: result.recipientCount,
          sent: 0,
          failed: 0,
          completedAt: null,
        })

        // Start polling every 5 seconds
        pollRef.current = setInterval(pollStatus, 5000)
      }
    } catch {
      alert(
        `Failed to ${sendMode === 'schedule' ? 'schedule' : 'send'} campaign`
      )
      setSending(false)
    }
  }

  const getMinDate = () => {
    const now = new Date()
    return now.toISOString().split('T')[0]
  }

  const canSchedule = sendMode === 'now' || (scheduledDate && scheduledTime)
  const isConfirmed = confirmText.toUpperCase() === 'SEND'

  // If we're showing progress, render the progress view
  if (progress) {
    const percent =
      progress.totalRecipients > 0
        ? Math.round((progress.sent / progress.totalRecipients) * 100)
        : 0
    const isDone = progress.status === 'SENT'

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-8">
          <div className="text-center mb-6">
            {isDone ? (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Campaign Sent!
                </h2>
                <p className="text-gray-600 mt-2">
                  {progress.sent.toLocaleString()} emails sent
                  {progress.failed > 0 && (
                    <span className="text-red-600">
                      , {progress.failed.toLocaleString()} failed
                    </span>
                  )}
                </p>
              </>
            ) : (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                  <svg
                    className="w-8 h-8 text-blue-600 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Sending Campaign...
                </h2>
                <p className="text-gray-600 mt-2">
                  {progress.sent.toLocaleString()} of{' '}
                  {progress.totalRecipients.toLocaleString()} emails sent
                </p>
              </>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${
                isDone ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 text-center">{percent}%</p>

          {isDone && (
            <button
              onClick={() => {
                router.push(`/campaigns/${campaignId}`)
                router.refresh()
              }}
              className="w-full mt-6 px-4 py-3 bg-[#0a0a0a] text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              View Campaign
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Recipient Selection */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Select Recipients
        </h2>

        <div className="space-y-3 mb-4">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <input
              type="radio"
              checked={mode === 'all'}
              onChange={() => setMode('all')}
              className="text-[#0a0a0a] w-4 h-4"
            />
            <div>
              <span className="font-medium text-gray-900">
                All subscribed contacts
              </span>
              <span className="text-gray-500 ml-2">
                ({totalSubscribed.toLocaleString()})
              </span>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <input
              type="radio"
              checked={mode === 'tags'}
              onChange={() => setMode('tags')}
              className="text-[#0a0a0a] w-4 h-4"
            />
            <span className="font-medium text-gray-900">Select by tag</span>
          </label>
        </div>

        {mode === 'tags' && (
          <div className="max-h-56 overflow-y-auto border rounded-lg p-3 space-y-1">
            {tags.length === 0 ? (
              <p className="text-sm text-gray-500 p-2">No tags available</p>
            ) : (
              tags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedTags.includes(tag.id)}
                    onChange={() => handleTagToggle(tag.id)}
                    className="text-[#0a0a0a] rounded w-4 h-4"
                  />
                  <span className="flex-1 text-sm text-gray-900">
                    {tag.name}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {tag.count.toLocaleString()}
                  </span>
                </label>
              ))
            )}
          </div>
        )}
      </div>

      {/* Recipient Count + Warning */}
      <div
        className={`rounded-xl p-6 border ${
          selectedCount > 20
            ? 'bg-red-50 border-red-200'
            : selectedCount > 0
              ? 'bg-green-50 border-green-200'
              : 'bg-gray-50 border-gray-200'
        }`}
      >
        <div className="text-center">
          <p
            className={`text-3xl font-bold ${
              selectedCount > 20
                ? 'text-red-800'
                : selectedCount > 0
                  ? 'text-green-800'
                  : 'text-gray-400'
            }`}
          >
            {selectedCount.toLocaleString()}
          </p>
          <p
            className={`text-sm mt-1 ${
              selectedCount > 20
                ? 'text-red-700'
                : selectedCount > 0
                  ? 'text-green-700'
                  : 'text-gray-500'
            }`}
          >
            {selectedCount === 1 ? 'recipient' : 'recipients'}
          </p>
        </div>

        {selectedCount > 20 && (
          <div className="mt-4 flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm text-red-800">
              <strong>⚠️ You are about to send this campaign to{' '}
              {selectedCount.toLocaleString()} people.</strong>{' '}
              This action cannot be undone.
            </p>
          </div>
        )}

        {selectedCount > 0 && selectedCount <= 20 && (
          <p className="text-sm text-green-800 mt-3 text-center">
            You are sending to {selectedCount.toLocaleString()}{' '}
            {selectedCount === 1 ? 'person' : 'people'}.
          </p>
        )}
      </div>

      {/* When to Send */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          When to Send
        </h2>

        <div className="space-y-3 mb-4">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <input
              type="radio"
              checked={sendMode === 'now'}
              onChange={() => setSendMode('now')}
              className="text-[#0a0a0a] w-4 h-4"
            />
            <span className="font-medium text-gray-900">Send immediately</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <input
              type="radio"
              checked={sendMode === 'schedule'}
              onChange={() => setSendMode('schedule')}
              className="text-[#0a0a0a] w-4 h-4"
            />
            <span className="font-medium text-gray-900">
              Schedule for later
            </span>
          </label>
        </div>

        {sendMode === 'schedule' && (
          <div className="flex gap-3 mt-2">
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              min={getMinDate()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
            />
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-400 focus:border-gray-400"
            />
          </div>
        )}
      </div>

      {/* Confirmation */}
      {selectedCount > 0 && canSchedule && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Confirm Send
          </h2>

          <p className="text-sm text-gray-600 mb-4">
            Type{' '}
            <strong className="text-red-600 font-mono text-base">SEND</strong>{' '}
            below to confirm:
          </p>

          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type SEND to confirm"
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-center text-lg font-mono focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-colors"
          />

          <button
            onClick={handleConfirmedSend}
            disabled={!isConfirmed || sending || selectedCount === 0}
            className={`w-full mt-4 px-4 py-3 rounded-lg font-medium transition-colors ${
              isConfirmed && !sending
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {sending
              ? 'Sending...'
              : sendMode === 'schedule'
                ? `Schedule to ${selectedCount.toLocaleString()} Recipients`
                : `Send Now to ${selectedCount.toLocaleString()} Recipients`}
          </button>
        </div>
      )}
    </div>
  )
}
