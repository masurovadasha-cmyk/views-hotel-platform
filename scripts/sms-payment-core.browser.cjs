'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {chromium}=require('playwright');
module.exports=async function({db,coreOrigin,webOrigin,entries}){
 const marker=await db.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()");
 assert.equal(marker.rows[0]?.marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[];let captures=0;
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);page.on('pageerror',()=>errors.push('PAGE_ERROR'));
  async function login(phone){
   await page.goto(webOrigin+'/?entry=sms-demo');await page.getByLabel('Телефон',{exact:true}).fill(phone);
   const request=page.waitForResponse(r=>r.url().endsWith('/sms-demo-api/sms'));
   await page.getByRole('button',{name:'Получить код',exact:true}).click();const challenge=await (await request).json();
   const otp=entries.find(e=>e.challengeId===challenge.challengeId);assert.ok(otp,'synthetic OTP was not captured');
   await page.getByLabel('Код',{exact:true}).fill(otp.code);
   const verification=page.waitForResponse(r=>r.url().endsWith('/sms-demo-api/verify'));
   await page.getByRole('button',{name:'Войти',exact:true}).click();const response=await verification;assert.equal(response.status(),201);
   const session=await response.json();await page.getByRole('heading',{name:'Мои поездки',exact:true}).waitFor();return session;
  }
  const session=await login('+998000000002');
  const fixture=await require('./guest-hold-smoke.cjs')({db,origin:coreOrigin,session,fixtureOnly:true});
  const held=await fetch(coreOrigin+'/v1/guest-identity/sms/holds',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token,'Idempotency-Key':randomUUID()},body:JSON.stringify({quoteId:fixture.quoteId})});
  assert.equal(held.status,201);const hold=await held.json();
  await page.getByRole('button',{name:'Обновить поездки',exact:true}).click();await page.getByRole('heading',{name:hold.confirmationCode,exact:true}).waitFor();
  await page.context().setOffline(true);await page.getByRole('button',{name:'Тестовая оплата — без списания',exact:true}).click();
  await page.getByText('Нет сети. Повторите запрос после подключения.',{exact:true}).waitFor();await page.context().setOffline(false);
  let lose=true;
  await page.route('**/sms-demo-api/sms/demo-payment',async route=>{
   captures++;if(lose){lose=false;const response=await route.fetch();assert.equal(response.status(),201);await route.abort('failed');}else await route.continue();
  });
  await page.getByRole('button',{name:'Тестовая оплата — без списания',exact:true}).click();
  const retry=page.getByRole('button',{name:'Повторить проверку оплаты',exact:true});await retry.waitFor();await page.waitForFunction(()=>!document.querySelector('button:disabled'));
  const paymentResponse=page.waitForResponse(r=>r.url().endsWith('/sms-demo-api/sms/demo-payment'));
  await retry.click();const response=await paymentResponse;assert.equal(response.status(),201);const receipt=await response.json();
  await page.getByText('Тестовая оплата подтверждена. Реальные деньги не списывались.',{exact:true}).waitFor();assert.equal(captures,2);
  assert.equal(receipt.simulation,true);assert.equal(receipt.reservationId,hold.reservationId);assert.equal(receipt.bookingStatus,'confirmed');
  await db.withOrganization(fixture.organizationId,async c=>{
   assert.equal((await c.query("SELECT count(*)::int n FROM provider_transactions WHERE payment_intent_id=$1 AND kind='capture'",[receipt.paymentIntentId])).rows[0].n,1);
   const ledger=(await c.query("SELECT count(*)::int n,sum(CASE WHEN e.side='debit' THEN e.amount_minor ELSE -e.amount_minor END)::text balance FROM ledger_entries e JOIN ledger_journals j ON j.id=e.journal_id WHERE j.reference_id=$1",[receipt.paymentIntentId])).rows[0];
   assert.deepEqual(ledger,{n:2,balance:'0'});
   assert.deepEqual((await c.query('SELECT kind FROM inventory_periods WHERE reservation_id=$1',[hold.reservationId])).rows,[{kind:'reservation'}]);
  });
  assert.equal(await page.evaluate(token=>JSON.stringify(localStorage).includes(token)||JSON.stringify(sessionStorage).includes(token),session.token),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile horizontal overflow');
  await page.screenshot({path:'/tmp/views-sms-payment-core.png',fullPage:true});
  await page.getByRole('button',{name:'Выйти',exact:true}).click();await page.getByRole('button',{name:'Получить код',exact:true}).waitFor();
  const denied=await fetch(coreOrigin+'/v1/guest-identity/sms/trips',{headers:{Authorization:'Bearer '+session.token}});assert.equal(denied.status,401);
  const other=await login('+998000000003');await page.getByText('Поездок пока нет. Для демо нужна бронь, привязанная к этому гостю.',{exact:true}).waitFor();
  const foreign=await fetch(coreOrigin+'/v1/guest-identity/sms/demo-payment',{method:'POST',headers:{Authorization:'Bearer '+other.token,'Content-Type':'application/json'},body:JSON.stringify({reservationId:hold.reservationId})});assert.equal(foreign.status,404);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'pass',realCore:true,realPostgres:true,browserSmsLogin:true,holdCreatedViaApi:true,mousePayment:true,lostReplyRetry:true,oneCapture:true,balancedLedger:true,logoutRevoked:true,foreignGuestDenied:true}));
 }finally{await browser.close();}
};
