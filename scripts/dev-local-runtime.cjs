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
 let app,web;
 try{
  apiRequire('reflect-metadata');
  app=await apiRequire('@nestjs/core').NestFactory.create(apiRequire('./dist/app.module').AppModule,{logger:false,cors:false});
  await app.listen(0,'127.0.0.1');const coreOrigin=await app.getUrl();
  const ready=await fetch(coreOrigin+'/readiness',{signal:AbortSignal.timeout(5000)});
  assert.equal(ready.status,200);assert.equal((await ready.json()).database,'ok');
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
