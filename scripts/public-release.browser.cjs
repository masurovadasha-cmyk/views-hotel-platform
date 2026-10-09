'use strict';
// Verify current public assets with curl's normal TLS validation, then render those
// downloaded responses in Chromium. No browser TLS bypass, credentials or API writes.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {execFileSync}=require('node:child_process'),{chromium}=require('playwright');
const [address,expectedSource,expectedVersion='0.9.0-preview']=process.argv.slice(2);
assert.ok(address&&/^[a-f0-9]{40}$/.test(expectedSource||''),'Usage: node scripts/public-release.browser.cjs HTTPS_URL SOURCE_SHA [VERSION]');
const target=new URL(address);
assert.equal(target.protocol,'https:');assert.equal(target.username,'');assert.equal(target.password,'');
assert.ok(['masurovadasha-cmyk.github.io','staging-master-reference-v1-views-hotel-platform.masurovadasha.workers.dev'].includes(target.hostname),'UNEXPECTED_RELEASE_HOST');
assert.equal(target.search,'');assert.equal(target.hash,'');
const prefix=target.pathname.endsWith('/')?target.pathname:target.pathname+'/';
const cache=new Map(),checks=[],errors=[],unexpected=[];
function download(url){
 const parsed=new URL(url);assert.equal(parsed.origin,target.origin);assert.ok(parsed.pathname.startsWith(prefix));
 const value=execFileSync('curl',['--fail','--silent','--show-error','--proto','=https','--connect-timeout','15','--max-time','45','--header','Cache-Control: no-cache',url],{maxBuffer:15*1024*1024});
 return value;
}
(async()=>{
 const release=JSON.parse(download(target.origin+prefix+'release.json?verify='+expectedSource));
 assert.equal(release.sourceCommit,expectedSource);assert.equal(release.sourceDirty,false);assert.equal(release.version,expectedVersion);
 assert.equal(release.mode,'static-demo');assert.equal(release.corePublic,false);assert.equal(release.emailConnected,false);
 checks.push('public_release_metadata_matches_clean_source_version_and_disconnected_core');
 const browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{}),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(15000);
  await page.addInitScript(()=>{localStorage.setItem('views.guest.locale','en');localStorage.setItem('views.staff.locale','en');});
  page.on('pageerror',()=>errors.push('BROWSER_JS_ERROR'));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==target.origin||!url.pathname.startsWith(prefix)||/\/(?:api|local-api|guest-api|v1)(?:\/|$)/.test(url.pathname)){
    unexpected.push(url.pathname);return route.abort();
   }
   const key=url.origin+url.pathname;
   if(!cache.has(key))cache.set(key,download(key));
   const ext=url.pathname.split('.').pop(),mime={js:'application/javascript',css:'text/css',svg:'image/svg+xml',jpg:'image/jpeg',png:'image/png',json:'application/json',woff2:'font/woff2'}[ext]||'text/html';
   return route.fulfill({status:200,body:cache.get(key),contentType:mime});
  });
  await page.goto(target.origin+prefix+'?api=demo&entry=access',{waitUntil:'networkidle'});
  assert.equal(await page.locator('.accessCards button').count(),5);
  await page.getByRole('button',{name:/Purchasing & warehouse/}).click();
  for(const role of ['procurement','warehouse'])assert.ok((await page.locator('[data-staff-entry="'+role+'"]').getAttribute('href')).includes('staffRole='+role));
  assert.ok((await page.locator('.accessVersion').innerText()).includes(expectedVersion));
  checks.push('five_public_directions_and_separate_supply_entries');
  for(const role of ['front_desk','housekeeper','technician','concierge','accountant','manager','owner','procurement','warehouse']){
   await page.goto(target.origin+prefix+'?api=demo&entry=staff&staffRole='+role,{waitUntil:'networkidle'});
   assert.equal(await page.locator('[data-staff-role]').getAttribute('data-staff-role'),role);
   assert.equal(await page.locator('.staffRoleSignIn input').isDisabled(),true);
   assert.equal(await page.locator('.staffRoleSignIn fieldset button').isDisabled(),true);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'ROLE_MOBILE_OVERFLOW_'+role);
  }
  checks.push('nine_public_role_entries_mobile_disconnected_email_no_api');
  await page.goto(target.origin+prefix+'?api=demo',{waitUntil:'networkidle'});
  await page.locator('.guestNav').getByRole('button',{name:'Services',exact:true}).click();
  await page.locator('.serviceGrid.large').getByRole('button',{name:/V Market/}).click();
  const market=page.getByTestId('guest-market');await market.waitFor();
  await market.getByRole('button',{name:'Add to list: Still water',exact:true}).click();
  await market.getByRole('button',{name:'Review list',exact:true}).click();await page.getByTestId('market-review').waitFor();
  assert.equal(await page.getByTestId('market-count').innerText(),'1');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'MARKET_MOBILE_OVERFLOW');
  checks.push('public_v_market_catalogue_and_unsent_shopping_list');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({result:'pass',proof:'public_release_assets_browser',url:target.origin+prefix,sourceCommit:expectedSource,version:expectedVersion,checks,downloadedResources:cache.size,tlsVerification:'curl_default_no_bypass',browserNetwork:'intercepted_to_verified_public_downloads',realEmailSent:false,publicCoreEnabled:false}));
 }finally{await browser.close();}
})().catch(error=>{console.error(JSON.stringify({result:'fail',proof:'public_release_assets_browser',checks,error:error.name,message:error.message}));process.exitCode=1;});
