'use client'

import { useState } from 'react'

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    sendgridApiKey: '',
    fromEmail: 'philip@companytheatre.ca',
    fromName: 'The Company Theatre',
    replyToEmail: 'philip@companytheatre.ca',
    physicalAddress: 'Toronto, ON, Canada',
  })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    // TODO: Save settings to database
    await new Promise(resolve => setTimeout(resolve, 500))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="p-8 page-enter">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">Settings</h1>
        <p className="text-stone-500 mt-1">
          Configure your email sending and compliance settings
        </p>
      </div>

      <form onSubmit={handleSave} className="max-w-2xl space-y-6">
        {/* SendGrid Configuration */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <ApiIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Email Provider</h2>
              <p className="text-sm text-stone-500">SendGrid API configuration</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="sendgridApiKey" className="block text-sm font-medium text-stone-700 mb-2">
                API Key
              </label>
              <input
                type="password"
                id="sendgridApiKey"
                value={settings.sendgridApiKey}
                onChange={(e) => setSettings({ ...settings, sendgridApiKey: e.target.value })}
                placeholder="SG.xxxxxxxxxxxxxxxxxxxx"
                className="input font-mono"
              />
              <p className="text-sm text-stone-500 mt-2 flex items-center gap-2">
                <InfoIcon className="w-4 h-4" />
                Get your API key from{' '}
                <a 
                  href="https://app.sendgrid.com/settings/api_keys" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-amber-600 hover:text-amber-700 underline underline-offset-2"
                >
                  SendGrid Dashboard
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Sender Configuration */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
              <MailIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Sender Details</h2>
              <p className="text-sm text-stone-500">How your emails appear to recipients</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="fromName" className="block text-sm font-medium text-stone-700 mb-2">
                  From Name
                </label>
                <input
                  type="text"
                  id="fromName"
                  value={settings.fromName}
                  onChange={(e) => setSettings({ ...settings, fromName: e.target.value })}
                  className="input"
                />
              </div>

              <div>
                <label htmlFor="fromEmail" className="block text-sm font-medium text-stone-700 mb-2">
                  From Email
                </label>
                <input
                  type="email"
                  id="fromEmail"
                  value={settings.fromEmail}
                  onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label htmlFor="replyToEmail" className="block text-sm font-medium text-stone-700 mb-2">
                Reply-To Email
              </label>
              <input
                type="email"
                id="replyToEmail"
                value={settings.replyToEmail}
                onChange={(e) => setSettings({ ...settings, replyToEmail: e.target.value })}
                className="input"
              />
            </div>
          </div>
        </div>

        {/* CASL Compliance */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
              <ShieldIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-stone-900">Compliance</h2>
              <p className="text-sm text-stone-500">CASL & CAN-SPAM requirements</p>
            </div>
          </div>
          
          <div>
            <label htmlFor="physicalAddress" className="block text-sm font-medium text-stone-700 mb-2">
              Physical Address
            </label>
            <input
              type="text"
              id="physicalAddress"
              value={settings.physicalAddress}
              onChange={(e) => setSettings({ ...settings, physicalAddress: e.target.value })}
              className="input"
            />
            <p className="text-sm text-stone-500 mt-2 flex items-center gap-2">
              <InfoIcon className="w-4 h-4" />
              Required by law in all marketing emails
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end items-center gap-4 pt-4">
          {saved && (
            <span className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
              <CheckIcon className="w-4 h-4" />
              Settings saved
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="btn btn-gold btn-md"
          >
            {saving ? (
              <>
                <span className="spinner" />
                Saving...
              </>
            ) : (
              <>
                <SaveIcon className="w-4 h-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

// Icons
function ApiIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 7h3a2 2 0 012 2v0a2 2 0 01-2 2H4V7z" />
      <path d="M4 11h2a3 3 0 010 6H4v-6z" />
      <path d="M15 7h2a3 3 0 010 6h-2V7z" />
      <path d="M15 13v4" />
      <path d="M20 7v10" />
    </svg>
  )
}

function MailIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9l9 5 9-5" />
    </svg>
  )
}

function ShieldIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function InfoIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
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

function CheckIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
