export type Party = 'TCT' | 'MIRVISH' | 'UNASSIGNED'
export type Budget = { id:string; category:string; label:string; amountCents:number|null; sourceRow:number }
export type Expense = { kind:'ACCRUED'|'COMMITTED'; id:string; lineId:string; vendor:string; description:string; party:Party; grossCents:number; taxCents:number|null; dueDate:string|null; receiptStatus:'PENDING'|'HELD'; source:string; archived:boolean }
export type Payment = { id:string; expenseId:string; amountCents:number; date:string|null; payer:Party; status:'PLANNED'|'PAID'; reference:string; archived:boolean }
export type Estimate = { id:string; lineId:string; amountCents:number|null; date:string|null; party:Party; note:string; archived:boolean }
export type Inflow = { id:string; description:string; amountCents:number; date:string|null; party:Party; status:'EXPECTED'|'RECEIVED'; archived:boolean }
export type State = { budget:Budget[]; expenses:Expense[]; payments:Payment[]; estimates:Estimate[]; inflows:Inflow[]; opening:{ amountCents:number|null; date:string|null; party:Party }; currency:'CAD' }
export const emptyState:State = {budget:[],expenses:[],payments:[],estimates:[],inflows:[],opening:{amountCents:null,date:null,party:'TCT'},currency:'CAD'}
export class FinanceError extends Error {constructor(public status:number,message:string){super(message)}}
const bad=(s:string):never=>{throw new FinanceError(400,s)}
const cents=(v:unknown,nullable=false)=>{if(nullable&&v===null)return;if(!Number.isSafeInteger(v)||Number(v)<0||Number(v)>100_000_000_000)bad('Amounts must be nonnegative integer cents within the supported range.')}
const date=(v:unknown)=>{if(v===null)return;if(typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)bad('Use a valid calendar date.')}
const text=(v:unknown,max=1000)=>{if(typeof v!=='string'||v.length>max)bad('Invalid or excessive text.')}
const party=(v:unknown)=>{if(!['TCT','MIRVISH','UNASSIGNED'].includes(String(v)))bad('Choose a responsible party.')}
function canonical(v:unknown):string {if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,value])=>JSON.stringify(k)+':'+canonical(value)).join(',')+'}';return JSON.stringify(v)}
export function validateState(input:unknown,baseline?:Budget[]):State {
 if(!input||typeof input!=='object')bad('Invalid workspace.')
 const s=input as State
 if(s.currency!=='CAD')bad('This workspace uses CAD only.')
 for(const key of ['budget','expenses','payments','estimates','inflows'] as const){if(!Array.isArray(s[key])||s[key].length>5000)bad('Invalid or excessive rows.');const ids=new Set<string>();for(const row of s[key]){if(!row||typeof row!=='object'||typeof row.id!=='string'||! /^[\w-]{1,128}$/.test(row.id)||ids.has(row.id))bad('Every row needs a unique ID.');ids.add(row.id)}}
 if(baseline&&canonical(s.budget)!==canonical(baseline))bad('The original budget is read-only. Record forecast changes separately.')
 for(const b of s.budget){text(b.label);text(b.category);cents(b.amountCents,true);if(!Number.isInteger(b.sourceRow))bad('Budget source row required.')}
 const lines=new Set(s.budget.map(x=>x.id));const activeExpenses=new Map(s.expenses.filter(x=>!x.archived).map(x=>[x.id,x]))
 for(const e of s.expenses){if(!['ACCRUED','COMMITTED'].includes(e.kind))bad('Choose incurred expense or planned commitment.');if(!lines.has(e.lineId))bad('Choose a budget line.');text(e.vendor);text(e.description);text(e.source,4000);party(e.party);cents(e.grossCents);cents(e.taxCents,true);if(e.taxCents!==null&&e.taxCents>e.grossCents)bad('Tax cannot exceed gross.');date(e.dueDate);if(!['PENDING','HELD'].includes(e.receiptStatus))bad('Invalid receipt status.');if(typeof e.archived!=='boolean')bad('Invalid archive flag.')}
 const total=new Map<string,number>()
 for(const p of s.payments){cents(p.amountCents);if(p.amountCents===0)bad('Payment must be greater than zero.');date(p.date);party(p.payer);text(p.reference);if(!['PLANNED','PAID'].includes(p.status))bad('Invalid payment status.');if(p.status==='PAID'&&!p.date)bad('Paid payments require a date.');if(typeof p.archived!=='boolean')bad('Invalid archive flag.');if(!p.archived){if(!activeExpenses.has(p.expenseId))bad('Payments require an active expense.');if(p.status==='PAID'&&activeExpenses.get(p.expenseId)!.kind!=='ACCRUED')bad('Mark the cost incurred before recording payment.');total.set(p.expenseId,(total.get(p.expenseId)||0)+p.amountCents)}}
 for(const [id,n] of total)if(n>activeExpenses.get(id)!.grossCents)bad('Paid plus scheduled instalments cannot exceed the expense gross. Adjust the expense or schedule first.')
 const estimateLines=new Set<string>()
 for(const e of s.estimates){if(!lines.has(e.lineId))bad('Choose a budget line.');cents(e.amountCents,true);date(e.date);party(e.party);text(e.note,4000);if(typeof e.archived!=='boolean')bad('Invalid archive flag.');if(!e.archived){if(estimateLines.has(e.lineId))bad('Keep one active remaining estimate per budget line.');estimateLines.add(e.lineId)}}
 for(const i of s.inflows){text(i.description);cents(i.amountCents);date(i.date);party(i.party);if(!['EXPECTED','RECEIVED'].includes(i.status))bad('Invalid receipt status.');if(i.status==='RECEIVED'&&!i.date)bad('Received cash needs a date.');if(typeof i.archived!=='boolean')bad('Invalid archive flag.')}
 if(!s.opening)bad('Opening balance required.');cents(s.opening.amountCents,true);date(s.opening.date);party(s.opening.party);if(s.opening.amountCents!==null&&!s.opening.date)bad('Opening cash requires an as-of date.')
 return s
}
export function summarize(s:State){
 const expenses=s.expenses.filter(x=>!x.archived),payments=s.payments.filter(x=>!x.archived),estimates=s.estimates.filter(x=>!x.archived)
 const paid=payments.filter(x=>x.status==='PAID').reduce((n,x)=>n+x.amountCents,0),gross=expenses.filter(x=>x.kind==='ACCRUED').reduce((n,x)=>n+x.grossCents,0),committed=expenses.filter(x=>x.kind==='COMMITTED').reduce((n,x)=>n+x.grossCents,0)
 const lines=s.budget.map(b=>{const es=expenses.filter(x=>x.lineId===b.id),ids=new Set(es.map(x=>x.id)),actual=es.reduce((n,x)=>n+x.grossCents,0),estimate=estimates.find(x=>x.lineId===b.id)?.amountCents??null;return {...b,grossCents:actual,paidCents:payments.filter(x=>ids.has(x.expenseId)&&x.status==='PAID').reduce((n,x)=>n+x.amountCents,0),remainingCents:estimate,forecastCents:estimate===null?null:actual+estimate}})
 return {committedCents:committed,grossCents:gross,paidCents:paid,unpaidCents:gross-paid,baselineCents:s.budget.reduce((n,b)=>n+(b.amountCents??0),0),unknownEstimateLines:lines.filter(x=>x.remainingCents===null).length,lines}
}
export function cashFlow(s:State){
 const events:{id:string;date:string|null;description:string;amountCents:number;party:Party;settled?:boolean}[]=[],active=s.expenses.filter(x=>!x.archived),payments=s.payments.filter(x=>!x.archived)
 for(const e of active){const ps=payments.filter(p=>p.expenseId===e.id);for(const p of ps)events.push({id:p.id,date:p.date,description:`${p.status==='PAID'?'Paid':'Scheduled'}: ${e.description}`,amountCents:-p.amountCents,party:p.payer,settled:p.status==='PAID'});const remainder=e.grossCents-ps.reduce((n,p)=>n+p.amountCents,0);if(remainder)events.push({id:e.id,date:e.dueDate,description:`Unscheduled balance: ${e.description}`,amountCents:-remainder,party:e.party})}
 for(const e of s.estimates.filter(x=>!x.archived&&x.amountCents!==null))events.push({id:e.id,date:e.date,description:`Additional estimate: ${s.budget.find(b=>b.id===e.lineId)?.label}`,amountCents:-e.amountCents!,party:e.party})
 for(const i of s.inflows.filter(x=>!x.archived))events.push({id:i.id,date:i.date,description:`${i.status==='RECEIVED'?'Received':'Expected'}: ${i.description}`,amountCents:i.amountCents,party:i.party,settled:i.status==='RECEIVED'})
 const included=events.filter(e=>e.party===s.opening.party&&(!e.settled||!e.date||!s.opening.date||e.date>=s.opening.date)).map(e=>!e.settled&&e.date&&s.opening.date&&e.date<s.opening.date?{...e,date:s.opening.date,description:`Overdue (due ${e.date}): ${e.description}`}:e);included.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.id.localeCompare(b.id))
 let balance=s.opening.amountCents
 return {rows:included.map(e=>{if(balance!==null&&e.date)balance+=e.amountCents;return {...e,balanceCents:e.date?balance:null}}),undated:included.filter(e=>!e.date).length,unassigned:events.filter(e=>e.party==='UNASSIGNED').length,incomplete:events.some(e=>e.party==='UNASSIGNED')||s.opening.amountCents===null||!s.opening.date||included.some(e=>!e.date)||summarize(s).unknownEstimateLines>0}
}
export function csv(rows:unknown[][]){return rows.map(row=>row.map(v=>{const value=v===null?'':String(v);return '"'+(/^[=+@-]/.test(value)?"'":'')+value.replaceAll('"','""')+'"'}).join(',')).join('\r\n')}
