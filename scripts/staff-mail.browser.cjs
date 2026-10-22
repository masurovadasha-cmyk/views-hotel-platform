'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const {createReviewServer}=require('../apps/api/ops/serve-local-review.cjs');
module.exports=async function browserProof({owner,staff,enqueue,send,rpc,messages,decodedText,internalKey,ORG,password,check}){
 const web=createReviewServer({configuration:{internalKey,fixture:{organizationId:ORG,propertyId:ORG,units:[]}}});
 await new Promise((resolve,reject)=>{web.once('error',reject);web.listen(4173,'127.0.0.1',resolve);});
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.VIEWS_BROWSER_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
  const context=await browser.newContext(),page=await context.newPage(),tokens=[],requests=[];
  page.on('request',r=>requests.push({url:r.url(),headers:r.headers(),method:r.method(),body:r.postData()}));
  const f=await staff(),q=await enqueue(f);tokens.push(q.token);assert.equal((await send(f)).state,'accepted');
  const link=decodedText(messages.at(-1).raw).match(/http:\/\/127\.0\.0\.1:4173\/\?api=local-core#[^\s]+/)[0];
  async function form(title){await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'');}
  async function submit(value){await page.getByLabel('Новый пароль',{exact:true}).fill(value);await page.getByLabel('Повторите пароль',{exact:true}).fill(value);await page.getByRole('button',{name:'Установить пароль и подтвердить код',exact:true}).click();}
  async function clean(){
   const state=await page.evaluate(()=>({html:document.documentElement.outerHTML,local:JSON.stringify(localStorage),session:JSON.stringify(sessionStorage),url:location.href}));
   for(const token of tokens){assert.ok(!JSON.stringify(state).includes(token),'TOKEN_IN_BROWSER_SURFACE');for(const r of requests){assert.ok(!JSON.stringify({url:r.url,headers:r.headers}).includes(token),'TOKEN_IN_NETWORK_METADATA');if(r.body?.includes(token))assert.ok(r.method==='POST'&&/^http:\/\/127\.0\.0\.1:4173\/local-api\/(activate|reset)$/.test(r.url),'TOKEN_IN_UNEXPECTED_BODY');}}
  }
  await check('browser_mail_GET_only_cleans_fragment_without_activation',async()=>{
   await page.goto(link);await form('Принять приглашение');
   assert.equal((await owner.query('SELECT count(*)::int n FROM staff_private.credentials WHERE membership_id=$1',[f.member])).rows[0].n,0);
   assert.equal(requests.filter(r=>r.method==='POST').length,0);await clean();
   for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'HORIZONTAL_OVERFLOW');}
  });
  await check('browser_explicit_activation_login_and_same_tab_reset',async()=>{
   await submit(password);await page.getByRole('heading',{name:'Вход в рабочую область',exact:true}).waitFor();
   await page.getByLabel('Email сотрудника',{exact:true}).fill(f.email);await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Войти',exact:true}).click();
   await page.getByRole('region',{name:'Учётная запись сотрудника'}).waitFor();
   const prior=(await rpc('login',{email:f.email,password})).body.token;
   const reset=await enqueue(f,'reset');tokens.push(reset.token);assert.equal((await send(f)).state,'accepted');
   await page.evaluate(token=>{location.hash='staff-action=reset&token='+token;},reset.token);await form('Восстановить доступ');await clean();
   await submit(password+' new');await page.getByRole('heading',{name:'Вход в рабочую область',exact:true}).waitFor();assert.equal((await rpc('session',undefined,prior)).status,401);
  });
  await check('browser_consumed_expired_encoded_links_and_reload',async()=>{
   await page.evaluate(token=>{location.hash='staff%2Daction=activate&%74oken='+token;},q.token);await form('Принять приглашение');await submit(password);
   await page.getByRole('alert').filter({hasText:'Ссылка истекла'}).waitFor();
   const x=await staff(),expired=await enqueue(x);tokens.push(expired.token);assert.equal((await send(x)).state,'accepted');
   await owner.query("UPDATE staff_private.activation_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[expired.job.token_hash]);
   await page.evaluate(token=>{location.hash='staff-action=activate&token='+token;},expired.token);await form('Принять приглашение');await submit(password);await page.getByRole('alert').filter({hasText:'Ссылка истекла'}).waitFor();await clean();
   await page.reload();await page.getByRole('heading',{name:'Вход в рабочую область',exact:true}).waitFor();await clean();
  });
 }finally{if(browser)await browser.close();web.closeAllConnections();await new Promise(r=>web.close(r));}
};
