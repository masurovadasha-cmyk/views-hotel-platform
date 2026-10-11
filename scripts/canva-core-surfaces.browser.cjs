'use strict';
// Appearance-only HTTP fixtures. Existing Core integration suites test real authorization/mutations.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const fixture=require('./fixtures/canva-core-ui.cjs');
const origin='http://127.0.0.1:4173',root=path.resolve('dist'),errors=[],unexpected=[],checks=[];
let browser,layouts=0,contrastSamples=0,minContrast=Infinity,reads=0,phase='setup';
async function inspect(page,label){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' horizontal overflow');layouts++;
 const result=await page.evaluate(()=>{
  const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number);
  const luminance=color=>{const c=color.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  const found=[];for(const el of document.querySelectorAll('.localWorkspace h1,.localWorkspace .localHint,.localWorkspace input:not(:disabled),.localWorkspace button.primary:not(:disabled),.guestEmail h1,.guestEmail dt,.guestEmail input:not(:disabled),.guestEmail button.primary:not(:disabled),.guestEmail [role="alert"]')){
   if(!el.getBoundingClientRect().width)continue;const fg=rgb(getComputedStyle(el).color);let current=el,bg;
   while(current){const c=rgb(getComputedStyle(current).backgroundColor);if(c.length===3||c[3]===1){bg=c;break;}current=current.parentElement;}
   bg=bg||[255,255,255];const a=luminance(fg),b=luminance(bg);found.push({label:el.tagName+'.'+el.className,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
  }return found;
 });
 for(const item of result){assert.ok(item.ratio>=4.5,label+' low contrast '+JSON.stringify(item));minContrast=Math.min(minContrast,item.ratio);contrastSamples++;}
}
async function variants(page,languageSelector,label){
 for(const locale of ['ru','uz','en']){await page.locator(languageSelector).selectOption(locale);
  for(const dark of [false,true]){if((await page.locator('[data-theme-toggle]').getAttribute('aria-pressed'))!==String(dark))await page.locator('[data-theme-toggle]').click();
   for(const width of [360,768,1440]){await page.setViewportSize({width,height:1000});await inspect(page,label+':'+locale+':'+dark+':'+width);}}
 }
}
(async()=>{
 browser=await chromium.launch({headless:true,...fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}});
 const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(8000);
 let state={staff:'signed-out',guest:false},failSession=false;page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url()),method=route.request().method();
  if(u.origin!==origin){unexpected.push(u.origin);return route.abort();}
  if(/^\/(local-api|guest-api)\//.test(u.pathname)){
   if(method!=='GET'&&!u.pathname.endsWith('/cancellation/preview')){unexpected.push(method+' '+u.pathname);return route.abort();}
   if(failSession&&u.pathname.endsWith('/session'))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'CORE_UNAVAILABLE'})});
   const body=fixture.response(u.pathname,state);if(body===undefined){unexpected.push(u.pathname);return route.abort();}reads++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  }
  const file=path.resolve(root,u.pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg'}[path.extname(file)]});
 });
 phase='staff-login';await page.goto(origin+'/?api=local-core',{waitUntil:'networkidle'});assert.equal(await page.locator('.app').getAttribute('data-runtime'),'local-core');await page.locator('.staffLogin').waitFor();await variants(page,'.staffLanguage select',phase);checks.push('staff_sign_in_three_languages_two_themes');
 for(const role of Object.keys(fixture.permissions)){
  phase='staff:'+role;state.staff=role;await page.goto(origin+'/?api=local-core&staffRole='+role,{waitUntil:'networkidle'});await page.locator('#staff-account').waitFor();
  if(['procurement','warehouse'].includes(role)){
   await page.getByTestId('supply-open').click();await page.getByTestId('supply-property').selectOption(fixture.id);
   await page.getByRole('button',{name:'Load supply data',exact:true}).click();await page.locator('.supplyRows li').first().waitFor();
  }
  if(['owner','accountant','manager','front_desk'].includes(role)){
   await page.getByTestId('folio-open').click();await page.getByTestId('folio-property').selectOption(fixture.id);
  }
  await variants(page,'.staffLanguage select',phase);
  if(role==='procurement')await page.screenshot({path:'/tmp/views-canva-core-procurement-dark.png',fullPage:true});
  if(role==='warehouse')await page.screenshot({path:'/tmp/views-canva-core-warehouse-dark.png',fullPage:true});
 }
 checks.push('nine_staff_roles_forms_read_only_not_connected_reception_housekeeping_owner_folio_supply_refund');
 phase='staff-role-mismatch';state.staff='warehouse';await page.goto(origin+'/?api=local-core&staffRole=owner',{waitUntil:'networkidle'});await page.locator('.staffRoleMismatch').waitFor();assert.equal(await page.locator('.ownerInventory').count(),0);await variants(page,'.staffLanguage select',phase);
 phase='staff-error';failSession=true;await page.goto(origin+'/?api=local-core',{waitUntil:'networkidle'});await page.getByRole('alert').waitFor();await variants(page,'.staffLanguage select',phase);failSession=false;
 phase='guest-login';await page.goto(origin+'/?api=guest-core',{waitUntil:'networkidle'});assert.equal(await page.locator('.app').getAttribute('data-runtime'),'guest-core');await page.locator('#guest-email').waitFor();await variants(page,'.guestLanguage select',phase);
 phase='guest-trip';state.guest=true;await page.reload({waitUntil:'networkidle'});await page.getByTestId('guest-trip').waitFor();await variants(page,'.guestLanguage select',phase);
 await page.getByRole('button',{name:'View trip',exact:true}).click();await page.getByTestId('guest-trip-detail').waitFor();
 await page.getByTestId('guest-cancellation-preview-button').count().then(async count=>{if(count)await page.getByTestId('guest-cancellation-preview-button').click();else await page.locator('.guestCancellation button').first().click();});
 await page.getByTestId('guest-cancellation-preview').waitFor();await variants(page,'.guestLanguage select','guest-cancellation');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/views-canva-core-guest-dark.png',fullPage:true});
 checks.push('guest_core_sign_in_owned_trip_and_cancellation_preview_no_confirmation_write');
 phase='guest-offline';await context.setOffline(true);await page.getByText('You are offline. Restore the connection and retry manually.',{exact:true}).waitFor();assert.equal(await page.locator('.connectionNotice').count(),0);await inspect(page,phase);await context.setOffline(false);
 phase='guest-error';failSession=true;await page.reload({waitUntil:'networkidle'});await page.getByRole('alert').waitFor();await variants(page,'.guestLanguage select',phase);checks.push('offline_retains_core_notice_error_and_mismatch_do_not_render_other_accounts');
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.ok(contrastSamples>0);
 console.log(JSON.stringify({result:'pass',proof:'canva_core_surfaces_http_fixtures',checks,layouts,contrastSamples,minimumContrast:Number(minContrast.toFixed(2)),reads,pageErrors:0,externalRequests:0,mutationRequests:0,actualCoreServerTested:false}));
})().catch(error=>{console.error(JSON.stringify({result:'fail',phase,message:error.message,unexpected,errors}));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
