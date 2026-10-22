// Synthetic HTTP fixtures only. Restricted PostgreSQL tests cover money and RLS.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{chromium}=require('playwright');
const origin='http://127.0.0.1:4173',id=randomUUID(),checks=[];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],unexpected=[],writes=[];
 let canReview=true,loseReply=true,stale=false,failRead=false,secondPage=false;
 const row={id,status:'uncertain',amountMinor:'9007199254740993',currency:'UZS',provider:'payme',revision:'a'.repeat(64),externalCaptureId:'synthetic-capture',externalRefundId:null};
 const reviews=[],completed=new Map(),json=(r,b,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(b)});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}
  if(url.pathname==='/local-api/session')return json(route,{authenticated:true,csrf:'synthetic',identity:{role:'accountant',permissions:canReview?['finance.read','finance.manage']:['finance.read'],email:'synthetic@views.invalid',displayName:'Synthetic accountant',emailVerified:false}});
  if(url.pathname==='/local-api/refund-reconciliation'){
   if(failRead)return json(route,{error:'CORE_UNAVAILABLE'},502);
   secondPage=url.searchParams.has('cursor');return json(route,{items:[row],nextCursor:secondPage?null:'synthetic-next-cursor'});
  }
  if(url.pathname==='/local-api/refund-reconciliation/'+id)return json(route,{...row,reviews});
  if(url.pathname==='/local-api/refund-reconciliation/'+id+'/reviews'){
   const body=route.request().postDataJSON(),key=route.request().headers()['idempotency-key'];writes.push({body,key});
   assert.deepEqual(Object.keys(body).sort(),['action','caseReference','expectedRevision']);
   if(completed.has(key)){assert.deepEqual(body,completed.get(key));return json(route,{idempotentReplay:true});}
   if(stale){stale=false;return json(route,{error:'REFUND_REVIEW_STALE'},409);}
   completed.set(key,body);reviews.push({id:randomUUID(),action:body.action,caseReference:body.caseReference,observedStatus:'uncertain',createdAt:new Date().toISOString()});
   if(loseReply){loseReply=false;return json(route,{error:'CORE_UNAVAILABLE'},502);}return json(route,{idempotentReplay:false});
  }
  if(url.pathname.startsWith('/local-api/')){unexpected.push(url.pathname);return route.abort();}
  const root=path.resolve('dist'),file=path.resolve(root,url.pathname.slice(1)||'index.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css'}[path.extname(file)]});
 });
 try{
  await page.goto(origin+'/',{waitUntil:'networkidle'});const panel=page.locator('.refundWorkspace');
  await panel.getByRole('button',{name:'Открыть сверку',exact:true}).click();
  await panel.getByLabel('Номер обращения',{exact:true}).fill('SYNTHETIC-CASE-1');
  for(const locale of ['en','uz','ru']){
   await page.locator('.staffLanguage select').selectOption(locale);
   assert.equal(await panel.locator('input').inputValue(),'SYNTHETIC-CASE-1');
   for(const width of [360,768,1440]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+locale+' '+width);}
  }
  assert.ok((await panel.innerText()).replace(/\s/g,'').includes('90071992547409,93'));checks.push('three_languages_exact_bigint_and_three_widths');
  await panel.getByRole('button',{name:'Записать проверку',exact:true}).click();await panel.getByRole('button',{name:'Повторить ту же запись',exact:true}).waitFor();
  assert.equal(await panel.getByLabel('Номер обращения',{exact:true}).isDisabled(),true);
  await panel.getByRole('button',{name:'Повторить ту же запись',exact:true}).click();await panel.getByText('Проверка записана. Статус возврата не изменён.',{exact:true}).waitFor();
  assert.deepEqual(writes[0],writes[1]);assert.equal(reviews.length,1);assert.equal(row.status,'uncertain');checks.push('lost_reply_reuses_key_body_and_keeps_financial_status');
  stale=true;await panel.getByLabel('Номер обращения',{exact:true}).fill('SYNTHETIC-CASE-2');await panel.getByRole('button',{name:'Записать проверку',exact:true}).click();
  await panel.getByText('Заявка изменилась или недоступна. Откройте её заново перед проверкой.',{exact:true}).waitFor();assert.equal(await panel.locator('.refundDetail').count(),0);checks.push('stale_state_requires_reopening');
  await panel.getByRole('button',{name:'Следующие 50 заявок',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.refundWorkspace button')?.disabled);assert.equal(secondPage,true);
  failRead=true;await panel.getByRole('button',{name:'Обновить очередь сверки',exact:true}).click();await panel.getByRole('alert').waitFor();assert.equal(await panel.getByRole('button',{name:'Открыть сверку',exact:true}).count(),0);
  failRead=false;await panel.getByRole('button',{name:'Обновить очередь сверки',exact:true}).click();await panel.getByRole('button',{name:'Открыть сверку',exact:true}).waitFor();checks.push('pagination_and_offline_read_retry');
  canReview=false;await page.reload({waitUntil:'networkidle'});await panel.getByRole('button',{name:'Открыть сверку',exact:true}).click();await panel.getByText('История проверок',{exact:true}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'Записать проверку',exact:true}).count(),0);assert.equal(reviews.length,1);checks.push('read_only_staff_sees_history_without_write_form');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await page.screenshot({path:'/tmp/views-refund-reconciliation.png',fullPage:true});
  console.log(JSON.stringify({stage:'B3',result:'pass',checks,httpFixturesOnly:true,externalRequestsSent:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
