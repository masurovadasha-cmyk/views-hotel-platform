// Synthetic HTTP UI proof; actual transaction behavior is covered in PostgreSQL tests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{chromium}=require('playwright');
const origin='http://127.0.0.1:4173',target=process.env.VIEWS_BROWSER_DIST||'dist',propertyId=randomUUID(),categoryId=randomUUID(),roomIds=[randomUUID(),randomUUID()];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],unexpected=[],writes=[],checks=[];
 let revision=1,loseReply=true,staleNext=false,detailFailure=false;
 let draft={revision:'1'.repeat(64),name:'Synthetic property',city:'Tashkent',address:'Synthetic address',categories:[{id:categoryId,name:'Double',maxGuests:2,units:roomIds.map((id,i)=>({id,code:'A'+(i+1)})),nightlyMinor:'10000001',freeCancellationHours:48}]};
 assert.ok(['dist','dist-android'].includes(target));const prefix=target==='dist-android'?'/views-hotel-platform/':'/';
 if(target==='dist-android')await page.addInitScript(()=>{delete String.prototype.replaceAll;});
 const completed=new Map(),json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 page.on('pageerror',e=>errors.push(e.name));page.on('dialog',dialog=>dialog.accept());
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}
  if(url.pathname==='/local-api/session')return json(route,{authenticated:true,csrf:'fixture',identity:{role:'owner',permissions:['property.manage'],email:'owner@views.invalid',displayName:'Synthetic owner',emailVerified:false}});
  if(url.pathname==='/local-api/owner-inventory')return json(route,{properties:[{id:propertyId,name:{ru:draft.name},city:draft.city,status:'draft',unitCount:draft.categories.reduce((n,c)=>n+c.units.length,0)}],truncated:false,draftOnly:true});
  if(url.pathname==='/local-api/owner-inventory/'+propertyId){
   if(route.request().method()==='GET')return detailFailure?json(route,{error:'CORE_UNAVAILABLE'},502):json(route,{...draft,propertyId,status:'draft'});
   const body=route.request().postDataJSON(),key=route.request().headers()['idempotency-key'];writes.push({body,key});
   if(completed.has(key)){assert.deepEqual(completed.get(key),body);return json(route,{propertyId,status:'draft',idempotentReplay:true});}
   if(staleNext){staleNext=false;draft={...draft,revision:String(++revision).repeat(64),name:'Changed by another editor'};return json(route,{error:'INVENTORY_REVISION_CONFLICT'},409);}
   assert.equal(body.revision,draft.revision);completed.set(key,body);draft={...body,revision:String(++revision).repeat(64),categories:body.categories.map(c=>({...c,id:c.id||randomUUID(),units:c.units.map(u=>({...u,id:u.id||randomUUID()}))}))};
   if(loseReply){loseReply=false;return json(route,{error:'CORE_UNAVAILABLE'},502);}return json(route,{propertyId,status:'draft'});
  }
  if(url.pathname.startsWith('/local-api/')){unexpected.push(url.pathname);return route.abort();}
  if(!url.pathname.startsWith(prefix)){unexpected.push(url.pathname);return route.abort();}
  const root=path.resolve(target),file=path.resolve(root,url.pathname.slice(prefix.length)||'index.html');
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css'}[path.extname(file)]});
 });
 try{
  await page.goto(origin+prefix,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Редактировать фонд',exact:true}).click();
  const editor=page.locator('.inventoryEditor'),categories=editor.locator('.inventoryCategory');await categories.waitFor();
  await editor.getByLabel('Название объекта',{exact:true}).fill('Edited property');
  await categories.nth(0).getByLabel('Название категории номеров',{exact:true}).fill('Suite');
  await categories.nth(0).getByLabel('Гостей в одном номере',{exact:true}).fill('3');
  await categories.nth(0).getByLabel('Цена за ночь, UZS',{exact:true}).fill('1234567890123.45');
  await categories.nth(0).getByLabel('Бесплатная отмена не позднее, часов до заезда',{exact:true}).fill('24');
  await categories.nth(0).getByLabel('Код номера 1',{exact:true}).fill('A2');await categories.nth(0).getByLabel('Код номера 2',{exact:true}).fill('A1');
  await editor.getByRole('button',{name:'Добавить категорию',exact:true}).click();
  await categories.nth(1).getByLabel('Название категории номеров',{exact:true}).fill('Family');
  await categories.nth(1).getByLabel('Гостей в одном номере',{exact:true}).fill('4');
  await categories.nth(1).getByLabel('Цена за ночь, UZS',{exact:true}).fill('500000.99');
  await categories.nth(1).getByLabel('Код номера 1',{exact:true}).fill('A1');
  await editor.getByRole('button',{name:'Сохранить изменения фонда',exact:true}).click();
  await editor.getByRole('alert').waitFor();assert.equal(writes.length,0);
  await categories.nth(1).getByLabel('Код номера 1',{exact:true}).fill('F1');
  await categories.nth(1).getByRole('button',{name:'Добавить номер',exact:true}).click();await categories.nth(1).getByLabel('Код номера 2',{exact:true}).fill('F2');
  const formValues=()=>editor.locator('input').evaluateAll(xs=>xs.map(x=>x.value)),expected=await formValues();
  for(const language of ['en','uz','ru']){
   await page.locator('.staffLanguage select').selectOption(language);assert.deepEqual(await formValues(),expected);
   for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+language+' '+width);}
  }
  assert.equal(writes.length,0);checks.push('three_languages_four_widths_preserve_multicategory_form');
  await editor.getByRole('button',{name:'Сохранить изменения фонда',exact:true}).click();
  await editor.getByRole('button',{name:'Повторить ту же отправку',exact:true}).waitFor();assert.equal(await editor.getByLabel('Название объекта',{exact:true}).isDisabled(),true);assert.equal(await editor.getByRole('button',{name:'Вернуться к объектам',exact:true}).isDisabled(),true);
  await editor.getByRole('button',{name:'Повторить ту же отправку',exact:true}).click();await editor.getByText('Изменения сохранены. Продажи не открыты.',{exact:true}).waitFor();
  assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(writes[0].body.categories[0].nightlyMinor,'123456789012345');assert.deepEqual(writes[0].body.categories[0].units.map(u=>u.id),roomIds);assert.equal(writes[0].body.categories[1].units[0].id,null);assert.equal(completed.size,1);checks.push('committed_response_loss_retries_identical_key_and_body');
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Редактировать фонд',exact:true}).click();await categories.nth(1).waitFor();assert.equal(await categories.nth(0).getByLabel('Цена за ночь, UZS',{exact:true}).inputValue(),'1234567890123.45');checks.push('reload_preserves_ids_categories_exact_money_and_terms');
  staleNext=true;await editor.getByLabel('Название объекта',{exact:true}).fill('My stale edits');await editor.getByRole('button',{name:'Сохранить изменения фонда',exact:true}).click();await editor.getByRole('alert').waitFor();
  assert.equal(await editor.getByLabel('Название объекта',{exact:true}).inputValue(),'My stale edits');assert.equal(await editor.getByRole('button',{name:'Сохранить изменения фонда',exact:true}).isDisabled(),true);
  await editor.getByRole('button',{name:'Загрузить свежую версию',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.inventoryEditor input')?.value==='Changed by another editor');checks.push('stale_revision_preserves_form_until_explicit_reload');
  await categories.nth(0).getByRole('button',{name:'Удалить номер 2',exact:true}).click();await categories.nth(1).getByRole('button',{name:'Удалить категорию',exact:true}).click();assert.equal(await categories.count(),1);
  await editor.getByRole('button',{name:'Сохранить изменения фонда',exact:true}).click();await editor.getByText('Изменения сохранены. Продажи не открыты.',{exact:true}).waitFor();assert.equal(draft.categories.length,1);assert.equal(draft.categories[0].units.length,1);checks.push('explicit_room_and_category_removal_saved_together');
  detailFailure=true;await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Редактировать фонд',exact:true}).click();await editor.getByRole('alert').waitFor();assert.equal(await editor.locator('form').count(),0);detailFailure=false;await editor.getByRole('button',{name:'Загрузить свежую версию',exact:true}).click();await categories.waitFor();checks.push('detail_failure_retry_without_mutation');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log(JSON.stringify({stage:'7.51',result:'pass',target,checks,httpFixturesOnly:true,externalRequestsSent:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
