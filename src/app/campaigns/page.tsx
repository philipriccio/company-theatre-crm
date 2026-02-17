import { prisma } from '@/lib/db'
import Link from 'next/link'
import { Campaign } from '@prisma/client'

export const dynamic = 'force-dynamic'

type CampaignWithStats = Campaign & {
  _count: {
    recipients: number
  }
  recipients: {
    openedAt: Date | null
    clickedAt: Date | null
  }[]
}

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    include: {
      _count: {
        select: { recipients: true },
      },
      recipients: {
        select: {
          openedAt: true,
          clickedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  }) as CampaignWithStats[]

  return (
    <div className="p-8 page-enter">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">Campaigns</h1>
          <p className="text-stone-500 mt-1">
            Create and manage email campaigns
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="btn btn-primary btn-md"
        >
          <PlusIcon className="w-4 h-4" />
          New Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-4">
            <MailIcon className="w-8 h-8 text-stone-400" />
          </div>
          <h3 className="text-lg font-semibold text-stone-900 mb-2">No campaigns yet</h3>
          <p className="text-stone-500 mb-6 max-w-sm mx-auto">
            Create your first email campaign to start engaging with your audience.
          </p>
          <Link
            href="/campaigns/new"
            className="btn btn-gold btn-md inline-flex"
          >
            Create your first campaign
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => {
            const opens = campaign.recipients.filter(r => r.openedAt).length
            const clicks = campaign.recipients.filter(r => r.clickedAt).length
            const total = campaign._count.recipients
            const openRate = total > 0 ? ((opens / total) * 100).toFixed(1) : null
            const clickRate = total > 0 ? ((clicks / total) * 100).toFixed(1) : null

            return (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="card p-6 flex items-center gap-6 card-interactive"
              >
                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  campaign.status === 'SENT' 
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' 
                    : campaign.status === 'DRAFT'
                    ? 'bg-gradient-to-br from-stone-200 to-stone-300'
                    : 'bg-gradient-to-br from-amber-500 to-amber-600'
                }`}>
                  <MailIcon className={`w-6 h-6 ${
                    campaign.status === 'DRAFT' ? 'text-stone-500' : 'text-white'
                  }`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold text-stone-900 truncate">
                      {campaign.name}
                    </h3>
                    <StatusBadge status={campaign.status} />
                  </div>
                  <p className="text-sm text-stone-500 truncate">
                    {campaign.subject}
                  </p>
                </div>

                {/* Stats (only for sent campaigns) */}
                {campaign.status === 'SENT' && total > 0 && (
                  <div className="flex items-center gap-8 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-stone-900">{total.toLocaleString()}</p>
                      <p className="text-xs text-stone-400">Sent</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-emerald-600">{openRate}%</p>
                      <p className="text-xs text-stone-400">Opens</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-semibold text-amber-600">{clickRate}%</p>
                      <p className="text-xs text-stone-400">Clicks</p>
                    </div>
                  </div>
                )}

                {/* Date */}
                <div className="text-right flex-shrink-0 w-28">
                  <p className="text-sm text-stone-500">
                    {campaign.sentAt 
                      ? new Date(campaign.sentAt).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : campaign.scheduledAt
                      ? `Scheduled`
                      : new Date(campaign.createdAt).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                  </p>
                  {campaign.scheduledAt && campaign.status === 'SCHEDULED' && (
                    <p className="text-xs text-amber-600">
                      {new Date(campaign.scheduledAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Arrow */}
                <div className="text-stone-300 group-hover:text-amber-500 transition-colors">
                  <ChevronIcon className="w-5 h-5" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { class: string; label: string }> = {
    DRAFT: { class: 'badge-neutral', label: 'Draft' },
    SCHEDULED: { class: 'badge-info', label: 'Scheduled' },
    SENDING: { class: 'badge-warning', label: 'Sending' },
    SENT: { class: 'badge-success', label: 'Sent' },
    CANCELLED: { class: 'badge-error', label: 'Cancelled' },
  }
  const { class: className, label } = config[status] || config.DRAFT

  return (
    <span className={`badge ${className}`}>
      {label}
    </span>
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

function MailIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9l9 5 9-5" />
    </svg>
  )
}

function ChevronIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
