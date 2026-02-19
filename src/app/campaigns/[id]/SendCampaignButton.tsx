'use client'

import { useState } from 'react'
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

export function SendCampaignButton({ campaignId, tags, totalSubscribed }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<'all' | 'tags'>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  
  // Safety confirmation states
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const selectedCount = mode === 'all' 
    ? totalSubscribed 
    : tags.filter(t => selectedTags.includes(t.id)).reduce((sum, t) => sum + t.count, 0)

  const handleTagToggle = (tagId: string) => {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  const handleSendTest = async () => {
    if (!testEmail) return
    setSendingTest(true)
    setTestSuccess(false)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail }),
      })
      if (!res.ok) throw new Error('Failed to send test')
      setTestSuccess(true)
      setTimeout(() => setTestSuccess(false), 5000)
    } catch (error) {
      alert('Failed to send test email')
    } finally {
      setSendingTest(false)
    }
  }

  const handleSendClick = () => {
    // Always show confirmation for any bulk send
    setShowConfirmation(true)
    setConfirmText('')
  }

  const handleConfirmedSend = async () => {
    // Verify confirmation text
    if (confirmText.toUpperCase() !== 'SEND') {
      return
    }
    
    setSending(true)
    try {
      const body: Record<string, unknown> = {
        mode,
        tagIds: mode === 'tags' ? selectedTags : undefined,
      }

      if (sendMode === 'schedule' && scheduledDate && scheduledTime) {
        body.scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
      }

      const res = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      
      if (!res.ok) throw new Error('Failed to send')
      
      setShowConfirmation(false)
      router.refresh()
    } catch (error) {
      alert(`Failed to ${sendMode === 'schedule' ? 'schedule' : 'send'} campaign`)
    } finally {
      setSending(false)
    }
  }

  // Get min datetime (now + 5 minutes)
  const getMinDate = () => {
    const now = new Date()
    return now.toISOString().split('T')[0]
  }

  const canSchedule = sendMode === 'now' || (scheduledDate && scheduledTime)
  const isBulkSend = selectedCount > 1

  return (
    <div className="space-y-6">
      {/* TEST SEND - Prominent Section */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="font-semibold text-blue-900">Test First (Recommended)</span>
        </div>
        <p className="text-sm text-blue-700 mb-3">
          Send a test to yourself before sending to your list.
        </p>
        <div className="flex gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 px-3 py-2 border border-blue-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleSendTest}
            disabled={sendingTest || !testEmail}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {sendingTest ? 'Sending...' : 'Send Test'}
          </button>
        </div>
        {testSuccess && (
          <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Test email sent! Check your inbox.
          </p>
        )}
      </div>

      <hr className="border-gray-200" />

      {/* Recipient Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Recipients
        </label>
        
        <div className="space-y-2 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={mode === 'all'}
              onChange={() => setMode('all')}
              className="text-indigo-600"
            />
            <span>All subscribed contacts ({totalSubscribed.toLocaleString()})</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={mode === 'tags'}
              onChange={() => setMode('tags')}
              className="text-indigo-600"
            />
            <span>Select by tag</span>
          </label>
        </div>

        {mode === 'tags' && (
          <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
            {tags.map(tag => (
              <label key={tag.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTags.includes(tag.id)}
                  onChange={() => handleTagToggle(tag.id)}
                  className="text-indigo-600 rounded"
                />
                <span className="flex-1 text-sm">{tag.name}</span>
                <span className="text-xs text-gray-400">{tag.count}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <hr className="border-gray-200" />

      {/* Scheduling */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          When to Send
        </label>
        
        <div className="space-y-2 mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={sendMode === 'now'}
              onChange={() => setSendMode('now')}
              className="text-indigo-600"
            />
            <span>Send immediately</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={sendMode === 'schedule'}
              onChange={() => setSendMode('schedule')}
              className="text-indigo-600"
            />
            <span>Schedule for later</span>
          </label>
        </div>

        {sendMode === 'schedule' && (
          <div className="flex gap-2">
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              min={getMinDate()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        )}
      </div>

      {/* WARNING for bulk sends */}
      {isBulkSend && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
          <div className="flex items-start gap-2">
            <svg className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-semibold text-amber-800">
                You are about to send to {selectedCount.toLocaleString()} people
              </p>
              <p className="text-sm text-amber-700 mt-1">
                This action cannot be undone. Make sure you&apos;ve tested the email first.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Send Button */}
      <div>
        <button
          onClick={handleSendClick}
          disabled={sending || selectedCount === 0 || !canSchedule}
          className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
            isBulkSend 
              ? 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
          }`}
        >
          {isBulkSend ? (
            <>⚠️ Send to {selectedCount.toLocaleString()} Recipients</>
          ) : (
            sendMode === 'schedule' ? 'Schedule Campaign' : 'Send Campaign'
          )}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Confirm Send</h3>
                <p className="text-sm text-gray-500">This cannot be undone</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-center">
                <span className="text-3xl font-bold text-red-600">{selectedCount.toLocaleString()}</span>
                <br />
                <span className="text-sm text-red-700">people will receive this email</span>
              </p>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Type <strong className="text-red-600">SEND</strong> below to confirm:
            </p>

            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type SEND to confirm"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-center text-lg font-mono focus:border-red-500 focus:ring-2 focus:ring-red-200"
              autoFocus
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowConfirmation(false)
                  setConfirmText('')
                }}
                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmedSend}
                disabled={confirmText.toUpperCase() !== 'SEND' || sending}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {sending ? 'Sending...' : 'Send Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
