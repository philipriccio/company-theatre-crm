'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function NewCampaignPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    fromName: 'The Company Theatre',
    fromEmail: 'philip@companytheatre.ca',
    previewText: '',
    content: '',
  })

  // Approved senders for Company Theatre emails
  const approvedSenders = [
    { email: 'philip@companytheatre.ca', name: 'Philip Riccio' },
    { email: 'mildred@companytheatre.ca', name: 'Mildred' },
    { email: 'janice@companytheatre.ca', name: 'Janice' },
  ]

  const handleSubmit = async (e: React.FormEvent, action: 'draft' | 'preview') => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, status: 'DRAFT' }),
      })

      if (!response.ok) throw new Error('Failed to create campaign')
      
      const campaign = await response.json()
      
      if (action === 'preview') {
        router.push(`/campaigns/${campaign.id}/preview`)
      } else {
        router.push(`/campaigns/${campaign.id}`)
      }
    } catch (error) {
      console.error('Error creating campaign:', error)
      alert('Failed to create campaign')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 page-enter">
      {/* Back link */}
      <Link 
        href="/campaigns" 
        className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-900 mb-6 transition-colors"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to Campaigns
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">
          Create Campaign
        </h1>
        <p className="text-stone-500 mt-1">
          Compose a new email to send to your audience
        </p>
      </div>

      <form onSubmit={(e) => handleSubmit(e, 'draft')} className="max-w-4xl">
        <div className="space-y-6">
          {/* Campaign Details */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-stone-900 mb-6 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center text-sm">1</span>
              Campaign Details
            </h2>
            
            <div className="space-y-5">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-stone-700 mb-2">
                  Campaign Name
                  <span className="text-stone-400 font-normal ml-1">(internal only)</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Jackpot Twins Announcement"
                  className="input"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="fromEmail" className="block text-sm font-medium text-stone-700 mb-2">
                    Send From
                  </label>
                  <select
                    id="fromEmail"
                    value={formData.fromEmail}
                    onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
                    className="input"
                    required
                  >
                    {approvedSenders.map((sender) => (
                      <option key={sender.email} value={sender.email}>
                        {sender.name} ({sender.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="fromName" className="block text-sm font-medium text-stone-700 mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    id="fromName"
                    value={formData.fromName}
                    onChange={(e) => setFormData({ ...formData, fromName: e.target.value })}
                    className="input"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Email Content */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-stone-900 mb-6 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-stone-900 text-white flex items-center justify-center text-sm">2</span>
              Email Content
            </h2>
            
            <div className="space-y-5">
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-stone-700 mb-2">
                  Subject Line
                </label>
                <input
                  type="text"
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="e.g., Big News from The Company Theatre"
                  className="input"
                  required
                />
                <p className="text-xs text-stone-400 mt-2">
                  Keep it under 50 characters for best results
                </p>
              </div>

              <div>
                <label htmlFor="previewText" className="block text-sm font-medium text-stone-700 mb-2">
                  Preview Text
                  <span className="text-stone-400 font-normal ml-1">(optional)</span>
                </label>
                <input
                  type="text"
                  id="previewText"
                  value={formData.previewText}
                  onChange={(e) => setFormData({ ...formData, previewText: e.target.value })}
                  placeholder="Shows after subject in inbox preview"
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="content" className="block text-sm font-medium text-stone-700 mb-2">
                  Email Body
                </label>
                <div className="mb-3 flex items-center gap-4 text-xs text-stone-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Supports HTML
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Variables: {"{{firstName}}"}, {"{{lastName}}"}, {"{{email}}"}
                  </span>
                </div>
                <textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={18}
                  placeholder={`<p>Dear {{firstName}},</p>

<p>We're thrilled to share some exciting news...</p>

<p>Best,<br>The Company Theatre</p>`}
                  className="font-mono text-sm"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mt-8 pt-6 border-t border-stone-200">
          <Link
            href="/campaigns"
            className="btn btn-ghost btn-md"
          >
            Cancel
          </Link>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={(e) => handleSubmit(e as unknown as React.FormEvent, 'preview')}
              disabled={loading}
              className="btn btn-secondary btn-md"
            >
              <PreviewIcon className="w-4 h-4" />
              Save & Preview
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-gold btn-md"
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Saving...
                </>
              ) : (
                <>
                  <SaveIcon className="w-4 h-4" />
                  Save Draft
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

// Icons
function ArrowLeftIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PreviewIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function SaveIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  )
}
