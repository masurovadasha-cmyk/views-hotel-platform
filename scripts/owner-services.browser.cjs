'use strict';
// UI boundary proof with synthetic HTTP responses, not a real Core integration claim.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const fixture=require('./fixtures/canva-core-ui.cjs'),root=path.resolve(process.env.VIEWS_JOURNEY_DIST||'dist'),origin='http://127.0.0.1:4173';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.VIEWS_BROWSER_EXECUTABLE||'/usr/bin/chromium'});try{
 for(const locale of ['ru','uz','en']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await page.addInitScript(l=>localStorage.setItem('views.staff.locale',l),locale);
  let fail=false,delayed,delay=false;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const url=new URL(route.request().url()),json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
   if(url.origin!==origin)return route.abort();
   if(url.pathname==='/local-api/owner-inventory')return json({properties:[{id:fixture.id,name:{en:'Synthetic property'},status:'active'}],truncated:false,draftOnly:true});
   if(url.pathname.startsWith('/local-api/owner-services/')){
    if(delay){delay=false;await new Promise(resolve=>{delayed=resolve;});}
    if(fail)return json({error:'STAFF_SESSION_REQUIRED'},401);
    const kind=url.searchParams.get('kind'),next=url.searchParams.has('after');
    return json({propertyId:fixture.id,kind,readOnly:true,nextCursor:next?null:fixture.id,items:[{id:next?'second':'first',name:{en:next?'Second row':'First row'},...kind==='catalog'?{priceMinor:'12345'}:{status:'requested',quantity:2}}]});
   }
   if(/^\/(local-api|api|guest-api)\//.test(url.pathname)){const body=fixture.response(url.pathname,{staff:'owner'});return body===undefined?json({},404):json(body);}
   const file=path.resolve(root,url.pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({path:file,contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg'})[path.extname(file)]});
  });
  await page.goto(origin+'/?api=local-core');const panel=page.locator('#staff-owner-services');await panel.waitFor();await panel.locator('select').first().selectOption(fixture.id);await panel.getByText('First row',{exact:true}).waitFor();
  await panel.locator('button').last().click();await panel.getByText('Second row',{exact:true}).waitFor();assert.equal(await panel.getByText('First row',{exact:true}).count(),0);
  await panel.locator('select').nth(1).selectOption('orders');await panel.getByText('First row',{exact:true}).waitFor();
  await page.evaluate(()=>window.dispatchEvent(new Event('offline')));assert.equal(await panel.locator('li').count(),0);await panel.getByRole('alert').waitFor();
  await panel.locator('button').first().click();await panel.getByText('First row',{exact:true}).waitFor();
  delay=true;await panel.locator('select').nth(1).selectOption('catalog');await page.waitForFunction(()=>document.querySelector('#staff-owner-services [role=status]'));await panel.locator('select').first().selectOption('');
  while(!delayed)await new Promise(resolve=>setTimeout(resolve,10));delayed();await page.waitForTimeout(100);assert.equal(await panel.locator('li').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Owner services UI: RU/UZ/EN 390px paging, kind switch, offline clearing, refresh and stale response suppression PASS (mock HTTP).');
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
