// Offline proof of the release entry screen; never represents real email login.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const target=process.env.VIEWS_ACCESS_BUILD||'dist';assert.ok(['dist','dist-android','dist-pages'].includes(target));
const prefix=target==='dist'?'/':'/views-hotel-platform/',origin='https://views-preview.invalid';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[],unexpected=[],checks=[];
 await page.addInitScript(()=>{localStorage.setItem('views.guest.locale','en');localStorage.setItem('views.staff.locale','en');});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin||!url.pathname.startsWith(prefix)){unexpected.push(url.pathname);return route.abort();}
  const root=path.resolve(target),file=path.resolve(root,url.pathname.slice(prefix.length)||'index.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){unexpected.push(url.pathname);return route.fulfill({status:404,body:''});}
  return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]});
 });
 try{
  await page.goto(origin+prefix+'?api=demo&entry=access',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'Choose your workspace',exact:true}).waitFor();
  assert.equal(await page.locator('.accessCards button').count(),5);
  for(const locale of ['ru','uz','en']){
   await page.locator('.guestLanguage select').selectOption(locale);
   for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1050});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+locale+' '+width);}
  }checks.push('five_workspaces_three_languages_four_widths');
  for(let i=0;i<5;i++){
   await page.locator('.accessCards button').nth(i).click();await page.getByRole('button',{name:'Sign in with email',exact:true}).click();
   await page.getByText('Email sign-in is not connected in this preview. No email is sent and no account is created.',{exact:true}).waitFor();
   assert.equal(await page.locator('.accessEmail input').isDisabled(),true);assert.equal(await page.locator('.accessEmail button').isDisabled(),true);
  }checks.push('all_email_entries_disclose_disconnected_delivery_without_requests');
  assert.equal(await page.locator('[data-staff-entry="procurement"]').count(),1);assert.equal(await page.locator('[data-staff-entry="warehouse"]').count(),1);
  checks.push('separate_purchasing_and_warehouse_entry_links');
  for(const [index,selector] of [[0,'.guestShell'],[1,'.staffLayout'],[2,'.staffLayout'],[3,'.staffLayout']]){
   await page.locator('.accessCards button').nth(index).click();await page.getByRole('button',{name:'Explore demo screens',exact:true}).click();
   await page.locator(selector).waitFor();assert.equal(await page.locator('.accessPortal').count(),0);
   await page.getByRole('button',{name:'VIEWS · Sign in',exact:true}).click();await page.locator('.accessPortal').waitFor();
  }checks.push('explicit_guest_host_employee_admin_demo_navigation');
  await page.getByRole('button',{name:'Dark',exact:true}).click();assert.equal(await page.locator('.app.dark').count(),1);
  await page.getByRole('button',{name:'Light',exact:true}).click();
  await page.locator('.guestLanguage select').selectOption('ru');
  await page.screenshot({path:'/tmp/views-new-access-'+target+'.png',fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({result:'pass',build:target,checks,realEmailSent:false,networkRequestsOutsideAssets:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
