'use strict';
const assert=require('node:assert/strict');
module.exports=async function passwordAssuranceProof({page,context,owner,rpc,fixture,password,check}){
 let f;await check('password_ui_fixture_enrolls_key',async()=>{f=await fixture();});
 const account=page.getByRole('region',{name:'Учётная запись сотрудника',exact:true});
 const current=account.getByLabel('Текущий пароль',{exact:true}),next=account.getByLabel('Новый пароль',{exact:true});
 const save=account.getByRole('button',{name:'Сохранить новый пароль',exact:true});
 const confirm=account.getByRole('button',{name:'Подтвердить ключом для смены пароля',exact:true});
 const token=async()=>(await context.cookies('http://localhost:4173/local-api/session')).find(c=>c.name==='views_staff_session').value;
 const oldSession=await token();
 const version=async member=>(await owner.query('SELECT version FROM staff_private.credentials WHERE membership_id=$1',[member])).rows[0].version;
 const originalVersion=await version(f.member);
 async function fill(){await current.fill(password);await next.fill(password+' UI changed');}
 await check('password_ui_clears_closed_form_and_explains_server_assurance_denial',async()=>{
  await account.getByRole('button',{name:'Изменить пароль',exact:true}).click();await fill();
  await account.getByRole('button',{name:'Изменить пароль',exact:true}).click();await account.getByRole('button',{name:'Изменить пароль',exact:true}).click();
  assert.equal(await current.inputValue(),'');assert.equal(await next.inputValue(),'');
  await owner.query('UPDATE staff_private.sessions SET passkey_verified_until=NULL WHERE membership_id=$1',[f.member]);
  await fill();await save.click();await confirm.waitFor();
  assert.equal(await current.inputValue(),'');assert.equal(await next.inputValue(),'');assert.equal(await save.isDisabled(),true);
  assert.equal(await version(f.member),originalVersion);
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 });
 await check('password_ui_cancelled_authenticator_never_submits_password',async()=>{
  let mutations=0;const count=r=>{if(new URL(r.url()).pathname==='/local-api/password')mutations++;};page.on('request',count);
  try{
   await page.evaluate(()=>{const get=navigator.credentials.get.bind(navigator.credentials);navigator.credentials.get=async function(...args){navigator.credentials.get=get;throw new DOMException('Cancelled synthetic authenticator','NotAllowedError');};});
   await confirm.click();await account.getByText('Подтверждение ключом не завершено. Пароль этой попыткой не менялся. Повторите подтверждение или отмените смену пароля.',{exact:true}).waitFor();
   assert.equal(mutations,0);assert.equal(await version(f.member),originalVersion);
  }finally{page.off('request',count);}
 });
 await check('password_ui_explicit_uv_then_resubmit_revokes_old_sessions',async()=>{
  await confirm.click();await account.getByText('Ключ подтверждён. Введите текущий и новый пароли ещё раз и сохраните изменение.',{exact:true}).waitFor();
  assert.equal(await current.inputValue(),'');assert.equal(await next.inputValue(),'');assert.equal(await version(f.member),originalVersion);
  await fill();await save.click();await page.getByText('Пароль изменён. Все сессии отозваны. Войдите заново.',{exact:true}).waitFor();
  assert.equal((await rpc('session',undefined,oldSession)).status,401);
  assert.equal((await rpc('login',{email:f.email,password:password+' UI changed'})).status,200);
 });
 for(const failure of ['network','server']){
 const g=await fixture(),lostSession=await token();
 await check('password_ui_lost_success_response_'+failure+'_does_not_retry_or_claim_failure',async()=>{
  let attempts=0;
  await page.route('**/local-api/password',async route=>{attempts++;const result=await route.fetch();assert.equal(result.status(),200);if(failure==='network')await route.abort('failed');else await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'CORE_UNAVAILABLE'})});});
  try{
   await account.getByRole('button',{name:'Изменить пароль',exact:true}).click();await fill();await save.click();
   await page.getByText('Не удалось получить подтверждение смены пароля. Он мог измениться. Попробуйте войти с новым паролем; если он не подходит — с прежним.',{exact:true}).waitFor();
   assert.equal(attempts,1);assert.equal((await rpc('session',undefined,lostSession)).status,401);
   assert.equal((await rpc('login',{email:g.email,password:password+' UI changed'})).status,200);
   assert.equal(await page.getByLabel('Пароль',{exact:true}).inputValue(),'');
  }finally{await page.unroute('**/local-api/password');}
 });
 }
};
