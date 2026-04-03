import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import ContactDossierClient from './ContactDossierClient'

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
      notes: {
        orderBy: { createdAt: 'desc' },
      },
      interactions: {
        orderBy: { occurredAt: 'desc' },
        take: 20,
      },
      connections: {
        orderBy: { createdAt: 'desc' },
      },
      followUps: {
        orderBy: [
          { completedAt: { sort: 'asc', nulls: 'first' } },
          { dueDate: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      },
    },
  })

  if (!contact) {
    notFound()
  }

  return <ContactDossierClient initialContact={contact} />
}
