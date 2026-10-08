'use strict';
// Real compiled reception UI; synthetic HTTP only. No server, credentials or DB.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
module.exports=async function guestLinkStaffBrowserProof({browser,dist=path.resolve('dist')}){
 const origin='http://127.0.0.1:4173',reservationId=randomUUID(),linkId=randomUUID();
 const token='vglk_'+'x'.repeat(43),email='synthetic-guest@views.invalid',csrf='synthetic-staff-csrf';
 const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage();
 page.setDefaultTimeout(10000);
 const checks=[],errors=[],unexpected=[],writes=[],revokes=[];
 let invitation=null,loseReply=true,enabled=true,canManage=true,phase='load';
 const expiresAt=new Date(Date.now()+3600000).toISOString(),now=new Date().toISOString();
 const empty={items:[],total:0,truncated:false};
 const property={id:randomUUID(),name:{ru:'Тестовый объект',uz:'Sinov obyekti',en:'Synthetic property'},timezone:'Asia/Tashkent'};
 const row={reservationId,confirmationCode:'SYNTHETIC-LINK',unitCode:'TEST-1',status:'confirmed',version:1,checkInAt:now,checkOutAt:new Date(Date.now()+86400000).toISOString()};
 const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 page.on('pageerror',()=>errors.push('BROWSER_JS_ERROR'));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){unexpected.push('EXTERNAL_ORIGIN');return route.abort();}
  assert.ok(!url.href.includes(token),'INVITATION_IN_URL');
  if(url.pathname==='/local-api/session')return json(route,{authenticated:true,csrf,identity:{role:'front_desk',permissions:canManage?['reservation.manage']:[],email:'synthetic-staff@views.invalid',displayName:'Synthetic staff',emailVerified:false}});
  if(url.pathname==='/local-api/workspace')return json(route,{property,units:[],reservations:[],reservationsTruncated:false,databaseTime:now,syntheticData:true,realPayments:false});
  if(url.pathname==='/local-api/reception')return json(route,{property,day:now.slice(0,10),databaseTime:now,arrivals:{items:[row],total:1,truncated:false},departures:empty,staying:empty,cleaning:empty});
  if(url.pathname==='/local-api/reservations/'+reservationId+'/guest-link'){
   assert.equal(request.headers()['x-csrf-token'],csrf);
   if(!enabled)return json(route,{error:'GUEST_LINK_DISABLED'},503);
   if(request.method()==='GET')return json(route,{invitation});
   assert.equal(request.method(),'POST');
   const body=request.postDataJSON(),key=request.headers()['idempotency-key'];
   assert.deepEqual(body,{email});assert.match(key,/^[a-f0-9-]{36}$/);
   writes.push({body,key});invitation={linkId,expiresAt,recipientEmail:email,status:'pending'};
   // The first response is lost after the synthetic server records the invitation.
   if(loseReply){loseReply=false;return route.abort('failed');}
   return json(route,{linkId,expiresAt,token,delivery:'manual_handoff',replayed:true});
  }
  if(url.pathname==='/local-api/reservations/'+reservationId+'/guest-link/revoke'){
   assert.equal(request.method(),'POST');assert.equal(request.headers()['x-csrf-token'],csrf);
   const body=request.postDataJSON();assert.deepEqual(body,{linkId});revokes.push(body);
   invitation={...invitation,status:'revoked'};return json(route,{revoked:true});
  }
  if(url.pathname.startsWith('/local-api/')){unexpected.push(url.pathname);return route.abort();}
  const root=path.resolve(dist),file=path.resolve(root,url.pathname.slice(1)||'index.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]});
 });
 const panel=page.locator('[data-stay-id="'+reservationId+'"] details');
 async function open(){await panel.locator('summary').click();await panel.getByRole('button',{name:'Обновить приглашение',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[data-stay-id] details button')?.disabled);}
 try{
  await page.goto(origin+'/',{waitUntil:'networkidle'});await open();
  await panel.getByLabel('Email получателя',{exact:true}).fill(email.toUpperCase());
  const labels={ru:['Приглашение гостя к брони','Email получателя','Выдать приглашение'],uz:['Mehmonni bronga taklif qilish','Qabul qiluvchi emaili','Taklif berish'],en:['Guest booking invitation','Recipient email','Issue invitation']};
  for(const [locale,[summary,label,button]] of Object.entries(labels)){
   await page.locator('.staffLanguage select').selectOption(locale);
   assert.equal(await panel.locator('summary').innerText(),summary);
   assert.equal(await panel.getByLabel(label,{exact:true}).inputValue(),email.toUpperCase());
   await panel.getByRole('button',{name:button,exact:true}).waitFor();
   for(const width of [360,768,1440]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'STAFF_LINK_OVERFLOW_'+locale+'_'+width);}
  }
  checks.push('reception_invitation_three_languages_three_widths');
  await page.locator('.staffLanguage select').selectOption('ru');
  phase='lost_issue_reply';await panel.getByRole('button',{name:'Выдать приглашение',exact:true}).click();await panel.getByRole('alert').waitFor();
  assert.equal(await panel.getByLabel('Email получателя',{exact:true}).isDisabled(),true);
  await panel.getByRole('button',{name:'Выдать приглашение',exact:true}).click();await panel.getByLabel('Код приглашения',{exact:true}).waitFor();
  assert.equal(await panel.getByLabel('Код приглашения',{exact:true}).inputValue(),token);
  assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);
  assert.ok(!await page.evaluate(t=>JSON.stringify({...localStorage,...sessionStorage}).includes(t),token));
  await page.setViewportSize({width:360,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'ISSUED_TOKEN_MOBILE_OVERFLOW');
  checks.push('lost_reply_same_normalized_email_key_manual_retry_no_token_storage');
  phase='restore_pending';await page.reload({waitUntil:'networkidle'});await open();
  await panel.getByText('Приглашение уже существует. Отзовите его перед выпуском нового.',{exact:false}).waitFor();
  assert.equal(await panel.getByLabel('Код приглашения',{exact:true}).count(),0);
  assert.ok((await panel.innerText()).includes(email));
  phase='restore_accepted';invitation={...invitation,status:'accepted'};
  await panel.getByRole('button',{name:'Обновить приглашение',exact:true}).click();await panel.getByText('Принято. Доступ сохраняется до отзыва.',{exact:true}).waitFor();
  for(const [locale,text] of [['uz','Qabul qilingan. Kirish bekor qilinmaguncha saqlanadi.'],['en','Accepted. Access remains until revoked.'],['ru','Принято. Доступ сохраняется до отзыва.']]){
   await page.locator('.staffLanguage select').selectOption(locale);await panel.getByText(text,{exact:true}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'ACCEPTED_MOBILE_OVERFLOW_'+locale);
  }
  await panel.getByRole('button',{name:'Отозвать приглашение',exact:true}).click();await panel.getByText('Приглашение и доступ по нему отозваны.',{exact:true}).waitFor();
  assert.equal(revokes.length,1);assert.equal(invitation.status,'revoked');
  await page.reload({waitUntil:'networkidle'});await open();await panel.getByLabel('Email получателя',{exact:true}).waitFor();
  checks.push('pending_and_accepted_status_recovery_without_token_revoke_after_reload');
  phase='disabled';enabled=false;await page.reload({waitUntil:'networkidle'});await open();
  await panel.getByText('Привязка бронирований на этом сервере не подключена.',{exact:true}).waitFor();
  assert.equal(await panel.getByLabel('Код приглашения',{exact:true}).count(),0);assert.equal(writes.length,2);
  canManage=false;await page.reload({waitUntil:'networkidle'});assert.equal(await panel.count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  checks.push('disabled_feature_explicit_read_error_staff_without_permission_has_no_panel');
  console.log(JSON.stringify({result:'pass',proof:'guest_link_staff_browser_http_fixtures',checks,httpFixturesOnly:true,externalRequestsSent:0}));
 }catch(error){console.error(JSON.stringify({result:'fail',proof:'guest_link_staff_browser_http_fixtures',phase,checks,error:error.name}));throw error;}finally{await context.close();}
};
if(require.main===module)(async()=>{
 const {chromium}=require('playwright');
 const browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
 try{await module.exports({browser,dist:process.argv[2]||path.resolve('dist')});}finally{await browser.close();}
})().catch(error=>{console.error(error.name);process.exitCode=1;});
