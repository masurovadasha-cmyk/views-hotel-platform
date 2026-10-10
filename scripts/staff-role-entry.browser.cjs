'use strict';
// Actual compiled role screens; all HTTP intercepted with synthetic session fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const roles=['front_desk','housekeeper','technician','concierge','accountant','manager','owner','procurement','warehouse'];
const labels={en:['Reception','Housekeeping','Maintenance','Concierge','Accounting','Management','Owner workspace','Purchasing','Warehouse'],ru:['Ресепшен','Уборка','Техник','Консьерж','Бухгалтерия','Управляющий','Кабинет владельца','Закупщик','Заведующий складом'],uz:['Resepshn','Tozalash','Texnik','Konsyerj','Buxgalteriya','Boshqaruvchi','Egasi kabineti','Xaridchi','Ombor mudiri']};
module.exports=async function staffRoleEntryProof({browser,dist=path.resolve('dist')}){
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],unexpected=[],apiCalls=[],logins=[],checks=[];
 const publicOrigin='https://role-preview.invalid',localOrigin='http://127.0.0.1:4173';
 let sessionRole=null,phase='public',allowed=[];
 page.setDefaultTimeout(10000);page.on('pageerror',()=>errors.push('BROWSER_JS_ERROR'));
 await page.addInitScript(()=>{localStorage.setItem('views.guest.locale','en');localStorage.setItem('views.staff.locale','en');});
 const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 const session=()=>sessionRole?{authenticated:true,csrf:'synthetic-csrf',identity:{role:sessionRole,permissions:['reservation.read','reservation.manage','finance.read','finance.manage','housekeeping.work','property.manage','supply.read'],email:'synthetic-staff@views.invalid',displayName:'Synthetic staff',emailVerified:false}}:{authenticated:false};
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(![publicOrigin,localOrigin].includes(url.origin)){unexpected.push('EXTERNAL');return route.abort();}
  if(url.pathname.startsWith('/local-api/')){
   assert.equal(url.origin,localOrigin);apiCalls.push(url.pathname);
   if(url.pathname==='/local-api/session')return json(route,session());
   if(url.pathname==='/local-api/login'){const body=request.postDataJSON();logins.push(body);assert.deepEqual(Object.keys(body).sort(),['email','password']);sessionRole='front_desk';return json(route,session());}
   if(!allowed.some(prefix=>url.pathname.startsWith(prefix))){unexpected.push(url.pathname);return route.abort();}
   // Disconnected operations are explicit: never fabricate completed tasks/balances.
   return json(route,{error:'CORE_UNAVAILABLE'},503);
  }
  const root=path.resolve(dist),file=path.resolve(root,url.pathname.slice(1)||'index.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){unexpected.push(url.pathname);return route.fulfill({status:404,body:''});}
  return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]});
 });
 try{
  for(const [index,role] of roles.entries()){
   await page.goto(publicOrigin+'/?api=demo&entry=staff&staffRole='+role,{waitUntil:'networkidle'});
   for(const locale of ['ru','uz','en']){
    await page.locator('.guestLanguage select').selectOption(locale);
    assert.ok((await page.locator('[data-staff-role="'+role+'"] h1').innerText()).includes(labels[locale][index]));
    assert.equal(await page.locator('.staffRoleSignIn input').isDisabled(),true);assert.equal(await page.locator('.staffRoleGrid a').count(),9);
    for(const width of [360,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'ROLE_ENTRY_OVERFLOW_'+role+'_'+locale+'_'+width);}
   }
   await page.getByRole('button',{name:'Explore this role’s demo',exact:true}).click();
   await page.locator(index<7?'.staffLayout':'.staffRoleUnavailable').waitFor();
   assert.equal(await page.getByRole('combobox',{name:'Demo staff role',exact:true}).count(),0);
  }
  assert.equal(apiCalls.length,0);checks.push('nine_public_role_entries_three_languages_three_widths_disabled_email_no_api');
  phase='local_login';
  for(const [index,role] of roles.entries()){
   await page.goto(localOrigin+'/?api=local-core&staffRole='+role,{waitUntil:'networkidle'});
   assert.equal(await page.locator('.staffLogin [data-staff-role]').getAttribute('data-staff-role'),role);
   assert.ok((await page.locator('.staffLogin h1').innerText()).includes(labels.en[index]));
  }
  await page.locator('.staffLogin input[type="email"]').fill('synthetic-staff@views.invalid');
  await page.locator('.staffLogin input[type="password"]').fill('synthetic-long-passphrase');
  await page.locator('.staffLogin form button').click();await page.locator('.staffRoleMismatch').waitFor();
  assert.equal(logins.length,1);assert.equal(await page.locator('#staff-reception').count(),0);
  checks.push('nine_local_email_entries_login_body_excludes_role_server_identity_mismatch_blocks_modules');
  phase='role_dashboard';
  const allowedByRole={front_desk:['/local-api/reception','/local-api/workspace'],housekeeper:['/local-api/housekeeping'],technician:[],concierge:[],accountant:['/local-api/refund-reconciliation'],manager:['/local-api/reception','/local-api/workspace','/local-api/owner-inventory','/local-api/refund-reconciliation'],owner:['/local-api/owner-inventory','/local-api/refund-reconciliation'],procurement:[],warehouse:[]};
  for(const role of roles){
   sessionRole=role;allowed=allowedByRole[role];
   await page.goto(localOrigin+'/?api=local-core&staffRole='+role,{waitUntil:'networkidle'});
   assert.equal(await page.locator('[data-staff-role]').getAttribute('data-staff-role'),role);
   if(role==='technician'||role==='concierge')await page.getByText('Work tools are not connected for this role yet.',{exact:true}).waitFor();
   if(role!=='front_desk'&&role!=='manager')assert.equal(await page.locator('#staff-reception').count(),0);
   if(role!=='housekeeper')assert.equal(await page.locator('#staff-housekeeping').count(),0);
   if(role==='procurement'||role==='warehouse')await page.locator('#staff-supplies').waitFor();
   await page.setViewportSize({width:360,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'DASHBOARD_OVERFLOW_'+role);
  }
  checks.push('assigned_role_only_dashboards_even_with_broad_fixture_permissions_disconnected_modules_explicit');
  phase='wrong_entry';sessionRole='housekeeper';allowed=[];
  await page.goto(localOrigin+'/?api=local-core&staffRole=owner',{waitUntil:'networkidle'});await page.locator('.staffRoleMismatch').waitFor();
  assert.equal(await page.locator('#staff-owner').count(),0);assert.equal(await page.locator('.staffRoleMismatch a').getAttribute('href'),'/?api=local-core&entry=staff&staffRole=housekeeper');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);checks.push('role_url_never_escalates_session_or_mounts_foreign_workspaces');
  console.log(JSON.stringify({result:'pass',proof:'staff_role_entry_browser_http_fixtures',roles:roles.length,checks,httpFixturesOnly:true,externalRequestsSent:0}));
 }catch(error){console.error(JSON.stringify({result:'fail',proof:'staff_role_entry_browser_http_fixtures',phase,error:error.name,unexpected}));throw error;}finally{await context.close();}
};
if(require.main===module)(async()=>{const browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});try{await module.exports({browser,dist:process.argv[2]||path.resolve('dist')});}finally{await browser.close();}})().catch(error=>{console.error(error.name,error.message);process.exitCode=1;});
