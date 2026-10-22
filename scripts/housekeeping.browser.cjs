// Offline synthetic UI responses; database authority is verified separately.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),catalog=require('../src/features/local-core/staff-translations.json');
const origin='http://127.0.0.1:4173',tr=(locale,key)=>locale==='ru'?key:catalog[key][locale];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],unexpected=[];
 let items=[{taskId:'task-101',unitCode:'101',createdAt:'2026-10-07T09:00:00Z',assignment:'available'},{taskId:'task-102',unitCode:'102',createdAt:'2026-10-07T08:00:00Z',assignment:'assigned'}],failNext=true,writes=[];
 const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 page.on('pageerror',e=>errors.push(e.name));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}
  if(url.pathname==='/local-api/session')return json(route,{authenticated:true,csrf:'fixture',identity:{role:'housekeeper',permissions:['housekeeping.work','property.read'],email:'cleaner@views.invalid',displayName:'Synthetic cleaner',emailVerified:false}});
  if(url.pathname==='/local-api/housekeeping'){
   if(route.request().method()==='GET')return json(route,{items,truncated:true,syntheticData:true});
   const body=route.request().postDataJSON();writes.push({body,key:route.request().headers()['idempotency-key']});
   if(body.action==='claim')items=items.map(x=>x.taskId===body.taskId?{...x,assignment:'mine'}:x);
   if(failNext){failNext=false;return json(route,{error:'CORE_UNAVAILABLE'},502);}
   if(body.action==='release')items=items.map(x=>x.taskId===body.taskId?{...x,assignment:'available'}:x);
   if(body.action==='complete')items=items.filter(x=>x.taskId!==body.taskId);
   return json(route,{taskId:body.taskId,status:body.action==='complete'?'completed':'pending'});
  }
  if(url.pathname.startsWith('/local-api/')){unexpected.push(url.pathname);return route.abort();}
  const file=path.resolve('dist',url.pathname.slice(1)||'index.html');if(!file.startsWith(path.resolve('dist')+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]});
 });
 try{
  await page.goto(origin+'/',{waitUntil:'networkidle'});await page.locator('.housekeepingTasks li').first().waitFor();
  assert.equal(await page.locator('#staff-reception,#staff-booking,#staff-owner').count(),0);
  for(const locale of ['ru','uz','en']){
   const t=key=>tr(locale,key);await page.locator('.staffLanguage select').selectOption(locale);
   await page.getByText(t('Показаны первые 100 задач. Поиск работает только по загруженной части очереди.'),{exact:true}).waitFor();
   for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+locale+' '+width);}
   await page.getByLabel(t('Поиск по номеру'),{exact:true}).fill('101');assert.equal(await page.locator('.housekeepingTasks li').count(),1);
   await page.getByLabel(t('Поиск по номеру'),{exact:true}).fill('');
  }
  assert.equal(await page.locator('.housekeepingTasks li').nth(1).getByRole('button').count(),0);
  await page.getByRole('button',{name:'Claim task',exact:true}).click();await page.getByRole('button',{name:'Retry the same action',exact:true}).waitFor();
  await page.locator('.staffLanguage select').selectOption('ru');await page.getByRole('button',{name:'Повторить то же действие',exact:true}).click();
  await page.getByRole('button',{name:'Вернуть в очередь',exact:true}).waitFor();assert.deepEqual(writes[0],writes[1]);
  await page.getByRole('button',{name:'Вернуть в очередь',exact:true}).click();await page.getByRole('button',{name:'Взять задачу',exact:true}).click();
  const completed=page.getByRole('button',{name:'Уборка завершена',exact:true});await completed.click();
  const dialog=page.getByRole('alertdialog');await dialog.waitFor();const count=writes.length;
  assert.equal(await dialog.getByRole('button',{name:'Подтвердить действие',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Shift+Tab');assert.equal(await dialog.getByRole('button',{name:'Отмена',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');assert.equal(await completed.evaluate(el=>el===document.activeElement),true);assert.equal(writes.length,count);
  await completed.click();await dialog.getByRole('button',{name:'Подтвердить действие',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.housekeepingTasks li').length===1);assert.equal(writes.at(-1).body.action,'complete');
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.housekeepingTasks li').count(),1);
  await page.getByLabel('Только мои задачи',{exact:true}).check();await page.getByText('Задач по выбранному фильтру нет.',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log('Housekeeping UI PASS: 3 languages × 4 widths; scoped navigation; search/partial queue; uncertain retry; claim/release/complete; keyboard confirmation and cancel without mutation; reload. HTTP fixtures only.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
