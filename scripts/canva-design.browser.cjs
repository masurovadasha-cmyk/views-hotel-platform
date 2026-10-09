'use strict';
// Bundled demo UI proof: real files over loopback, no API or provider mocks.
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const guest=require('../src/features/guest/guest-translations.json'),staff=require('../src/features/staff/legacy-staff-translations.json'),access=require('../src/features/auth/access-translations.json');
const tr=(catalog,locale,key)=>catalog[key]?.[locale]||key,root=path.resolve(__dirname,'../dist');
const widths=[360,768,1440],locales=['ru','uz','en'],errors=[],unexpected=[],checks=[],screenshots=[],contrastBySurface={guest:0,staff:0};
let browser,server,phase='setup',layoutChecks=0,contrastChecks=0,minimumSampledContrast=Infinity,assetRequests=0;
async function fits(page,label,dialog){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const box=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('main *,[role="dialog"] *')].filter(el=>el.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(el).position!=='fixed').slice(0,5).map(el=>el.className||el.tagName)}));
 assert.ok(box.scroll<=box.width,label+' '+JSON.stringify(box));
 if(dialog)assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),label+' dialog overflow');layoutChecks++;
}
async function contrast(page,label,selector,surface='guest'){
 const sample=await page.locator(selector).first().evaluate(el=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  function rgba(value){ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);const c=ctx.getImageData(0,0,1,1).data;return [c[0]/255,c[1]/255,c[2]/255,c[3]/255];}
  function over(top,base){const a=top[3];return [top[0]*a+base[0]*(1-a),top[1]*a+base[1]*(1-a),top[2]*a+base[2]*(1-a),1];}
  const chain=[];for(let node=el;node;node=node.parentElement){const style=getComputedStyle(node),color=rgba(style.backgroundColor);chain.push({color,image:style.backgroundImage});if(color[3]===1)break;}
  let background=[1,1,1,1];for(const layer of chain.reverse()){if(layer.image!=='none')return {unsupported:'non-solid background'};background=over(layer.color,background);}
  const style=getComputedStyle(el),foreground=over(rgba(style.color),background);
  const luminance=c=>c.slice(0,3).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((total,x,i)=>total+x*[.2126,.7152,.0722][i],0);
  const a=luminance(foreground),b=luminance(background);return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),color:style.color,background:background.slice(0,3).map(x=>Math.round(x*255))};
 });
 assert.ok(sample.ratio>=4.5,label+' contrast '+selector+' '+JSON.stringify(sample));contrastChecks++;contrastBySurface[surface]++;minimumSampledContrast=Math.min(minimumSampledContrast,sample.ratio);
}
async function theme(page,dark){
 if(Boolean(await page.locator('.app.dark').count())!==dark)await page.locator('[data-theme-toggle]').click();
 assert.equal(Boolean(await page.locator('.app.dark').count()),dark);assert.equal(await page.evaluate(()=>localStorage.getItem('views.theme')),dark?'dark':'light');
}
async function trapped(page,dialog){
 assert.equal(await dialog.evaluate(el=>el.matches(':modal')||el.getAttribute('aria-modal')==='true'),true);assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
 const focusable=dialog.locator('button:enabled,input:enabled,select:enabled,textarea:enabled,a[href],[tabindex="0"]');
 const visible=[];for(let i=0;i<await focusable.count();i++)if(await focusable.nth(i).isVisible())visible.push(focusable.nth(i));
 assert.ok(visible.length);await visible.at(-1).focus();await page.keyboard.press('Tab');assert.equal(await visible[0].evaluate(el=>el===document.activeElement),true,'Tab must wrap to first dialog control: '+JSON.stringify(await page.evaluate(()=>({tag:document.activeElement?.tagName,className:document.activeElement?.className}))));
 await page.keyboard.press('Shift+Tab');assert.equal(await visible.at(-1).evaluate(el=>el===document.activeElement),true);
}
async function restored(page,opener){await page.waitForFunction(el=>el===document.activeElement,await opener.elementHandle(),{timeout:2000});assert.equal(await opener.evaluate(el=>el===document.activeElement),true);}
async function shot(page,name){const file='/tmp/views-canva-review-'+name+'.png';await page.screenshot({path:file,fullPage:true});screenshots.push(file);}
(async()=>{
 await fs.access(path.join(root,'index.html'));
 server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://loopback.invalid');
   if(req.method!=='GET'&&req.method!=='HEAD'){unexpected.push('method:'+req.method);res.writeHead(405);res.end();return;}
   if(/^\/(?:api|local-api|guest-api|v1)(?:\/|$)/.test(url.pathname)){unexpected.push(url.pathname);res.writeHead(503);res.end();return;}
   const file=path.resolve(root,decodeURIComponent(url.pathname.slice(1))||'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
   const data=await fs.readFile(file);assetRequests++;res.writeHead(200,{'Cache-Control':'no-store','Content-Type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'}[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404);res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const origin='http://127.0.0.1:'+server.address().port;
 const executablePath=process.env.VIEWS_BROWSER_EXECUTABLE||(await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>undefined));
 browser=await chromium.launch({headless:true,...executablePath?{executablePath}:{}});
 const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'}),page=await context.newPage();page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}return route.continue();});
 await page.goto(origin+'/?api=demo&entry=access',{waitUntil:'networkidle'});
 for(const locale of locales){
  phase='portal:'+locale;const t=key=>tr(access,locale,key);await page.locator('.guestLanguage select').selectOption(locale);assert.equal(await page.locator('html').getAttribute('lang'),locale);
  await page.getByRole('heading',{name:t('Choose your workspace'),exact:true}).waitFor();assert.equal(await page.locator('.accessCards button').count(),5);
  for(const dark of [true,false]){await theme(page,dark);for(const width of widths){await page.setViewportSize({width,height:1000});await fits(page,phase+':'+dark+':'+width);}}
  for(let i=0;i<5;i++){await page.locator('.accessCards button').nth(i).click();assert.equal(await page.locator('.accessCards button[aria-pressed="true"]').count(),1);await page.getByRole('button',{name:t('Sign in with email'),exact:true}).click();assert.equal(await page.locator('.accessEmail input').isDisabled(),true);assert.equal(await page.locator('.accessEmail button').isDisabled(),true);}
  assert.equal(await page.locator('[data-staff-entry="procurement"]').count(),1);assert.equal(await page.locator('[data-staff-entry="warehouse"]').count(),1);
 }
 checks.push('five_workspace_entries_three_languages_two_themes_three_widths_disabled_preview_email');await shot(page,'portal-light-1440');
 await theme(page,true);await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.app.dark').count(),1);assert.equal(await page.locator('.guestLanguage select').inputValue(),'en');checks.push('theme_and_guest_language_persist_after_reload');
 for(const direction of [1,3]){await page.locator('.accessCards button').nth(direction).click();await page.getByRole('button',{name:'Explore demo screens',exact:true}).click();await page.locator('.staffLayout').waitFor();await page.getByRole('button',{name:'VIEWS · Sign in',exact:true}).click();await page.locator('.accessPortal').waitFor();}checks.push('explicit_host_and_platform_admin_demo_entry');
 await page.locator('.accessCards button').nth(0).click();await page.getByRole('button',{name:'Explore demo screens',exact:true}).click();await page.locator('.guestShell').waitFor();
 for(const locale of locales){
  phase='guest:'+locale;const t=key=>tr(guest,locale,key);await page.locator('.guestLanguage select').selectOption(locale);const nav=page.locator('.guestNav');assert.equal(await nav.locator('button').count(),5);
  for(const dark of [true,false]){await theme(page,dark);for(const tab of ['Explore','Bookings','Services','Messages','Profile']){await nav.getByRole('button',{name:t(tab),exact:true}).click();assert.equal(await nav.locator('[aria-current="page"]').count(),1);for(const width of widths){await page.setViewportSize({width,height:1000});await fits(page,phase+':'+tab+':'+dark+':'+width);if(tab==='Explore')for(const selector of ['.serviceGrid button b','.filterRow>button','.guestNav button.active span'])await contrast(page,phase+':'+dark+':'+width,selector);}}}
  await nav.getByRole('button',{name:t('Explore'),exact:true}).click();const search=page.locator('.searchBox');await search.getByLabel(t('Check-in'),{exact:true}).fill('2027-06-10');await search.getByLabel(t('Check-out'),{exact:true}).fill('2027-06-12');await search.getByLabel(t('Guests'),{exact:true}).fill('2');
  await search.getByRole('button',{name:t('Show results'),exact:true}).click();assert.equal(await page.locator('#guest-results').evaluate(el=>el===document.activeElement),true);
  await search.getByRole('combobox',{name:t('Destination'),exact:true}).selectOption('Samarkand');assert.equal(await page.locator('.apartmentCard').count(),0);await search.getByRole('combobox',{name:t('Destination'),exact:true}).selectOption('Tashkent');assert.ok(await page.locator('.apartmentCard').count()>0);
  const filter=page.getByTestId('guest-amenity-filters').getByRole('button').first();await filter.click();assert.equal(await filter.getAttribute('aria-pressed'),'true');await filter.click();
  await page.getByRole('button',{name:t('Map'),exact:true}).click();await page.locator('.mapStage').waitFor();await fits(page,phase+':map');await page.getByRole('button',{name:t('List'),exact:true}).click();
  const trigger=page.locator('.photoButton').first(),dialog=page.getByRole('dialog');
  for(const dark of [true,false]){await theme(page,dark);await trigger.click();await dialog.waitFor();await trapped(page,dialog);for(const width of widths){await page.setViewportSize({width,height:1000});await fits(page,phase+':apartment:'+dark+':'+width,dialog);}await page.keyboard.press('Escape');await restored(page,trigger);}
  await trigger.click();await dialog.getByRole('button',{name:t('Choose dates'),exact:true}).click();await dialog.getByTestId('guest-booking-progress').waitFor();await dialog.getByLabel(t('Check-in'),{exact:true}).fill('2027-06-10');await dialog.getByLabel(t('Check-out'),{exact:true}).fill('2027-06-12');await dialog.getByRole('button',{name:t('Continue'),exact:true}).click();await dialog.getByLabel(t('Full name'),{exact:true}).fill('Synthetic design preview');
  await dialog.getByRole('button',{name:t('Continue'),exact:true}).click();assert.equal(await dialog.getByRole('button',{name:t('Continue to secure payment'),exact:true}).isDisabled(),true);await fits(page,phase+':payment',dialog);
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);await restored(page,trigger);
  await nav.getByRole('button',{name:t('Services'),exact:true}).click();const form=page.getByTestId('guest-service-preview-form');await form.getByLabel(t('Details'),{exact:true}).fill('Synthetic airport transfer, no dispatch');await form.getByRole('button',{name:t('Preview request'),exact:true}).click();await page.getByTestId('guest-service-preview').waitFor();await fits(page,phase+':service-preview');
  await nav.getByRole('button',{name:t('Messages'),exact:true}).click();assert.equal(await page.locator('.chatShell input').isDisabled(),true);assert.equal(await page.locator('.chatShell footer button').isDisabled(),true);
 }
 checks.push('guest_five_tabs_search_map_detail_booking_preview_service_preview_modal_focus_and_no_provider_writes');
 await page.locator('.guestNav').getByRole('button',{name:'Explore',exact:true}).click();await page.setViewportSize({width:1440,height:1000});await theme(page,false);await shot(page,'guest-light-1440');await theme(page,true);await page.setViewportSize({width:360,height:900});await shot(page,'guest-dark-360');
 await context.setOffline(true);assert.equal(await page.evaluate(()=>navigator.onLine),false);await page.locator('.connectionNotice').waitFor();await page.locator('.guestNav').getByRole('button',{name:'Profile',exact:true}).click();await page.locator('.profileHero').waitFor();await fits(page,'guest:offline');await context.setOffline(false);await page.locator('.connectionNotice').waitFor({state:'detached'});checks.push('offline_notice_loaded_demo_navigation_and_no_automatic_requests');
 phase='staff-entry';await page.getByRole('button',{name:'VIEWS · Sign in',exact:true}).click();await page.locator('.accessCards button').nth(2).click();await page.getByRole('button',{name:'Explore demo screens',exact:true}).click();await page.locator('.staffLayout').waitFor();
 for(const locale of locales){
  phase='staff:'+locale;const t=key=>tr(staff,locale,key);await page.locator('.staffLanguage select').selectOption(locale);assert.equal(await page.locator('html').getAttribute('lang'),locale);
  for(const dark of [true,false]){await theme(page,dark);for(const tab of ['Overview','Inbox']){await page.setViewportSize({width:1440,height:1000});await page.locator('.sidebar').getByRole('button',{name:t(tab),exact:true}).click();await page.locator(tab==='Overview'?'.kpis':'.unifiedInbox').waitFor();for(const width of widths){await page.setViewportSize({width,height:1000});await fits(page,phase+':'+tab+':'+dark+':'+width);if(tab==='Overview')for(const selector of ['.timelineBoard .bar.guest','.timelineBoard .bar.cleaning','.timelineBoard .bar.maintenance'])await contrast(page,phase+':'+dark+':'+width,selector,'staff');}}}
  await page.locator('.inboxTabs button').nth(2).click();assert.equal(await page.locator('.unifiedInbox .order').count(),0);await page.locator('.inboxTabs button').first().click();assert.ok(await page.locator('.unifiedInbox .order').count()>0);
  const search=page.getByTestId('staff-inbox-search'),title=await page.locator('.unifiedInbox .orderOpen').first().innerText();await search.fill(title);assert.equal(await page.locator('.unifiedInbox .order').count(),1);await search.fill('no-such-synthetic-request-731');assert.equal(await page.locator('.unifiedInbox .order').count(),0);await page.locator('.unifiedInbox').getByRole('button',{name:t('Clear filters'),exact:true}).click();
  const trigger=page.locator('.unifiedInbox .orderOpen').first(),sheet=page.locator('.staffMobileSheet');
  for(const dark of [true,false]){await theme(page,dark);await trigger.focus();await page.keyboard.press('Enter');await sheet.waitFor();await trapped(page,sheet);for(const width of widths){await page.setViewportSize({width,height:900});await fits(page,phase+':detail:'+dark+':'+width,sheet);}await page.keyboard.press('Escape');assert.equal(await sheet.count(),0);await restored(page,trigger);
   await page.setViewportSize({width:360,height:900});for(const tab of ['tasks','proof','create','notifications']){const button=page.locator('.staffMobileDock').getByRole('button',{name:t(tab),exact:true});await button.click();await sheet.waitFor();await trapped(page,sheet);await fits(page,phase+':drawer:'+tab+':'+dark,sheet);if(tab==='proof')assert.equal(await page.locator('.mobileProof button:disabled').count(),2);await page.keyboard.press('Escape');await restored(page,button);}}

 }
 checks.push('staff_dashboard_inbox_filters_order_keyboard_details_mobile_drawers_three_languages_two_themes');
 await page.locator('.sidebar').getByRole('button',{name:'Overview',exact:true}).click();await page.setViewportSize({width:1440,height:1000});await theme(page,false);await shot(page,'staff-light-1440');await theme(page,true);await page.setViewportSize({width:360,height:900});await shot(page,'staff-dark-360');
 phase='final';assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.ok(assetRequests>0);
 console.log(JSON.stringify({result:'pass',proof:'canva_static_demo_browser',checks,layoutChecks,contrastChecks,contrastBySurface,minimumSampledContrast:Number(minimumSampledContrast.toFixed(2)),sampledTextContrastThreshold:4.5,fullWcagAudit:false,build:'dist',runtime:'api=demo',screenshots,pageErrors:0,assetRequests,externalRequestsSent:0,apiRequestsSent:0,realEmailSent:false,realBookingsCreated:false}));
})().catch(error=>{console.error(JSON.stringify({result:'fail',proof:'canva_static_demo_browser',phase,checks,layoutChecks,contrastChecks,error:error.name,message:error.message,frames:error.stack?.split('\n').filter(s=>s.startsWith('    at ')).slice(0,4)}));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});});
