import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
import {mkdir} from 'node:fs/promises'
import {prisma} from '../src/lib/db'
import {authPool,tokenHash} from '../src/lib/auth/store'
import {saveTask} from '../src/lib/jt-tasks'
const require=createRequire(process.cwd()+'/package.json')
const {chromium}=require('/opt/homebrew/lib/node_modules/agent-browser/node_modules/playwright-core')
async function main(){
 assert.equal(process.env.JT_ISOLATED_PROOF,'1');assert.ok(process.env.DATABASE_URL?.includes('/jt_task_test?host=/tmp/jt-tasks.'))
 const actor=randomUUID(),base=process.env.CRM_AUTH_ORIGIN!, out='../../audits/jt-todo-20261121'
 await mkdir(out,{recursive:true})
 await prisma.crmUser.create({data:{id:actor,email:'jt-proof@example.invalid',name:'Synthetic Philip',passwordHash:'not-a-login'}})
 const session=randomBytes(32).toString('hex');await prisma.crmSession.create({data:{tokenHash:tokenHash(session),userId:actor,expiresAt:new Date(Date.now()+86400000)}})
 const req={requestId:randomUUID(),title:'Confirm costume and wigs budget',notes:'Original checklist source',sourceLinks:['https://example.invalid/checklist']}
 const created=await saveTask(actor,req) as unknown as {id:string;version:number}
 const replay=await saveTask(actor,req);assert.deepEqual(replay,created);assert.equal(await prisma.jtTask.count(),1)
 await assert.rejects(saveTask(actor,{...req,title:'Changed request'}),/identifier/)
 const races=await Promise.allSettled([saveTask(actor,{requestId:randomUUID(),version:1,owner:'PHILIP'},created.id),saveTask(actor,{requestId:randomUUID(),version:1,owner:'JANICE'},created.id)])
 assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected').length,1)
 assert.equal(await prisma.jtTaskChange.count({where:{taskId:created.id}}),2)
 const before=await prisma.jtTask.findUniqueOrThrow({where:{id:created.id}})
 await assert.rejects(saveTask('missing-actor',{requestId:randomUUID(),version:before.version,title:'No actor'},created.id),/account/)
 assert.equal((await prisma.jtTask.findUniqueOrThrow({where:{id:created.id}})).title,req.title)
 await assert.rejects(prisma.jtTaskChange.updateMany({data:{actorLabel:'Forged'}}),/append-only/)
 const parent=await saveTask(actor,{requestId:randomUUID(),title:'Confirm all designer agreements, payment dates and outstanding signatures',sourceKey:'proof-parent'}) as unknown as {id:string}
 await saveTask(actor,{requestId:randomUUID(),title:'Nilou agreement',parentId:parent.id,sourceKey:'proof-nilou'})
 await assert.rejects(saveTask(actor,{requestId:randomUUID(),title:'Duplicate',sourceKey:'proof-nilou'}),/already exists/)
 const machine=randomBytes(32).toString('hex'),token=`mcrm_${machine}`
 await prisma.crmMachineIdentity.create({data:{id:randomUUID(),name:'Synthetic Mildred',tokenHash:tokenHash(token),scopes:['tasks:read','tasks:write'],expiresAt:new Date(Date.now()+86400000)}})
 const headers={'x-crm-machine-token':token,'Content-Type':'application/json'}
 assert.equal((await fetch(base+'/api/jt-tasks')).status,401)
 assert.equal((await fetch(base+'/api/jt-tasks',{headers})).status,200)
 assert.equal((await fetch(base+'/api/contacts',{headers})).status,403)
 assert.equal((await fetch(base+'/api/campaigns',{method:'POST',headers,body:'{}'})).status,403)
 assert.equal((await fetch(base+'/api/jt-tasks',{method:'POST',headers:{...headers,origin:base},body:'{}'})).status,403)
 assert.equal((await fetch(base+'/api/jt-tasks',{method:'POST',headers,body:'{invalid'})).status,400)
 const body={requestId:randomUUID(),title:'Weekly settlement review',owner:'MILDRED',dueDate:'2026-11-01',latestUpdate:'Awaiting the statement'}
 const response=await fetch(base+'/api/jt-tasks',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(response.status,201);const machineTask=await response.json()
 const detail=await(await fetch(base+`/api/jt-tasks/${machineTask.id}`,{headers})).json();assert.equal(detail.history[0].actorLabel,'Synthetic Mildred')
 const replayResponse=await fetch(base+'/api/jt-tasks',{method:'POST',headers,body:JSON.stringify(body)});assert.equal((await replayResponse.json()).id,machineTask.id)
 const roToken=`mcrm_${randomBytes(32).toString('hex')}`;await prisma.crmMachineIdentity.create({data:{id:randomUUID(),name:'Synthetic Read Only',tokenHash:tokenHash(roToken),scopes:['tasks:read'],expiresAt:new Date(Date.now()+86400000)}})
 assert.equal((await fetch(base+'/api/jt-tasks',{method:'POST',headers:{'x-crm-machine-token':roToken,'Content-Type':'application/json'},body:JSON.stringify({...body,requestId:randomUUID()})})).status,403)
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const context=await browser.newContext();await context.addCookies([{name:'crm-local-session',value:session,url:base}]);const page=await context.newPage();const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message))
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await page.goto(base+'/jt-to-do');await page.getByRole('heading',{name:'JT To Do',exact:true}).waitFor();await page.getByLabel('Title: Confirm costume and wigs budget',{exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);await page.screenshot({path:`${out}/tasks-${width}.png`,fullPage:true});await page.getByLabel('Title: Confirm all designer agreements, payment dates and outstanding signatures',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/long-task-${width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>Array.from(document.querySelectorAll('.jt-workspace,.jt-row,.workspace-main')).every(e=>e.scrollWidth<=e.clientWidth)),`container overflow ${width}`)}
  await page.getByLabel('Add a task',{exact:true}).fill('Book fitting appointment');await page.getByRole('button',{name:'Add task',exact:true}).click();await page.getByLabel('Title: Book fitting appointment',{exact:true}).waitFor()
  await page.getByLabel('Owner: Book fitting appointment',{exact:true}).selectOption('JANICE');await page.getByRole('status').filter({hasText:'Saved'}).waitFor()
  await page.getByLabel('Status: Book fitting appointment',{exact:true}).selectOption('IN_PROGRESS');await page.getByRole('status').filter({hasText:'Saved'}).waitFor()
  const row=page.locator('article').filter({has:page.getByLabel('Title: Book fitting appointment',{exact:true})});await row.getByRole('button',{name:'Notes & history'}).click();await page.getByRole('dialog').waitFor()
  await page.getByLabel('Notes',{exact:true}).fill('Janice is arranging a time.');await page.getByLabel('Latest update',{exact:true}).fill('Waiting for availability');await page.getByRole('button',{name:'Save changes'}).click();await page.getByRole('dialog').waitFor({state:'hidden'})
  await page.reload();assert.equal(await page.getByLabel('Latest update: Book fitting appointment',{exact:true}).inputValue(),'Waiting for availability')
  await page.getByLabel('Status: Book fitting appointment',{exact:true}).selectOption('DONE');await page.getByLabel('Title: Book fitting appointment',{exact:true}).waitFor({state:'hidden'})
  await page.locator('.jt-filters').getByLabel('Filter status',{exact:true}).selectOption('DONE');await page.getByLabel('Status: Book fitting appointment',{exact:true}).selectOption('TODO');await page.locator('.jt-filters').getByLabel('Filter status',{exact:true}).selectOption('open')
  await page.locator('article').filter({has:page.getByLabel('Title: Book fitting appointment',{exact:true})}).getByRole('button',{name:'Notes & history'}).click()
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/details-320.png`,fullPage:true})
  await page.getByRole('button',{name:'Archive task',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByLabel('Title: Book fitting appointment',{exact:true}).waitFor({state:'hidden'})
  await page.locator('.jt-filters').getByLabel('Filter view',{exact:true}).selectOption('archived');await page.locator('article').filter({has:page.getByLabel('Title: Book fitting appointment',{exact:true})}).getByRole('button',{name:'Notes & history'}).click();await page.getByRole('button',{name:'Restore task',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})
  await page.locator('.jt-filters').getByLabel('Filter view',{exact:true}).selectOption('active');await page.getByLabel('Title: Book fitting appointment',{exact:true}).waitFor()
  // Two stale browser views: second save is rejected without clobbering first.
  const second=await context.newPage();await second.goto(base+'/jt-to-do');await second.getByLabel('Title: Book fitting appointment',{exact:true}).waitFor()
  await page.getByLabel('Owner: Book fitting appointment',{exact:true}).selectOption('PHILIP');await page.getByRole('status').filter({hasText:'Saved'}).waitFor();await second.getByLabel('Owner: Book fitting appointment',{exact:true}).selectOption('MILDRED');await second.getByRole('alert').filter({hasText:'Someone changed this task'}).waitFor();await second.getByRole('button',{name:'Reload list'}).click();await second.waitForFunction(()=>document.querySelector<HTMLSelectElement>('[aria-label="Owner: Book fitting appointment"]')?.value==='PHILIP');assert.equal(await second.getByLabel('Owner: Book fitting appointment',{exact:true}).inputValue(),'PHILIP')
  // A failed inline save retains text across refresh until explicitly discarded.
  await page.route('**/api/jt-tasks/*',async(route: {request:()=>{method:()=>string};abort:()=>Promise<void>;continue:()=>Promise<void>})=>{if(route.request().method()==='PATCH')await route.abort();else await route.continue()})
  const updateField=page.getByLabel('Latest update: Book fitting appointment',{exact:true});await updateField.fill('Preserve this unsaved update');await updateField.press('Enter');await page.locator('.jt-error').waitFor();await page.getByRole('button',{name:'Reload list'}).click();await page.getByRole('status').filter({hasText:'Loading'}).waitFor({state:'hidden'});assert.equal(await updateField.inputValue(),'Preserve this unsaved update');await page.getByRole('button',{name:'Discard my text & reload'}).click();await page.unroute('**/api/jt-tasks/*');await page.getByRole('status').filter({hasText:'Loading'}).waitFor({state:'hidden'});assert.equal(await updateField.inputValue(),'Waiting for availability')
  assert.deepEqual(errors,[]);await second.close();await context.close()
 }finally{await browser.close()}
 console.log('PASS: task persistence, atomic history, idempotency, concurrent stale writes, source imports, auth scopes, browser workflow and responsive overflow.')
 await prisma.$disconnect();await authPool.end()
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})
