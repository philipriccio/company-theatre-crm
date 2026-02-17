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
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')

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
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail }),
      })
      if (!res.ok) throw new Error('Failed to send test')
      alert('Test email sent!')
    } catch (error) {
      alert('Failed to send test email')
    } finally {
      setSendingTest(false)
    }
  }

  const handleSend = async () => {
    const actionText = sendMode === 'schedule' ? 'schedule' : 'send'
    const timeText = sendMode === 'schedule' 
      ? ` for ${new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString()}`
      : ''
    
    if (!confirm(`${actionText.charAt(0).toUpperCase() + actionText.slice(1)} this campaign to ${selectedCount.toLocaleString()} recipients${timeText}?`)) {
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

  return (
    <div className="space-y-6">
      {/* Test Send */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Send Test Email
        </label>
        <div className="flex gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            onClick={handleSendTest}
            disabled={sendingTest || !testEmail}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm"
          >
            {sendingTest ? 'Sending...' : 'Test'}
          </button>
        </div>
      </div>

      <hr />

      {/* Recipient Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Recipients
        </label>
        
        <div className="space-y-2 mb-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={mode === 'all'}
              onChange={() => setMode('all')}
              className="text-indigo-600"
            />
            <span>All subscribed contacts ({totalSubscribed.toLocaleString()})</span>
          </label>
          <label className="flex items-center gap-2">
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
              <label key={tag.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
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

      <hr />

      {/* Scheduling */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          When to Send
        </label>
        
        <div className="space-y-2 mb-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={sendMode === 'now'}
              onChange={() => setSendMode('now')}
              className="text-indigo-600"
            />
            <span>Send immediately</span>
          </label>
          <label className="flex items-center gap-2">
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

      {/* Send Button */}
      <div>
        <p className="text-sm text-gray-500 mb-3">
          Will {sendMode === 'schedule' ? 'schedule' : 'send'} to <strong>{selectedCount.toLocaleString()}</strong> recipients
          {sendMode === 'schedule' && scheduledDate && scheduledTime && (
            <> for <strong>{new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString()}</strong></>
          )}
        </p>
        <button
          onClick={handleSend}
          disabled={sending || selectedCount === 0 || !canSchedule}
          className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
        >
          {sending 
            ? (sendMode === 'schedule' ? 'Scheduling...' : 'Sending...') 
            : (sendMode === 'schedule' ? 'Schedule Campaign' : 'Send Campaign')
          }
        </button>
      </div>
    </div>
  )
}
