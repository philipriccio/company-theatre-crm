'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

export default function UnsubscribePage() {
  const params = useParams()
  const token = params.token as string
  
  const [status, setStatus] = useState<'loading' | 'confirm' | 'success' | 'already' | 'error'>('loading')
  const [email, setEmail] = useState<string>('')

  useEffect(() => {
    // Check unsubscribe status
    fetch(`/api/unsubscribe/${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setStatus('error')
        } else if (data.alreadyUnsubscribed) {
          setEmail(data.email)
          setStatus('already')
        } else {
          setEmail(data.email)
          setStatus('confirm')
        }
      })
      .catch(() => setStatus('error'))
  }, [token])

  const handleUnsubscribe = async () => {
    setStatus('loading')
    try {
      const res = await fetch(`/api/unsubscribe/${token}`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setStatus('success')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          The Company Theatre
        </h1>
        
        {status === 'loading' && (
          <p className="text-gray-500">Loading...</p>
        )}

        {status === 'confirm' && (
          <>
            <p className="text-gray-600 mb-6">
              Are you sure you want to unsubscribe <strong>{email}</strong> from our mailing list?
            </p>
            <button
              onClick={handleUnsubscribe}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Yes, Unsubscribe Me
            </button>
            <p className="text-sm text-gray-400 mt-4">
              You will no longer receive marketing emails from us.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-5xl mb-4">✓</div>
            <p className="text-gray-600 mb-2">
              <strong>{email}</strong> has been unsubscribed.
            </p>
            <p className="text-sm text-gray-400">
              You will no longer receive marketing emails from The Company Theatre.
            </p>
          </>
        )}

        {status === 'already' && (
          <>
            <div className="text-5xl mb-4">📭</div>
            <p className="text-gray-600">
              <strong>{email}</strong> is already unsubscribed.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-gray-600">
              Something went wrong. Please try again or contact us directly.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
