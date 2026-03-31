'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface QuickTagButtonProps {
  contactId: string
  contactName: string
  existingTagNames: string[]
  allTags: { id: string; name: string }[]
}

export default function QuickTagButton({ contactId, contactName, existingTagNames, allTags }: QuickTagButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setFilter('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  const availableTags = allTags.filter(
    t => !existingTagNames.includes(t.name) && t.name.toLowerCase().includes(filter.toLowerCase())
  )

  async function handleAdd(tagName: string) {
    setAdding(true)
    try {
      await fetch('/api/contacts/tag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + btoa('Philip:Riccio'),
        },
        body: JSON.stringify({ contactId, tagName }),
      })
      setOpen(false)
      setFilter('')
      router.refresh()
    } finally {
      setAdding(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-stone-500 hover:text-[#ff3b1d] hover:bg-red-50 rounded-lg transition-colors border border-stone-200 hover:border-red-200"
        title={`Add ${contactName} to a tag`}
      >
        + Tag
      </button>

      {open && (
        <div className="absolute z-50 right-0 top-full mt-1 w-72 bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
          <div className="p-2 border-b border-stone-100">
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter tags..."
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ff3b1d]/20 focus:border-[#ff3b1d]"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {adding ? (
              <div className="px-4 py-3 text-sm text-stone-500">Adding...</div>
            ) : availableTags.length > 0 ? (
              availableTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleAdd(tag.name)}
                  className="w-full text-left px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 hover:text-[#ff3b1d] transition-colors border-b border-stone-50 last:border-0"
                >
                  {tag.name}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-stone-400">
                {filter ? 'No matching tags' : 'Already in all tags'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
