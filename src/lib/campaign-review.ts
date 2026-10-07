import { createHash } from 'node:crypto'
import { Prisma, type Campaign } from '@prisma/client'
import { prisma } from './db'
import { wrapInTemplate } from './email-template'

export function reviewSnapshot(c: Pick<Campaign, 'name'|'subject'|'fromName'|'fromEmail'|'replyToEmail'|'previewText'|'content'|'design'>) {
  return { name:c.name, subject:c.subject, fromName:c.fromName, fromEmail:c.fromEmail, replyToEmail:c.replyToEmail, previewText:c.previewText, content:c.content, design:c.design,
    previewHtml:wrapInTemplate({content:c.content,previewText:c.previewText||undefined,unsubscribeUrl:'#'}) }
}
export function reviewHash(c: Parameters<typeof reviewSnapshot>[0]) {
  return createHash('sha256').update(JSON.stringify(reviewSnapshot(c))).digest('hex')
}
export function reviewState(events: {action:string;contentHash:string}[], hash:string) {
  const decision=events.find(e=>e.action!=='NOTE')
  if(!decision || decision.contentHash!==hash) return 'Draft'
  return ({SUBMIT:'Awaiting review',CHANGES:'Changes requested',APPROVE:'Design approved'} as Record<string,string>)[decision.action]||'Draft'
}
export async function recordReview(id:string, body:Record<string,unknown>) {
  const {action,contentHash}=body
  if(!['NOTE','SUBMIT','CHANGES','APPROVE','COPY'].includes(String(action))) throw Error('Choose a valid review action')
  const author=typeof body.author==='string'?body.author.trim():''
  const note=typeof body.note==='string'?body.note.trim():''
  if(action!=='COPY' && (!author || author.length>100 || note.length>5000)) throw Error('Enter your name and a note of at most 5,000 characters')
  if(['NOTE','CHANGES'].includes(String(action))&&!note) throw Error('Add your notes first')
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id=${id} FOR UPDATE`
    const c=await tx.campaign.findUnique({where:{id}})
    if(!c) throw Error('Campaign not found')
    if(action==='COPY') {
      if(typeof body.referenceId!=='string') throw Error('Choose an approved reference')
      const ref=await tx.campaignReview.findFirst({where:{id:body.referenceId,campaignId:id,action:'APPROVE'}})
      if(!ref?.snapshot) throw Error('Approved reference not found')
      const s=ref.snapshot as unknown as ReturnType<typeof reviewSnapshot>
      const draft=await tx.campaign.create({data:{name:`${s.name} (Copy)`,subject:s.subject,fromName:s.fromName,fromEmail:s.fromEmail,replyToEmail:s.replyToEmail,previewText:s.previewText,content:s.content,design:s.design??Prisma.DbNull,status:'DRAFT'}})
      return {id:draft.id}
    }
    if(c.status!=='DRAFT') throw Error('Only drafts can be reviewed; create a copy first')
    const hash=reviewHash(c)
    if(contentHash!==hash) throw Error('This draft changed since you opened it. Reload and review the latest version.')
    if(action==='APPROVE'&&(!c.subject.trim()||!c.content.trim())) throw Error('Add the subject and email design before approval')
    await tx.campaignReview.create({data:{campaignId:id,contentHash:hash,action:String(action),author,note,snapshot:action==='APPROVE'?JSON.parse(JSON.stringify(reviewSnapshot(c))):Prisma.DbNull}})
    return {success:true}
  })
}
