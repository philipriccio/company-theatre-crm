import { prisma } from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TestSendButton } from './TestSendButton'
import { CancelCampaignButton } from './CancelCampaignButton'
import { DuplicateCampaignButton } from './DuplicateCampaignButton'
import { CampaignControls } from './CampaignControls'

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
          status: true,
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
  const accepted = campaign.recipients.filter(r => r.status === 'ACCEPTED').length
  const delivered = campaign.recipients.filter(r => r.status === 'DELIVERED').length
  const failed = campaign.recipients.filter(r => r.status === 'FAILED').length
  const suppressed = campaign.recipients.filter(r => r.status === 'SUPPRESSED').length
  const unknown = campaign.recipients.filter(r => r.status === 'UNKNOWN').length

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

      {total > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-7 gap-4 mb-8">
          <StatCard label="Accepted" value={accepted} />
          <StatCard label="Delivered" value={delivered} />
          <StatCard label="Opened" value={opened} percent={(opened / total) * 100} />
          <StatCard label="Clicked" value={clicked} percent={(clicked / total) * 100} />
          <StatCard label="Bounced" value={bounced} percent={(bounced / total) * 100} color="red" />
          <StatCard label="Suppressed" value={suppressed} color="red" />
          <StatCard label="Unknown" value={unknown + failed} color="red" />
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

        {/* Side Panel */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          {campaign.status === 'DRAFT' ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Send Campaign</h2>
                <TestSendButton campaignId={campaign.id} />
              </div>

              <hr className="border-gray-200" />

              <div>
                <p className="text-sm text-gray-500 mb-4">
                  Ready to send? Choose your recipients and review before sending.
                </p>
                <Link
                  href={`/campaigns/${campaign.id}/send`}
                  className="block w-full px-4 py-3 bg-[#0a0a0a] text-white rounded-lg hover:bg-[#1a1a1a] font-medium text-center transition-colors"
                >
                  Prepare to Send →
                </Link>
              </div>
            </div>
          ) : ['SENT', 'COMPLETED', 'COMPLETED_WITH_FAILURES'].includes(campaign.status) ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Campaign Sent</h2>
              <p className="text-gray-500 text-sm">
                Completed on {campaign.completedAt ? new Date(campaign.completedAt).toLocaleString() : campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : 'Unknown'}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                {(campaign.frozenRecipientCount || total).toLocaleString()} frozen recipients
              </p>
              <div className="mt-4"><CampaignControls campaignId={campaign.id} status={campaign.status} /></div>
            </>
          ) : campaign.status === 'SCHEDULED' && campaign.scheduledAt ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Scheduled Campaign</h2>
              <CancelCampaignButton
                campaignId={campaign.id}
                scheduledAt={campaign.scheduledAt}
                recipientCount={total}
              />
              <div className="mt-4"><CampaignControls campaignId={campaign.id} status={campaign.status} /></div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Status: {campaign.status}</h2>
              <p className="text-gray-500 text-sm">
                {campaign.scheduledAt && `Scheduled for ${new Date(campaign.scheduledAt).toLocaleString()}`}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Frozen recipients: {(campaign.frozenRecipientCount || total).toLocaleString()}
              </p>
              {campaign.approvedAt && (
                <p className="text-gray-500 text-sm mt-2">
                  Approved by {campaign.approvedBy || 'Unknown'} on {new Date(campaign.approvedAt).toLocaleString()}
                </p>
              )}
              <div className="mt-4"><CampaignControls campaignId={campaign.id} status={campaign.status} /></div>
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
    QUEUED: 'bg-blue-100 text-blue-800',
    SENDING: 'bg-yellow-100 text-yellow-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    COMPLETED: 'bg-green-100 text-green-800',
    COMPLETED_WITH_FAILURES: 'bg-orange-100 text-orange-800',
    SENT: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-800',
    FAILED: 'bg-red-100 text-red-800',
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
