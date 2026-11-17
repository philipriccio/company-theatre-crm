import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, open, chmod } from 'node:fs/promises';
import { once } from 'node:events';
import { authPool, tokenHash } from '../src/lib/auth/store';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('/opt/homebrew/lib/node_modules/agent-browser/node_modules/playwright-core');
async function main() {
  assert.equal(process.env.CRM_SCRATCH_ISOLATED_PROOF, '1');
  assert.ok(process.env.DATABASE_URL?.includes('/crm_scratch_test?host=/tmp/company-crm-scratch.'));
  const out = '../../audits/crm-scratch-players-20261117';
  await mkdir(out,{recursive:true});
  const id=randomUUID(), token=randomBytes(32).toString('hex');
  await authPool.query('INSERT INTO "CrmUser" (id,email,name,"passwordHash") VALUES ($1,$2,$3,$4)',[id,'viewer@example.invalid','Synthetic viewer','unusable']);
  await authPool.query('INSERT INTO "CrmSession" ("tokenHash","userId","expiresAt") VALUES ($1,$2,now()+interval \'1 day\')',[tokenHash(token),id]);
  await authPool.query('INSERT INTO "Contact" (id,email,"fullName","createdAt","updatedAt") VALUES ($1,$2,$3,\'2020-01-01\',now())',['synthetic-existing',' PLAYED@example.invalid ','Existing CRM name']);
  const base=process.env.CRM_AUTH_ORIGIN!;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  let server: ChildProcess | undefined;
  const log=await open(out+'/browser-server.log','w');
  async function stop() { if(server && server.exitCode === null && server.signalCode === null) { const ended=once(server,'exit'); server.kill('SIGTERM'); const timer=setTimeout(()=>server?.kill('SIGKILL'),5000); await ended; clearTimeout(timer); } server=undefined; }
  async function start(mode: string) {
    await stop();
    const env={...process.env};
    if(mode==='missing') delete env.SCRATCH_REPORT_DATABASE_URL;
    if(mode==='outage') env.SCRATCH_REPORT_DATABASE_URL='postgresql://localhost:1/unavailable';
    server=spawn('./node_modules/.bin/next',['start','--hostname','127.0.0.1','--port','3397'],{env,stdio:['ignore',log.fd,log.fd]});
    for(let i=0;i<60;i++) {
      assert.equal(server.exitCode,null,'server exited');
      try { if((await fetch(base+'/login')).ok) return; } catch {}
      await new Promise(r=>setTimeout(r,250));
    }
    throw new Error('preview start timed out');
  }
  try {
    await start('ready');
    for(const headers of [{},{'x-forwarded-user':'viewer@example.invalid','x-middleware-subrequest':'proxy'},{cookie:'crm-local-session=invalid'}]) {
      const r=await fetch(base+'/scratch-players',{headers:headers as Record<string,string>,redirect:'manual'});
      assert.ok([307,308].includes(r.status)); assert.match(r.headers.get('location')||'',/login/); assert.ok(!(await r.text()).includes('played@example.invalid'));
    }
    const context=await browser.newContext();
    await context.addCookies([{name:'crm-local-session',value:token,url:base,httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(15000); const errors:string[]=[];
    page.on('pageerror',(e:Error)=>errors.push(e.message));
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:width===1440?1000:844});
      await page.goto(base+'/scratch-players'); await page.getByRole('heading',{name:'Scratch players.'}).waitFor();
      assert.equal(await page.locator('.player-card').count(),50);
      assert.equal(await page.locator('.player-card').first().getByRole('link',{name:'Open CRM profile →'}).getAttribute('href'),'/contacts/synthetic-existing');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`overflow ${width}`);
      await page.screenshot({path:`${out}/players-${width}.png`,fullPage:width===1440});
    }
    console.log('PASS: viewport/auth/profile checks');
    await page.locator('summary').click();
    await page.getByLabel('Signup source',{exact:true}).selectOption('newsletter');
    await page.getByRole('button',{name:'Apply filters'}).click();
    console.log('After apply URL:',page.url()); await page.waitForURL(/source=newsletter/,{timeout:10000}); assert.equal(await page.locator('.player-card').count(),1);
    assert.match(await page.locator('.player-card').innerText(),/1 started · 1 completed/);
    assert.match(await page.locator('.player-card').innerText(),/25% offer/);
    assert.ok(!(await page.locator('.player-card').innerText()).includes('Free ticket pair'));
    await page.goto(base+'/scratch-players?status=not_played');assert.equal(await page.locator('.player-card').count(),50);
    await page.goto(base+'/scratch-players?search=does-not-exist'); await page.getByRole('heading',{name:'No players match these filters.'}).waitFor();
    await page.goto(base+'/scratch-players?from=2026-11-18&to=2026-11-17'); await page.getByRole('alert').filter({hasText:'Choose a From date'}).waitFor();
    await page.goto(base+'/scratch-players?page=2');assert.equal(await page.locator('.player-card').count(),8);
    for(const mode of ['missing','outage']) {
      await start(mode); await page.goto(base+'/scratch-players'); await page.getByRole('heading',{name:'Player activity is unavailable'}).waitFor();
      assert.equal(await page.locator('.player-card').count(),0); assert.equal(await page.locator('.player-stats').count(),0);
      await page.screenshot({path:`${out}/${mode}-320.png`,fullPage:true});
    }
    assert.deepEqual(errors,[]);
    await start('ready');
    await page.goto(base+'/scratch-players?source=newsletter');
    await authPool.query("UPDATE scratch_player SET name='Updated gameplay report name' WHERE email='played@example.invalid'");
    await page.getByRole('link',{name:'Refresh activity'}).click();
    await page.getByRole('heading',{name:'Updated gameplay report name'}).waitFor();
    console.log('PASS: Refresh activity reads fresh database data.');
    console.log('PASS: unauthenticated/forged denial; authenticated real SQL; existing contact normalized link; 1440/390/320 layout; source/status/date/search/pagination; no test prize; missing/outage explicit; no page errors.');
    if(process.env.CRM_SCRATCH_KEEP_PREVIEW==='1') {
      await page.goto(base+'/scratch-players');
      const statePath=out+'/synthetic-browser-state.json';
      await context.storageState({path:statePath}); await chmod(statePath,0o600);
      console.log('Synthetic preview ready at http://127.0.0.1:3397/scratch-players; private local browser state saved.');
      await new Promise<void>(resolve=>process.once('SIGTERM',()=>resolve()));
    }
  } finally { await stop(); await browser.close(); await log.close(); await authPool.end(); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
