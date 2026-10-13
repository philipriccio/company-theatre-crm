import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { recipientSelect } from '@/lib/email/analytics'
import '../../analytics.css'
export const dynamic = 'force-dynamic'
const date = (value: Date | null) => value ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'medium' }).format(value) : 'Not recorded'
export default async function RecipientTimeline({ params, searchParams }: { params: Promise<{ id: string; recipientId: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id, recipientId } = await params
  const query = await searchParams
  const requestedPage = Math.max(1,Math.min(100000,parseInt(query.page || '1',10)||1))
  const [recipient, count] = await Promise.all([
    prisma.campaignRecipient.findFirst({ where: { id: recipientId, campaignId: id }, select: { ...recipientSelect, campaign: { select: { name: true } } } }),
    prisma.emailAnalyticsEvent.count({ where: { campaignId:id, recipientId } }),
  ])
  if (!recipient) notFound()
  const pages = Math.max(1,Math.ceil(count/100)), page = Math.min(requestedPage,pages)
  const events = await prisma.emailAnalyticsEvent.findMany({ where: { campaignId:id, recipientId }, orderBy: [{occurredAt:'desc'},{id:'desc'}], take:100, skip:(page-1)*100,
    select: { id:true, kind:true, source:true, canonical:true, occurredAt:true, receivedAt:true, linkLabel:true, linkKey:true, targetUrl:true, automation:true, detail:true } })
  return <div className="email-analytics"><nav className="analytics-nav"><Link href={`/campaigns/${id}/analytics#recipients`}>← Campaign report</Link></nav><header className="analytics-head"><div><p className="analytics-eyebrow">Recipient evidence · {recipient.campaign.name}</p><h1>{recipient.fullName || [recipient.firstName,recipient.lastName].filter(Boolean).join(' ') || recipient.email}</h1><p>{recipient.email}</p></div></header><div className="analytics-notice">An open or click is recorded activity, not proof a person read the email. Provider automation labels are evidence, not a human-verification test. All times below: America/Toronto.</div><section className="analytics-panel"><h2>Delivery & engagement</h2><dl className="analytics-detail-grid">{[['Current outcome',recipient.status],['Accepted',date(recipient.acceptedAt)],['Delivered to mail server',date(recipient.deliveredAt)],['First recorded open',date(recipient.openedAt)],['First recorded click',date(recipient.clickedAt)],['Bounce',recipient.bounceType || 'Not recorded'],['Campaign unsubscribe',date(recipient.unsubscribedAt)],['Spam complaint',date(recipient.complainedAt)],['Tracking coverage',recipient.analyticsVersion===1?'SES opens · signed app clicks':'Historical / partial evidence']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className="analytics-panel"><h2>Evidence timeline</h2><p className="analytics-muted">Newest event first · {count} captured events · mirrored observations are labelled and excluded from engagement totals.</p><ol className="analytics-timeline">{events.map(e=><li key={e.id}><strong>{e.kind.replaceAll('_',' ')} {e.canonical?'':'· secondary observation'}</strong><small>{date(e.occurredAt)} · {e.source.toUpperCase()} · {e.automation.replaceAll('_',' ')}</small>{e.linkLabel && <p>{e.linkLabel}</p>}{e.targetUrl && <span className="analytics-url">{e.targetUrl}</span>}{e.detail && <p className="analytics-muted">{e.detail}</p>}</li>)}</ol>{!events.length && <div className="analytics-empty">No detailed event history was captured.<br/>Existing timestamps above are historical evidence only; absence is not proof of no activity.</div>}<div className="analytics-pagination"><span>Page {page} of {pages}</span><nav className="analytics-nav">{page>1 && <Link href={`?page=${page-1}`}>Previous</Link>}{page<pages && <Link href={`?page=${page+1}`}>Next</Link>}</nav></div></section></div>
}
