'use client'
import { useEffect, useState } from 'react'
type Event={id:string;userId:string|null;actorType:string;actorLabel:string;kind:string;outcome:string;resourceId:string|null;createdAt:string}
type Alert={id:string;eventId:string;rule:string;reason:string;reviewedAt:string|null;reviewerName:string|null;createdAt:string}
type Data={events:Event[];alerts:Alert[];startedAt:string|null;next:string|null}
const time=(value:string)=>`${new Date(value).toLocaleString()} (${new Date(value).toISOString()})`
export default function SecurityHistory(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[query,setQuery]=useState(''),[busy,setBusy]=useState(true),[revision,setRevision]=useState(0)
 function refresh(){setBusy(true);setError('');setData(null);setRevision(v=>v+1)}
 useEffect(()=>{const controller=new AbortController()
 fetch(`/api/security-history?${query}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error||'History could not be loaded.');if(!controller.signal.aborted)setData(body)}).catch(error=>{if(!controller.signal.aborted)setError(error.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)})
 return()=>controller.abort()},[query,revision])
 async function review(id:string){setBusy(true);setError('');try{const r=await fetch('/api/security-history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});const b=await r.json();if(!r.ok)throw Error(b.error||'Review was not saved.');refresh()}catch(e){setError(e instanceof Error?e.message:'Review was not saved.');setBusy(false)}}
 return <section style={{padding:'clamp(16px,4vw,40px)',maxWidth:1200,overflowWrap:'anywhere'}}>
  <h1 className="text-3xl font-semibold mb-3">Security history</h1>
  <p className="mb-3">Who did what, when, and whether it succeeded. Times show your browser timezone followed by UTC.</p>
  <p className="mb-5 text-sm">New monitoring starts {data?.startedAt?time(data.startedAt):'when this release is activated'}. Older entries are partial and unverified. Exports record initiation, not proof of download. This is application activity—not server, AWS or mailbox history.</p>
  <p className="mb-3 text-sm">Filters below apply to events; alerts remain visible above the results.</p><a href="#security-events" className="underline inline-block mb-3">Jump to events</a>
  <form onSubmit={e=>{e.preventDefault();const p=new URLSearchParams();new FormData(e.currentTarget).forEach((v,k)=>{if(String(v))p.set(k,String(v))});setQuery(p.toString());refresh()}} className="flex flex-wrap gap-3 mb-4">
   <label>Outcome<select name="outcome" className="block border rounded p-2"><option value="">All outcomes</option>{['success','failure','attempt','unknown'].map(x=><option key={x}>{x}</option>)}</select></label>
   <label>Event<input name="kind" placeholder="e.g. login_failed" maxLength={80} className="block border rounded p-2 w-44"/></label>
   <label>Actor ID<input name="actor" placeholder="Exact ID" maxLength={128} className="block border rounded p-2 w-44"/></label>
   <label>Since (UTC)<input type="date" name="since" className="block border rounded p-2 max-w-full"/></label>
   <button disabled={busy} className="border rounded p-2 self-end">Apply filters</button>
  </form>
  <button disabled={busy} onClick={refresh} className="border rounded p-2 mb-4">Refresh</button>
  {error&&<p role="alert" className="p-3 bg-red-50 text-red-800 mb-4">{error} Use Refresh to retry.</p>}
  {busy&&<p role="status">Loading…</p>}
  {data&&<><h2 className="text-xl font-semibold mb-2">Activity to review</h2><p className="text-sm mb-3">Latest 50 alerts, unreviewed first. Rules flag sensitive changes and 5 repeated failures, denials or exports within 15 minutes. Alerts are signals, not proof of compromise. Reviewing acknowledges an alert; it does not remove evidence.</p>
   {!data.alerts.length&&<p>No alerts recorded. This does not establish that all activity was safe.</p>}
   <div className="grid gap-3 mb-6">{data.alerts.map(a=><article key={a.id} className="border rounded p-3"><strong>{a.rule.replaceAll('-',' ').replaceAll('_',' ')}</strong><p>{a.reason}</p><small>{time(a.createdAt)} · Evidence event: {a.eventId}</small><div><button className="underline py-2" disabled={busy} onClick={()=>{setQuery(new URLSearchParams({eventId:a.eventId}).toString());refresh()}}>View evidence event</button></div>{a.reviewedAt?<p>Reviewed by {a.reviewerName} · {time(a.reviewedAt)}</p>:<div><button disabled={busy} className="border rounded px-3 py-2 mt-2" onClick={()=>review(a.id)}>Mark reviewed</button></div>}</article>)}</div>
   <h2 id="security-events" className="text-xl font-semibold mb-3">Events</h2>{new URLSearchParams(query).has('eventId')&&<p className="mb-3">Showing one alert’s evidence event. <button className="underline" onClick={()=>{setQuery('');refresh()}}>Show all events</button></p>}
   {!data.events.length&&<p>No events match these filters.</p>}
   <div className="grid gap-3">{data.events.map(e=><article key={e.id} className="border rounded p-3"><strong>{e.kind.replaceAll('_',' ')}</strong> <span>— {e.outcome}</span><p>{e.actorLabel} · {e.actorType}{e.userId?` · ${e.userId}`:''}</p><p className="text-sm">{time(e.createdAt)}</p>{e.resourceId&&<p>Resource: {e.resourceId}</p>}<small>Event ID: {e.id}</small>{e.userId&&<div><button className="underline py-2" disabled={busy} onClick={()=>{setQuery(new URLSearchParams({actor:e.userId!}).toString());refresh()}}>View this actor’s activity</button></div>}</article>)}</div>
   {data.next&&<button disabled={busy} className="border rounded p-3 mt-4" onClick={()=>{const p=new URLSearchParams(query);p.set('before',data.next!);setQuery(p.toString());refresh()}}>Older events</button>}
  </>}
 </section>
}
