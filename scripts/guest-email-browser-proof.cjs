'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {randomBytes}=require('node:crypto');
const {chromium}=require('playwright');
module.exports=async function guestEmailBrowserProof({coreOrigin,smtp,setLinkOrigin,admin}){
 const web=await require('./fixtures/guest-email-web.cjs')(coreOrigin);let browser;
 const checks=[];let phase='setup';
 try{
  setLinkOrigin(web.origin+'/?api=guest-core');
  browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',()=>errors.push('BROWSER_JS_ERROR'));
  let exchanges=0;page.on('request',r=>{assert.ok(!/vgel_|vges_/.test(r.url()),'TOKEN_IN_REQUEST_URL');if(r.url().endsWith('/guest-api/exchange'))exchanges++;});
  const email='guest-browser-'+randomBytes(6).toString('hex')+'@views.invalid';
  const entry=web.origin+'/?api=guest-core';
  const visible=async(selector)=>page.locator(selector).waitFor({state:'visible'});
  async function api(route,method='GET',body,headers={}){
   return page.evaluate(async({route,method,body,headers})=>{
    const r=await fetch('/guest-api/'+route,{method,headers:{'Content-Type':'application/json','X-Views-Guest-Pilot':'1',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
   },{route,method,body,headers});
  }
  phase='request_link';await page.goto(entry);await visible('#guest-email');
  await page.locator('#guest-email').fill(email);await page.getByRole('button',{name:'Send sign-in link',exact:true}).click();
  await page.getByText('Link accepted by test delivery.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Send sign-in link',exact:true}).isDisabled(),true);
  const captured=smtp.messages.find(m=>m.recipient===email);assert.ok(captured);
  const raw=captured.raw,mail=Buffer.from(raw.slice(raw.indexOf('\r\n\r\n')+4).replace(/\s/g,''),'base64').toString('utf8');
  const link=mail.split('\n').find(s=>s.startsWith(web.origin));assert.ok(link);
  const pending=await api('request','POST',{email,locale:'en'});assert.equal(pending.status,429);
  assert.equal((await admin.query('SELECT count(*)::int n FROM users WHERE email=$1',[email])).rows[0].n,0);
  phase='confirm_link';await page.goto(link);await page.getByRole('button',{name:'Confirm sign-in',exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'');assert.equal(exchanges,0);
  await page.getByRole('button',{name:'Confirm sign-in',exact:true}).click();await visible('[data-testid="guest-identity"]');
  assert.equal(await page.locator('[data-testid="guest-identity"]').textContent(),email);assert.equal(exchanges,1);
  const cookies=await context.cookies(web.origin+'/guest-api/session'),cookie=cookies.find(c=>c.name==='views_guest_email');
  assert.ok(cookie?.httpOnly);assert.equal(cookie.sameSite,'Strict');assert.equal(cookie.path,'/guest-api');
  const storage=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage},cookies:document.cookie}));
  assert.ok(!JSON.stringify(storage).includes(cookie.value));assert.ok(!/vgel_|vges_/.test(JSON.stringify(storage)));
  await page.reload();await visible('[data-testid="guest-identity"]');
  const identity=await api('session');assert.equal(identity.status,200);assert.equal(identity.body.profile.email,email);
  assert.equal(identity.body.token,undefined);checks.push('real_smtp_link_explicit_confirmation_httponly_cookie_reload_no_token_storage');
  phase='owned_trips';await require('./guest-trips-browser-proof.cjs')({page,api,admin,identity:identity.body});
  phase='reservation_link';await require('./guest-reservation-link-browser-proof.cjs')({page,api,admin,identity:identity.body,coreOrigin});
  phase='gateway_boundaries';assert.equal((await api('logout','POST',{})).status,403);
  assert.equal((await api('logout','POST',{}, {'X-Views-Guest-Csrf':'0'.repeat(64)})).status,403);
  assert.equal((await api('exchange','POST',{challengeId:'invalid',token:'invalid'})).status,409);
  assert.equal((await api('session','GET',undefined,{Authorization:'Bearer '+cookie.value})).status,403);
  assert.equal((await api('session','GET',undefined,{'X-User-Id':identity.body.profile.userId})).status,403);
  assert.equal((await api('../guest-api/v1/staff-auth/session')).status,404);
  const foreign=await fetch(web.origin+'/guest-api/logout',{method:'POST',headers:{Origin:'https://foreign.invalid','Content-Type':'application/json','X-Views-Guest-Pilot':'1'},body:'{}'});
  assert.equal(foreign.status,403);
  checks.push('csrf_cross_origin_actor_spoofing_and_staff_routes_rejected');
  phase='locale_offline_logout';const headings={ru:'Вход выполнен: гость',uz:'Mehmon sifatida kirildi',en:'Signed in as guest'};
  for(const [locale,heading] of Object.entries(headings)){
   await page.locator('.guestLanguage select').selectOption(locale);await page.getByRole('heading',{name:heading,exact:true}).waitFor();
   assert.equal(await page.locator('html').getAttribute('lang'),locale);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.getByRole('button',{name:'Dark',exact:true}).click();assert.ok(await page.locator('.app.dark').count());
  await page.screenshot({path:'/tmp/views-guest-email-mobile.png',fullPage:true});
  await context.setOffline(true);await page.getByText('You are offline.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Sign out',exact:true}).isDisabled(),true);
  await context.setOffline(false);
  // Lost response: Core executes logout, browser sees a transport failure. Explicit retry resolves it.
  await page.route('**/guest-api/logout',async route=>{await route.fetch();await route.abort('failed');},{times:1});
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('alert').waitFor();
  assert.ok(await page.locator('[data-testid="guest-identity"]').count());
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await visible('#guest-email');
  assert.equal((await api('session')).body.authenticated,false);
  assert.equal((await api('trips')).status,401);assert.equal(await page.locator('.guestTrips').count(),0);
  const revoked=await fetch(coreOrigin+'/v1/guest-identity/email/session',{headers:{Authorization:'Bearer '+cookie.value}});assert.equal(revoked.status,401);
  checks.push('three_languages_mobile_dark_offline_and_lost_logout_response_manual_retry');
  const beforeReplay=exchanges;phase='link_replay';await page.goto(link);await page.getByRole('button',{name:'Confirm sign-in',exact:true}).click();
  await page.getByText('This link is invalid, expired or already used.',{exact:false}).waitFor();
  assert.equal((await api('session')).body.authenticated,false);assert.equal(exchanges,beforeReplay+1);
  await page.getByRole('button',{name:'Request a new link',exact:true}).click();await visible('#guest-email');
  const invalid=entry+'#challengeId=bad&token=vgel_bad';await page.goto(invalid);await page.getByRole('alert').waitFor();assert.equal(new URL(page.url()).hash,'');
  assert.equal(errors.length,0);checks.push('replay_and_malformed_links_fail_without_session');
  console.log(JSON.stringify({result:'pass',proof:'guest_email_browser_core_postgres_smtp',checks,externalEmailSent:false,publicEnabled:false}));
 }catch(error){console.error(JSON.stringify({result:'fail',proof:'guest_email_browser',phase,checks,error:error.name,frames:error.stack?.split('\n').filter(s=>s.startsWith('    at ')).slice(0,3)}));throw error;}finally{if(browser)await browser.close();await web.close();}
};
