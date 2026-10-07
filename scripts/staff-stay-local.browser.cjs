'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process'),{randomUUID}=require('crypto');
const {chromium}=require('playwright'),{root}=require('../apps/api/ops/local-state.cjs').localState();
(async()=>{
 if(process.argv[2]!=='--ack=LOCAL_SYNTHETIC_STAY_PROOF')throw Error('STAY_PROOF_ACK_REQUIRED');
 const seed=spawnSync(process.execPath,['apps/api/ops/prepare-local-stay.cjs','--ack=LOCAL_SYNTHETIC_STAY'],{encoding:'utf8'});assert.equal(seed.status,0);const fixture=JSON.parse(seed.stdout);
 const blockedSeed=spawnSync(process.execPath,['apps/api/ops/prepare-local-stay.cjs','--ack=LOCAL_SYNTHETIC_STAY','--without-guest'],{encoding:'utf8'});assert.equal(blockedSeed.status,0);const blocked=JSON.parse(blockedSeed.stdout);
 const docsSeed=spawnSync(process.execPath,['apps/api/ops/prepare-local-stay.cjs','--ack=LOCAL_SYNTHETIC_STAY','--document-statuses'],{encoding:'utf8'});assert.equal(docsSeed.status,0);const docsFixture=JSON.parse(docsSeed.stdout);
 const login=JSON.parse(fs.readFileSync(path.join(root,'private/staff-browser-fixture.json'),'utf8'));assert.match(login.email,/^auth-proof-[a-f0-9]+@views\.invalid$/);
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),context=await browser.newContext(),page=await context.newPage();
 const report={stage:'7.35',result:'fail',sourceCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),sourceDirty:!!spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.trim(),checks:[],productionEnabled:false,realPayments:false};
 const errors=[];page.on('pageerror',e=>errors.push(e.name));
 try{
  await page.goto('http://localhost:4173/?api=local-core');await page.getByLabel('Email сотрудника',{exact:true}).fill(login.email);await page.getByLabel('Пароль',{exact:true}).fill(login.password);await page.getByRole('button',{name:'Войти',exact:true}).click();
  const reception=page.getByRole('region',{name:'Ресепшен',exact:true});
  const arriving=reception.getByRole('region',{name:'Ожидаемые заезды',exact:true}).locator('[data-stay-id="'+fixture.reservationId+'"]');await arriving.waitFor();
  await arriving.getByText('Основной гость: Synthetic Local Stay',{exact:true}).waitFor();
  const blockedRow=reception.getByRole('region',{name:'Ожидаемые заезды',exact:true}).locator('[data-stay-id="'+blocked.reservationId+'"]');
  await blockedRow.getByText('Не указан основной гость.',{exact:true}).waitFor();assert.equal(await blockedRow.getByRole('button',{name:'Заселить (тест)',exact:true}).isDisabled(),true);
  report.checks.push('server_guest_card_and_missing_guest_blocks_ui');
  await arriving.getByText('Документы не добавлены.',{exact:true}).waitFor();
  const docsRow=reception.getByRole('region',{name:'Ожидаемые заезды',exact:true}).locator('[data-stay-id="'+docsFixture.reservationId+'"]');
  for(const state of ['Загрузка не завершена','Ожидает проверки','Отклонён','Срок действия истёк'])await docsRow.getByText('Паспорт: '+state,{exact:true}).waitFor();
  assert.equal(await docsRow.getByRole('button',{name:'Заполнить данные гостя (тест)',exact:true}).isDisabled(),true);
  assert.equal(await docsRow.getByText('Паспорт: Проверен в Core',{exact:true}).count(),0);
  report.checks.push('document_statuses_expiry_and_guest_edit_lock');
  async function api(route,body,key,csrf=true){return page.evaluate(async({route,body,key,csrf})=>{
   const session=await(await fetch('/local-api/session',{headers:{'X-Views-Local-Workspace':'1'}})).json();
   const r=await fetch('/local-api/'+route,{method:'POST',headers:{'X-Views-Local-Workspace':'1','Content-Type':'application/json','Idempotency-Key':key,...(csrf?{'X-CSRF-Token':session.csrf}:{})},body:JSON.stringify(body)});
   return {status:r.status,body:await r.json()};
  },{route,body,key,csrf});}
  const denied=await api('check-in',{reservationId:blocked.reservationId},randomUUID());assert.equal(denied.status,409);assert.equal(denied.body.error,'STAY_GUEST_REQUIRED');
  assert.equal((await api('check-in',{reservationId:fixture.reservationId},randomUUID(),false)).status,403);
  assert.equal((await api('check-in',{reservationId:randomUUID()},randomUUID())).status,403);assert.equal((await api('check-in',{reservationId:fixture.reservationId,localStayPilot:true},randomUUID())).status,400);report.checks.push('csrf_workspace_scope_and_body_allowlist');
  const guest={firstName:'Synthetic',lastName:'Edited',dateOfBirth:'2000-02-29',nationality:'UZ',expectedVersion:1};
  assert.equal((await api('guest',{reservationId:blocked.reservationId,guest},randomUUID(),false)).status,403);
  assert.equal((await api('guest',{reservationId:randomUUID(),guest},randomUUID())).status,403);
  assert.equal((await api('guest',{reservationId:blocked.reservationId,guest:{...guest,verified:true}},randomUUID())).status,400);
  await blockedRow.getByRole('button',{name:'Заполнить данные гостя (тест)',exact:true}).click();
  const form=page.getByRole('form',{name:'Данные тестового гостя'});
  await form.getByLabel('Имя гостя',{exact:true}).fill(guest.firstName);await form.getByLabel('Фамилия гостя',{exact:true}).fill(guest.lastName);await form.getByLabel('Дата рождения',{exact:true}).fill(guest.dateOfBirth);
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await form.getByRole('button',{name:'Сохранить тестового гостя',exact:true}).click();
  await blockedRow.getByText('Основной гость: Synthetic Edited',{exact:true}).waitFor();
  await page.reload();await blockedRow.getByText('Основной гость: Synthetic Edited',{exact:true}).waitFor();
  assert.equal(await blockedRow.getByRole('button',{name:'Заселить (тест)',exact:true}).isEnabled(),true);
  assert.equal((await api('guest',{reservationId:blocked.reservationId,guest},randomUUID())).status,409);
  report.checks.push('guest_form_persists_unlocks_arrival_and_rejects_stale_write');
  await arriving.getByRole('button',{name:'Заселить (тест)',exact:true}).click();await reception.getByRole('button',{name:'Отмена',exact:true}).click();await arriving.waitFor();report.checks.push('cancel_keeps_confirmed');
  await arriving.getByRole('button',{name:'Заселить (тест)',exact:true}).click();await reception.getByRole('button',{name:'Подтвердить действие',exact:true}).click();await reception.getByText('Тестовое заселение оформлено.',{exact:true}).waitFor();
  await page.reload();const staying=page.getByRole('region',{name:'Сейчас проживают',exact:true}).locator('[data-stay-id="'+fixture.reservationId+'"]');await staying.waitFor();report.checks.push('check_in_survives_reload');
  assert.equal((await api('check-in',{reservationId:fixture.reservationId},randomUUID())).status,409);
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}report.checks.push('four_widths');
  await staying.getByRole('button',{name:'Оформить выезд (тест)',exact:true}).click();await reception.getByRole('button',{name:'Подтвердить действие',exact:true}).click();await reception.getByText('Тестовый выезд оформлен.',{exact:false}).waitFor();
  await page.reload();await page.getByRole('region',{name:'Сейчас проживают',exact:true}).waitFor();assert.equal(await staying.count(),0);report.checks.push('check_out_survives_reload');assert.deepEqual(errors,[]);
  Object.assign(report,{result:'pass',pageErrors:errors,checkedAt:new Date().toISOString()});
 }catch(e){report.failure={code:e.code||e.name,frames:String(e.stack||'').split('\n').filter(l=>/^\s+at /.test(l)).slice(0,4)};process.exitCode=1;}
 finally{await browser.close();fs.writeFileSync(path.join(root,'evidence/stage732-stay.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})().catch(()=>{console.error('STAY_BROWSER_PROOF_FAILED');process.exitCode=1;});
