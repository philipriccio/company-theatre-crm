const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {resolve}=require('node:path');
const {chromium}=require('/opt/homebrew/lib/node_modules/agent-browser/node_modules/playwright-core');
module.exports=async function proveBrowser(crmPort,token,prisma){
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext();
 await context.route('**/*google-analytics.com/**',r=>r.abort());await context.route('**/gtag/js**',r=>r.abort());
 try {for(const [index,dir] of ['jt-signup-release','ct-signup-release'].entries()){
  const port=3166+index;
  const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{cwd:resolve('..',dir),stdio:'ignore',env:{...process.env,NODE_ENV:'test',NODE_OPTIONS:`--require=${resolve('tests/signup-fetch-local.cjs')}`,CRM_PROOF_PORT:String(crmPort),CRM_URL:'https://crm.companytheatre.ca',CRM_AUTH:'synthetic:local-proof',CRM_WEBSITE_SIGNUP_TOKEN:token,EMAIL_PROVIDER:'disabled'}});
  try {
   let ready=false;for(let a=0;a<30;a++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}assert.ok(ready);
   const page=await context.newPage();
   for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:844});await page.goto(`http://127.0.0.1:${port}`);
    await page.getByRole('button',{name:index===0?'Sign Me Up':'Sign Up',exact:true}).first().click();
    const form=index===0?page.locator('.signup-modal-form'):page.locator('form').last();await form.scrollIntoViewIfNeeded();
    await form.getByRole('textbox',{name:'First name',exact:true}).fill('Synthetic');await form.getByRole('textbox',{name:'Last name',exact:true}).fill('Proof');
    const email=`browser-${index}-${width}@example.com`;await form.getByRole('textbox',{name:'Email address',exact:true}).fill(email);await form.getByRole('checkbox').check();
    await page.screenshot({path:`reports/signup-2026-10-10/${dir}-${width}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const response=page.waitForResponse(r=>r.url().endsWith(index===0?'/api/signup':'/api/newsletter')&&r.request().method()==='POST');
    await form.getByRole('button',{name:index===0?'Notify Me':'Subscribe',exact:true}).click();assert.equal((await response).status(),200);
    await page.getByText(index===0?"You're in!":"You're on the list!",{exact:false}).waitFor();assert.equal((await prisma.contact.findUniqueOrThrow({where:{email}})).solicitation,true);
   }
   for(const status of [202,502]){
    await page.goto(`http://127.0.0.1:${port}`);await page.getByRole('button',{name:index===0?'Sign Me Up':'Sign Up',exact:true}).first().click();
    const form=index===0?page.locator('.signup-modal-form'):page.locator('form').last();await form.getByRole('textbox',{name:'First name',exact:true}).fill('Synthetic');await form.getByRole('textbox',{name:'Last name',exact:true}).fill('Proof');await form.getByRole('textbox',{name:'Email address',exact:true}).fill('manual@example.com');await form.getByRole('checkbox').check();
    if(status===502)await page.route('**/api/'+(index===0?'signup':'newsletter'),r=>r.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'Unable to confirm signup. Please try again.'})}));
    await form.getByRole('button',{name:index===0?'Notify Me':'Subscribe',exact:true}).click();
    await page.getByText(status===202?'Your request was recorded, but this address needs a subscription review. It has not been added to the mailing list.':index===0?"We couldn't submit right now. Please try again.":'Unable to confirm signup. Please try again.',{exact:true}).waitFor();
    assert.equal(await page.getByText(index===0?"You're in!":"You're on the list!",{exact:false}).count(),0);
   }
   await page.close();
  }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r))}
 }}finally{await browser.close()}
}
