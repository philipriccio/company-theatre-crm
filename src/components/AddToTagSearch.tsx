'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'

interface ContactResult {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
  fullName: string | null
}

export default function AddToTagSearch({ tagName }: { tagName: string }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactResult[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSearch(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.length < 2) {
      setResults([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/contacts/search?q=${encodeURIComponent(value)}&excludeTag=${encodeURIComponent(tagName)}`,
          { headers: { Authorization: 'Basic ' + btoa('Philip:Riccio') } }
        )
        const data = await res.json()
        setResults(data)
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
  }

  async function handleAdd(contact: ContactResult) {
    setAdding(contact.id)
    try {
      await fetch('/api/contacts/tag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + btoa('Philip:Riccio'),
        },
        body: JSON.stringify({ contactId: contact.id, tagName }),
      })
      // Remove from results
      setResults(prev => prev.filter(c => c.id !== contact.id))
      router.refresh()
    } finally {
      setAdding(null)
    }
  }

  function displayName(c: ContactResult) {
    const name = c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' ')
    return name || c.email
  }

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search contacts to add..."
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#ff3b1d]/20 focus:border-[#ff3b1d] bg-white"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm animate-spin">⟳</span>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white rounded-xl shadow-lg border border-stone-200 max-h-64 overflow-y-auto">
          {results.map(contact => (
            <button
              key={contact.id}
              onClick={() => handleAdd(contact)}
              disabled={adding === contact.id}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50 transition-colors text-left border-b border-stone-100 last:border-0 disabled:opacity-50"
            >
              <div>
                <div className="text-sm font-medium text-stone-900">{displayName(contact)}</div>
                <div className="text-xs text-stone-500">{contact.email}</div>
              </div>
              <span className="text-xs font-medium text-[#ff3b1d] flex-shrink-0 ml-3">
                {adding === contact.id ? 'Adding...' : '+ Add'}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white rounded-xl shadow-lg border border-stone-200 px-4 py-3">
          <p className="text-sm text-stone-500">No contacts found</p>
        </div>
      )}
    </div>
  )
}
