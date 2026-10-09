'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const {chromium}=require('playwright'),{root}=require('../apps/api/ops/local-state.cjs').localState();
(async()=>{
 if(process.argv[2]!=='--ack=LOCAL_STAFF_LOCALE_PROOF')throw Error('LOCALE_PROOF_ACK_REQUIRED');
 const prepare=flag=>{const result=spawnSync(process.execPath,['apps/api/ops/prepare-local-stay.cjs','--ack=LOCAL_SYNTHETIC_STAY',flag],{encoding:'utf8'});assert.equal(result.status,0);return JSON.parse(result.stdout);};
 const stay=prepare('--without-guest'),documentStay=prepare('--document-preview');
 const login=JSON.parse(fs.readFileSync(path.join(root,'private/staff-browser-fixture.json'),'utf8'));assert.match(login.email,/^auth-proof-[a-f0-9]+@views\.invalid$/);
 const browser=await chromium.launch({headless:true,executablePath:process.env.VIEWS_BROWSER_EXECUTABLE||'/usr/bin/chromium'});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 const report={stage:'7.45',result:'fail',sourceCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),sourceDirty:!!spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.trim(),checks:[],productionEnabled:false,realPayments:false};
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.name));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/local-api/'))requests.push({path:new URL(r.url()).pathname,method:r.method()});});
 const select=()=>page.locator('.staffLanguage select');
 const change=async locale=>{await select().selectOption(locale);assert.equal(await page.locator('html').getAttribute('lang'),locale);};
 try{
  await page.goto('http://localhost:4173/',{waitUntil:'networkidle'});
  await page.evaluate(()=>localStorage.setItem('views.staff.locale','invalid'));
  await page.reload({waitUntil:'networkidle'});assert.equal(await select().inputValue(),'ru');
  await page.getByLabel('Email сотрудника',{exact:true}).fill(login.email);await page.getByLabel('Пароль',{exact:true}).fill(login.password);
  const beforeLoginSwitch=requests.length;
  for(const [locale,email,password,heading]of [['en','Staff email','Password','Sign in to workspace'],['uz','Xodim emaili','Parol','Ish maydoniga kirish'],['ru','Email сотрудника','Пароль','Вход в рабочую область']]){
   await change(locale);await page.getByRole('heading',{name:heading,exact:true}).waitFor();
   assert.equal(await page.getByLabel(email,{exact:true}).inputValue(),login.email);assert.equal(await page.getByLabel(password,{exact:true}).inputValue(),login.password);
  }
  assert.equal(requests.length,beforeLoginSwitch);report.checks.push('three_login_languages_preserve_fields_without_requests_invalid_preference_fallback');
  await change('en');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByLabel('Apartment',{exact:true}).waitFor();await page.waitForLoadState('networkidle');
  const row=page.locator('[data-stay-id="'+stay.reservationId+'"]');
  await row.getByText('The primary guest is not specified.',{exact:true}).waitFor();
  await row.getByRole('button',{name:'Enter guest details (test)',exact:true}).click();
  await page.getByLabel('Guest first name',{exact:true}).fill('Locale');await page.getByLabel('Guest last name',{exact:true}).fill('Synthetic');
  await page.getByLabel('Date of birth',{exact:true}).fill('1990-01-02');
  const beforeGuestSwitch=requests.length;await change('uz');
  assert.equal(await page.getByLabel('Mehmonning ismi',{exact:true}).inputValue(),'Locale');assert.equal(await page.getByLabel('Tugʻilgan sana',{exact:true}).inputValue(),'1990-01-02');
  assert.equal(requests.length,beforeGuestSwitch);
  await page.getByRole('button',{name:'Sinov mehmonini saqlash',exact:true}).click();
  await row.getByText('Asosiy mehmon: Locale Synthetic',{exact:true}).waitFor();
  report.checks.push('guest_form_survives_language_change_and_saves_via_core');
  for(const [locale,button,title,cancel]of [['ru','Заселить (тест)','Оформить тестовое заселение','Отмена'],['en','Check in (test)','Record test check-in','Cancel'],['uz','Joylashtirish (sinov)','Sinov joylashtirishini rasmiylashtirish','Bekor qilish']]){
   await change(locale);await row.getByRole('button',{name:button,exact:true}).click();const modal=page.getByRole('alertdialog',{name:title,exact:true});await modal.waitFor();
   assert.equal(await modal.getByRole('button',{name:cancel,exact:true}).count(),1);await page.keyboard.press('Escape');assert.equal(await modal.count(),0);
   assert.equal(await row.getByRole('button',{name:button,exact:true}).evaluate(el=>el===document.activeElement),true);
  }
  await change('en');await row.getByRole('button',{name:'Check in (test)',exact:true}).click();await page.getByRole('button',{name:'Confirm action',exact:true}).click();
  await page.getByText('Test check-in recorded.',{exact:true}).waitFor();await change('uz');
  await page.getByText('Sinov joylashtirishi rasmiylashtirildi.',{exact:true}).waitFor();
  await row.getByRole('button',{name:'Chiqishni rasmiylashtirish (sinov)',exact:true}).click();await page.getByRole('button',{name:'Amalni tasdiqlash',exact:true}).click();
  await page.locator('#staff-cleaning [data-stay-id="'+stay.reservationId+'"] ').waitFor();await change('en');
  await row.getByRole('button',{name:'Confirm cleaning (test)',exact:true}).click();await page.getByRole('button',{name:'Confirm action',exact:true}).click();
  await page.getByText('Test room readiness after cleaning is confirmed.',{exact:true}).waitFor();
  await page.reload({waitUntil:'networkidle'});assert.equal(await select().inputValue(),'en');assert.equal(await row.count(),0);
  assert.equal(requests.filter(r=>r.path==='/local-api/check-in'&&r.method==='POST').length,1);
  assert.equal(requests.filter(r=>r.path==='/local-api/check-out'&&r.method==='POST').length,1);
  assert.equal(requests.filter(r=>r.path==='/local-api/cleaning-complete'&&r.method==='POST').length,1);
  report.checks.push('translated_modal_cancel_and_single_checkin_checkout_cleaning_persist');
  const docRow=page.locator('[data-stay-id="'+documentStay.reservationId+'"]');await docRow.getByRole('button',{name:'Open test file',exact:true}).click();
  const preview=page.getByRole('region',{name:'Test file preview',exact:true});await preview.getByText('Not an identity document.',{exact:false}).waitFor();
  const beforePreviewSwitch=requests.length;const fileText=await preview.locator('pre').innerText();await change('uz');
  assert.equal(await page.getByRole('region',{name:'Sinov faylini koʻrish',exact:true}).locator('pre').innerText(),fileText);assert.equal(requests.length,beforePreviewSwitch);
  await page.getByRole('button',{name:'Koʻrishni yopish',exact:true}).click();await page.waitForLoadState('networkidle');report.checks.push('document_content_unchanged_and_no_refetch_on_language_change');
  for(const locale of ['ru','uz','en']){
   await change(locale);
   for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  }
  report.checks.push('three_languages_four_widths_no_overflow');
  await page.getByLabel('Apartment',{exact:true}).selectOption({index:1});
  const day=n=>new Date(Date.now()+(280+n)*86400000).toISOString().slice(0,10);
  await page.getByLabel('Check-in',{exact:true}).fill(day(0));await page.getByLabel('Check-out',{exact:true}).fill(day(2));
  await page.getByRole('button',{name:'Calculate via Core',exact:true}).click();await page.getByRole('button',{name:'Create test hold',exact:true}).waitFor();
  const beforeQuoteSwitch=requests.length;await change('uz');assert.equal(await page.getByLabel('Kelish',{exact:true}).inputValue(),day(0));
  assert.equal(await page.getByRole('button',{name:'Sinov bandlovini yaratish',exact:true}).isEnabled(),true);assert.equal(requests.length,beforeQuoteSwitch);
  const holdResponse=page.waitForResponse(r=>r.url().endsWith('/local-api/holds'));await page.getByRole('button',{name:'Sinov bandlovini yaratish',exact:true}).click();
  const held=await holdResponse;assert.equal(held.status(),200);const heldId=(await held.json()).reservationId;
  await page.reload({waitUntil:'networkidle'});assert.equal(await select().inputValue(),'uz');
  const heldRow=page.locator('[data-reservation-id="'+heldId+'"]');await heldRow.waitFor();await change('en');
  const releaseResponse=page.waitForResponse(r=>r.url().endsWith('/local-api/release'));await heldRow.getByRole('button',{name:'Release hold',exact:true}).click();assert.equal((await releaseResponse).status(),200);
  await heldRow.getByText('Cancelled',{exact:true}).waitFor();report.checks.push('quote_survives_language_change_hold_reload_release');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Sign in to workspace',exact:true}).waitFor();
  await change('uz');await page.getByText('Siz tizimdan chiqdingiz.',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage).sort()),['views.staff.locale','views.theme']);
  report.checks.push('notices_retranslate_and_only_language_is_stored');
  const isolated=await browser.newContext();await isolated.addInitScript(()=>{Object.defineProperty(Storage.prototype,'getItem',{value(){throw new DOMException('Blocked','SecurityError');}});Object.defineProperty(Storage.prototype,'setItem',{value(){throw new DOMException('Blocked','SecurityError');}});});
  const blocked=await isolated.newPage();blocked.on('pageerror',e=>errors.push(e.name));await blocked.goto('http://localhost:4173/');await blocked.getByRole('heading',{name:'Вход в рабочую область',exact:true}).waitFor();
  await blocked.locator('.staffLanguage select').selectOption('uz');await blocked.getByRole('heading',{name:'Ish maydoniga kirish',exact:true}).waitFor();await isolated.close();
  report.checks.push('blocked_storage_still_allows_in_memory_language_selection');
  assert.deepEqual(errors,[]);Object.assign(report,{result:'pass',pageErrors:errors,checkedAt:new Date().toISOString()});
 }catch(e){report.failure={code:e.code||e.name,frames:String(e.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,4)};process.exitCode=1;}
 finally{await browser.close();fs.writeFileSync(path.join(root,'evidence/stage745-locale.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})().catch(()=>{console.error('LOCALE_BROWSER_PROOF_FAILED');process.exitCode=1;});
