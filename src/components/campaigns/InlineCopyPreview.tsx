'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CopyField } from '@/lib/campaign-copy'

type Props = { id:string; hash:string; subject:string; previewText:string; fields:CopyField[]; document:string }
export function InlineCopyPreview(props:Props) {
 const router=useRouter()
 const frame=useRef<HTMLIFrameElement>(null)
 const cleanup=useRef<()=>void>(()=>{})
 const [subject,setSubject]=useState(props.subject),[preview,setPreview]=useState(props.previewText)
 const [values,setValues]=useState<Record<string,string>>({})
 const [mobile,setMobile]=useState(false),[revision,setRevision]=useState(0)
 const [busy,setBusy]=useState(false),[active,setActive]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('')
 const dirty=subject!==props.subject||preview!==props.previewText||props.fields.some(f=>values[f.id]!==undefined&&values[f.id]!==f.text)
 useEffect(()=>{
  window.dispatchEvent(new CustomEvent('campaign-copy-editing',{detail:active||dirty||busy}))
  return ()=>{window.dispatchEvent(new CustomEvent('campaign-copy-editing',{detail:false}))}
 },[active,dirty,busy])
 useEffect(()=>()=>cleanup.current(),[])
 useEffect(()=>{frame.current?.contentDocument?.querySelectorAll<HTMLElement>('[data-crm-copy]').forEach(el=>{el.contentEditable=busy?'false':'plaintext-only'})},[busy])
 useEffect(()=>{
  if(!dirty)return
  const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''}
  const navigate=(e:MouseEvent)=>{if((e.target as Element).closest?.('a[href]')&&!window.confirm('Discard your unsaved text changes?')){e.preventDefault();e.stopPropagation()}}
  window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate,true)
  return ()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true)}
 },[dirty])
 function attach() {
  cleanup.current()
  const doc=frame.current?.contentDocument
  if(!doc)return
  const known=new Map(props.fields.map(f=>[f.id,f]))
  doc.querySelectorAll<HTMLElement>('[data-crm-copy]').forEach(el=>{
   const field=known.get(el.dataset.crmCopy||'')
   if(!field){el.removeAttribute('data-crm-copy');return}
   el.contentEditable='plaintext-only';el.tabIndex=0;el.setAttribute('role','textbox');el.setAttribute('aria-multiline','true');el.setAttribute('aria-label',field.label)
  })
  const fieldFor=(target:EventTarget|null)=>(target as Element)?.closest?.<HTMLElement>('[data-crm-copy]')
  const focus=()=>{setActive(true);setSaved(false)}
  const input=(e:Event)=>{
   const el=fieldFor(e.target)
   if(el&&known.has(el.dataset.crmCopy||''))setValues(v=>({...v,[el.dataset.crmCopy!]:el.innerText.replace(/\r\n?/g,'\n')}))
  }
  const click=(e:Event)=>{if((e.target as Element).closest?.('a'))e.preventDefault()}
  const paste=(event:Event)=>{
   const e=event as ClipboardEvent;const el=fieldFor(e.target)
   if(!el)return
   e.preventDefault()
   doc.execCommand('insertText',false,e.clipboardData?.getData('text/plain')||'')
   input(e)
  }
  const drop=(e:Event)=>e.preventDefault()
  doc.addEventListener('focusin',focus);doc.addEventListener('input',input);doc.addEventListener('click',click,true);doc.addEventListener('paste',paste);doc.addEventListener('drop',drop)
  cleanup.current=()=>{doc.removeEventListener('focusin',focus);doc.removeEventListener('input',input);doc.removeEventListener('click',click,true);doc.removeEventListener('paste',paste);doc.removeEventListener('drop',drop)}
 }
 function cancel() {
  if(dirty&&!window.confirm('Discard your unsaved text changes?'))return
  setSubject(props.subject);setPreview(props.previewText);setValues({});setError('');setActive(false);setSaved(false);setRevision(v=>v+1)
 }
 async function save() {
  setBusy(true);setError('')
  // Read the actual DOM as well: a final keystroke must not race a React update.
  const current={...values}
  frame.current?.contentDocument?.querySelectorAll<HTMLElement>('[data-crm-copy]').forEach(el=>{if(Object.hasOwn(current,el.dataset.crmCopy!))current[el.dataset.crmCopy!]=el.innerText.replace(/\r\n?/g,'\n')})
  try {
   const response=await fetch(`/api/campaigns/${props.id}/copy`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({contentHash:props.hash,subject,previewText:preview,edits:props.fields.flatMap(f=>current[f.id]!==undefined&&current[f.id]!==f.text?[{id:f.id,text:current[f.id]}]:[])})})
   const data=await response.json()
   if(!response.ok)throw Error(data.error||'Unable to save text')
   setSaved(true);setActive(false);router.refresh()
  } catch(e) {setError(e instanceof TypeError?'Could not save. Check your connection and try again.':e instanceof Error?e.message:'Unable to save text')} finally {setBusy(false)}
 }
 return <div className="space-y-4">
  <div><h2 className="font-semibold text-lg">Edit the email preview</h2><p className="text-sm text-stone-600">Click any words below and type. Images, design and link destinations stay in place.</p></div>
  <div className="sticky top-0 z-10 bg-white border-b py-3 flex flex-wrap items-center gap-2">
   <button type="button" className="btn btn-primary btn-md min-h-[44px]" disabled={busy||!dirty||saved} onClick={save}>{busy?'Saving…':'Save text'}</button>
   <button type="button" className="btn btn-secondary btn-md min-h-[44px]" disabled={busy} onClick={cancel}>Cancel</button>
   <span role="status" className="text-sm text-stone-600">{saved?'Text saved. Nothing was sent.':dirty?'Unsaved changes':'Click text to edit'}</span>
  </div>
  {error&&<p role="alert" className="text-red-700">{error} Your changes are still here.</p>}
  <fieldset disabled={busy} className="space-y-3 min-w-0">
   <label className="block text-sm font-medium">Subject<input className="input mt-1 w-full" value={subject} maxLength={200} onFocus={()=>setActive(true)} onChange={e=>{setSaved(false);setSubject(e.target.value)}}/></label>
   <label className="block text-sm font-medium">Inbox preview<input className="input mt-1 w-full" value={preview} maxLength={300} onFocus={()=>setActive(true)} onChange={e=>{setSaved(false);setPreview(e.target.value)}}/></label>
  </fieldset>
  <div className="flex gap-2"><button type="button" className="btn btn-secondary btn-md" aria-pressed={!mobile} onClick={()=>setMobile(false)}>Desktop</button><button type="button" className="btn btn-secondary btn-md" aria-pressed={mobile} onClick={()=>setMobile(true)}>Mobile</button></div>
  <p className="text-xs text-stone-500">Tab through text areas to edit with the keyboard. Links are disabled. Browser preview only; inbox rendering needs separate testing.</p>
  <div className="bg-stone-100 p-2 sm:p-4 rounded-xl relative">
   {busy&&<div className="absolute inset-0 z-10" aria-hidden="true"/>}
   <iframe key={revision} ref={frame} title="Editable email preview" sandbox="allow-same-origin" srcDoc={props.document} onLoad={attach} tabIndex={busy?-1:0} className="bg-white border-0 mx-auto max-w-full" style={{width:mobile?375:680,height:760,pointerEvents:busy?'none':undefined}}/>
  </div>
 </div>
}
