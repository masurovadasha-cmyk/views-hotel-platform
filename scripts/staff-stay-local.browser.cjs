'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process'),{randomUUID}=require('crypto');
const {chromium}=require('playwright'),{root}=require('../apps/api/ops/local-state.cjs').localState();
(async()=>{
 if(process.argv[2]!=='--ack=LOCAL_SYNTHETIC_STAY_PROOF')throw Error('STAY_PROOF_ACK_REQUIRED');
 const seed=spawnSync(process.execPath,['apps/api/ops/prepare-local-stay.cjs','--ack=LOCAL_SYNTHETIC_STAY'],{encoding:'utf8'});assert.equal(seed.status,0);const fixture=JSON.parse(seed.stdout);
 const blockedSeed=spawnSync(process.execPath,['apps/api/ops/prepare-local-stay.cjs','--ack=LOCAL_SYNTHETIC_STAY','--without-guest'],{encoding:'utf8'});assert.equal(blockedSeed.status,0);const blocked=JSON.parse(blockedSeed.stdout);
 const docsSeed=spawnSync(process.execPath,['apps/api/ops/prepare-local-stay.cjs','--ack=LOCAL_SYNTHETIC_STAY','--document-statuses'],{encoding:'utf8'});assert.equal(docsSeed.status,0);const docsFixture=JSON.parse(docsSeed.stdout);
 const previewSeed=spawnSync(process.execPath,['apps/api/ops/prepare-local-stay.cjs','--ack=LOCAL_SYNTHETIC_STAY','--document-preview'],{encoding:'utf8'});assert.equal(previewSeed.status,0);const previewFixture=JSON.parse(previewSeed.stdout);
 const login=JSON.parse(fs.readFileSync(path.join(root,'private/staff-browser-fixture.json'),'utf8'));assert.match(login.email,/^auth-proof-[a-f0-9]+@views\.invalid$/);
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),context=await browser.newContext(),page=await context.newPage();
 const report={stage:'7.44',result:'fail',sourceCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),sourceDirty:!!spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.trim(),checks:[],productionEnabled:false,realPayments:false};
 const errors=[];page.on('pageerror',e=>errors.push(e.name));
 try{
  await page.goto('http://localhost:4173/?api=local-core');await page.getByLabel('Email сотрудника',{exact:true}).fill(login.email);await page.getByLabel('Пароль',{exact:true}).fill(login.password);const loginResponsePromise=page.waitForResponse(r=>r.url().endsWith('/local-api/login'));await page.getByRole('button',{name:'Войти',exact:true}).click();const loginResponse=await loginResponsePromise;if(loginResponse.status()!==200){const failure=await loginResponse.json();throw Error('LOGIN_HTTP_'+loginResponse.status()+'_'+(failure.error||'UNKNOWN'));}
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
  const previewRow=reception.getByRole('region',{name:'Ожидаемые заезды',exact:true}).locator('[data-stay-id="'+previewFixture.reservationId+'"]');
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/local-api/document-view'));
  await previewRow.getByRole('button',{name:'Открыть тестовый файл',exact:true}).click();
  const response=await responsePromise;assert.equal(response.status(),200);assert.equal(response.headers()['cache-control'],'no-store');
  const previewData=await response.json();assert.equal(previewData.syntheticData,true);
  const preview=page.getByRole('region',{name:'Просмотр тестового файла',exact:true});await preview.getByText('Not an identity document.',{exact:false}).waitFor();
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  assert.equal((await api('document-view',{reservationId:previewFixture.reservationId,documentId:previewData.documentId},randomUUID(),false)).status,403);
  assert.equal((await api('document-view',{reservationId:fixture.reservationId,documentId:previewData.documentId},randomUUID())).status,404);
  for(const mode of ['stop','start'])assert.equal(spawnSync(process.execPath,['apps/api/ops/cloud-local-rehearsal.cjs',mode],{encoding:'utf8'}).status,0);
  await page.reload();await previewRow.getByRole('button',{name:'Открыть тестовый файл',exact:true}).click();await preview.getByText('Not an identity document.',{exact:false}).waitFor();
  report.checks.push('same_encrypted_file_survives_core_and_gateway_restart');
  await preview.getByRole('button',{name:'Закрыть просмотр',exact:true}).click();assert.equal(await preview.count(),0);
  await page.clock.install();await previewRow.getByRole('button',{name:'Открыть тестовый файл',exact:true}).click();await preview.getByText('Not an identity document.',{exact:false}).waitFor();
  await page.clock.fastForward(61000);assert.equal(await preview.count(),0);await page.clock.resume();
  report.checks.push('encrypted_preview_no_store_scope_csrf_close_and_timeout');
  await previewRow.getByRole('button',{name:'Открыть тестовый файл',exact:true}).click();
  await preview.getByText('Not an identity document.',{exact:false}).waitFor();
  assert.equal(await preview.getByRole('button',{name:'Принять тестовый документ',exact:true}).isDisabled(),true);
  await preview.getByLabel('Я просмотрел искусственный тестовый файл',{exact:true}).check();
  const reviewResponsePromise=page.waitForResponse(r=>r.url().endsWith('/local-api/document-review'));
  await preview.getByRole('button',{name:'Принять тестовый документ',exact:true}).click();
  const reviewResponse=await reviewResponsePromise;if(reviewResponse.status()!==200){const failure=await reviewResponse.json();throw Error('REVIEW_HTTP_'+reviewResponse.status()+'_'+(failure.error||'UNKNOWN'));}
  await previewRow.getByText('Другой документ: Проверен в Core',{exact:true}).waitFor();
  await page.reload();await previewRow.getByText('Другой документ: Проверен в Core',{exact:true}).waitFor();
  const staleReview=await api('document-review',{reservationId:previewFixture.reservationId,documentId:previewData.documentId,decision:'rejected',reviewToken:previewData.reviewToken},randomUUID());assert.equal(staleReview.status,409);
  report.checks.push('explicit_document_review_persists_and_stale_decision_denied');
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
  const cleaning=page.getByRole('region',{name:'Ожидают уборки (тест)',exact:true}).locator('[data-stay-id="'+fixture.reservationId+'"]');await cleaning.waitFor();
  const cleaningBoard=page.getByRole('region',{name:'Ожидают уборки (тест)',exact:true});
  const code=await cleaning.locator('strong').innerText();
  await cleaningBoard.getByLabel('Поиск уборки по номеру или брони',{exact:true}).fill('no-match-'+randomUUID());
  await cleaningBoard.getByText('Совпадений в загруженной очереди нет. Измените или сбросьте поиск.',{exact:true}).waitFor();
  assert.equal(await cleaningBoard.locator('[data-stay-id]').count(),0);
  await cleaningBoard.getByRole('button',{name:'Сбросить поиск уборки',exact:true}).click();await cleaning.waitFor();
  await cleaningBoard.getByLabel('Поиск уборки по номеру или брони',{exact:true}).fill('  '+code.toLowerCase()+'  ');
  assert.equal(await cleaningBoard.locator('[data-stay-id]').count(),1);
  await cleaningBoard.getByLabel('Порядок очереди уборки',{exact:true}).selectOption('unit');await cleaning.waitFor();
  for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  report.checks.push('turnover_search_clear_sort_and_four_widths');
  await cleaning.getByRole('button',{name:'Подтвердить уборку (тест)',exact:true}).click();
  const confirmation=page.getByRole('alertdialog',{name:'Подтвердить готовность номера',exact:true});await confirmation.waitFor();
  assert.equal(await confirmation.getByRole('button',{name:'Подтвердить действие',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Shift+Tab');assert.equal(await confirmation.getByRole('button',{name:'Отмена',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Tab');assert.equal(await confirmation.getByRole('button',{name:'Подтвердить действие',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');await cleaning.waitFor();assert.equal(await confirmation.count(),0);
  assert.equal(await cleaning.getByRole('button',{name:'Подтвердить уборку (тест)',exact:true}).evaluate(el=>el===document.activeElement),true);
  report.checks.push('turnover_confirmation_keyboard_cancel_restores_focus');
  await cleaning.getByRole('button',{name:'Подтвердить уборку (тест)',exact:true}).click();await reception.getByRole('button',{name:'Подтвердить действие',exact:true}).click();
  await reception.getByText('Готовность тестового номера после уборки подтверждена.',{exact:true}).waitFor();
  await page.reload();await page.getByRole('region',{name:'Ожидают уборки (тест)',exact:true}).waitFor();assert.equal(await cleaning.count(),0);report.checks.push('checkout_creates_cleaning_and_confirmation_survives_reload');
  // UI-only projection fixture: no synthetic row below is written to Core.
  const projectionRoute='**/local-api/reception?*';
  await page.route(projectionRoute,async route=>{
   const response=await route.fetch();assert.equal(response.status(),200);const board=await response.json();
   board.cleaning={total:103,truncated:true,items:[
    {reservationId:'ui-a',confirmationCode:'UI-A',unitCode:'10',checkOutAt:'2026-10-07T11:00:00+05:00'},
    {reservationId:'ui-b',confirmationCode:'UI-B',unitCode:'2',checkOutAt:'2026-10-07T07:00:00Z'},
    {reservationId:'ui-c',confirmationCode:'UI-C',unitCode:'1',checkOutAt:'2026-10-07T08:00:00Z'}
   ].map(row=>({...row,checkInAt:'2026-10-06T00:00:00Z',status:'checked_out',version:1,stayPilot:false}))};
   await route.fulfill({response,json:board});
  });
  await page.reload();await cleaningBoard.getByText('Загружены первые 3 из 103 записей. Поиск и сортировка действуют только на загруженную часть очереди.',{exact:true}).waitFor();
  assert.deepEqual(await cleaningBoard.locator('[data-stay-id]').evaluateAll(rows=>rows.map(row=>row.dataset.stayId)),['ui-a','ui-b','ui-c']);
  await cleaningBoard.getByLabel('Порядок очереди уборки',{exact:true}).selectOption('unit');
  assert.deepEqual(await cleaningBoard.locator('[data-stay-id]').evaluateAll(rows=>rows.map(row=>row.dataset.stayId)),['ui-c','ui-b','ui-a']);
  assert.equal(await cleaningBoard.getByRole('button',{name:'Подтвердить уборку (тест)',exact:true}).evaluateAll(buttons=>buttons.every(button=>button.disabled)),true);
  await page.unroute(projectionRoute);await page.reload();await cleaningBoard.waitFor();
  assert.equal(await cleaningBoard.locator('[data-stay-id^="ui-"]').count(),0);assert.deepEqual(errors,[]);
  report.checks.push('ui_only_truncated_projection_numeric_and_timezone_sort_nonpilot_disabled');
  assert.equal((await api('logout',{all:false},randomUUID())).status,200);
  assert.equal((await api('document-view',{reservationId:previewFixture.reservationId,documentId:previewData.documentId},randomUUID())).status,401);report.checks.push('document_preview_denied_after_logout');
  Object.assign(report,{result:'pass',pageErrors:errors,checkedAt:new Date().toISOString()});
 }catch(e){report.failure={code:e.code||e.name,safeDetail:/^(?:REVIEW|LOGIN)_HTTP_[A-Z0-9_]+$/.test(e.message)?e.message:undefined,frames:String(e.stack||'').split('\n').filter(l=>/^\s+at /.test(l)).slice(0,4)};process.exitCode=1;}
 finally{await browser.close();fs.writeFileSync(path.join(root,'evidence/stage732-stay.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})().catch(()=>{console.error('STAY_BROWSER_PROOF_FAILED');process.exitCode=1;});
