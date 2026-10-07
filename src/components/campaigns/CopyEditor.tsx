'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CopyField } from '@/lib/campaign-copy'
type Props={id:string;hash:string;subject:string;previewText:string;fields:CopyField[];structured:boolean}
export function CopyEditor(props:Props) {
 const [open,setOpen]=useState(false),[saved,setSaved]=useState(false)
 useEffect(()=>{window.dispatchEvent(new CustomEvent('campaign-copy-editing',{detail:open}));return ()=>{window.dispatchEvent(new CustomEvent('campaign-copy-editing',{detail:false}))}},[open])
 return <section className="card p-4 sm:p-5 space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-lg">Make it your own</h2><p className="text-sm text-stone-600">Edit the words directly. The design, images and links stay in place.</p></div>{!open&&(props.structured?<a className="btn btn-primary btn-md min-h-[44px] max-w-full whitespace-normal text-center" href={`/campaigns/${props.id}/edit`}>Edit text in visual editor</a>:<button className="btn btn-primary btn-md min-h-[44px] max-w-full whitespace-normal text-center" onClick={()=>{setSaved(false);setOpen(true)}}>Edit text</button>)}</div>
  {saved&&<p role="status" className="text-sm text-emerald-700">Text saved. The preview below is updated. Nothing was sent.</p>}
  {open&&<EditForm key={props.hash} {...props} onClose={()=>setOpen(false)} onSaved={()=>{setOpen(false);setSaved(true)}}/>}
 </section>
}
function EditForm({id,hash,subject:initialSubject,previewText:initialPreview,fields,onClose,onSaved}:Props&{onClose:()=>void;onSaved:()=>void}) {
 const router=useRouter()
 const [subject,setSubject]=useState(initialSubject),[previewText,setPreview]=useState(initialPreview)
 const [values,setValues]=useState(()=>fields.map(f=>f.text)),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const dirty=subject!==initialSubject||previewText!==initialPreview||values.some((v,i)=>v!==fields[i].text)
 useEffect(()=>{
  if(!dirty)return
  function unload(e:BeforeUnloadEvent){e.preventDefault();e.returnValue=''}
  function navigate(e:MouseEvent){const a=(e.target as Element).closest?.('a');if(a&&a.href&&!window.confirm('Discard your unsaved text changes?')){e.preventDefault();e.stopPropagation()}}
  window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate,true)
  return ()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true)}
 },[dirty])
 async function save(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('')
  try {
   const r=await fetch(`/api/campaigns/${id}/copy`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({contentHash:hash,subject,previewText,edits:fields.flatMap((f,i)=>values[i]!==f.text?[{id:f.id,text:values[i]}]:[])})})
   const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to save text')
   onSaved();router.refresh()
  }catch(e){setError(e instanceof TypeError?'Could not save. Check your connection and try again.':e instanceof Error?e.message:'Unable to save text')}finally{setBusy(false)}
 }
 return <form onSubmit={save} className="space-y-5 border-t pt-4">
  <div className="sticky top-0 z-10 bg-white border-b py-3 flex flex-wrap items-center gap-3"><button className="btn btn-primary btn-md min-h-[44px] max-w-full whitespace-normal text-center" disabled={busy||!dirty}>{busy?'Saving…':'Save text'}</button><button type="button" className="btn btn-secondary btn-md min-h-[44px] max-w-full whitespace-normal text-center" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Discard your unsaved text changes?'))onClose()}}>Cancel</button><span role="status" className="text-sm text-stone-600">{dirty?'Unsaved changes':'No changes yet'}</span></div>
  {error&&<p role="alert" className="text-red-700 whitespace-pre-wrap">{error} Your text is still in this form.</p>}
  <fieldset disabled={busy} className="space-y-5 min-w-0">
   <label className="block text-sm font-medium">Subject<input autoFocus className="input mt-2 w-full" value={subject} maxLength={200} required onChange={e=>setSubject(e.target.value)}/></label>
   <label className="block text-sm font-medium">Inbox preview<input className="input mt-2 w-full" value={previewText} maxLength={300} onChange={e=>setPreview(e.target.value)}/></label>
   <p className="text-sm text-stone-600">Email text, from top to bottom. Enter starts a new line. Existing emphasis is kept where possible; check the preview after saving. Editing does not change any saved approved reference.</p>
   {fields.map((f,i)=><label key={f.id} className="block text-sm font-medium">{f.label}<textarea className="input mt-2 w-full leading-relaxed" rows={Math.max(2,Math.min(6,Math.ceil(values[i].length/65)+values[i].split('\n').length-1))} value={values[i]} maxLength={10000} onChange={e=>setValues(v=>v.map((text,j)=>j===i?e.target.value:text))}/></label>)}
  </fieldset>
  <div className="flex flex-wrap gap-3"><button className="btn btn-primary btn-md min-h-[44px] max-w-full whitespace-normal text-center" disabled={busy||!dirty}>{busy?'Saving…':'Save text'}</button><button type="button" className="btn btn-secondary btn-md min-h-[44px] max-w-full whitespace-normal text-center" disabled={busy} onClick={()=>{if(!dirty||window.confirm('Discard your unsaved text changes?'))onClose()}}>Cancel</button></div>
 </form>
}
