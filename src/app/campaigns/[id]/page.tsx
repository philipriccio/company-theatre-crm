import { prisma } from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SendCampaignButton } from './SendCampaignButton'
import { CancelCampaignButton } from './CancelCampaignButton'
import { DuplicateCampaignButton } from './DuplicateCampaignButton'

export const dynamic = 'force-dynamic'

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      _count: { select: { recipients: true } },
      recipients: {
        select: {
          openedAt: true,
          clickedAt: true,
          bouncedAt: true,
        },
      },
    },
  })

  if (!campaign) {
    notFound()
  }

  // Calculate stats
  const total = campaign._count.recipients
  const opened = campaign.recipients.filter(r => r.openedAt).length
  const clicked = campaign.recipients.filter(r => r.clickedAt).length
  const bounced = campaign.recipients.filter(r => r.bouncedAt).length

  // Get available segments for sending
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { contacts: true } } },
    orderBy: { name: 'asc' },
  })

  const subscribedCount = await prisma.contact.count({
    where: { solicitation: true, unsubscribedAt: null },
  })

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/campaigns" className="text-indigo-600 hover:text-indigo-800">
          ← Back to Campaigns
        </Link>
      </div>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{campaign.name}</h1>
          <p className="text-gray-500 mt-1">Subject: {campaign.subject}</p>
        </div>
        <div className="flex items-center gap-3">
          <DuplicateCampaignButton campaignId={campaign.id} />
          <StatusBadge status={campaign.status} />
        </div>
      </div>

      {/* Stats (only show if sent) */}
      {campaign.status === 'SENT' && total > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard label="Sent" value={total} />
          <StatCard label="Opened" value={opened} percent={(opened / total) * 100} />
          <StatCard label="Clicked" value={clicked} percent={(clicked / total) * 100} />
          <StatCard label="Bounced" value={bounced} percent={(bounced / total) * 100} color="red" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email Preview */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Preview</h2>
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="mb-4 pb-4 border-b">
              <p className="text-sm text-gray-500">From: {campaign.fromName} &lt;{campaign.fromEmail}&gt;</p>
              <p className="text-sm text-gray-500">Subject: {campaign.subject}</p>
              {campaign.previewText && (
                <p className="text-sm text-gray-400">Preview: {campaign.previewText}</p>
              )}
            </div>
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: campaign.content }}
            />
          </div>
        </div>

        {/* Send Panel */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          {campaign.status === 'DRAFT' ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Send Campaign</h2>
              <SendCampaignButton
                campaignId={campaign.id}
                tags={tags.map(t => ({ id: t.id, name: t.name, count: t._count.contacts }))}
                totalSubscribed={subscribedCount}
              />
            </>
          ) : campaign.status === 'SENT' ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Campaign Sent</h2>
              <p className="text-gray-500 text-sm">
                Sent on {campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : 'Unknown'}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                {total.toLocaleString()} recipients
              </p>
            </>
          ) : campaign.status === 'SCHEDULED' && campaign.scheduledAt ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Scheduled Campaign</h2>
              <CancelCampaignButton
                campaignId={campaign.id}
                scheduledAt={campaign.scheduledAt}
                recipientCount={total}
              />
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Status: {campaign.status}</h2>
              <p className="text-gray-500 text-sm">
                {campaign.scheduledAt && `Scheduled for ${new Date(campaign.scheduledAt).toLocaleString()}`}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    SCHEDULED: 'bg-blue-100 text-blue-800',
    SENDING: 'bg-yellow-100 text-yellow-800',
    SENT: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${styles[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

function StatCard({ label, value, percent, color = 'indigo' }: { 
  label: string
  value: number
  percent?: number
  color?: string 
}) {
  const colorClasses = color === 'red' ? 'text-red-600' : 'text-indigo-600'
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      {percent !== undefined && (
        <p className={`text-sm ${colorClasses}`}>{percent.toFixed(1)}%</p>
      )}
    </div>
  )
}
