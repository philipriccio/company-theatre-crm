import {audiencePermission,permissionLabels} from '@/lib/audience-workspace'
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

  const [permission,evidence]=await Promise.all([audiencePermission(id),prisma.consentEvidence.findMany({where:{contactId:id},orderBy:[{recordedAt:'desc'},{id:'desc'}],take:50})])
  return <ContactDossierClient initialContact={contact} permissionPanel={<section className="audience-panel audience-evidence"><details open><summary>Permission & source evidence · {permission ? permissionLabels[permission] : 'Unknown'}</summary><p>Mailing flag: {contact.solicitation?'on':'off'}. This flag is not proof of consent. Blocks take precedence over recorded requests. Nothing here changes permissions.</p>{evidence.length===0?<p>No consent evidence recorded. This is an evidence gap, not a legal conclusion about historical consent.</p>:<ol>{evidence.map(e=><li key={e.id}><strong>{e.source}</strong> · {e.status==='express_opt_in_recorded'?'Opt-in recorded':e.status==='express_opt_in_needs_review'?'Opt-in request needs review':'Other evidence — review required'}<br/>{e.recordedAt.toLocaleString('en-CA',{timeZone:'America/Toronto'})} (Toronto) · {e.email}{e.metadata && typeof e.metadata==='object' && !Array.isArray(e.metadata) && typeof e.metadata.consentText==='string' && <p>{e.metadata.consentText}</p>}</li>)}</ol>}<p>Read-only history · up to 50 most recent records. Older evidence is retained.</p></details></section>} />

}
