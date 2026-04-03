'use client'

import type {
  Campaign,
  CampaignRecipient,
  Contact,
  ContactConnection,
  ContactFollowUp,
  ContactInteraction,
  ContactNote,
  ContactTag,
  Tag,
} from '@prisma/client'
import Link from 'next/link'
import { useMemo, useState } from 'react'

type ContactWithRelations = Contact & {
  tags: (ContactTag & { tag: Tag })[]
  campaignRecipients: (CampaignRecipient & { campaign: Campaign })[]
  notes: ContactNote[]
  interactions: ContactInteraction[]
  connections: ContactConnection[]
  followUps: ContactFollowUp[]
}

type NoteCategoryFilter = 'all' | 'general' | 'personal' | 'business' | 'follow-up'

const relationshipHealthConfig: Record<string, { label: string; dot: string; badge: string }> = {
  active: { label: 'Active', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  warm: { label: 'Warm', dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  cooling: { label: 'Cooling', dot: 'bg-orange-400', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  cold: { label: 'Cold', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-200' },
  dormant: { label: 'Dormant', dot: 'bg-stone-400', badge: 'bg-stone-100 text-stone-700 border-stone-200' },
}

const interactionTypeOptions = [
  { value: 'email_sent', label: 'Email sent', icon: '📧' },
  { value: 'email_received', label: 'Email received', icon: '📥' },
  { value: 'meeting', label: 'Meeting', icon: '🤝' },
  { value: 'phone', label: 'Phone', icon: '📞' },
  { value: 'event', label: 'Event', icon: '🎭' },
  { value: 'note', label: 'Note', icon: '📝' },
]

const noteCategoryOptions = [
  { value: 'general', label: 'General' },
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
  { value: 'follow-up', label: 'Follow-up' },
]

const followUpPriorityOptions = ['low', 'normal', 'high', 'urgent']
const relationshipHealthOptions = ['', 'active', 'warm', 'cooling', 'cold', 'dormant']

export default function ContactDossierClient({ initialContact }: { initialContact: ContactWithRelations }) {
  const [contact, setContact] = useState(initialContact)
  const [personalNotesDraft, setPersonalNotesDraft] = useState(initialContact.personalNotes || '')
  const [savingPersonalNotes, setSavingPersonalNotes] = useState(false)
  const [savingHeader, setSavingHeader] = useState(false)
  const [noteFilter, setNoteFilter] = useState<NoteCategoryFilter>('all')
  const [noteForm, setNoteForm] = useState({ content: '', category: 'general' })
  const [followUpForm, setFollowUpForm] = useState({ description: '', dueDate: '', priority: 'normal' })
  const [interactionForm, setInteractionForm] = useState({ type: 'meeting', subject: '', summary: '', emailId: '', occurredAt: formatDateTimeLocal(new Date()) })
  const [connectionForm, setConnectionForm] = useState({ connectedId: '', name: '', relationship: '', notes: '' })
  const [savingSection, setSavingSection] = useState<string | null>(null)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [showFollowUpForm, setShowFollowUpForm] = useState(false)
  const [showInteractionForm, setShowInteractionForm] = useState(false)
  const [showConnectionForm, setShowConnectionForm] = useState(false)

  const displayName = useMemo(() => {
    return contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email
  }, [contact])

  const location = [contact.city, contact.state, contact.country].filter(Boolean).join(', ')
  const health = contact.relationshipHealth ? relationshipHealthConfig[contact.relationshipHealth] : null
  const filteredNotes = contact.notes.filter((note) => noteFilter === 'all' || note.category === noteFilter)
  const openFollowUps = contact.followUps.filter((item) => !item.completedAt)
  const completedFollowUps = contact.followUps.filter((item) => item.completedAt)

  async function updateContact(patch: Partial<Contact>) {
    const response = await fetch(`/api/contacts/${contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...contact, ...patch }),
    })

    if (!response.ok) {
      throw new Error('Failed to update contact')
    }

    const updated = await response.json()
    setContact((current) => ({ ...current, ...updated }))
    return updated as Contact
  }

  async function handlePersonalNotesBlur() {
    if (personalNotesDraft === (contact.personalNotes || '')) return
    setSavingPersonalNotes(true)
    try {
      await updateContact({ personalNotes: personalNotesDraft || null })
    } catch {
      alert('Failed to save personal notes')
      setPersonalNotesDraft(contact.personalNotes || '')
    } finally {
      setSavingPersonalNotes(false)
    }
  }

  async function handleHeaderPatch(patch: Partial<Contact>) {
    setSavingHeader(true)
    try {
      await updateContact(patch)
    } catch {
      alert('Failed to update contact details')
    } finally {
      setSavingHeader(false)
    }
  }

  async function submitNote(event: React.FormEvent) {
    event.preventDefault()
    if (!noteForm.content.trim()) return
    setSavingSection('note')
    try {
      const response = await fetch(`/api/contacts/${contact.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noteForm),
      })
      if (!response.ok) throw new Error('Failed to create note')
      const note = await response.json()
      setContact((current) => ({ ...current, notes: [note, ...current.notes] }))
      setNoteForm({ content: '', category: noteForm.category })
      setNoteFilter('all')
    } catch {
      alert('Failed to add note')
    } finally {
      setSavingSection(null)
    }
  }

  async function submitFollowUp(event: React.FormEvent) {
    event.preventDefault()
    if (!followUpForm.description.trim()) return
    setSavingSection('follow-up')
    try {
      const response = await fetch(`/api/contacts/${contact.id}/follow-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...followUpForm,
          dueDate: followUpForm.dueDate || null,
        }),
      })
      if (!response.ok) throw new Error('Failed to create follow-up')
      const followUp = await response.json()
      setContact((current) => ({
        ...current,
        followUps: sortFollowUps([followUp, ...current.followUps]),
      }))
      setFollowUpForm({ description: '', dueDate: '', priority: 'normal' })
    } catch {
      alert('Failed to add follow-up')
    } finally {
      setSavingSection(null)
    }
  }

  async function completeFollowUp(id: string) {
    setSavingSection(id)
    try {
      const response = await fetch(`/api/contacts/${contact.id}/follow-ups`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completedAt: new Date().toISOString() }),
      })
      if (!response.ok) throw new Error('Failed to complete follow-up')
      const updated = await response.json()
      setContact((current) => ({
        ...current,
        followUps: sortFollowUps(current.followUps.map((item) => (item.id === id ? updated : item))),
      }))
    } catch {
      alert('Failed to complete follow-up')
    } finally {
      setSavingSection(null)
    }
  }

  async function submitInteraction(event: React.FormEvent) {
    event.preventDefault()
    setSavingSection('interaction')
    try {
      const response = await fetch(`/api/contacts/${contact.id}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...interactionForm,
          occurredAt: new Date(interactionForm.occurredAt).toISOString(),
        }),
      })
      if (!response.ok) throw new Error('Failed to create interaction')
      const interaction = await response.json()
      setContact((current) => ({
        ...current,
        lastContactedAt: interaction.occurredAt,
        interactions: sortInteractions([interaction, ...current.interactions]),
      }))
      setInteractionForm({ type: 'meeting', subject: '', summary: '', emailId: '', occurredAt: formatDateTimeLocal(new Date()) })
    } catch {
      alert('Failed to add interaction')
    } finally {
      setSavingSection(null)
    }
  }

  async function submitConnection(event: React.FormEvent) {
    event.preventDefault()
    if (!connectionForm.name.trim() || !connectionForm.relationship.trim()) return
    setSavingSection('connection')
    try {
      const response = await fetch(`/api/contacts/${contact.id}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectionForm),
      })
      if (!response.ok) throw new Error('Failed to create connection')
      const connection = await response.json()
      setContact((current) => ({ ...current, connections: [connection, ...current.connections] }))
      setConnectionForm({ connectedId: '', name: '', relationship: '', notes: '' })
    } catch {
      alert('Failed to add connection')
    } finally {
      setSavingSection(null)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 page-enter">
      <div>
        <Link href="/contacts" className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
          ← Back to Contacts
        </Link>
      </div>

      <section className="card rounded-xl p-6 shadow-sm border border-stone-200 bg-white">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-stone-900">{displayName}</h1>
              {contact.vip && <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">⭐ VIP</span>}
              {contact.context && <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200">{contact.context}</span>}
              {health && (
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${health.badge}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${health.dot}`} />
                  {health.label}
                </span>
              )}
            </div>

            {(contact.organization || contact.role) && (
              <p className="text-lg text-stone-600">{[contact.organization, contact.role].filter(Boolean).join(' · ')}</p>
            )}

            <div className="grid gap-3 text-sm text-stone-600 sm:grid-cols-2 lg:grid-cols-4">
              <InfoItem label="Email" value={contact.email} />
              <InfoItem label="Phone" value={contact.phone || '—'} />
              <InfoItem label="Location" value={location || '—'} />
              <InfoItem label="Last contacted" value={contact.lastContactedAt ? formatDate(contact.lastContactedAt) : '—'} />
            </div>
          </div>

          <div className="w-full max-w-sm space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-700">Relationship settings</span>
              <Link href={`/contacts/${contact.id}/edit`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">Edit</Link>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-200">
              <span>VIP contact</span>
              <input type="checkbox" checked={contact.vip} onChange={(e) => void handleHeaderPatch({ vip: e.target.checked })} className="h-4 w-4 rounded border-stone-300 text-indigo-600" />
            </label>
            <label className="block text-sm text-stone-700">
              <span className="mb-1 block font-medium">Relationship health</span>
              <select
                value={contact.relationshipHealth || ''}
                onChange={(e) => void handleHeaderPatch({ relationshipHealth: e.target.value || null })}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
              >
                <option value="">Not set</option>
                {relationshipHealthOptions.filter(Boolean).map((option) => (
                  <option key={option} value={option}>{capitalize(option)}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-stone-700">
              <span className="mb-1 block font-medium">Organization</span>
              <input
                value={contact.organization || ''}
                onChange={(e) => setContact((current) => ({ ...current, organization: e.target.value }))}
                onBlur={() => void handleHeaderPatch({ organization: contact.organization || null })}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm text-stone-700">
              <span className="mb-1 block font-medium">Role</span>
              <input
                value={contact.role || ''}
                onChange={(e) => setContact((current) => ({ ...current, role: e.target.value }))}
                onBlur={() => void handleHeaderPatch({ role: contact.role || null })}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
              />
            </label>
            <label className="block text-sm text-stone-700">
              <span className="mb-1 block font-medium">Context</span>
              <input
                value={contact.context || ''}
                onChange={(e) => setContact((current) => ({ ...current, context: e.target.value }))}
                onBlur={() => void handleHeaderPatch({ context: contact.context || null })}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2"
              />
            </label>
            {savingHeader && <p className="text-xs text-stone-500">Saving relationship details…</p>}
          </div>
        </div>
      </section>

      <section className="card rounded-xl border border-stone-200 bg-gradient-to-r from-indigo-50 to-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Personal notes</h2>
            <p className="text-sm text-stone-600">Quick context Philip should know before a call or meeting.</p>
          </div>
          {savingPersonalNotes && <span className="text-xs font-medium text-indigo-600">Saving…</span>}
        </div>
        <textarea
          value={personalNotesDraft}
          onChange={(e) => setPersonalNotesDraft(e.target.value)}
          onBlur={() => void handlePersonalNotesBlur()}
          rows={4}
          placeholder="Married to Susan. Two kids. Loves jazz. Hates early mornings."
          className="w-full rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </section>

      <section className="card rounded-xl border border-stone-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Follow-ups</h2>
            <p className="text-sm text-stone-500">Outstanding next steps and commitments.</p>
          </div>
        </div>

        <div className="space-y-3">
          {openFollowUps.length > 0 ? openFollowUps.map((item) => {
            const dueTone = getDueTone(item.dueDate)
            return (
              <div key={item.id} className={`rounded-xl border px-4 py-3 ${dueTone.wrapper}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-stone-900">{item.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-600">
                      <span className="capitalize">{item.priority} priority</span>
                      {item.dueDate && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${dueTone.badge}`}>{formatDueLabel(item.dueDate)}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void completeFollowUp(item.id)}
                    disabled={savingSection === item.id}
                    className="inline-flex items-center justify-center rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                  >
                    {savingSection === item.id ? 'Completing…' : 'Complete'}
                  </button>
                </div>
              </div>
            )
          }) : <p className="text-sm text-stone-500">No open follow-ups.</p>}
        </div>

        {!showFollowUpForm ? (
          <button type="button" onClick={() => setShowFollowUpForm(true)} className="w-full rounded-xl border-2 border-dashed border-stone-300 py-3 text-sm font-medium text-stone-500 hover:border-indigo-300 hover:text-indigo-600 transition">+ Add follow-up</button>
        ) : (
        <form onSubmit={(e) => { submitFollowUp(e); setShowFollowUpForm(false) }} className="grid gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 lg:grid-cols-[minmax(0,1fr),180px,140px,auto]">
          <input
            value={followUpForm.description}
            onChange={(e) => setFollowUpForm((current) => ({ ...current, description: e.target.value }))}
            placeholder="Add a follow-up"
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={followUpForm.dueDate}
            onChange={(e) => setFollowUpForm((current) => ({ ...current, dueDate: e.target.value }))}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          />
          <select
            value={followUpForm.priority}
            onChange={(e) => setFollowUpForm((current) => ({ ...current, priority: e.target.value }))}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm capitalize"
          >
            {followUpPriorityOptions.map((priority) => (
              <option key={priority} value={priority}>{capitalize(priority)}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button type="submit" disabled={savingSection === 'follow-up'} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {savingSection === 'follow-up' ? 'Saving…' : 'Add'}
            </button>
            <button type="button" onClick={() => setShowFollowUpForm(false)} className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:text-stone-700">Cancel</button>
          </div>
        </form>
        )}

        {completedFollowUps.length > 0 && (
          <div className="border-t border-stone-200 pt-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Completed</h3>
            <div className="mt-3 space-y-2">
              {completedFollowUps.map((item) => (
                <div key={item.id} className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-stone-800">{item.description}</span>
                    <span>Completed {formatDate(item.completedAt!)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="card rounded-xl border border-stone-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Interaction timeline</h2>
            <p className="text-sm text-stone-500">Meetings, calls, emails, and events in one feed.</p>
          </div>
        </div>

        {!showInteractionForm ? (
          <button type="button" onClick={() => setShowInteractionForm(true)} className="w-full rounded-xl border-2 border-dashed border-stone-300 py-3 text-sm font-medium text-stone-500 hover:border-indigo-300 hover:text-indigo-600 transition">+ Log interaction</button>
        ) : (
        <form onSubmit={(e) => { submitInteraction(e); setShowInteractionForm(false) }} className="grid gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 lg:grid-cols-2">
          <select value={interactionForm.type} onChange={(e) => setInteractionForm((current) => ({ ...current, type: e.target.value }))} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
            {interactionTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input type="datetime-local" value={interactionForm.occurredAt} onChange={(e) => setInteractionForm((current) => ({ ...current, occurredAt: e.target.value }))} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
          <input value={interactionForm.subject} onChange={(e) => setInteractionForm((current) => ({ ...current, subject: e.target.value }))} placeholder="Subject or topic" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
{/* emailId is populated programmatically by Mildred, not shown in the UI */}
          <textarea value={interactionForm.summary} onChange={(e) => setInteractionForm((current) => ({ ...current, summary: e.target.value }))} placeholder="Brief summary" rows={3} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm lg:col-span-2" />
          <div className="lg:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowInteractionForm(false)} className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:text-stone-700">Cancel</button>
            <button type="submit" disabled={savingSection === 'interaction'} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {savingSection === 'interaction' ? 'Saving…' : 'Add interaction'}
            </button>
          </div>
        </form>
        )}

        <div className="space-y-4">
          {contact.interactions.length > 0 ? contact.interactions.map((interaction) => {
            const interactionMeta = interactionTypeOptions.find((option) => option.value === interaction.type)
            return (
              <div key={interaction.id} className="flex gap-4 rounded-xl border border-stone-200 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xl">{interactionMeta?.icon || '•'}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-stone-900">{interaction.subject || interactionMeta?.label || interaction.type}</p>
                      <p className="text-sm text-stone-500">{formatDateTime(interaction.occurredAt)}</p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-stone-400">{interaction.type.replaceAll('_', ' ')}</span>
                  </div>
                  {interaction.summary && <p className="mt-2 text-sm leading-6 text-stone-600">{interaction.summary}</p>}
                </div>
              </div>
            )
          }) : <p className="text-sm text-stone-500">No interactions recorded yet.</p>}
        </div>
      </section>

      <section className="card rounded-xl border border-stone-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Notes</h2>
            <p className="text-sm text-stone-500">Personal, business, and follow-up context in one place.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'personal', 'business', 'follow-up'] as NoteCategoryFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setNoteFilter(filter)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${noteFilter === filter ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
              >
                {filter === 'all' ? 'All' : capitalize(filter)}
              </button>
            ))}
          </div>
        </div>

        {!showNoteForm ? (
          <button type="button" onClick={() => setShowNoteForm(true)} className="w-full rounded-xl border-2 border-dashed border-stone-300 py-3 text-sm font-medium text-stone-500 hover:border-indigo-300 hover:text-indigo-600 transition">+ Add note</button>
        ) : (
        <form onSubmit={(e) => { submitNote(e); setShowNoteForm(false) }} className="grid gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 lg:grid-cols-[180px,minmax(0,1fr),auto]">
          <select value={noteForm.category} onChange={(e) => setNoteForm((current) => ({ ...current, category: e.target.value }))} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
            {noteCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input value={noteForm.content} onChange={(e) => setNoteForm((current) => ({ ...current, content: e.target.value }))} placeholder="Add a note" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="submit" disabled={savingSection === 'note'} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {savingSection === 'note' ? 'Saving…' : 'Add'}
            </button>
            <button type="button" onClick={() => setShowNoteForm(false)} className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:text-stone-700">Cancel</button>
          </div>
        </form>
        )}

        <div className="space-y-3">
          {filteredNotes.length > 0 ? filteredNotes.map((note) => (
            <div key={note.id} className="rounded-xl border border-stone-200 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-700">{note.category}</span>
                <span>{note.authorName}</span>
                <span>•</span>
                <span>{formatDateTime(note.createdAt)}</span>
              </div>
              <p className="text-sm leading-6 text-stone-700">{note.content}</p>
            </div>
          )) : <p className="text-sm text-stone-500">No notes in this category yet.</p>}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">

      <section className="card rounded-xl border border-stone-200 bg-white p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Connections</h2>
          <p className="text-sm text-stone-500">Who this person knows and how they connect.</p>
        </div>

        {!showConnectionForm ? (
          <button type="button" onClick={() => setShowConnectionForm(true)} className="w-full rounded-xl border-2 border-dashed border-stone-300 py-3 text-sm font-medium text-stone-500 hover:border-indigo-300 hover:text-indigo-600 transition">+ Add connection</button>
        ) : (
        <form onSubmit={(e) => { submitConnection(e); setShowConnectionForm(false) }} className="grid gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 sm:grid-cols-2">
          <input value={connectionForm.name} onChange={(e) => setConnectionForm((current) => ({ ...current, name: e.target.value }))} placeholder="Person's name" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
          <input value={connectionForm.relationship} onChange={(e) => setConnectionForm((current) => ({ ...current, relationship: e.target.value }))} placeholder="Relationship (e.g. spouse, agent, collaborator)" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
          <input value={connectionForm.notes} onChange={(e) => setConnectionForm((current) => ({ ...current, notes: e.target.value }))} placeholder="Notes (optional)" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm sm:col-span-2" />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setShowConnectionForm(false)} className="rounded-lg px-3 py-2 text-sm text-stone-500 hover:text-stone-700">Cancel</button>
            <button type="submit" disabled={savingSection === 'connection'} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {savingSection === 'connection' ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
        )}

        <div className="space-y-3">
          {contact.connections.length > 0 ? contact.connections.map((connection) => (
            <div key={connection.id} className="rounded-xl border border-stone-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  {connection.connectedId ? (
                    <Link href={`/contacts/${connection.connectedId}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                      {connection.name}
                    </Link>
                  ) : (
                    <p className="font-medium text-stone-900">{connection.name}</p>
                  )}
                  <p className="text-sm text-stone-600">{connection.relationship}</p>
                </div>
                <span className="text-xs text-stone-400">Added {formatDate(connection.createdAt)}</span>
              </div>
              {connection.notes && <p className="mt-2 text-sm leading-6 text-stone-600">{connection.notes}</p>}
            </div>
          )) : <p className="text-sm text-stone-500">No connections recorded yet.</p>}
        </div>
      </section>

      <section className="card rounded-xl border border-stone-200 bg-white p-6 shadow-sm lg:self-start">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">Tags</h2>
        {contact.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {contact.tags.map(({ tag }) => (
              <span key={tag.id} className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800">
                {tag.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-500">No tags assigned.</p>
        )}
      </section>

      </div>{/* end two-column grid */}

      <section className="card rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">Campaign history</h2>
        {contact.campaignRecipients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-stone-200 text-left text-sm text-stone-500">
                  <th className="pb-3 pr-4 font-medium">Campaign</th>
                  <th className="pb-3 pr-4 font-medium">Sent</th>
                  <th className="pb-3 pr-4 font-medium">Opened</th>
                  <th className="pb-3 font-medium">Clicked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {contact.campaignRecipients.map((recipient) => (
                  <tr key={recipient.id}>
                    <td className="py-3 pr-4">
                      <Link href={`/campaigns/${recipient.campaign.id}`} className="text-indigo-600 hover:text-indigo-800 hover:underline">
                        {recipient.campaign.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-sm text-stone-500">{recipient.sentAt ? formatDate(recipient.sentAt) : '—'}</td>
                    <td className="py-3 pr-4 text-sm text-stone-500">{recipient.openedAt ? '✓' : '—'}</td>
                    <td className="py-3 text-sm text-stone-500">{recipient.clickedAt ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-stone-500">No campaign activity yet.</p>
        )}
      </section>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-sm text-stone-800">{value}</p>
    </div>
  )
}

function sortInteractions(items: ContactInteraction[]) {
  return [...items].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
}

function sortFollowUps(items: ContactFollowUp[]) {
  return [...items].sort((a, b) => {
    if (!!a.completedAt !== !!b.completedAt) {
      return a.completedAt ? 1 : -1
    }
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER
    if (aDue !== bDue) return aDue - bDue
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

function getDueTone(dueDate: string | Date | null) {
  if (!dueDate) {
    return {
      wrapper: 'border-stone-200 bg-stone-50',
      badge: 'bg-stone-200 text-stone-700',
    }
  }

  const due = new Date(dueDate)
  const today = new Date()
  const dueOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  if (dueOnly.getTime() < todayOnly.getTime()) {
    return {
      wrapper: 'border-red-200 bg-red-50',
      badge: 'bg-red-100 text-red-700',
    }
  }

  if (dueOnly.getTime() === todayOnly.getTime()) {
    return {
      wrapper: 'border-amber-200 bg-amber-50',
      badge: 'bg-amber-100 text-amber-700',
    }
  }

  return {
    wrapper: 'border-stone-200 bg-white',
    badge: 'bg-stone-100 text-stone-700',
  }
}

function formatDueLabel(date: string | Date) {
  const target = new Date(date)
  const today = new Date()
  const targetOnly = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((targetOnly.getTime() - todayOnly.getTime()) / 86400000)

  if (diffDays < 0) return `Overdue · ${formatDate(target)}`
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due tomorrow'
  return `Due ${formatDate(target)}`
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
