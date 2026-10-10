'use strict';
// Synthetic legacy guest session: verify routing compatibility without external requests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const translations=require('../src/features/guest/guest-translations.json');
const origin='https://catalog.invalid',root=path.resolve('dist');
(async()=>{
 const browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
 const page=await browser.newPage(),writes=[],errors=[],unexpected=[];let layouts=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin!==origin){unexpected.push(u.origin);return route.abort();}
  if(u.pathname==='/api/session')return route.fulfill({json:{authenticated:true,session:{mode:'guest',userId:'synthetic'}}});
  if(u.pathname==='/api/my-bookings')return route.fulfill({json:{items:[{id:'booking-fixture',confirmation_code:'SYNTHETIC',property_name:'Fixture',unit_code:'101',city:'Tashkent',check_in_date:'2030-01-01',check_out_date:'2030-01-03',status:'confirmed',currency:'UZS',total_amount:'100'}]}});
  if(u.pathname==='/api/guest-service-orders'&&route.request().method()==='POST'){writes.push(route.request().postDataJSON());return route.fulfill({json:{id:'fixture-order'}});}
  if(u.pathname.startsWith('/api/')){unexpected.push(u.pathname);return route.abort();}
  const file=path.resolve(root,u.pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg'}[path.extname(file)]});
 });
 try{
  await page.goto(origin+'/?api=live',{waitUntil:'networkidle'});
  await page.getByRole('navigation').getByRole('button',{name:'Services',exact:true}).click();
  assert.equal(await page.locator('[data-testid="primary-services"] button').count(),8);
  assert.equal(await page.locator('[data-testid="additional-services"] button').count(),3);
  for(const locale of ['ru','uz','en']){
   await page.locator('.guestLanguage select').selectOption(locale);
   for(const dark of [false,true]){
    if(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed')!==String(dark))await page.locator('[data-theme-toggle]').click();
    for(const id of ['transfer','excursions','tickets']){
     await page.locator('[data-service="'+id+'"]').click();assert.equal(await page.locator('.liveServiceForm').count(),0);assert.equal(await page.getByTestId('guest-service-preview-form').count(),0);
     const key='This service is not connected yet. Booking, payment and sending requests are unavailable.';
     await page.getByText(locale==='en'?key:translations[key][locale],{exact:true}).waitFor();
     for(const width of [360,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));layouts++;}
    }
   }
  }
  assert.equal(writes.length,0);
  for(const id of ['cleaning','laundry','minimart','concierge','rent_car','restaurant','bar','spa']){
   await page.locator('[data-service="'+id+'"]').click();await page.locator('.liveServiceForm textarea').fill('Synthetic request only');await page.locator('.liveServiceForm button.primary').click();
   await page.getByText('Request created and routed to VIEWS staff.',{exact:true}).waitFor();assert.equal(writes.at(-1).category,id);assert.equal(writes.at(-1).reservationId,'booking-fixture');
  }
  assert.equal(writes.length,8);assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await page.setViewportSize({width:390,height:1000});await page.locator('[data-service="transfer"]').click();await page.screenshot({path:'/tmp/views-catalog-dark.png',fullPage:true});
  console.log(JSON.stringify({result:'pass',layouts,primaryDirections:8,preservedLegacyCategories:8,newServiceWrites:0,fixtureWrites:writes.length,externalRequests:0,pageErrors:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
