import { ReviewActions } from '@/components/campaigns/ReviewActions'
import { reviewHash, reviewState } from '@/lib/campaign-review'
import { EmailPreview } from "@/components/campaigns/EmailPreview";
import { wrapInTemplate } from "@/lib/email-template";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelCampaignButton } from "./CancelCampaignButton";
import { DuplicateCampaignButton } from "./DuplicateCampaignButton";
import { CampaignControls } from "./CampaignControls";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
  });

  if (!campaign) {
    notFound();
  }

  if (campaign.status === 'DRAFT') {
    const events = await prisma.campaignReview.findMany({where:{campaignId:id},orderBy:[{createdAt:'desc'},{id:'desc'}]})
    const hash=reviewHash(campaign)
    const refs=events.filter(e=>e.action==='APPROVE')
    return <div className="p-4 sm:p-8 space-y-6 max-w-6xl mx-auto">
      <Link href="/campaigns" className="text-sm underline">← All emails</Link>
      <header className="space-y-3"><p className="text-sm uppercase tracking-widest text-stone-500">Company Theatre · Creative review</p><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold">{campaign.name}</h1><span className="rounded-full bg-amber-50 text-amber-900 px-3 py-1 text-sm">{reviewState(events,hash)}</span></div><p className="text-stone-600">Review the email below and leave your notes. Nothing is sent from this page.</p></header>
      <section className="card p-5 space-y-2 text-sm"><p><strong>Subject:</strong> {campaign.subject || 'Not set'}</p><p><strong>Inbox preview:</strong> {campaign.previewText || 'Not set'}</p><p><strong>From:</strong> {campaign.fromName} · {campaign.fromEmail}</p><p><strong>Replies:</strong> {campaign.replyToEmail || campaign.fromEmail}</p></section>
      <div className="grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 items-start"><section className="card p-3 sm:p-5 min-w-0"><EmailPreview html={wrapInTemplate({content:campaign.content,previewText:campaign.previewText||undefined,unsubscribeUrl:'#'})}/></section><div className="space-y-5"><ReviewActions id={id} hash={hash} references={refs.map((r,i)=>({id:r.id,label:`approved version ${refs.length-i}`}))}/><section className="card p-5"><h2 className="text-lg font-semibold mb-4">Review history</h2>{!events.length&&<p className="text-sm text-stone-500">No notes yet. Your feedback and approved versions will appear here.</p>}<ol className="space-y-4">{events.map(e=><li key={e.id} className="border-b pb-3 text-sm"><p className="font-medium">{e.author} · {({NOTE:'Note',SUBMIT:'Ready for review',CHANGES:'Changes requested',APPROVE:'Design approved'} as Record<string,string>)[e.action]}</p><p className="text-xs text-stone-500">{e.createdAt.toISOString().replace('T',' ').slice(0,16)} UTC{e.contentHash!==hash?' · Earlier version':''}</p>{e.note&&<p className="whitespace-pre-wrap mt-2 break-words">{e.note}</p>}{e.action==='APPROVE'&&<Link className="underline inline-block mt-2" href={`/campaigns/${id}/references/${e.id}`}>View preserved approved design</Link>}</li>)}</ol></section></div></div>
      <details className="card p-5"><summary className="cursor-pointer text-sm font-medium">Authoring tools</summary><div className="flex flex-wrap gap-3 mt-4"><Link className="btn btn-secondary btn-md min-h-[44px] max-w-full whitespace-normal" href={`/campaigns/${id}/edit`}>Edit draft</Link><Link className="btn btn-secondary btn-md min-h-[44px] max-w-full whitespace-normal" href={`/campaigns/${id}/preview`}>Content checks</Link><DuplicateCampaignButton campaignId={id}/></div><p className="text-xs text-stone-500 mt-3">Sending is a separate workflow and requires separate approval.</p></details>
    </div>
  }

  // Calculate stats
  const total = campaign._count.recipients;
  const opened = campaign.recipients.filter((r) => r.openedAt).length;
  const clicked = campaign.recipients.filter((r) => r.clickedAt).length;
  const bounced = campaign.recipients.filter((r) => r.bouncedAt).length;
  const accepted = campaign.recipients.filter(
    (r) => r.status === "ACCEPTED",
  ).length;
  const delivered = campaign.recipients.filter(
    (r) => r.status === "DELIVERED",
  ).length;
  const failed = campaign.recipients.filter(
    (r) => r.status === "FAILED",
  ).length;
  const suppressed = campaign.recipients.filter(
    (r) => r.status === "SUPPRESSED",
  ).length;
  const unknown = campaign.recipients.filter(
    (r) => r.status === "UNKNOWN",
  ).length;

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <Link
          href="/campaigns"
          className="text-indigo-600 hover:text-indigo-800"
        >
          ← Back to Campaigns
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 justify-between items-start mb-6">
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
          <StatCard
            label="Opened"
            value={opened}
            percent={(opened / total) * 100}
          />
          <StatCard
            label="Clicked"
            value={clicked}
            percent={(clicked / total) * 100}
          />
          <StatCard
            label="Bounced"
            value={bounced}
            percent={(bounced / total) * 100}
            color="red"
          />
          <StatCard label="Suppressed" value={suppressed} color="red" />
          <StatCard label="Failed" value={failed} color="red" />
          <StatCard label="Unknown" value={unknown} color="red" />
        </div>
      )}

      {total > 0 && (
        <p className="mb-6 text-sm text-stone-500">
          Accepted means the provider accepted the message, not that it reached
          an inbox. Opens and clicks are indicative: privacy features and
          security scanners can inflate both. Unknown outcomes are not
          automatically resent.
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Email Preview */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Email Preview
          </h2>
          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="mb-4 pb-4 border-b">
              <p className="text-sm text-gray-500">
                From: {campaign.fromName} &lt;{campaign.fromEmail}&gt;
              </p>
              <p className="text-sm text-gray-500">
                Replies go to: {campaign.replyToEmail || campaign.fromEmail}
              </p>
              <p className="text-sm text-gray-500">
                Subject: {campaign.subject}
              </p>
              {campaign.previewText && (
                <p className="text-sm text-gray-400">
                  Preview: {campaign.previewText}
                </p>
              )}
            </div>
            <EmailPreview
              html={wrapInTemplate({
                content: campaign.content,
                previewText: campaign.previewText || undefined,
                unsubscribeUrl: "#",
              })}
            />
          </div>
        </div>

        {/* Side Panel */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          {["SENT", "COMPLETED", "COMPLETED_WITH_FAILURES"].includes(
              campaign.status,
            ) ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Campaign Sent
              </h2>
              <p className="text-gray-500 text-sm">
                Completed on{" "}
                {campaign.completedAt
                  ? new Date(campaign.completedAt).toLocaleString()
                  : campaign.sentAt
                    ? new Date(campaign.sentAt).toLocaleString()
                    : "Unknown"}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                {(campaign.frozenRecipientCount || total).toLocaleString()}{" "}
                frozen recipients
              </p>
              <div className="mt-4">
                <CampaignControls
                  campaignId={campaign.id}
                  status={campaign.status}
                />
              </div>
            </>
          ) : campaign.status === "SCHEDULED" && campaign.scheduledAt ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Scheduled Campaign
              </h2>
              <CancelCampaignButton
                campaignId={campaign.id}
                scheduledAt={campaign.scheduledAt}
                recipientCount={total}
              />
              <div className="mt-4">
                <CampaignControls
                  campaignId={campaign.id}
                  status={campaign.status}
                />
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Status: {campaign.status}
              </h2>
              <p className="text-gray-500 text-sm">
                {campaign.scheduledAt &&
                  `Scheduled for ${new Date(campaign.scheduledAt).toLocaleString()}`}
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Frozen recipients:{" "}
                {(campaign.frozenRecipientCount || total).toLocaleString()}
              </p>
              {campaign.approvedAt && (
                <p className="text-gray-500 text-sm mt-2">
                  Approved by {campaign.approvedBy || "Unknown"} on{" "}
                  {new Date(campaign.approvedAt).toLocaleString()}
                </p>
              )}
              <div className="mt-4">
                <CampaignControls
                  campaignId={campaign.id}
                  status={campaign.status}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-gray-100 text-gray-800",
    SCHEDULED: "bg-blue-100 text-blue-800",
    QUEUED: "bg-blue-100 text-blue-800",
    SENDING: "bg-yellow-100 text-yellow-800",
    PAUSED: "bg-yellow-100 text-yellow-800",
    COMPLETED: "bg-green-100 text-green-800",
    COMPLETED_WITH_FAILURES: "bg-orange-100 text-orange-800",
    SENT: "bg-green-100 text-green-800",
    CANCELLED: "bg-red-100 text-red-800",
    FAILED: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${styles[status]}`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function StatCard({
  label,
  value,
  percent,
  color = "indigo",
}: {
  label: string;
  value: number;
  percent?: number;
  color?: string;
}) {
  const colorClasses = color === "red" ? "text-red-600" : "text-indigo-600";
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900">
        {value.toLocaleString()}
      </p>
      {percent !== undefined && (
        <p className={`text-sm ${colorClasses}`}>{percent.toFixed(1)}%</p>
      )}
    </div>
  );
}
