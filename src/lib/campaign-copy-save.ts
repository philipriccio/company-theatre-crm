import { prisma } from './db'
import { reviewHash } from './campaign-review'
import { patchCopy } from './campaign-copy'
export async function saveCampaignCopy(id:string,body:Record<string,unknown>) {
 if(typeof body.subject!=='string'||!body.subject.trim()||body.subject.length>200||/[\r\n]/.test(body.subject))throw Error('Enter a subject of 1–200 characters on one line')
 if(typeof body.previewText!=='string'||body.previewText.length>300||/[\r\n]/.test(body.previewText))throw Error('Enter inbox preview text of at most 300 characters on one line')
 const subject=body.subject.trim(),previewText=body.previewText
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id=${id} FOR UPDATE`
  const c=await tx.campaign.findUnique({where:{id}})
  if(!c||c.status!=='DRAFT')throw Error('Only drafts can be edited. Create a copy first.')
  if(reviewHash(c)!==body.contentHash)throw Error('This draft changed since you opened it. Your edits have not been saved. Copy your text, then reload to review the latest version.')
  if(c.design!==null)throw Error('This draft uses the visual editor. Open Authoring tools → Edit draft to change its text.')
  const content=patchCopy(c.content,body.edits,previewText)
  const updated=await tx.campaign.update({where:{id},data:{subject,previewText,content}})
  return {contentHash:reviewHash(updated)}
 })
}
