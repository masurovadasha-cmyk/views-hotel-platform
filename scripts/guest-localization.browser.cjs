// Offline browser fixtures only; no real guest authentication, booking or provider calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {chromium}=require('playwright'),catalog=require('../src/features/guest/guest-translations.json');
const target=process.env.VIEWS_GUEST_PROOF_BUILD||'dist';assert.ok(['dist','dist-android'].includes(target));
const android=target==='dist-android',origin=android?'https://appassets.androidplatform.net':'https://guest-preview.invalid',prefix=android?'/views-hotel-platform/':'/';
const tr=(locale,key)=>locale==='en'?key:catalog[key][locale];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.VIEWS_BROWSER_EXECUTABLE||'/usr/bin/chromium'});
 const report={stage:'7.46',result:'fail',build:target,sourceCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),sourceDirty:!!spawnSync('git',['status','--porcelain'],{encoding:'utf8'}).stdout.trim(),checks:[],apiFixturesOnly:true,externalRequestsSent:0,androidDeviceTested:false};
 const errors=[],unexpected=[];
 async function newPage(handler,blockedStorage=false){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  if(android)await page.addInitScript(()=>{delete String.prototype.replaceAll;});
  if(blockedStorage)await page.addInitScript(()=>{Object.defineProperty(Storage.prototype,'getItem',{value(){throw new DOMException('Blocked','SecurityError');}});Object.defineProperty(Storage.prototype,'setItem',{value(){throw new DOMException('Blocked','SecurityError');}});});
  page.on('pageerror',error=>errors.push(error.name));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}
   if(url.pathname.startsWith('/api/')){if(handler)return handler(route,url.pathname);unexpected.push(url.pathname);return route.abort();}
   if(!url.pathname.startsWith(prefix)){unexpected.push(url.pathname);return route.abort();}
   const file=path.resolve(target,decodeURIComponent(url.pathname.slice(prefix.length))||'index.html');
   if(!file.startsWith(path.resolve(target)+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.svg':'image/svg+xml'}[path.extname(file)];
   return route.fulfill({path:file,contentType:mime});
  });return page;
 }
 const widths=[360,390,768,1440],languages=['en','ru','uz'];
 try{
  const page=await newPage();await page.goto(origin+prefix+'?api=demo',{waitUntil:'networkidle'});
  for(const locale of languages){
   const t=key=>tr(locale,key);await page.locator('.guestLanguage select').selectOption(locale);assert.equal(await page.locator('html').getAttribute('lang'),locale);
   const nav=page.getByRole('navigation',{name:t('Guest sections'),exact:true});
   for(const tab of ['Explore','Bookings','Services','Messages','Profile']){
    await nav.getByRole('button',{name:t(tab),exact:true}).click();
    for(const width of widths){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'OVERFLOW_'+locale+'_'+tab+'_'+width);assert.equal(await nav.isVisible(),true);}
   }
   await nav.getByRole('button',{name:t('Explore'),exact:true}).click();
   await page.getByRole('button',{name:t('Map'),exact:true}).click();assert.equal(await page.locator('.mapStage').count(),1);await page.getByRole('button',{name:t('List'),exact:true}).click();
   const sms=page.getByRole('button',{name:t('SMS verification'),exact:true});await sms.click();
   const smsDialog=page.getByRole('dialog',{name:t('SMS verification unavailable'),exact:true});await smsDialog.waitFor();assert.equal(await smsDialog.locator('input').count(),0);
   await page.keyboard.press('Tab');assert.equal(await smsDialog.getByRole('button',{name:t('Close'),exact:true}).evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press('Escape');assert.equal(await sms.evaluate(el=>el===document.activeElement),true);
   await page.locator('.photoButton').first().click();let dialog=page.getByRole('dialog');
   for(const width of widths){await page.setViewportSize({width,height:1000});assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'MODAL_OVERFLOW_'+locale+'_'+width);}
   await dialog.getByRole('button',{name:t('Choose dates'),exact:true}).click();
   await dialog.getByLabel(t('Check-in'),{exact:true}).fill('');
   assert.equal(await dialog.getByRole('button',{name:t('Continue'),exact:true}).isDisabled(),true);
   await dialog.getByLabel(t('Check-in'),{exact:true}).fill('2027-03-10');await dialog.getByLabel(t('Check-out'),{exact:true}).fill('2027-03-12');
   await dialog.getByRole('button',{name:t('Continue'),exact:true}).click();await dialog.getByLabel(t('Full name'),{exact:true}).fill('Synthetic Guest');
   // Context rerender must not replace the current form or send any request.
   const next=locale==='en'?'ru':'en';await page.locator('.guestLanguage select').selectOption(next);assert.equal(await dialog.getByLabel(tr(next,'Full name'),{exact:true}).inputValue(),'Synthetic Guest');
   await page.locator('.guestLanguage select').selectOption(locale);
   await dialog.getByRole('button',{name:t('Continue'),exact:true}).click();assert.equal(await dialog.getByRole('button',{name:t('Continue to secure payment'),exact:true}).isDisabled(),true);
   await dialog.getByRole('button',{name:t('Preview confirmation state'),exact:true}).click();await dialog.getByRole('heading',{name:t('Confirmation screen preview'),exact:true}).first().waitFor();
   await dialog.getByText(t('Preview only. These screens do not create bookings or process payments.'),{exact:true}).waitFor();
   await dialog.getByRole('button',{name:t('Booking details'),exact:true}).click();await dialog.getByRole('button',{name:t('Change / cancel booking'),exact:true}).click();
   const last=dialog.getByRole('button',{name:t('Close'),exact:true});await last.focus();await page.keyboard.press('Shift+Tab');assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
   assert.equal(await dialog.getByRole('button',{name:t('Confirm cancellation'),exact:true}).isDisabled(),true);
   await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.locator('.photoButton').first().evaluate(el=>el===document.activeElement),true);
  }
  report.checks.push('three_languages_all_tabs_map_four_widths','translated_sms_keyboard_focus_no_fake_code','preview_journey_preserves_form_and_never_enables_payment_or_cancel');
  await page.locator('.guestLanguage select').selectOption('en');
  await page.locator('.heart').first().click();await page.getByRole('navigation').getByRole('button',{name:'Profile',exact:true}).click();
  await page.getByRole('button',{name:'Favorites Saved: 1',exact:true}).click();assert.equal(await page.locator('.apartmentCard').count(),1);
  await page.locator('.heart').first().click();await page.getByText('No apartments match. Change the guest count or turn off the favorites filter.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Show all apartments',exact:true}).click();assert.equal(await page.locator('.apartmentCard').count(),4);
  await page.getByRole('navigation').getByRole('button',{name:'Profile',exact:true}).click();await page.getByLabel('Search help…',{exact:true}).fill('refund');assert.equal(await page.locator('.helpLinks details').count(),1);
  await page.locator('.helpLinks summary').click();assert.equal(await page.locator('.helpLinks details').getAttribute('open'),'');
  await page.getByLabel('Search help…',{exact:true}).fill('no-match-123');await page.getByText('No help topics match your search.',{exact:true}).waitFor();
  report.checks.push('favorites_filter_and_help_search_work');
  await page.locator('.guestLanguage select').selectOption('uz');await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.guestLanguage select').inputValue(),'uz');
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),['views.guest.locale']);
  await page.evaluate(()=>localStorage.setItem('views.guest.locale','invalid'));await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.guestLanguage select').inputValue(),'en');
  const blocked=await newPage(undefined,true);await blocked.goto(origin+prefix+'?api=demo');await blocked.locator('.guestLanguage select').selectOption('ru');await blocked.getByRole('heading',{name:'Доступные апартаменты',exact:true}).waitFor();await blocked.close();
  report.checks.push('language_persists_invalid_or_blocked_storage_safe');
  let calls=0,failBookings=true;
  const fixtures=[{id:'fixture-1',confirmation_code:'DEMO-ONE',status:'confirmed',check_in_date:'2027-04-01',check_out_date:'2027-04-03',total_amount:null,currency:'UZS',property_name:'First Fixture',city:'City One',unit_code:'10'},
   {id:'fixture-2',confirmation_code:'DEMO-TWO',status:'checked_in',check_in_date:'2027-06-09',check_out_date:'2027-06-12',total_amount:null,currency:'UZS',property_name:'<em>Second Fixture</em>',city:'City Two',unit_code:'42'}];
  const live=await newPage(async(route,url)=>{
   calls++;if(url==='/api/session')return route.fulfill({json:{authenticated:true,session:{mode:'guest',userId:'fixture',guestId:'fixture',organizationId:'fixture'}}});
   if(url==='/api/my-bookings')return route.fulfill(failBookings?{status:503,json:{error:'FIXTURE_UNAVAILABLE'}}:{json:{items:fixtures}});
   unexpected.push(url);return route.abort();
  });
  await live.goto(origin+prefix+'?api=live',{waitUntil:'networkidle'});await live.getByRole('navigation').getByRole('button',{name:'Bookings',exact:true}).click();await live.getByRole('alert').getByText('Could not load bookings. Check your connection and try again.',{exact:true}).waitFor();
  failBookings=false;await live.getByRole('button',{name:'Retry',exact:true}).click();await live.locator('.bookingCard').nth(1).waitFor();
  const beforeLanguage=calls;await live.locator('.guestLanguage select').selectOption('ru');await live.locator('.bookingCard').nth(1).getByRole('button',{name:'Детали',exact:true}).click();
  const details=live.getByRole('dialog',{name:'Детали брони',exact:true});await details.getByText('DEMO-TWO',{exact:true}).waitFor();await details.getByText('<em>Second Fixture</em>',{exact:true}).waitFor();
  assert.equal(await details.locator('em,img').count(),0);assert.equal(await details.getByText('First Fixture',{exact:true}).count(),0);await details.getByText('2027-06-09 → 2027-06-12',{exact:true}).waitFor();
  assert.equal(calls,beforeLanguage);await live.keyboard.press('Escape');await live.close();report.checks.push('mocked_live_booking_retry_and_correct_selected_details_no_demo_substitution');
  let loginCalls=0;
  const auth=await newPage(async(route,url)=>{
   if(url==='/api/session')return route.fulfill({json:{authenticated:false}});
   if(url==='/api/auth-email'){loginCalls++;return route.fulfill({status:503,json:{error:'FIXTURE_UNAVAILABLE'}});}
   unexpected.push(url);return route.abort();
  });
  await auth.goto(origin+prefix+'?api=live',{waitUntil:'networkidle'});await auth.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');await auth.locator('.guestLanguage select').selectOption('uz');assert.equal(await auth.getByLabel('Email',{exact:true}).inputValue(),'synthetic@example.invalid');assert.equal(loginCalls,0);
  await auth.getByRole('button',{name:'Email bilan davom etish',exact:true}).click();await auth.getByText('Kirish soʻrovi bajarilmadi. Ulanishni tekshiring va qayta urining.',{exact:true}).waitFor();
  await auth.locator('.guestLanguage select').selectOption('ru');await auth.getByText('Запрос входа не выполнен. Проверьте соединение и повторите попытку.',{exact:true}).waitFor();assert.equal(loginCalls,1);await auth.close();report.checks.push('mocked_public_login_error_retranslates_without_resend');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);Object.assign(report,{result:'pass',pageErrors:0,checkedAt:new Date().toISOString()});
 }catch(error){report.failure={code:error.code||error.name,message:error.message,frames:String(error.stack||'').split('\n').filter(line=>/^\s+at /.test(line)).slice(0,3)};process.exitCode=1;}
 finally{await browser.close();fs.mkdirSync('review-output',{recursive:true});fs.writeFileSync('review-output/guest-locale-'+(android?'android':'web')+'-evidence.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
})().catch(error=>{console.error(error);process.exitCode=1;});
