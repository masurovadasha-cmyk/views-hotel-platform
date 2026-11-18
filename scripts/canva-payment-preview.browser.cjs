'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const catalog=require('../src/features/guest/guest-translations.json'),root=path.resolve('dist'),origin='https://canva-preview.invalid';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('views.guest.locale','en'));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin!==origin||route.request().method()!=='GET'||u.pathname.startsWith('/api/')){requests.push(u.pathname);return route.abort();}
  const file=path.resolve(root,u.pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp'}[path.extname(file)]});
 });
 try{
  await page.goto(origin+'/?api=demo');await page.getByRole('navigation').getByRole('button',{name:'Services',exact:true}).click();
  await page.locator('[data-service="cleaning"]').click();await page.getByTestId('guest-service-preview-form').locator('textarea').fill('Synthetic cleaning request');
  await page.getByRole('button',{name:'Preview request',exact:true}).click();await page.getByRole('button',{name:'Preview payment options',exact:true}).click();
  const panel=page.getByTestId('service-payment-preview');await panel.waitFor();
  for(const locale of ['ru','uz','en']){
   await page.locator('.guestLanguage select').selectOption(locale);const t=k=>locale==='en'?k:catalog[k][locale];
   await panel.getByRole('heading',{name:t('How would you like to pay?')}).waitFor();
   for(const theme of ['light','dark']){
    if((await page.locator('[data-theme-toggle]').getAttribute('aria-pressed'))!==String(theme==='dark'))await page.locator('[data-theme-toggle]').click();
    for(const method of ['folio','card','payme','click']){await panel.locator('input[value="'+method+'"]').check();assert.equal(await panel.locator('input:checked').count(),1);}
    assert.equal(await panel.getByRole('button',{name:t('Payment unavailable')}).isDisabled(),true);
    for(const width of [360,390,768]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
    if(locale==='ru'){await page.setViewportSize({width:390,height:1000});await panel.screenshot({path:'/tmp/views-canva-payment-'+theme+'.png'});}
   }
  }
  await panel.getByRole('button',{name:'Back to request',exact:true}).click();assert.equal(await page.getByTestId('guest-service-preview-form').locator('textarea').inputValue(),'Synthetic cleaning request');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);console.log(JSON.stringify({result:'pass',screen:'SG-GN-004',layouts:18,languages:3,themes:2,requests:0,draftPreserved:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
