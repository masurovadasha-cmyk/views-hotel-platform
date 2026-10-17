// UI acceptance with synthetic HTTP responses; no privileged account activation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),catalog=require('../src/features/local-core/staff-translations.json');
const origin='http://127.0.0.1:4173';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),errors=[],unexpected=[];
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.name));
 let properties=[],writes=[],failNext=true,role='owner';
 const json=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}
  if(url.pathname==='/local-api/session')return json(route,{authenticated:true,csrf:'fixture',identity:{role,permissions:role==='owner'?['property.manage','reservation.read']:[],email:'owner@views.invalid',displayName:'Synthetic owner',emailVerified:false}});
  if(url.pathname==='/local-api/owner-inventory'){
   if(route.request().method()==='GET')return json(route,{properties,truncated:false,draftOnly:true});
   writes.push({key:route.request().headers()['idempotency-key'],body:route.request().postDataJSON()});
   if(failNext){failNext=false;return json(route,{error:'CORE_UNAVAILABLE'},502);}
   properties=[{id:'fixture-property',name:{ru:writes.at(-1).body.name},city:'Tashkent',status:'draft',unitCount:2}];
   return json(route,{propertyId:'fixture-property',status:'draft'});
  }
  if(url.pathname.startsWith('/local-api/')){unexpected.push(url.pathname);return route.abort();}
  const file=path.resolve('dist',url.pathname.slice(1)||'index.html');
  if(!file.startsWith(path.resolve('dist')+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]});
 });
 try{
  await page.goto(origin+'/',{waitUntil:'networkidle'});await page.locator('.ownerInventory').waitFor();
  assert.equal(await page.locator('#staff-reception').count(),0);
  const fields=page.locator('.ownerInventory input');
  for(const [i,value] of ['Synthetic property','Tashkent','Synthetic address','Double','2','1234567890123.45','48'].entries())await fields.nth(i).fill(value);
  await page.locator('.ownerInventory textarea').fill('A1, A2');
  for(const locale of ['ru','uz','en']){
   await page.locator('.staffLanguage select').selectOption(locale);
   assert.equal(await fields.nth(0).inputValue(),'Synthetic property');
   for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+locale+' '+width);}
  }
  await page.getByRole('button',{name:'Save property draft',exact:true}).click();
  await page.getByRole('button',{name:'Retry the same submission',exact:true}).waitFor();assert.equal(await fields.nth(0).isDisabled(),true);
  await page.locator('.staffLanguage select').selectOption('ru');
  await page.getByRole('button',{name:'Повторить ту же отправку',exact:true}).click();
  await page.getByText('Черновик сохранён. Продажи не открыты.',{exact:true}).waitFor();
  assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(writes[0].body.nightlyMinor,'123456789012345');
  assert.equal(await fields.nth(0).inputValue(),'');assert.equal(await page.locator('.ownerInventory li').count(),1);
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.ownerInventory li').count(),1);
  role='housekeeper';await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('.ownerInventory').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log('Owner UI PASS: 3 languages × 4 widths; form preservation; exact minor money; uncertain retry uses same body/key; list reload; role separation. HTTP fixtures only.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
