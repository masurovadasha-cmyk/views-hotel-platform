'use strict';
const durable=require('./demo-market-storage-browser-helper.cjs');
// Upgrade and atomic replacement proof against the actual built UI, without Core/network writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const source=path.resolve(process.env.VIEWS_REPLACEMENT_SOURCE||'.');
const messages=require(path.join(source,'src/features/guest/market-translations.json'));
const root=path.resolve(process.env.VIEWS_JOURNEY_DIST||'dist');
const checks=[],errors=[],requests=[];
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 const target=file===root?path.join(root,'index.html'):file;
 if(!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'})[path.extname(target)]||'application/octet-stream');res.end(fs.readFileSync(target));
});
(async()=>{
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.VIEWS_BROWSER_EXECUTABLE||'/usr/bin/chromium'});
  for(const locale of ['en','ru','uz']){
   const context=await browser.newContext({viewport:{width:360,height:800}}),page=await context.newPage();page.setDefaultTimeout(10000);
   await page.addInitScript(l=>localStorage.setItem('views.guest.locale',l),locale);
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==origin){requests.push(r.url());return route.abort();}return route.continue();});
   await page.goto(origin+'/?api=demo');await page.getByRole('button',{name:/V Market/}).first().click();await durable.ready(page);
   const shop=page.getByTestId('guest-market'),t=k=>messages[k]?.[locale]||k;
   for(const theme of ['light','dark']){
    if(await page.locator('[data-theme-toggle]').getAttribute('aria-pressed')!==String(theme==='dark'))await page.locator('[data-theme-toggle]').click();
    for(const width of [360,390,1440]){
     await page.setViewportSize({width,height:900});await page.waitForFunction(()=>[...document.querySelectorAll('.marketPhoto img')].length===7&&[...document.querySelectorAll('.marketPhoto img')].every(i=>i.complete&&i.naturalWidth>0));
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
     if(width===390)await page.screenshot({path:'/tmp/views-market-photos-mobile-'+locale+'-'+theme+'.png',fullPage:true});
     assert.equal(await shop.locator('.marketPhoto').count(),8);assert.equal(await shop.getByText(t('Photo unavailable'),{exact:true}).count(),1);
    }
    await page.screenshot({path:'/tmp/views-market-photos-'+locale+'-'+theme+'.png',fullPage:true});
   }
   await shop.locator('.marketPhoto summary').first().click();assert.ok(await shop.locator('.marketPhoto a').first().isVisible());
   await shop.getByRole('button',{name:t('Add to list')+': '+t('Green tea'),exact:true}).click();await durable.ready(page);assert.equal(await shop.getByTestId('market-count').innerText(),'1');
   await page.route('**/*.webp',route=>route.abort());await page.reload();await page.getByRole('button',{name:/V Market/}).first().click();await durable.ready(page);
   await page.waitForFunction(()=>document.querySelectorAll('.marketPhoto img').length===0);assert.equal(await shop.getByText(t('Photo unavailable'),{exact:true}).count(),8);assert.equal(await shop.getByTestId('market-count').innerText(),'1');
   checks.push(locale+': light/dark 360/390/1440; seven photos, attribution, missing/error fallback, cart reload');await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log(JSON.stringify({result:'pass',checks,externalRequests:requests.length}));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
