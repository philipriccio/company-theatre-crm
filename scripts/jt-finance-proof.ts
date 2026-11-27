import assert from 'node:assert/strict'
import { randomUUID,randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { prisma } from '../src/lib/db'
import { authPool,tokenHash } from '../src/lib/auth/store'
import { financeSave } from '../src/lib/jt-finance/server'
import { emptyState,type State } from '../src/lib/jt-finance/model'
const require=createRequire(process.cwd()+'/package.json'),{chromium}=require('/opt/homebrew/lib/node_modules/agent-browser/node_modules/playwright-core')
async function main(){
 assert.equal(process.env.JT_FINANCE_ISOLATED_PROOF,'1');assert.ok(process.env.DATABASE_URL?.includes('/jt_finance_test?host=/tmp/jt-finance.'))
 const base=process.env.CRM_AUTH_ORIGIN!,out='../../audits/jt-finance-20261126';await mkdir(out,{recursive:true})
 for(const [id,name] of [['finance-proof','Synthetic Philip'],['janice-proof','Synthetic Janice'],['other-proof','Unapproved CRM user']])await prisma.crmUser.create({data:{id,name,email:`${id}@example.invalid`,passwordHash:'not-a-login'}})
 const session=randomBytes(32).toString('hex'),other=randomBytes(32).toString('hex'),janice=randomBytes(32).toString('hex')
 for(const [token,id] of [[session,'finance-proof'],[other,'other-proof'],[janice,'janice-proof']])await prisma.crmSession.create({data:{tokenHash:tokenHash(token),userId:id,expiresAt:new Date(Date.now()+86400000)}})
 const state:State={...structuredClone(emptyState),budget:[{id:'travel',category:'Travel',label:'Travel and accommodation',amountCents:null,sourceRow:49}],expenses:[{id:'seana',kind:'ACCRUED',lineId:'travel',vendor:'Synthetic supplier',description:'Synthetic accommodation',party:'TCT',grossCents:387500,taxCents:null,dueDate:null,receiptStatus:'PENDING',source:'Synthetic fixture only',archived:false}],payments:[{id:'payment',expenseId:'seana',amountCents:387500,date:'2026-11-26',payer:'TCT',status:'PAID',reference:'Synthetic payment',archived:false}]}
 await prisma.jtFinanceWorkspace.create({data:{id:'JT',data:JSON.parse(JSON.stringify(state))}})
 const actor={id:'finance-proof',name:'Synthetic Philip'},req={requestId:randomUUID(),version:1,data:state};const saved=await financeSave(actor,req);assert.deepEqual(await financeSave(actor,req),saved);assert.equal(await prisma.jtFinanceChange.count(),1)
 await assert.rejects(financeSave(actor,{...req,data:{...state,opening:{...state.opening,amountCents:10}}}),/Request ID/)
 const races=await Promise.allSettled([financeSave(actor,{...req,requestId:randomUUID(),version:2}),financeSave({id:'janice-proof',name:'Synthetic Janice'},{...req,requestId:randomUUID(),version:2})]);assert.equal(races.filter(x=>x.status==='fulfilled').length,1)
 await assert.rejects(prisma.jtFinanceChange.updateMany({data:{actorLabel:'Forged'}}))
 const headers={cookie:`crm-local-session=${session}`,origin:base,'Content-Type':'application/json'}
 assert.equal((await fetch(base+'/api/jt-finance')).status,401);assert.equal((await fetch(base+'/api/jt-finance',{headers:{cookie:`crm-local-session=${other}`}})).status,403)
 assert.equal((await fetch(base+'/api/jt-finance',{headers:{cookie:`crm-local-session=${janice}`}})).status,200)
 assert.equal((await fetch(base+'/api/jt-finance',{method:'POST',headers:{...headers,origin:'https://evil.invalid'},body:'{}'})).status,403)
 const get=await(await fetch(base+'/api/jt-finance',{headers})).json();assert.equal((await fetch(base+'/api/jt-finance',{method:'POST',headers,body:JSON.stringify({version:get.version,requestId:randomUUID(),data:{...get.data,budget:[]}})})).status,400)
 const receipt=await fetch(base+'/api/jt-finance/receipts?expenseId=seana',{method:'POST',headers:{...headers,'Content-Type':'application/pdf','X-Filename':'synthetic.pdf'},body:'%PDF-1.4\nSynthetic receipt fixture'});assert.equal(receipt.status,201);const receiptBody=await receipt.json()
 assert.equal((await fetch(base+`/api/jt-finance/receipts/${receiptBody.id}`,{headers:{cookie:`crm-local-session=${other}`}})).status,403)
 const downloaded=await fetch(base+`/api/jt-finance/receipts/${receiptBody.id}`,{headers});assert.equal(downloaded.status,200);assert.equal(downloaded.headers.get('x-content-type-options'),'nosniff');assert.match(downloaded.headers.get('content-disposition')!,/attachment/)
 assert.equal((await fetch(base+'/api/jt-finance/receipts?expenseId=seana',{method:'POST',headers:{...headers,'Content-Type':'image/png'},body:'bad'})).status,400)
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{const context=await browser.newContext();await context.addCookies([{name:'crm-local-session',value:session,url:base}]);const page=await context.newPage(),errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message))
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await page.goto(base+'/jt-finance');await page.getByText('Latest shared workspace loaded.').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);await page.screenshot({path:`${out}/finance-budget-${width}.png`,fullPage:true});await page.getByRole('button',{name:'Costs',exact:true}).click();await page.getByText('Synthetic accommodation',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByText('Synthetic accommodation',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/finance-costs-${width}.png`,fullPage:true})}
 await page.getByRole('button',{name:'Add cost / commitment'}).click();await page.getByLabel('Description',{exact:true}).fill('Browser-created commitment');await page.getByLabel('Kind',{exact:true}).selectOption('COMMITTED');await page.getByLabel('Gross (CAD)',{exact:true}).waitFor()
 await page.locator('input[type=number]').first().fill('100.25');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Browser-created commitment',{exact:true}).waitFor();await page.reload();await page.getByText('Latest shared workspace loaded.').waitFor();await page.getByRole('button',{name:'Costs',exact:true}).click();await page.getByText('Browser-created commitment',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Cash flow',exact:true}).click();await page.getByText(/Incomplete forecast:/).waitFor();await page.screenshot({path:`${out}/finance-cash-320.png`,fullPage:true})
 // Janice's genuine authorised session can edit through HTTP; no privileged test bypass.
 const current=await(await fetch(base+'/api/jt-finance',{headers})).json();const result=await fetch(base+'/api/jt-finance',{method:'POST',headers:{...headers,cookie:`crm-local-session=${janice}`},body:JSON.stringify({requestId:randomUUID(),version:current.version,data:current.data})});assert.equal(result.status,200)
 await page.getByRole('button',{name:'Set opening cash / scope'}).click();await page.locator('input[type=number]').fill('2000');await page.locator('input[type=date]').fill('2026-11-27');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('alert').filter({hasText:'Someone else changed'}).waitFor();assert.equal(await page.locator('input[type=number]').inputValue(),'2000')
 assert.deepEqual(errors,[]);await context.close()
 }finally{await browser.close()}
 console.log('PASS: isolated finance persistence, stale writes, replay, append-only history, exact human authorization, receipt upload/private download, browser create/reload/conflict and 1440/390/320 layout.')
 await prisma.$disconnect();await authPool.end()
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})
