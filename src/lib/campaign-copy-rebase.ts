import type { CopyField } from './campaign-copy'
export type CopyVersion = { hash:string; subject:string; previewText:string; fields:CopyField[]; document:string }
// Only carry edits where the original text still exists uniquely. Never infer a
// changed field from its offset: formatting edits can move every source offset.
export function rebaseCopy(old:CopyVersion, latest:CopyVersion, subject:string, preview:string, values:Record<string,string>) {
 const conflicts:string[]=[];const edits:Record<string,string>={};const destinations=new Set<string>()
 const merge=(label:string,before:string,mine:string,current:string)=>{
  if(mine===before)return current
  if(current===before||current===mine)return mine
  conflicts.push(label);return mine
 }
 const nextSubject=merge('Subject',old.subject,subject,latest.subject)
 const nextPreview=merge('Inbox preview',old.previewText,preview,latest.previewText)
 for(const field of old.fields){
  const mine=values[field.id]
  if(mine===undefined||mine===field.text)continue
  const candidates=latest.fields.filter(f=>f.text===field.text)
  if(old.fields.filter(f=>f.text===field.text).length===1&&candidates.length===1&&!destinations.has(candidates[0].id)){
   destinations.add(candidates[0].id);edits[candidates[0].id]=mine;continue
  }
  // Finding the desired words elsewhere is not proof that this field saved.
  // Without unique unchanged source text, require manual reconciliation.
  conflicts.push(field.label)
 }
 return {subject:nextSubject,preview:nextPreview,values:edits,conflicts}
}
