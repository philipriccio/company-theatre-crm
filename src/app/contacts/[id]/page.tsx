import { prisma } from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      tags: { include: { tag: true } },
      campaignRecipients: {
        include: { campaign: true },
        orderBy: { sentAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!contact) {
    notFound()
  }

  const displayName = contact.fullName || 
    `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 
    contact.email

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link href="/contacts" className="text-indigo-600 hover:text-indigo-800">
          ← Back to Contacts
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{displayName}</h1>
            <p className="text-gray-500 mt-1">{contact.email}</p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/contacts/${id}/edit`}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Edit
            </Link>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex gap-2 mt-4">
          {contact.unsubscribedAt ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
              Unsubscribed {new Date(contact.unsubscribedAt).toLocaleDateString()}
            </span>
          ) : !contact.solicitation ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
              No Solicitation
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
              Subscribed
            </span>
          )}
          {contact.totalDonations && contact.totalDonations > 0 && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
              Donor: ${contact.totalDonations.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Info */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
          <dl className="space-y-3">
            {contact.title && (
              <div>
                <dt className="text-sm text-gray-500">Title</dt>
                <dd className="text-gray-900">{contact.title}</dd>
              </div>
            )}
            {contact.firstName && (
              <div>
                <dt className="text-sm text-gray-500">First Name</dt>
                <dd className="text-gray-900">{contact.firstName}</dd>
              </div>
            )}
            {contact.lastName && (
              <div>
                <dt className="text-sm text-gray-500">Last Name</dt>
                <dd className="text-gray-900">{contact.lastName}</dd>
              </div>
            )}
            {contact.phone && (
              <div>
                <dt className="text-sm text-gray-500">Phone</dt>
                <dd className="text-gray-900">{contact.phone}</dd>
              </div>
            )}
            {(contact.city || contact.state || contact.country) && (
              <div>
                <dt className="text-sm text-gray-500">Location</dt>
                <dd className="text-gray-900">
                  {[contact.city, contact.state, contact.country].filter(Boolean).join(', ')}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-gray-500">Added</dt>
              <dd className="text-gray-900">{new Date(contact.createdAt).toLocaleDateString()}</dd>
            </div>
          </dl>
        </div>

        {/* Tags */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tags</h2>
          {contact.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {contact.tags.map(({ tag }) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No tags assigned</p>
          )}
        </div>

        {/* Email History */}
        <div className="bg-white rounded-xl shadow-sm p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Email History</h2>
          {contact.campaignRecipients.length > 0 ? (
            <table className="min-w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500">
                  <th className="pb-2">Campaign</th>
                  <th className="pb-2">Sent</th>
                  <th className="pb-2">Opened</th>
                  <th className="pb-2">Clicked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contact.campaignRecipients.map((recipient) => (
                  <tr key={recipient.id}>
                    <td className="py-2">
                      <Link href={`/campaigns/${recipient.campaign.id}`} className="text-indigo-600 hover:underline">
                        {recipient.campaign.name}
                      </Link>
                    </td>
                    <td className="py-2 text-sm text-gray-500">
                      {recipient.sentAt ? new Date(recipient.sentAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2">
                      {recipient.openedAt ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      {recipient.clickedAt ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 text-sm">No emails sent to this contact yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
