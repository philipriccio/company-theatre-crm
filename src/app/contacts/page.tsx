import { prisma } from '@/lib/db'
import Link from 'next/link'
import { Contact, Tag, ContactTag } from '@prisma/client'

export const dynamic = 'force-dynamic'

type ContactWithTags = Contact & {
  tags: (ContactTag & { tag: Tag })[]
}

interface SearchParams {
  page?: string
  search?: string
  tag?: string
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const page = parseInt(params.page || '1')
  const search = params.search || ''
  const tagFilter = params.tag || ''
  const pageSize = 50

  const where = {
    AND: [
      search ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' as const } },
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { fullName: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {},
      tagFilter ? {
        tags: { some: { tag: { name: tagFilter } } },
      } : {},
    ],
  }

  const [contacts, total, tags] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
      },
      orderBy: { email: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
    prisma.tag.findMany({ orderBy: { name: 'asc' } }),
  ])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="p-8 page-enter">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">Contacts</h1>
          <p className="text-stone-500 mt-1">
            {total.toLocaleString()} contacts in your database
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/contacts/import"
            className="btn btn-secondary btn-md"
          >
            <UploadIcon className="w-4 h-4" />
            Import
          </Link>
          <Link
            href="/contacts/new"
            className="btn btn-primary btn-md"
          >
            <PlusIcon className="w-4 h-4" />
            Add Contact
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <form method="GET" className="flex gap-4">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search by name or email..."
              className="input pl-12"
            />
          </div>
          <select
            name="tag"
            defaultValue={tagFilter}
            className="w-64"
          >
            <option value="">All Tags</option>
            {tags.map((tag: Tag) => (
              <option key={tag.id} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="btn btn-primary btn-md"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Results count */}
      <p className="text-sm text-stone-500 mb-4">
        Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()} contacts
      </p>

      {/* Contacts table */}
      <div className="table-container bg-white">
        <table className="min-w-full">
          <thead>
            <tr className="bg-stone-50/80">
              <th className="px-6 py-4 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Tags
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Location
              </th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact: ContactWithTags) => (
              <tr key={contact.id} className="table-row group">
                <td className="px-6 py-4">
                  <Link href={`/contacts/${contact.id}`} className="block">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-stone-200 to-stone-300 flex items-center justify-center text-stone-600 font-medium text-sm group-hover:from-amber-100 group-hover:to-amber-200 group-hover:text-amber-700 transition-colors">
                        {getInitials(contact)}
                      </div>
                      <div>
                        <div className="font-medium text-stone-900 group-hover:text-amber-700 transition-colors">
                          {contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email}
                        </div>
                        <div className="text-sm text-stone-500">{contact.email}</div>
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {contact.tags.slice(0, 3).map(({ tag }: { tag: Tag }) => (
                      <span
                        key={tag.id}
                        className="badge badge-neutral"
                      >
                        {tag.name}
                      </span>
                    ))}
                    {contact.tags.length > 3 && (
                      <span className="text-xs text-stone-400 self-center">
                        +{contact.tags.length - 3}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  {contact.unsubscribedAt ? (
                    <span className="badge badge-error">
                      Unsubscribed
                    </span>
                  ) : !contact.solicitation ? (
                    <span className="badge badge-warning">
                      No Solicitation
                    </span>
                  ) : (
                    <span className="badge badge-success">
                      Subscribed
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-stone-500">
                  {[contact.city, contact.state, contact.country].filter(Boolean).join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-6">
          {page > 1 && (
            <Link
              href={`/contacts?page=${page - 1}&search=${search}&tag=${tagFilter}`}
              className="btn btn-secondary btn-sm"
            >
              ← Previous
            </Link>
          )}
          <div className="flex items-center gap-1 px-4">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (page <= 3) {
                pageNum = i + 1
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = page - 2 + i
              }
              return (
                <Link
                  key={pageNum}
                  href={`/contacts?page=${pageNum}&search=${search}&tag=${tagFilter}`}
                  className={`w-10 h-10 flex items-center justify-center rounded-xl text-sm font-medium transition-colors ${
                    page === pageNum 
                      ? 'bg-stone-900 text-white' 
                      : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  {pageNum}
                </Link>
              )
            })}
          </div>
          {page < totalPages && (
            <Link
              href={`/contacts?page=${page + 1}&search=${search}&tag=${tagFilter}`}
              className="btn btn-secondary btn-sm"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function getInitials(contact: ContactWithTags): string {
  if (contact.firstName && contact.lastName) {
    return `${contact.firstName[0]}${contact.lastName[0]}`.toUpperCase()
  }
  if (contact.fullName) {
    const parts = contact.fullName.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    }
    return contact.fullName[0].toUpperCase()
  }
  return contact.email[0].toUpperCase()
}

// Icons
function UploadIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 15V3m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 15v4a2 2 0 002 2h14a2 2 0 002-2v-4" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
    </svg>
  )
}
