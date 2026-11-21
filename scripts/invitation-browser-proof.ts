import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { authPool, tokenHash } from '../src/lib/auth/store'
const require = createRequire(process.cwd()+'/package.json')
const {chromium}=require('/opt/homebrew/lib/node_modules/agent-browser/node_modules/playwright-core')
async function main() {
  assert.equal(process.env.CRM_AUTH_ISOLATED_PROOF,'1')
  assert.ok(process.env.DATABASE_URL?.includes('/crm_auth_test?host=/tmp/company-crm-auth.'))
  const base=process.env.CRM_AUTH_ORIGIN!, out='../../audits/crm-invite-20261121'
  await mkdir(out,{recursive:true})
  const browser=await chromium.launch({channel:'chrome',headless:true})
  try {
    for(const width of [1440,390,320]) {
      const code=randomBytes(32).toString('hex'), password=randomBytes(24).toString('hex'), email=`${randomUUID()}@example.invalid`, id=randomUUID()
      await authPool.query('INSERT INTO "CrmInvitation" ("id","email","name","tokenHash","expiresAt") VALUES ($1,$2,$3,$4,NOW()+INTERVAL \'1 hour\')',[id,email,'Synthetic Browser',tokenHash(code)])
      const context=await browser.newContext({viewport:{width,height:900}}), page=await context.newPage()
      const errors:string[]=[], urls:string[]=[]
      page.on('pageerror',(error:Error)=>errors.push(error.message))
      page.on('request',(request:{url():string})=>urls.push(request.url()))
      const response=await page.goto(base+'/set-password')
      assert.equal(response.status(),200)
      assert.equal(response.headers()['referrer-policy'],'no-referrer')
      assert.match(response.headers()['content-security-policy'],/frame-ancestors 'none'/)
      assert.match(response.headers()['cache-control'],/no-store/)
      for(const field of ['code','password','confirmation']) assert.equal(await page.locator(`input[name=${field}]`).getAttribute('type'),'password')
      await page.locator('input[name=code]').fill(code)
      await page.getByLabel('New password',{exact:true}).fill(password)
      await page.getByLabel('Confirm password',{exact:true}).fill('mismatch')
      await page.getByRole('button',{name:'Set password',exact:true}).click()
      await page.getByRole('alert').filter({hasText:'do not match'}).waitFor()
      assert.equal(await page.locator('input[name=code]').inputValue(),code)
      await page.getByLabel('Confirm password',{exact:true}).fill(password)
      const bounds=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:innerWidth}))
      assert.ok(bounds.scroll<=bounds.view)
      await page.screenshot({path:`${out}/setup-${width}.png`,fullPage:true})
      await page.getByRole('button',{name:'Set password',exact:true}).click()
      await page.getByRole('heading',{name:'Your account is ready'}).waitFor()
      await page.screenshot({path:`${out}/ready-${width}.png`,fullPage:true})
      assert.equal(page.url(),base+'/set-password')
      assert.ok(urls.every(url=>url.startsWith(base+'/')),'no external assets')
      assert.ok(urls.every(url=>!url.includes(code)&&!url.includes(password)),'no credentials in URL')
      assert.equal((await context.cookies()).filter((cookie:{name:string})=>cookie.name.includes('crm')).length,0)
      await page.getByRole('link',{name:'Sign in',exact:true}).click()
      await page.getByLabel('Email',{exact:true}).fill(email)
      await page.getByLabel('Password',{exact:true}).fill(password)
      await page.getByRole('button',{name:'Sign in',exact:true}).click()
      await page.waitForURL(base+'/')
      await page.goto(base+'/jt-to-do')
      assert.equal(page.url(),base+'/jt-to-do')
      assert.equal(errors.length,0)
      await context.close()
      await authPool.query('DELETE FROM "CrmUser" WHERE "email"=$1',[email])
      await authPool.query('DELETE FROM "CrmInvitation" WHERE "id"=$1',[id])
    }
    console.log('Invitation browser proof passed: 1440/390/320, masked setup, validation retention, atomic success, normal sign-in, JT task access, no external requests/URL leaks.')
  } finally {await browser.close();await authPool.end()}
}
main().catch(()=>{console.error('Synthetic invitation browser proof failed (credentials withheld).');process.exitCode=1})
