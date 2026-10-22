// Calendar UI proof with synthetic HTTP responses. PostgreSQL tests prove exclusion.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{chromium}=require('playwright');
const origin='http://127.0.0.1:4173',property=randomUUID(),unit=randomUUID(),day=n=>new Date(Date.now()+5*3600000+n*86400000).toISOString().slice(0,10);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],unexpected=[],writes=[],checks=[];
 let loseReply=true,conflict=false,failRead=false,acceptRemoval=false;
 let periods=[{id:randomUUID(),unitId:unit,kind:'payment_hold',start:day(0)+'T01:00+05:00',end:day(0)+'T02:00+05:00',expiresAt:'2020-01-01T00:00:00Z',canRemove:false}];const completed=new Map();
 const json=(r,b,status=200)=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(b)});
 page.on('pageerror',e=>errors.push(e.name));page.on('dialog',d=>acceptRemoval?d.accept():d.dismiss());
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin){unexpected.push(url.origin);return route.abort();}
  if(url.pathname==='/local-api/session')return json(route,{authenticated:true,csrf:'fixture',identity:{role:'owner',permissions:['property.manage'],email:'owner@views.invalid',displayName:'Synthetic owner',emailVerified:false}});
  if(url.pathname==='/local-api/owner-inventory')return json(route,{properties:[{id:property,name:{ru:'Synthetic operating property'},city:'Tashkent',status:'active',unitCount:1}],truncated:false,draftOnly:true});
  if(url.pathname==='/local-api/owner-inventory/'+property+'/calendar'){
   if(route.request().method()==='GET'){
    if(failRead)return json(route,{error:'CORE_UNAVAILABLE'},502);
    assert.deepEqual([...url.searchParams.keys()].sort(),['from','to']);
    return json(route,{units:[{id:unit,code:'A1',status:'active'}],periods,unitsTruncated:false,periodsTruncated:true,window:{start:url.searchParams.get('from')+'T00:00+05:00',end:url.searchParams.get('to')+'T00:00+05:00'}});
   }
   const body=route.request().postDataJSON(),key=route.request().headers()['idempotency-key'];writes.push({body,key});
   if(completed.has(key)){assert.deepEqual(completed.get(key).body,body);return json(route,{...completed.get(key).result,idempotentReplay:true});}
   if(conflict){conflict=false;return json(route,{error:'CALENDAR_PERIOD_CONFLICT'},409);}
   const periodId=body.action==='block'?randomUUID():body.periodId,result={propertyId:property,status:body.action==='block'?'blocked':'unblocked',periodId};
   if(body.action==='block'){assert.deepEqual(Object.keys(body).sort(),['action','end','kind','start','unitId']);assert.equal(body.unitId,unit);assert.ok(body.start.endsWith('+05:00'));periods.push({id:periodId,unitId:unit,kind:body.kind,start:body.start,end:body.end,expiresAt:null,canRemove:true});}
   else periods=periods.filter(p=>p.id!==periodId);
   completed.set(key,{body,result});if(loseReply){loseReply=false;return json(route,{error:'CORE_UNAVAILABLE'},502);}return json(route,result);
  }
  if(url.pathname.startsWith('/local-api/')){unexpected.push(url.pathname);return route.abort();}
  const root=path.resolve('dist'),file=path.resolve(root,url.pathname.slice(1)||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({path:file,contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css'}[path.extname(file)]});
 });
 try{
  await page.goto(origin+'/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Календарь занятости',exact:true}).click();const calendar=page.locator('.ownerCalendar');await calendar.getByRole('button',{name:'Закрыть номер',exact:true}).waitFor();
  assert.equal(await calendar.getByRole('button',{name:'Снять блокировку',exact:true}).count(),0);await calendar.getByText('Ожидает освобождения холда',{exact:false}).waitFor();
  assert.ok((await calendar.innerText()).includes('Показана только часть календаря'));
  await calendar.getByLabel('Начало блокировки',{exact:true}).fill(day(3)+'T14:00');await calendar.getByLabel('Конец блокировки',{exact:true}).fill(day(4)+'T12:00');
  const values=()=>calendar.locator('input').evaluateAll(xs=>xs.map(x=>x.value)),expected=await values();
  for(const locale of ['en','uz','ru']){await page.locator('.staffLanguage select').selectOption(locale);assert.deepEqual(await values(),expected);for(const width of [360,390,768,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+locale+' '+width);}}
  assert.equal(writes.length,0);checks.push('three_languages_four_widths_expiry_and_partial_warning');
  await calendar.getByRole('button',{name:'Закрыть номер',exact:true}).click();await calendar.getByRole('button',{name:'Повторить ту же отправку',exact:true}).waitFor();assert.equal(await calendar.getByLabel('Начало блокировки',{exact:true}).isDisabled(),true);assert.equal(await calendar.getByRole('button',{name:'Вернуться к объектам',exact:true}).isDisabled(),true);
  await calendar.getByRole('button',{name:'Повторить ту же отправку',exact:true}).click();await calendar.getByText('Команда уже выполнялась. Актуальное состояние — в календаре.',{exact:true}).waitFor();assert.deepEqual(writes[0],writes[1]);assert.equal(completed.size,1);checks.push('lost_commit_reply_replays_frozen_body_and_key');
  conflict=true;await calendar.getByRole('button',{name:'Закрыть номер',exact:true}).click();await calendar.getByRole('alert').waitFor();assert.deepEqual(await values(),expected);assert.equal(await calendar.getByLabel('Начало блокировки',{exact:true}).isDisabled(),false);checks.push('overlap_error_preserves_editable_form');
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'Календарь занятости',exact:true}).click();const remove=calendar.getByRole('button',{name:'Снять блокировку',exact:true});await remove.waitFor();const count=writes.length;await remove.click();assert.equal(writes.length,count);acceptRemoval=true;await remove.click();await calendar.getByText('Ручная блокировка снята.',{exact:true}).waitFor();assert.equal(periods.length,1);assert.equal(periods[0].kind,'payment_hold');checks.push('reload_cancel_confirmation_and_remove_only_manual_block');
  failRead=true;await calendar.getByRole('button',{name:'Обновить календарь',exact:true}).click();await calendar.getByRole('alert').waitFor();failRead=false;await calendar.getByRole('button',{name:'Обновить календарь',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ownerCalendar input')?.disabled===false);assert.equal(await calendar.getByRole('alert').count(),0);checks.push('read_failure_recovery_without_mutation');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);console.log(JSON.stringify({stage:'7.52',result:'pass',checks,httpFixturesOnly:true,externalRequestsSent:0}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
