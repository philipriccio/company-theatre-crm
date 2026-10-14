import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
const require=createRequire(import.meta.url)
const {chromium}=require('/opt/homebrew/lib/node_modules/agent-browser/node_modules/playwright-core')
const base='http://127.0.0.1:3194'
const output='reports/analytics-2026-10-13'
mkdirSync(output,{recursive:true})
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
const errors=[],results=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
try {
  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:1000})
    await page.goto(`${base}/campaigns/analytics-showcase/analytics`)
    await page.waitForLoadState('networkidle')
    assert.deepEqual(await page.locator('.analytics-card strong').allTextContents(),['90','60','30','6'])
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await page.screenshot({path:`${output}/browser-${width}.png`})
    results.push({check:`layout ${width}`,passed:true})
  }
  await page.setViewportSize({width:1440,height:1000})
  await page.selectOption('#automation','exclude_likely')
  await Promise.all([page.waitForURL(/automation=exclude_likely/),page.getByRole('button',{name:'Update report'}).click()])
  assert.deepEqual(await page.locator('.analytics-card strong').allTextContents(),['90','50','30','6'])
  results.push({check:'reversible automation view',passed:true})
  for(const [filter,total] of [['opened',60],['unopened',30],['clicked',30],['bounced',6],['hard',3],['soft',3],['unsubscribed',3],['complaint',4],['unknown',5],['queued',5]]) {
    await page.goto(`${base}/campaigns/analytics-showcase/analytics?filter=${filter}#recipients`)
    assert.ok((await page.locator('#recipients .analytics-pagination').innerText()).includes(`${total} matching`),filter)
    const response=await page.request.get(`${base}/api/campaigns/analytics-showcase/analytics/export?filter=${filter}`)
    assert.equal(response.status(),200)
    assert.equal((await response.text()).trim().split('\r\n').length,total+1)
    results.push({check:`${filter} + CSV parity`,passed:true})
  }
  await page.goto(`${base}/campaigns/analytics-showcase/analytics`)
  await page.getByRole('textbox',{name:'Search name or email'}).fill('person-001')
  await Promise.all([page.waitForURL(/q=person-001/),page.getByRole('button',{name:'Apply filters'}).click()])
  assert.equal(await page.locator('#recipients tbody tr').count(),1)
  await page.locator('#recipients tbody a').click()
  await page.waitForURL(/recipients\/showcase-recipient-0/)
  assert.ok((await page.locator('.analytics-timeline').innerText()).includes('secondary observation'))
  assert.ok((await page.locator('.analytics-timeline').innerText()).includes('likely automated'))
  await page.screenshot({path:`${output}/timeline.png`})
  results.push({check:'real form search and person timeline navigation',passed:true})
  for(const id of ['analytics-empty','analytics-legacy','analytics-14k']) {
    await page.goto(`${base}/campaigns/${id}/analytics${id==='analytics-14k'?'?page=280':''}`)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    if(id==='analytics-empty') assert.ok((await page.locator('body').innerText()).includes('No recipients yet'))
    if(id==='analytics-legacy') assert.ok((await page.locator('body').innerText()).includes('historical/partial coverage'))
    if(id==='analytics-14k') {assert.equal(await page.locator('#recipients tbody tr').count(),50);assert.ok((await page.locator('#recipients .analytics-pagination').innerText()).includes('page 280 of 280'))}
    results.push({check:id,passed:true})
  }
  await page.goto(`${base}/campaigns/analytics`)
  await page.screenshot({path:`${output}/comparison.png`})
  assert.ok((await page.locator('body').innerText()).includes('All emails, together.'))
  results.push({check:'comparison',passed:true})
  const forbidden=await page.request.get(`${base}/campaigns/analytics-empty/analytics/recipients/showcase-recipient-0`)
  assert.equal(forbidden.status(),404)
  results.push({check:'cross-campaign recipient scope',passed:true})
  assert.deepEqual(errors,[])
  writeFileSync(`${output}/browser.json`,JSON.stringify({results,errors},null,2)+'\n')
  console.log(JSON.stringify({checks:results.length,passed:results.length,errors}))
} finally {await browser.close()}
