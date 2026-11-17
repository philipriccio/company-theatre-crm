import { createHash } from 'node:crypto'

export interface SendApproval {
  reference: string
  approvedBy: string
  updatedAt: string
  contentSha256: string
  audienceSha256: string
  recipientCount: number
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
/** Hash every delivery-affecting saved field, not only HTML. */
export function campaignSendFingerprint(c: {subject:string;content:string;previewText:string|null;fromName:string;fromEmail:string;replyToEmail:string|null;audienceMode:string|null;audienceTagIds:string[];audienceExcludeTagIds:string[]}) {
  return digest([c.subject,c.content,c.previewText,c.fromName,c.fromEmail,c.replyToEmail,c.audienceMode,[...c.audienceTagIds].sort(),[...c.audienceExcludeTagIds].sort()])
}
/** Exact identities and addresses: a count alone must not approve a different audience. */
export function audienceSendFingerprint(contacts: {id:string;email:string}[]) {
  return digest(contacts.map(c=>[c.id,c.email.toLowerCase()]).sort((a,b)=>a[0].localeCompare(b[0])))
}
export function parseSendApproval(value: unknown): SendApproval {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Explicit send approval evidence is required')
  const v=value as Record<string,unknown>
  if (typeof v.reference !== 'string' || !/^[a-zA-Z0-9:_-]{1,200}$/.test(v.reference) ||
      typeof v.approvedBy !== 'string' || !v.approvedBy.trim() || v.approvedBy.length>200 ||
      typeof v.updatedAt !== 'string' || !Number.isFinite(Date.parse(v.updatedAt)) ||
      typeof v.contentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.contentSha256) ||
      typeof v.audienceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.audienceSha256) ||
      !Number.isSafeInteger(v.recipientCount) || Number(v.recipientCount)<1) throw Error('Invalid send approval evidence')
  return v as unknown as SendApproval
}
