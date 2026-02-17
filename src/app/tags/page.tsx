import { prisma } from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function TagsPage() {
  const tags = await prisma.tag.findMany({
    include: {
      _count: {
        select: { contacts: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  // Group tags by category
  const attendanceTags = tags.filter(t => t.name.startsWith('Attended'))
  const listTags = tags.filter(t => t.name.includes('List'))
  const otherTags = tags.filter(t => !t.name.startsWith('Attended') && !t.name.includes('List'))

  const totalContacts = tags.reduce((sum, t) => sum + t._count.contacts, 0)

  return (
    <div className="p-8 page-enter">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">Tags</h1>
          <p className="text-stone-500 mt-1">
            {tags.length} tags across {totalContacts.toLocaleString()} assignments
          </p>
        </div>
        <button className="btn btn-primary btn-md">
          <PlusIcon className="w-4 h-4" />
          New Tag
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Show Attendance */}
        <TagSection 
          title="Show Attendance"
          icon={<TicketIcon />}
          color="amber"
          tags={attendanceTags}
        />

        {/* Mailing Lists */}
        <TagSection 
          title="Mailing Lists"
          icon={<MailIcon />}
          color="blue"
          tags={listTags}
        />

        {/* Other */}
        <TagSection 
          title="Other"
          icon={<TagIcon />}
          color="stone"
          tags={otherTags}
        />
      </div>
    </div>
  )
}

function TagSection({ 
  title, 
  icon, 
  color,
  tags 
}: { 
  title: string
  icon: React.ReactNode
  color: 'amber' | 'blue' | 'stone'
  tags: { id: string; name: string; _count: { contacts: number } }[]
}) {
  const colorClasses = {
    amber: 'from-amber-500 to-amber-600',
    blue: 'from-blue-500 to-blue-600',
    stone: 'from-stone-500 to-stone-600',
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center`}>
          <span className="text-white w-5 h-5">{icon}</span>
        </div>
        <div>
          <h2 className="font-semibold text-stone-900">{title}</h2>
          <p className="text-sm text-stone-500">{tags.length} tags</p>
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/contacts?tag=${encodeURIComponent(tag.name)}`}
              className="flex items-center justify-between p-3 -mx-2 rounded-xl hover:bg-stone-50 transition-colors group"
            >
              <span className="text-stone-700 group-hover:text-stone-900 transition-colors">
                {tag.name.replace('Attended ', '')}
              </span>
              <span className="text-sm text-stone-400 tabular-nums">
                {tag._count.contacts.toLocaleString()}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-400 text-center py-8">No tags in this category</p>
      )}
    </div>
  )
}

// Icons
function PlusIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <path d="M2 9a3 3 0 013-3h14a3 3 0 013 3v0a3 3 0 01-3 3v0a3 3 0 00-3 3v0a3 3 0 01-3 3H5a3 3 0 01-3-3V9z" />
      <path d="M13 6v4M13 14v4" strokeLinecap="round" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9l9 5 9-5" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-full h-full">
      <path d="M4 9h7l5 5v7a1 1 0 01-1 1H5a1 1 0 01-1-1V9z" />
      <circle cx="8" cy="13" r="1" fill="currentColor" />
    </svg>
  )
}
