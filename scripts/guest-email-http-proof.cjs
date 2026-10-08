'use strict';
// Real loopback HTTP + SMTP + PostgreSQL; isolated fixture addresses only.
const assert=require('node:assert/strict'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const {createRequire}=require('node:module');
const apiRequire=createRequire(path.resolve(__dirname,'../apps/api/package.json'));
module.exports=async function guestEmailHttpProof({admin,runtimeUrl}){
 assert.equal((await admin.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker,'VIEWS_DISPOSABLE_CORE_TEST');
 const settings={DATABASE_URL:runtimeUrl,NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_GUEST_EMAIL_PILOT_ENABLED:'true',VIEWS_GUEST_TRIPS_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_TOKEN_KEY:randomBytes(32).toString('hex'),TRUSTED_PROXY_MODE:'direct'};
 const saved=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));Object.assign(process.env,settings);
 let app,smtp,transport;const checks=[];
 try{
  apiRequire('reflect-metadata');
  const {NestFactory}=apiRequire('@nestjs/core');
  const {AppModule}=apiRequire('./dist/app.module');
  const {GuestEmailRegistry}=apiRequire('./dist/guest-identity/guest-email.registry');
  app=await NestFactory.create(AppModule,{logger:false,cors:false});
  await app.listen(0,'127.0.0.1');const origin=await app.getUrl();
  assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
  smtp=await require('./fixtures/guest-email-smtp.cjs')();
  transport=apiRequire('nodemailer').createTransport({host:'127.0.0.1',port:smtp.port,secure:false,ignoreTLS:true,pool:false,logger:false,debug:false,connectionTimeout:3000,socketTimeout:5000,disableFileAccess:true,disableUrlAccess:true});
  let linkOrigin=origin+'/';
  app.get(GuestEmailRegistry).register({send:async m=>{
   assert.ok(m.email.endsWith('@views.invalid'));
   const fragment=new URLSearchParams({challengeId:m.challengeId,token:m.token});
   const result=await transport.sendMail({from:'guest-auth@views.invalid',to:m.email,subject:'[LOCAL TEST] Guest email identity',textEncoding:'base64',
    text:'Synthetic capture only; no external mailbox delivery.\n'+linkOrigin+'#'+fragment.toString(),disableFileAccess:true,disableUrlAccess:true});
   assert.deepEqual(result.accepted,[m.email]);assert.deepEqual(result.rejected,[]);return {accepted:true};
  }});
  async function rpc(route,body,token,extra={}){
   const response=await fetch(origin+'/v1/guest-identity/email/'+route,{method:body===undefined?'GET':'POST',
    headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
   return {status:response.status,cache:response.headers.get('cache-control'),body:await response.json()};
  }
  const email='guest-http-'+randomBytes(6).toString('hex')+'@views.invalid';
  assert.equal((await rpc('request',{email,locale:'ru',role:'platform_admin'})).status,400);
  assert.equal((await rpc('request',{email,locale:'ru'},null,{'x-user-id':'20000000-0000-4000-8000-000000000001'})).status,401);
  const issued=await rpc('request',{email,locale:'ru'});
  assert.equal(issued.status,200);assert.equal(issued.cache,'no-store');assert.equal(issued.body.token,undefined);
  assert.equal(smtp.messages.length,1);assert.equal(smtp.messages[0].recipient,email);
  const raw=smtp.messages[0].raw;assert.match(raw,/Content-Transfer-Encoding: base64/i);
  const text=Buffer.from(raw.slice(raw.indexOf('\r\n\r\n')+4).replace(/\s/g,''),'base64').toString('utf8');
  const link=new URL(text.split('\n').find(s=>s.startsWith(origin))),fragment=new URLSearchParams(link.hash.slice(1));
  assert.equal(fragment.get('challengeId'),issued.body.challengeId);assert.match(fragment.get('token'),/^vgel_[A-Za-z0-9_-]{43}$/);
  assert.equal((await admin.query('SELECT count(*)::int n FROM users WHERE email=$1',[email])).rows[0].n,0);
  assert.equal((await rpc('exchange')).status,404);checks.push('request_and_real_loopback_smtp_capture_no_token_echo_no_get_exchange');
  const command={challengeId:fragment.get('challengeId'),token:fragment.get('token')};
  const verified=await rpc('exchange',command);
  assert.equal(verified.status,200);assert.equal(verified.cache,'no-store');assert.equal(verified.body.role,'guest');
  assert.equal((await rpc('exchange',command)).status,401);
  const session=await rpc('session',undefined,verified.body.token);
  assert.equal(session.status,200);assert.equal(session.cache,'no-store');assert.equal(session.body.email,email);
  assert.equal((await admin.query('SELECT count(*)::int n FROM organization_memberships WHERE user_id=$1',[verified.body.userId])).rows[0].n,0);
  const staff=await fetch(origin+'/v1/staff-auth/session',{headers:{Authorization:'Bearer '+verified.body.token}});
  assert.ok([401,404].includes(staff.status));checks.push('single_use_guest_session_no_staff_membership_or_session');
  assert.equal((await rpc('logout',{},verified.body.token)).status,200);
  assert.equal((await rpc('session',undefined,verified.body.token)).status,401);
  if(process.env.VIEWS_GUEST_EMAIL_BROWSER_PROOF==='true')await require('./guest-email-browser-proof.cjs')({coreOrigin:origin,smtp,admin,setLinkOrigin:value=>{linkOrigin=value;}});
  process.env.VIEWS_GUEST_EMAIL_PILOT_ENABLED='false';
  assert.equal((await rpc('request',{email,locale:'ru'})).status,404);checks.push('logout_and_default_off_route');
  console.log(JSON.stringify({result:'pass',proof:'guest_email_http_smtp',checks,smtpMessagesCaptured:smtp.messages.length,externalEmailSent:false,productionEnabled:false}));
 }catch(error){console.error(JSON.stringify({result:'fail',proof:'guest_email_http',checks,error:error.name,frames:error.stack?.split('\n').filter(s=>s.startsWith('    at ')).slice(0,3)}));throw error;}finally{
  transport?.close();if(smtp)await smtp.close();if(app)await app.close();
  for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
};
if(require.main===module){
 (async()=>{
  assert.ok(process.env.VIEWS_GUEST_EMAIL_PROOF_OWNER_URL&&process.env.DATABASE_URL,'DISPOSABLE_DATABASE_URLS_REQUIRED');
  const {Client}=apiRequire('pg'),admin=new Client({connectionString:process.env.VIEWS_GUEST_EMAIL_PROOF_OWNER_URL});
  try{await admin.connect();await module.exports({admin,runtimeUrl:process.env.DATABASE_URL});}
  finally{await admin.end();}
 })().catch(()=>{console.error('GUEST_EMAIL_HTTP_PROOF_FAILED');process.exitCode=1;});
}
