import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { authPool } from '../src/lib/auth/store'
import { hashPassword } from '../src/lib/auth/password'
const require = createRequire(process.cwd() + '/package.json')
const { chromium } = require('/opt/homebrew/lib/node_modules/agent-browser/node_modules/playwright-core')
async function main() {
const base='http://127.0.0.1:3257'
const out='../../audits/company-crm-fortification-20261031'
assert.equal(process.env.CRM_AUTH_ISOLATED_PROOF,'1')
assert.ok(process.env.DATABASE_URL?.includes('/crm_auth_test?host=/tmp/company-crm-auth.'))
await mkdir(out,{recursive:true})
const id=randomUUID(), email=`proof-${id}@example.invalid`, password=randomBytes(24).toString('hex'), replacement=randomBytes(24).toString('hex')
await authPool.query('INSERT INTO "CrmUser" ("id","email","name","passwordHash") VALUES ($1,$2,$3,$4)',[id,email,'Synthetic reviewer',await hashPassword(password)])
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 for(const path of ['/api/contacts','/api/contacts/export','/api/settings','/api/campaigns','/api/templates','/api/contacts.js','/api/cron/send-scheduled']) {
   const response=await fetch(base+path,{headers:{'x-forwarded-user':email,'x-middleware-subrequest':'proxy'}})
   assert.equal(response.status,401,path)
 }
 assert.equal((await fetch(base+'/api/auth/login',{method:'POST',headers:{origin:'https://attacker.invalid','content-type':'application/json'},body:JSON.stringify({email,password})})).status,403)
 assert.notEqual((await fetch(base+'/api/website-signups',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,200)
 assert.notEqual((await fetch(base+'/api/unsubscribe/invalid',{method:'POST'})).status,200)
 const context=await browser.newContext({viewport:{width:1440,height:1000}})
 const page=await context.newPage(); const errors:string[]=[]
 page.on('pageerror',(error:Error)=>errors.push(error.message))
 await page.goto(base+'/settings/account'); await page.waitForURL('**/login')
 await page.getByLabel('Email',{exact:true}).fill(email)
 await page.getByLabel('Password',{exact:true}).fill(password)
 await page.getByRole('button',{name:'Sign in',exact:true}).click(); await page.waitForURL(base+'/')
 await page.goto(base+'/settings/account')
 const oldCookies=await context.cookies()
 const other=await browser.newContext();await other.addCookies(oldCookies)
 await page.getByLabel('Current password',{exact:true}).fill('incorrect')
 await page.getByLabel('New password',{exact:true}).fill(replacement)
 await page.getByLabel('Confirm new password',{exact:true}).fill(replacement)
 await page.getByRole('button',{name:'Change password',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'Current password is incorrect'}).waitFor()
 assert.equal(await page.getByLabel('New password',{exact:true}).inputValue(),replacement)
 await page.getByLabel('Current password',{exact:true}).fill(password)
 await page.getByRole('button',{name:'Change password',exact:true}).click()
 await page.getByRole('status').filter({hasText:'Password changed'}).waitFor()
 assert.equal((await other.request.get(base+'/api/contacts')).status(),401)
 assert.equal((await context.request.get(base+'/api/contacts')).status(),200)
 assert.equal((await context.request.post(base+'/api/settings',{headers:{origin:'https://attacker.invalid'},data:{}})).status(),403)
 assert.equal((await context.request.get(base+'/api/cron/send-scheduled')).status(),405)
 for(const width of [1440,390,320]) {
  await page.setViewportSize({width,height:width===1440?1000:844})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`)
  await page.screenshot({path:`${out}/account-${width}.png`,fullPage:true})
  await page.getByRole('button',{name:'Sign out',exact:true}).scrollIntoViewIfNeeded()
  const target = await page.getByRole('button',{name:'Sign out',exact:true}).boundingBox()
  assert.ok(target && target.height >= 44)
  await page.screenshot({path:`${out}/account-${width}-actions.png`,fullPage:true})
 }
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/login')
 assert.equal((await context.request.get(base+'/api/contacts')).status(),401)
 await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(replacement)
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(base+'/')
 assert.deepEqual(errors,[])
 await other.close();await context.close()
 console.log('Browser proof PASS: anonymous/spoofed access, cross-origin login/mutation rejection, correct-current-password check, failed-form preservation, rotation/other-session revocation, logout, new-password login, 1440/390/320 no-overflow and screenshots, no page errors. Synthetic fixture only.')
} finally {await browser.close();await authPool.query('DELETE FROM "CrmUser" WHERE "id"=$1',[id]);await authPool.end()}

}
main().catch(() => { console.error("Browser proof FAILED; inspect locally without logging credentials."); process.exitCode=1 })
