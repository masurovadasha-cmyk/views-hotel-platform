'use strict';
// Disposable guest pilot only; no real delivery provider is registered.
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const apiRequire=createRequire(path.resolve(__dirname,'../apps/api/package.json'));
module.exports=async function({runtimeUrl,smoke,stopping}){
 Object.assign(process.env,{DATABASE_URL:runtimeUrl,NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',
  VIEWS_GUEST_EMAIL_PILOT_ENABLED:'true',VIEWS_GUEST_TRIPS_PILOT_ENABLED:'true',
  VIEWS_GUEST_EMAIL_TOKEN_KEY:randomBytes(32).toString('hex'),TRUSTED_PROXY_MODE:'direct'});
 const demoSms=process.argv.includes('--demo-sms'),entries=[];
 if(demoSms)Object.assign(process.env,{VIEWS_DEMO_SMS:'true',VIEWS_GUEST_SMS_PILOT_ENABLED:'true',VIEWS_GUEST_SMS_OTP_KEY:randomBytes(32).toString('hex')});
 let app,web;
 try{
  apiRequire('reflect-metadata');
  app=await apiRequire('@nestjs/core').NestFactory.create(apiRequire('./dist/app.module').AppModule,{logger:false,cors:false});
  if(demoSms){
   const db=app.get(apiRequire('./dist/database/database.service').DatabaseService);
   const registry=app.get(apiRequire('./dist/guest-identity/guest-sms.registry').GuestSmsRegistry);
   registry.register(await require('./demo-sms.cjs')(db,process.env,entry=>{if(smoke)entries.push(entry);console.log(JSON.stringify(entry));}));
  }
  await app.listen(0,'127.0.0.1');const coreOrigin=await app.getUrl();
  const ready=await fetch(coreOrigin+'/readiness',{signal:AbortSignal.timeout(5000)});
  assert.equal(ready.status,200);assert.equal((await ready.json()).database,'ok');
  if(demoSms&&smoke){
   const call=async(route,body,token)=>fetch(coreOrigin+'/v1/guest-identity/'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
   const invalid=await call('sms',{phone:'+998901234567'});assert.equal(invalid.status,400);assert.equal(entries.length,0);
   const requested=await call('sms',{phone:'+998000000001'});assert.equal(requested.status,201);
   const challenge=await requested.json();assert.equal(challenge.code,undefined);assert.equal(entries.length,1);
   const payload={challengeId:challenge.challengeId,code:entries[0].code};
   const verified=await call('verify',payload);assert.equal(verified.status,201);const session=await verified.json();
   const trips=await call('sms/trips',null,session.token);assert.equal(trips.status,200);assert.deepEqual(await trips.json(),{items:[],nextCursor:null});
   assert.equal((await call('email/trips',null,session.token)).status,401);
   assert.equal(session.role,'guest');assert.equal((await call('verify',payload)).status,401);
   assert.equal((await call('session',null,session.token)).status,200);
   assert.equal((await call('logout',{},session.token)).status,201);
   assert.equal((await call('session',null,session.token)).status,401);
   assert.equal((await call('sms/trips',null,session.token)).status,401);
   console.log(JSON.stringify({demoSmsSmoke:true,syntheticOnly:true,oneTimeCode:true,logoutRevoked:true}));
  }
  web=await require('./fixtures/guest-email-web.cjs')(coreOrigin);
  const html=await fetch(web.origin,{signal:AbortSignal.timeout(5000)});
  assert.equal(html.status,200);assert.ok((await html.text()).includes('<div id="root">'));
  const session=await fetch(web.origin+'/guest-api/session',{headers:{'X-Views-Guest-Pilot':'1'},signal:AbortSignal.timeout(5000)});
  assert.equal(session.status,200);assert.deepEqual(await session.json(),{authenticated:false});
  const denied=await fetch(web.origin+'/guest-api/trips',{headers:{'X-Views-Guest-Pilot':'1'},signal:AbortSignal.timeout(5000)});
  assert.equal(denied.status,401);
  console.log(JSON.stringify({sandboxReady:true,corePort:new URL(coreOrigin).port,webPort:new URL(web.origin).port,
   mode:'guest-core',disposable:true,externalDelivery:false,authenticatedTripsDenied:true}));
  if(!smoke)while(!stopping())await new Promise(resolve=>setTimeout(resolve,200));
 }finally{if(web)await web.close();if(app)await app.close();}
};
