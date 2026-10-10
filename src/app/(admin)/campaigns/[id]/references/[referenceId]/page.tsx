import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EmailPreview } from '@/components/campaigns/EmailPreview'
import type { reviewSnapshot } from '@/lib/campaign-review'
export const dynamic='force-dynamic'
export default async function Reference({params}:{params:Promise<{id:string;referenceId:string}>}) {
 const {id,referenceId}=await params
 const r=await prisma.campaignReview.findFirst({where:{id:referenceId,campaignId:id,action:'APPROVE'}})
 if(!r?.snapshot)notFound()
 const s=r.snapshot as unknown as ReturnType<typeof reviewSnapshot>
 return <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-5"><Link href={`/campaigns/${id}`} className="underline">← Review workspace</Link><h1 className="text-2xl font-semibold">Approved design reference</h1><p className="text-sm text-stone-600">Layout and copy preserved at design approval by {r.author}. This is not permission to send.</p><section className="card p-5"><h2 className="font-semibold">{s.name}</h2><p>Subject: {s.subject}</p><p>Preview: {s.previewText}</p><p>From: {s.fromName} · {s.fromEmail}</p><p>Replies: {s.replyToEmail||s.fromEmail}</p></section><p className="text-xs text-stone-500">Images load from their original web addresses and may change if those files are replaced.</p><EmailPreview html={s.previewHtml}/></div>
}
