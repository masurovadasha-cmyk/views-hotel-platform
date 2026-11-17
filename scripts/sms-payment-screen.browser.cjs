'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
const {chromium}=require('playwright');
(async()=>{
 Object.assign(process.env,{NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_DEMO_SMS:'true'});
 const token='vgs_'+'a'.repeat(43),id='10000000-0000-4000-8000-000000000011';let paid=false,payCalls=0,lost=true;
 const core=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');const send=v=>res.end(JSON.stringify(v));
  if(req.url.endsWith('/sms'))return send({challengeId:id});
  if(req.url.endsWith('/verify'))return send({token});
  assert.equal(req.headers.authorization,'Bearer '+token);
  if(req.url.endsWith('/sms/trips'))return send({items:[{id,confirmationCode:'DEMO-TEST',status:paid?'confirmed':'hold',totalMinor:'123456',currency:'UZS'}],nextCursor:null});
  if(req.url.endsWith('/sms/demo-payment')){
   payCalls++;paid=true;if(lost){lost=false;req.socket.destroy();return;}
   return send({simulation:true,reservationId:id,paymentStatus:'captured',bookingStatus:'confirmed'});
  }
  if(req.url.endsWith('/logout'))return send({ok:true});res.writeHead(404);res.end('{}');
 });
 await new Promise(r=>core.listen(0,'127.0.0.1',r));
 const web=await require('./fixtures/guest-email-web.cjs')('http://127.0.0.1:'+core.address().port);
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(web.origin+'/?entry=sms-demo');await page.getByRole('button',{name:'Получить код',exact:true}).click();
  await page.getByLabel('Код',{exact:true}).fill('123456');await page.getByRole('button',{name:'Войти',exact:true}).click();
  await page.getByRole('heading',{name:'DEMO-TEST'}).waitFor();
  assert.ok((await page.locator('article').innerText()).includes('1 234,56 UZS'));
  await page.context().setOffline(true);await page.getByRole('button',{name:'Тестовая оплата — без списания',exact:true}).click();
  await page.getByText('Нет сети. Повторите запрос после подключения.',{exact:true}).waitFor();assert.equal(payCalls,0);await page.context().setOffline(false);
  await page.getByRole('button',{name:'Тестовая оплата — без списания',exact:true}).click();
  await page.getByText('DEMO_CONNECTION_FAILED',{exact:true}).waitFor();assert.equal(payCalls,1);
  await page.getByRole('button',{name:'Повторить проверку оплаты',exact:true}).click();
  await page.getByText('Тестовая оплата подтверждена. Реальные деньги не списывались.',{exact:true}).waitFor();assert.equal(payCalls,2);
  assert.ok((await page.locator('article').innerText()).includes('Подтверждена'));
  assert.equal(await page.evaluate(t=>JSON.stringify(localStorage).includes(t)||JSON.stringify(sessionStorage).includes(t),token),false);
  await page.screenshot({path:'/tmp/views-sms-payment-screen.png',fullPage:true});
  await page.reload();await page.getByRole('button',{name:'Получить код',exact:true}).waitFor();assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'pass',mockCore:true,realGateway:true,offline:true,lostReplyRetry:true,memoryOnlySession:true,pageErrors:0}));
 }finally{await browser.close();await web.close();await new Promise(r=>{core.close(r);core.closeAllConnections();});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
