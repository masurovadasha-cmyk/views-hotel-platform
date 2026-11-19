'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const scope=require('../src/features/canva-workbench/scope.json'),root=path.resolve('dist'),origin='https://views-workbench.invalid';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),page=await browser.newPage({viewport:{width:390,height:1000}}),errors=[],requests=[];let layouts=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==origin||route.request().method()!=='GET'||/\/(api|v1|guest-api)\//.test(u.pathname)){requests.push(u.pathname);return route.abort();}
  const file=path.resolve(root,u.pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp'}[path.extname(file)]});
 });
 try{
  assert.equal(scope.length,81);assert.equal(new Set(scope.map(s=>s.id)).size,81);
  await page.goto(origin+'/?entry=canva-workbench');
  const nav=page.getByRole('navigation',{name:'Экраны Canva'});
  for(const screen of scope){
   await nav.getByRole('button',{name:new RegExp(screen.id)}).click();
   const stage=page.locator('[data-workbench-screen="'+screen.id+'"]');await stage.waitFor();
   assert.ok((await stage.textContent()).trim().length>50,'EMPTY_SCREEN:'+screen.id);
   assert.ok(await stage.locator('button,input,select,textarea,a').count(),'NO_CONTROLS:'+screen.id);
   for(const dark of [false,true]){
    const toggle=page.getByRole('button',{name:'Тёмная тема',exact:true});if(await toggle.getAttribute('aria-pressed')!==String(dark))await toggle.click();
    for(const width of [390,1280]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'OVERFLOW:'+screen.id);layouts++;}
   }
  }
  await page.getByRole('button',{name:'Макет для сравнения',exact:true}).click();await page.locator('.workbenchReference').waitFor();
  assert.equal(await page.locator('.workbenchReference').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  await page.getByLabel('Поиск экрана').fill('NO_MATCH_SYNTHETIC');assert.equal(await nav.getByRole('button').count(),0);
  await page.getByLabel('Поиск экрана').fill('');
  for(const id of ['SG-CL-007','SD-GN-003','SS-GN-008','SP-GN-002','SH-GN-001','SA-GN-001']){
   await nav.getByRole('button',{name:new RegExp(id)}).click();await page.setViewportSize({width:390,height:1000});await page.locator('.workbenchStage').screenshot({path:'/tmp/views-workbench-'+id+'.png'});
  }
  async function screen(id){await nav.getByRole('button',{name:new RegExp(id)}).click();return page.locator('[data-workbench-screen="'+id+'"]');}
  let form=await screen('SG-TX-001');await form.getByRole('button',{name:'Выбрать класс в демо'}).click();await page.locator('[data-workbench-screen="SG-TX-002"]').waitFor();
  form=await screen('SS-CL-004');await form.getByRole('button',{name:'Завершить демо-диагностику'}).click();await form.getByRole('status').filter({hasText:'Заполните все пункты'}).waitFor();
  for(const check of await form.getByRole('checkbox').all())await check.check();await form.getByRole('button',{name:'Завершить демо-диагностику'}).click();await form.getByRole('status').filter({hasText:'Демо-действие выполнено'}).waitFor();
  form=await screen('SP-GN-002');assert.equal(await form.getByRole('button',{name:'Принять в демо',exact:true}).isDisabled(),true);await form.getByRole('checkbox').first().check();await form.getByRole('button',{name:'Принять в демо',exact:true}).click();await form.getByRole('status').filter({hasText:'Демо-заказ принят'}).waitFor();
  form=await screen('SA-GN-001');const code=form.locator('input').first();await code.fill('');await form.locator('form button[type=submit],form button:not([type])').last().click();await form.getByRole('status').filter({hasText:'Заполните поле'}).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log(JSON.stringify({result:'pass',screens:81,layouts,themes:2,language:'ru',apiRequests:0,pageErrors:0,actionPaths:4,note:'render/navigation and selected action proof; not full scenario acceptance'}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
