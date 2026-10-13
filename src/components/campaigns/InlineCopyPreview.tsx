'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CopyField } from '@/lib/campaign-copy'
import { rebaseCopy } from '@/lib/campaign-copy-rebase'

type Props = { id:string; hash:string; subject:string; previewText:string; fields:CopyField[]; document:string }
export function InlineCopyPreview(initial:Props) {
 const [props,setBase]=useState(initial)
 const router=useRouter()
 const frame=useRef<HTMLIFrameElement>(null)
 const cleanup=useRef<()=>void>(()=>{})
 const originalDOM=useRef(new WeakMap<HTMLElement,string>())
 const pendingValues=useRef<Record<string,string>>({})
 const [stale,setStale]=useState(false)
 const [subject,setSubject]=useState(props.subject),[preview,setPreview]=useState(props.previewText)
 const [values,setValues]=useState<Record<string,string>>({})
 const [mobile,setMobile]=useState(false),[revision,setRevision]=useState(0)
 const [busy,setBusy]=useState(false),[active,setActive]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState('')
 const dirty=subject!==props.subject||preview!==props.previewText||props.fields.some(f=>values[f.id]!==undefined&&values[f.id]!==f.text)
 useEffect(()=>{
  window.dispatchEvent(new CustomEvent('campaign-copy-editing',{detail:active||dirty||busy}))
  return ()=>{window.dispatchEvent(new CustomEvent('campaign-copy-editing',{detail:false}))}
 },[active,dirty,busy])

 useEffect(()=>{frame.current?.contentDocument?.querySelectorAll<HTMLElement>('[data-crm-copy]').forEach(el=>{el.contentEditable=busy?'false':'plaintext-only'})},[busy])
 useEffect(()=>{
  if(!dirty)return
  const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''}
  const navigate=(e:MouseEvent)=>{if((e.target as Element).closest?.('a[href]:not([download])')&&!window.confirm('Discard your unsaved text changes?')){e.preventDefault();e.stopPropagation()}}
  window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate,true)
  return ()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true)}
 },[dirty])
 const attach=useCallback(()=> {
  cleanup.current()
  const doc=frame.current?.contentDocument
  if(!doc)return
  const known=new Map(props.fields.map(f=>[f.id,f]))
  doc.querySelectorAll<HTMLElement>('[data-crm-copy]').forEach(el=>{
   const field=known.get(el.dataset.crmCopy||'')
   if(!field){el.removeAttribute('data-crm-copy');return}
   if(!originalDOM.current.has(el)){originalDOM.current.set(el,el.innerText.replace(/\r\n?/g,'\n'));if(pendingValues.current[field.id]!==undefined)el.innerText=pendingValues.current[field.id]}
   el.contentEditable='plaintext-only';el.tabIndex=0;el.setAttribute('role','textbox');el.setAttribute('aria-multiline','true');el.setAttribute('aria-label',field.label)
  })
  const fieldFor=(target:EventTarget|null)=>{const node=target as Node|null;return (node?.nodeType===3?node.parentElement:node as Element)?.closest?.<HTMLElement>('[data-crm-copy]')}
  const focus=()=>{setActive(true);setSaved(false)}
  const input=()=>{
   const current:Record<string,string>={}
   doc.querySelectorAll<HTMLElement>('[data-crm-copy]').forEach(el=>{
    const id=el.dataset.crmCopy||'';const text=el.innerText.replace(/\r\n?/g,'\n')
    if(known.has(id)&&text!==originalDOM.current.get(el))current[id]=text
   })
   pendingValues.current=current;setValues(current);setSaved(false)
  }
  const click=(e:Event)=>{if((e.target as Element).closest?.('a'))e.preventDefault()}
  const paste=(event:Event)=>{
   const e=event as ClipboardEvent;const el=fieldFor(e.target)
   if(!el)return
   e.preventDefault()
   doc.execCommand('insertText',false,e.clipboardData?.getData('text/plain')||'')
   input()
  }
  const drop=(e:Event)=>e.preventDefault()
  const Observer=(doc.defaultView as Window & typeof globalThis).MutationObserver
  const observer=new Observer(input)
  doc.querySelectorAll('[data-crm-copy]').forEach(el=>observer.observe(el,{childList:true,characterData:true,subtree:true}))
  doc.addEventListener('focusin',focus);doc.addEventListener('input',input);doc.addEventListener('click',click,true);doc.addEventListener('paste',paste);doc.addEventListener('drop',drop)
  cleanup.current=()=>{observer.disconnect();doc.removeEventListener('focusin',focus);doc.removeEventListener('input',input);doc.removeEventListener('click',click,true);doc.removeEventListener('paste',paste);doc.removeEventListener('drop',drop)}
 },[props.fields])
 useEffect(()=>{attach();return ()=>cleanup.current()},[attach])
 function cancel() {
  if(dirty&&!window.confirm('Discard your unsaved text changes?'))return
  pendingValues.current={};setSubject(props.subject);setPreview(props.previewText);setValues({});setError('');setActive(false);setSaved(false);setRevision(v=>v+1)
 }
 async function save() {
  setBusy(true);setError('')
  // Read the actual DOM as well: a final keystroke must not race a React update.
  const current={...values}
  frame.current?.contentDocument?.querySelectorAll<HTMLElement>('[data-crm-copy]').forEach(el=>{if(el.innerText.replace(/\r\n?/g,'\n')!==originalDOM.current.get(el))current[el.dataset.crmCopy!]=el.innerText.replace(/\r\n?/g,'\n')})
  pendingValues.current=current;setValues(current)
  try {
   const response=await fetch(`/api/campaigns/${props.id}/copy`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({contentHash:props.hash,subject,previewText:preview,edits:props.fields.flatMap(f=>current[f.id]!==undefined&&current[f.id]!==f.text?[{id:f.id,text:current[f.id]}]:[])})})
   const data=await response.json()
   if(!response.ok){setStale(data.code==='STALE_COPY');throw Error(data.error||'Unable to save text')}
   setSaved(true);setActive(false);router.refresh()
  } catch(e) {setError(e instanceof TypeError?'Could not save. Check your connection and try again.':e instanceof Error?e.message:'Unable to save text')} finally {setBusy(false)}
 }
 async function recover() {
  setBusy(true);setError('')
  try {
   const response=await fetch(`/api/campaigns/${props.id}/copy`,{cache:'no-store'})
   const latest=await response.json()
   if(!response.ok)throw Error(latest.error||'Could not load latest draft')
   const merged=rebaseCopy(props,latest,subject,preview,pendingValues.current)
   if(merged.conflicts.length)throw Error(`Both versions changed: ${merged.conflicts.join(', ')}. Download your unsaved text below before reloading; these edits cannot be merged safely.`)
   pendingValues.current=merged.values;setValues(merged.values);setSubject(merged.subject);setPreview(merged.preview)
   setBase({...latest,id:props.id});setRevision(v=>v+1);setStale(false);setSaved(false);setActive(true)
  } catch(e){setError(e instanceof Error?e.message:'Could not load latest draft')} finally{setBusy(false)}
 }
 function download() {
  const text=[`Subject: ${subject}`,`Inbox preview: ${preview}`,...props.fields.map(f=>`${f.label}:\n${pendingValues.current[f.id]??f.text}`)].join('\n\n')
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='unsaved-email-copy.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
 }
 return <div className="space-y-4">
  <div><h2 className="font-semibold text-lg">Edit the email preview</h2><p className="text-sm text-stone-600">Click any words below and type. Images, design and link destinations stay in place.</p></div>
  <div className="sticky top-0 z-10 bg-white border-b py-3 flex flex-wrap items-center gap-2">
   <button type="button" className="btn btn-primary btn-md min-h-[44px]" disabled={busy||!dirty||saved} onClick={save}>{busy?'Saving…':'Save text'}</button>
   <button type="button" className="btn btn-secondary btn-md min-h-[44px]" disabled={busy} onClick={cancel}>Cancel</button>
   <span role="status" className="text-sm text-stone-600">{saved?'Text saved. Nothing was sent.':dirty?'Unsaved changes':'Click text to edit'}</span>
  </div>
  {error&&<div className="rounded border border-red-300 bg-red-50 p-3 space-y-2"><p role="alert" className="text-red-700">{error} Your changes are still here; nothing was saved.</p>{stale&&<button type="button" disabled={busy} className="btn btn-secondary btn-md" onClick={recover}>Load latest and keep my edits</button>}<button type="button" className="btn btn-secondary btn-md" onClick={download}>Download unsaved text</button></div>}
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
