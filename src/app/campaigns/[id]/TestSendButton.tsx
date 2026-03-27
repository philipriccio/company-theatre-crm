'use client'

import { useState } from 'react'

interface Props {
  campaignId: string
}

export function TestSendButton({ campaignId }: Props) {
  const [testEmail, setTestEmail] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testSuccess, setTestSuccess] = useState(false)

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
    } catch {
      alert('Failed to send test email')
    } finally {
      setSendingTest(false)
    }
  }

  return (
    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <span className="font-semibold text-blue-900">Send Test Email</span>
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
  )
}
