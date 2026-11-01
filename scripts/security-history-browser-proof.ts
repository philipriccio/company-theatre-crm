import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { authPool, audit, login, tokenHash } from '../src/lib/auth/store'
import { hashPassword } from '../src/lib/auth/password'
const require=createRequire(process.cwd()+'/package.json')
const {chromium}=require('/opt/homebrew/lib/node_modules/agent-browser/node_modules/playwright-core')
async function main(){
 assert.equal(process.env.CRM_AUTH_ISOLATED_PROOF,'1')
 assert.ok(process.env.DATABASE_URL?.includes('/crm_auth_test?host=/tmp/company-crm-auth.'))
 const out='../../audits/crm-security-history-20261101',base=process.env.CRM_AUTH_ORIGIN!
 await mkdir(out,{recursive:true})
 const id=randomUUID(),email=`history-browser-${id}@example.invalid`,password=randomBytes(24).toString('hex')
 await authPool.query('INSERT INTO "CrmUser" (id,email,name,"passwordHash") VALUES ($1,$2,$3,$4)',[id,email,'Synthetic security reviewer',await hashPassword(password)])
 const token=await login(email,password)
 await audit('password_changed_all_sessions_rotated',id)
 const subject=tokenHash(randomUUID());for(let i=0;i<5;i++)await audit('login_failed',null,{subject,status:401})
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const anonymous=await browser.newPage();await anonymous.goto(base+'/security');await anonymous.waitForURL('**/login');await anonymous.close()
  const context=await browser.newContext({viewport:{width:1440,height:1000}})
  await context.addCookies([{name:'crm-local-session',value:token,url:base}])
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message))
  await page.goto(base+'/security');await page.getByRole('heading',{name:'Security history',exact:true}).waitFor()
  await page.getByRole('heading',{name:'Events',exact:true}).waitFor()
  assert.ok(await page.getByText('Synthetic security reviewer · human',{exact:false}).count()>0)
  const exported=await context.request.get(base+'/api/contacts/export',{headers:{'x-forwarded-user':'forged'}});assert.equal(exported.status(),200)
  const entry=(await authPool.query('SELECT "userId","outcome" FROM "CrmAuthEvent" WHERE "kind"=$1 AND "userId"=$2',['export_started',id])).rows
  assert.equal(entry.length,1);assert.equal(entry[0].outcome,'attempt')
  for(const width of [1440,390,320]){
   await page.locator('main').evaluate((el:HTMLElement)=>{el.scrollTop=0})
   await page.setViewportSize({width,height:width===1440?1000:844})
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`document overflow ${width}`)
   assert.equal(await page.locator('main').evaluate((el:HTMLElement)=>el.scrollWidth<=el.clientWidth),true,`main overflow ${width}`)
   await page.screenshot({path:`${out}/company-security-${width}.png`,fullPage:true})
   await page.getByRole('heading',{name:'Events',exact:true}).scrollIntoViewIfNeeded()
   await page.screenshot({path:`${out}/company-events-${width}.png`,fullPage:true})
  }
  await page.getByLabel('Actor ID',{exact:true}).fill(id)
  await page.getByLabel('Event',{exact:true}).fill('export_started')
  await page.getByRole('button',{name:'Apply filters',exact:true}).click()
  await page.getByRole('heading',{name:'Events',exact:true}).waitFor()
  assert.equal(await page.locator('article').filter({hasText:'export started'}).count(),1)
  await page.getByRole('button',{name:'View evidence event',exact:true}).first().click()
  await page.getByText('Showing one alert’s evidence event.',{exact:false}).waitFor()
  await page.getByRole('heading',{name:'Events',exact:true}).waitFor()
  await page.getByRole('button',{name:'Show all events',exact:true}).click()
  await page.getByRole('heading',{name:'Events',exact:true}).waitFor()
  await page.getByRole('button',{name:'Mark reviewed',exact:true}).first().click()
  await page.getByText(/Reviewed by Synthetic security reviewer/).first().waitFor()
  await page.route('**/api/security-history?*',(route:{abort:()=>Promise<void>})=>route.abort())
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('alert').waitFor()
  assert.equal(await page.getByRole('heading',{name:'Events',exact:true}).count(),0)
  await page.unroute('**/api/security-history?*')
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('heading',{name:'Events',exact:true}).waitFor()
  assert.equal(errors.length,0,errors.join('\n'))
  console.log('Company security browser proof: anonymous denial, actor attribution, real export, filters, review, error recovery, 1440/390/320 no overflow PASS')
 }finally{await browser.close();await authPool.query('DELETE FROM "CrmUser" WHERE id=$1',[id]);await authPool.end()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
