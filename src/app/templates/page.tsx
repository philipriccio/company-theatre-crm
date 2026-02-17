import { prisma } from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  const templates = await prisma.template.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="p-8 page-enter">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">Templates</h1>
          <p className="text-stone-500 mt-1">
            Create reusable email designs with drag and drop
          </p>
        </div>
        <Link
          href="/templates/new"
          className="btn btn-primary btn-md"
        >
          <PlusIcon className="w-4 h-4" />
          New Template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <TemplateIcon className="w-8 h-8 text-stone-400" />
          </div>
          <h3 className="text-lg font-semibold text-stone-900 mb-2">No templates yet</h3>
          <p className="text-stone-500 mb-6 max-w-sm mx-auto">
            Create reusable email templates with our drag-and-drop builder.
          </p>
          <Link
            href="/templates/new"
            className="btn btn-gold btn-md inline-flex"
          >
            Create your first template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
            <Link
              key={template.id}
              href={`/templates/${template.id}`}
              className="card card-interactive overflow-hidden group"
            >
              {/* Preview Area */}
              <div className="h-40 bg-gradient-to-br from-stone-100 to-stone-200 p-4 relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
                  <span className="text-white font-medium">Edit Template</span>
                </div>
                {/* Mini preview */}
                <div className="bg-white rounded shadow-sm h-full w-full flex flex-col overflow-hidden">
                  <div className="h-6 bg-stone-900 flex items-center justify-center">
                    <span className="text-[8px] text-white tracking-wider">THE COMPANY THEATRE</span>
                  </div>
                  <div className="flex-1 p-2">
                    <div className="space-y-1">
                      <div className="h-2 bg-stone-200 rounded w-3/4" />
                      <div className="h-1.5 bg-stone-100 rounded w-full" />
                      <div className="h-1.5 bg-stone-100 rounded w-2/3" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-stone-900 truncate">{template.name}</h3>
                  {template.isDefault && (
                    <span className="badge badge-info text-[10px]">Default</span>
                  )}
                </div>
                <p className="text-sm text-stone-500 mt-1">
                  Created {new Date(template.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </Link>
          ))}
        </div>
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

function TemplateIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 10h16" />
      <path d="M10 10v10" />
    </svg>
  )
}
