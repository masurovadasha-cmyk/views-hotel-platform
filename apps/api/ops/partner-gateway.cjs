'use strict';
// Independent loopback partner BFF. No login, issuance or bootstrap route.
const {createHmac,timingSafeEqual}=require('node:crypto');
const TOKEN=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i,COOKIE='views_partner_session';
function enabled(){return process.env.NODE_ENV==='test'&&process.env.VIEWS_LOCAL_REHEARSAL==='true'&&process.env.VIEWS_PARTNER_PILOT_ENABLED==='true';}
function cookie(res,token){res.setHeader('Set-Cookie',`${COOKIE}=${token||''}; HttpOnly; SameSite=Strict; Path=/partner-api; Max-Age=${token?3600:0}`);}
// Called only by disposable proof fixture setup; deliberately not exposed by handle().
exports.setPartnerFixtureCookie=(res,token)=>{if(!enabled()||!TOKEN.test(token))throw Error('PARTNER_FIXTURE_DENIED');cookie(res,token);};
function loopback(origin){const u=new URL(origin);if(u.origin!==origin||u.hostname!=='127.0.0.1'||u.protocol!=='http:'||!u.port)throw Error('PARTNER_LOOPBACK_REQUIRED');return u;}
function reply(res,status,body){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(body));}
exports.createPartnerGateway=({origin,coreOrigin,csrfKey})=>{
 const url=loopback(origin);loopback(coreOrigin);if(!TOKEN.test(csrfKey))throw Error('PARTNER_GATEWAY_KEY_REQUIRED');let active=0;
 const csrf=token=>createHmac('sha256',csrfKey).update('partner-csrf:v1:'+token).digest('hex');
 async function upstream(path,token,body,key){const response=await fetch(coreOrigin+'/v1/partner-assignments'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-views-partner-session':token,...key?{'Idempotency-Key':key}:{}},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)});let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>131072)throw Error();chunks.push(chunk);}return {status:response.status,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))};}
 return async(req,res)=>{
  if(!req.url?.startsWith('/partner-api'))return false;
  if(!enabled()){reply(res,404,{error:'PARTNER_PILOT_DISABLED'});return true;}
  const forbidden=Object.keys(req.headers).some(k=>k==='authorization'||/^x-(organization|user|membership|property|actor)-id$/.test(k)||/^x-views-(internal|service|staff|partner-session)/.test(k));
  if(!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||req.headers.host!==url.host||forbidden||req.headers['x-views-partner-pilot']!=='1'||req.headers.origin&&req.headers.origin!==origin||req.method!=='GET'&&req.headers.origin!==origin||req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site'])){reply(res,403,{error:'PARTNER_ORIGIN_REJECTED'});return true;}
  const route=new URL(req.url,origin),path=route.pathname.slice('/partner-api'.length),keys=[...route.searchParams.keys()];
  const list=path==='/assignments'&&req.method==='GET'&&keys.every(k=>k==='after')&&route.searchParams.getAll('after').length<=1&&(!route.searchParams.has('after')||UUID.test(route.searchParams.get('after')));
  const session=path==='/session'&&req.method==='GET'&&!route.search;
  const decision=/^\/assignments\/([a-f0-9-]{36})\/decisions$/i.exec(path);
  if(route.pathname+route.search!==req.url||!(list||session||decision&&UUID.test(decision[1])&&req.method==='POST'&&!route.search)){reply(res,404,{error:'PARTNER_ROUTE_NOT_FOUND'});return true;}
  const values=(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(COOKIE+'='));const token=values.length===1?values[0].slice(COOKIE.length+1):'';
  if(!TOKEN.test(token)){reply(res,session?200:401,session?{authenticated:false}:{error:'PARTNER_SESSION_REQUIRED'});return true;}
  if(active>=12){reply(res,503,{error:'PARTNER_CORE_UNAVAILABLE'});return true;}
  active++;try{
   let body,key;
   if(decision){const supplied=req.headers['x-csrf-token'],expected=csrf(token);if(typeof supplied!=='string'||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))){reply(res,403,{error:'CSRF_REQUIRED'});return true;}
    key=req.headers['idempotency-key'];if(typeof key!=='string'||!UUID.test(key)||req.headers['content-type']!=='application/json'||req.headers['content-encoding']){reply(res,400,{error:'PARTNER_INPUT_INVALID'});return true;}
    let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096){reply(res,413,{error:'PARTNER_INPUT_INVALID'});return true;}chunks.push(chunk);}try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{reply(res,400,{error:'PARTNER_INPUT_INVALID'});return true;}
   }
   const result=await upstream(session?'/session':list?route.search:'/'+decision[1]+'/decisions',token,body,key);
   if(result.status===401){cookie(res,'');if(session){reply(res,200,{authenticated:false});return true;}}
   if(result.status!==200){reply(res,[400,401,403,404,409,429].includes(result.status)?result.status:502,{error:/^PARTNER_[A-Z_]+$/.test(result.body?.message||'')?result.body.message:'PARTNER_CORE_UNAVAILABLE'});return true;}
   if(session){const b=result.body;if(!UUID.test(b.principalId)||!UUID.test(b.grantId)||b.synthetic!==true||!Number.isFinite(Date.parse(b.expiresAt)))throw Error();reply(res,200,{authenticated:true,sessionScope:JSON.stringify([b.principalId,b.grantId]),csrf:csrf(token),expiresAt:b.expiresAt,synthetic:true});}
   else reply(res,200,result.body);return true;
  }catch{reply(res,502,{error:'PARTNER_CORE_UNAVAILABLE'});return true;}finally{active--;}
 };
};
