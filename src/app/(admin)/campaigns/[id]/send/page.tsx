import { prisma } from '@/lib/db'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { SendFlowClient } from './SendFlowClient'

export const dynamic = 'force-dynamic'

export default async function SendCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const campaign = await prisma.campaign.findUnique({
    where: { id },
  })

  if (!campaign) {
    notFound()
  }

  // Only DRAFT campaigns can be sent
  if (campaign.status !== 'DRAFT') {
    redirect(`/campaigns/${id}`)
  }

  // Get available tags with contact counts
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { contacts: true } } },
    orderBy: { name: 'asc' },
  })

  const subscribedCount = await prisma.contact.count({
    where: { solicitation: true, unsubscribedAt: null },
  })

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Back link */}
      <div className="mb-6">
        <Link
          href={`/campaigns/${id}`}
          className="text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"
        >
          ← Back to edit
        </Link>
      </div>

      {/* Campaign summary */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Prepare to Send
        </h1>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex gap-2">
            <span className="font-medium text-gray-700 w-20">Name:</span>
            <span>{campaign.name}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium text-gray-700 w-20">Subject:</span>
            <span>{campaign.subject}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium text-gray-700 w-20">From:</span>
            <span>
              {campaign.fromName} &lt;{campaign.fromEmail}&gt;
            </span>
          </div>
          {campaign.previewText && (
            <div className="flex gap-2">
              <span className="font-medium text-gray-700 w-20">Preview:</span>
              <span className="text-gray-500">{campaign.previewText}</span>
            </div>
          )}
        </div>
      </div>

      {/* Client-side send flow */}
      <SendFlowClient
        campaignId={campaign.id}
        tags={tags.map((t) => ({
          id: t.id,
          name: t.name,
          count: t._count.contacts,
        }))}
        totalSubscribed={subscribedCount}
      />
    </div>
  )
}
