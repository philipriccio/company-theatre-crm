import { prisma } from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getStats() {
  const [
    totalContacts,
    subscribedContacts,
    totalTags,
    totalCampaigns,
    sentCampaigns,
    recentCampaigns,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { solicitation: true, unsubscribedAt: null } }),
    prisma.tag.count(),
    prisma.campaign.count(),
    prisma.campaign.count({ where: { status: 'SENT' } }),
    prisma.campaign.findMany({
      where: { status: 'SENT' },
      orderBy: { sentAt: 'desc' },
      take: 5,
      include: {
        _count: { select: { recipients: true } },
      },
    }),
  ])

  return {
    totalContacts,
    subscribedContacts,
    totalTags,
    totalCampaigns,
    sentCampaigns,
    recentCampaigns,
  }
}

export default async function Dashboard() {
  const stats = await getStats()

  return (
    <div className="p-8 page-enter">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">
          Dashboard
        </h1>
        <p className="text-stone-500 mt-1">
          Welcome back. Here's what's happening with your audience.
        </p>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard
          title="Total Contacts"
          value={stats.totalContacts}
          icon={<ContactIcon />}
          trend="+12% from import"
        />
        <StatCard
          title="Subscribed"
          value={stats.subscribedContacts}
          icon={<MailIcon />}
          subtitle="Can receive emails"
          accent
        />
        <StatCard
          title="Tags"
          value={stats.totalTags}
          icon={<TagIcon />}
        />
        <StatCard
          title="Campaigns Sent"
          value={stats.sentCampaigns}
          icon={<SendIcon />}
          subtitle={`${stats.totalCampaigns} total`}
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-stone-900 mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <ActionButton 
              href="/campaigns/new" 
              icon={<PlusIcon />} 
              label="Create Campaign"
              description="Draft a new email"
              primary
            />
            <ActionButton 
              href="/contacts/import" 
              icon={<UploadIcon />} 
              label="Import Contacts"
              description="Add from CSV"
            />
            <ActionButton 
              href="/contacts" 
              icon={<SearchIcon />} 
              label="Browse Contacts"
              description="View all contacts"
            />
          </div>
        </div>

        {/* Recent Campaigns */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-stone-900">Recent Campaigns</h2>
            <Link 
              href="/campaigns"
              className="text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              View all →
            </Link>
          </div>
          {stats.recentCampaigns.length > 0 ? (
            <div className="space-y-3">
              {stats.recentCampaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.id}`}
                  className="flex items-center gap-4 p-3 -mx-3 rounded-xl hover:bg-stone-50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center group-hover:from-amber-50 group-hover:to-amber-100 transition-colors">
                    <MailIcon className="w-5 h-5 text-stone-500 group-hover:text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-900 truncate">{campaign.name}</p>
                    <p className="text-sm text-stone-500">
                      {campaign._count.recipients.toLocaleString()} recipients
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-stone-400">
                      {campaign.sentAt && new Date(campaign.sentAt).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3">
                <MailIcon className="w-6 h-6 text-stone-400" />
              </div>
              <p className="text-stone-500 text-sm">No campaigns sent yet</p>
              <Link 
                href="/campaigns/new"
                className="text-sm text-amber-600 hover:text-amber-700 font-medium mt-2 inline-block"
              >
                Create your first campaign →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ 
  title, 
  value, 
  icon, 
  subtitle, 
  trend,
  accent 
}: { 
  title: string
  value: number
  icon: React.ReactNode
  subtitle?: string
  trend?: string
  accent?: boolean
}) {
  return (
    <div className={`card p-6 ${accent ? 'ring-1 ring-amber-200 bg-gradient-to-br from-white to-amber-50/30' : ''}`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          accent 
            ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white' 
            : 'bg-stone-100 text-stone-500'
        }`}>
          {icon}
        </div>
        {trend && (
          <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-stone-500 mb-1">{title}</p>
      <p className="text-3xl font-semibold text-stone-900 tracking-tight stat-value">
        {value.toLocaleString()}
      </p>
      {subtitle && (
        <p className="text-xs text-stone-400 mt-1">{subtitle}</p>
      )}
    </div>
  )
}

function ActionButton({ 
  href, 
  icon, 
  label, 
  description,
  primary 
}: { 
  href: string
  icon: React.ReactNode
  label: string
  description: string
  primary?: boolean
}) {
  return (
    <Link
      href={href}
      className={`
        flex items-center gap-4 p-3 rounded-xl transition-all duration-200 group
        ${primary 
          ? 'bg-gradient-to-r from-stone-900 to-stone-800 text-white hover:from-stone-800 hover:to-stone-700 shadow-md hover:shadow-lg' 
          : 'bg-stone-50 hover:bg-stone-100'
        }
      `}
    >
      <div className={`
        w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105
        ${primary ? 'bg-white/10' : 'bg-white shadow-sm'}
      `}>
        <span className={primary ? 'text-amber-400' : 'text-stone-500'}>
          {icon}
        </span>
      </div>
      <div>
        <p className={`font-medium ${primary ? 'text-white' : 'text-stone-900'}`}>
          {label}
        </p>
        <p className={`text-sm ${primary ? 'text-stone-300' : 'text-stone-500'}`}>
          {description}
        </p>
      </div>
    </Link>
  )
}

// Icons
function ContactIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" />
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

function TagIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 9h7l5 5v7a1 1 0 01-1 1H5a1 1 0 01-1-1V9z" />
      <circle cx="8" cy="13" r="1" fill="currentColor" />
    </svg>
  )
}

function SendIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
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

function UploadIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 15V3m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 15v4a2 2 0 002 2h14a2 2 0 002-2v-4" strokeLinecap="round" />
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
