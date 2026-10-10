'use strict';
// Disposable/local pilot only. Public deployment needs a separate HTTPS boundary.
const {createHmac,timingSafeEqual}=require('node:crypto');
const TOKEN=/^vges_[A-Za-z0-9_-]{43}$/;
const COOKIE='views_guest_email';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERRORS=new Set(['INVALID_GUEST_EMAIL_REQUEST','GUEST_EMAIL_LINK_INVALID','GUEST_EMAIL_SESSION_INVALID',
 'EMAIL_RESEND_COOLDOWN','RATE_LIMITED','GUEST_EMAIL_DELIVERY_UNCERTAIN','GUEST_EMAIL_CHALLENGE_INACTIVE',
 'GUEST_EMAIL_NOT_CONNECTED','GUEST_EMAIL_DISABLED','GUEST_EMAIL_KEY_REQUIRED','GUEST_TRIPS_DISABLED','GUEST_TRIP_NOT_FOUND','INVALID_GUEST_TRIP_CURSOR','INVALID_GUEST_TRIP_QUERY','GUEST_LINK_DISABLED','GUEST_LINK_INVALID','GUEST_LINK_INPUT_INVALID','GUEST_CANCELLATION_DISABLED','GUEST_CANCELLATION_INPUT_INVALID','GUEST_CANCELLATION_QUOTE_STALE','GUEST_CANCELLATION_NOT_AVAILABLE','GUEST_CANCELLATION_RECONCILIATION_REQUIRED','GUEST_CANCELLATION_COMMAND_CONFLICT']);
function loopbackOrigin(value){
 const u=new URL(value);
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.origin!==value)throw Error('GUEST_GATEWAY_LOOPBACK_ONLY');
 return u;
}
function reply(res,status,body){
 res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
 res.end(JSON.stringify(body));
}
function cookie(res,token){res.setHeader('Set-Cookie',`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/guest-api; Max-Age=${token?604800:0}`);}
function sessionToken(req){
 const values=(req.headers.cookie||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(COOKIE+'='));
 if(values.length!==1)return null;
 const value=values[0].slice(COOKIE.length+1);return TOKEN.test(value)?value:null;
}
function profile(b){
 return b&&UUID.test(b.userId)&&typeof b.email==='string'&&b.email.length<=254&&['ru','uz','en'].includes(b.locale)
  &&b.role==='guest'&&typeof b.expiresAt==='string'&&Number.isFinite(Date.parse(b.expiresAt));
}
async function jsonBody(req){
 if(req.headers['content-type']!=='application/json'||req.headers['content-encoding'])throw Error('INVALID_BODY');
 let text='';for await(const part of req){text+=part.toString('utf8');if(Buffer.byteLength(text)>4096)throw Error('INVALID_BODY');}
 const value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_BODY');return value;
}
function exact(value,keys){return Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));}
exports.createGuestEmailGateway=function({origin,coreOrigin,csrfKey}){
 const browser=loopbackOrigin(origin);loopbackOrigin(coreOrigin);
 if(!/^[a-f0-9]{64}$/.test(csrfKey))throw Error('GUEST_GATEWAY_KEY_REQUIRED');
 const csrf=token=>createHmac('sha256',Buffer.from(csrfKey,'hex')).update('guest-csrf:v1:'+token).digest('hex');
 let inFlight=0;
 async function upstream(route,body,token,key){
  const response=await fetch(coreOrigin+'/v1/guest-identity/email/'+route,{method:body===undefined?'GET':'POST',
   headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})},
   body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});
  let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.length;if(size>131072)throw Error('INVALID_RESPONSE');chunks.push(chunk);}
  return {status:response.status,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))};
 }
 function failed(res,result){
  const code=(ERRORS.has(result.body?.message)||/^SERVICE_[A-Z_]+$/.test(result.body?.message||''))?result.body.message:'GUEST_CORE_UNAVAILABLE';
  const retry=result.body?.retryAfterSeconds;
  reply(res,[400,401,403,404,409,429,503].includes(result.status)?result.status:502,
   {error:code,...(Number.isInteger(retry)&&retry>0&&retry<=3600?{retryAfterSeconds:retry}:{})});
 }
 return async function handle(req,res){
  if(!req.url?.startsWith('/guest-api'))return false;
  if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_GUEST_EMAIL_PILOT_ENABLED!=='true'){
   reply(res,404,{error:'GUEST_EMAIL_DISABLED'});return true;
  }
  const local=['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const forbidden=Object.keys(req.headers).some(k=>k==='authorization'||/^x-(user|actor|organization|membership|property)-id$/.test(k)||k.startsWith('x-views-internal')||k.startsWith('x-views-staff')||k.startsWith('x-views-service'));
  if(!local||req.headers.host!==browser.host||forbidden||req.headers['x-views-guest-pilot']!=='1'
   ||(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))
   ||(req.headers.origin&&req.headers.origin!==origin)||(req.method!=='GET'&&req.headers.origin!==origin)){
   reply(res,403,{error:'GUEST_ORIGIN_REJECTED'});return true;
  }
  const route=req.url.slice('/guest-api/'.length);
  if(route.startsWith('services')){
   if(inFlight>=12){reply(res,503,{error:'GUEST_CORE_UNAVAILABLE'});return true;}
   inFlight++;try{return await require('./guest-service-gateway.cjs').handle({route,req,res,token:sessionToken(req),csrf,upstream,reply,failed,jsonBody});}
   catch{reply(res,502,{error:'GUEST_CORE_UNAVAILABLE'});return true;}finally{inFlight--;}
  }
  const linkRoute=['reservation-link/preview','reservation-link/accept'].includes(route);
  const cancellation=/^trips\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/cancellation\/(preview|confirm)$/i.exec(route);
  const tripRoute=/^trips(?:\?cursor=[A-Za-z0-9_-]{1,300}|\/[a-fA-F0-9-]{36})?$/.test(route);
  if((!tripRoute&&!linkRoute&&!cancellation&&!['session','request','exchange','logout'].includes(route))||req.method!==((tripRoute||route==='session')?'GET':'POST')){
   reply(res,404,{error:'GUEST_ROUTE_NOT_FOUND'});return true;
  }
  if(inFlight>=12){reply(res,503,{error:'GUEST_CORE_UNAVAILABLE'});return true;}
  inFlight++;
  try{
   const token=sessionToken(req);
   if(tripRoute){
    if(!token){reply(res,401,{error:'GUEST_EMAIL_SESSION_INVALID'});return true;}
    const result=await upstream(route,undefined,token);
    if(result.status===401)cookie(res,'');
    if(result.status!==200){failed(res,result);return true;}
    reply(res,200,require('./guest-trips-projection.cjs')(result.body));return true;
   }
   if(route==='session'){
    if(!token){cookie(res,'');reply(res,200,{authenticated:false});return true;}
    const result=await upstream('session',undefined,token);
    if(result.status===401){cookie(res,'');reply(res,200,{authenticated:false});return true;}
    if(result.status!==200){failed(res,result);return true;}
    if(!profile(result.body))throw Error('INVALID_RESPONSE');
    const {userId,email,locale,expiresAt,role}=result.body;
    reply(res,200,{authenticated:true,profile:{userId,email,locale,expiresAt,role},csrf:csrf(token)});return true;
   }
   let body;try{body=await jsonBody(req);}catch{reply(res,400,{error:'INVALID_GUEST_EMAIL_REQUEST'});return true;}
   const keys=cancellation?(cancellation[1]==='confirm'?['quoteId']:[]):linkRoute?['token']:route==='request'?['email','locale']:route==='exchange'?['challengeId','token']:[];
   if(!exact(body,keys)){reply(res,400,{error:'INVALID_GUEST_EMAIL_REQUEST'});return true;}
   if(linkRoute||cancellation){
    if(!token){reply(res,401,{error:'GUEST_EMAIL_SESSION_INVALID'});return true;}
    const supplied=req.headers['x-views-guest-csrf'];
    if(typeof supplied!=='string'||!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied,'hex'),Buffer.from(csrf(token),'hex'))){reply(res,403,{error:'GUEST_CSRF_REJECTED'});return true;}
    const command=cancellation?.[1]==='confirm'?req.headers['idempotency-key']:undefined;
    if(cancellation?.[1]==='confirm'&&(typeof command!=='string'||!UUID.test(command))){reply(res,400,{error:'GUEST_CANCELLATION_INPUT_INVALID'});return true;}
    const result=await upstream(route,body,token,command);
    if(result.status===401)cookie(res,'');
    if(result.status!==200){failed(res,result);return true;}
    reply(res,200,(cancellation?require('./guest-cancellation-projection.cjs')(result.body,cancellation[1]):require('./guest-link-projection.cjs')(result.body)));return true;
   }
   if(route==='logout'){
    if(!token){cookie(res,'');reply(res,200,{ok:true});return true;}
    const supplied=req.headers['x-views-guest-csrf'];
    if(typeof supplied!=='string'||!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied,'hex'),Buffer.from(csrf(token),'hex'))){
     reply(res,403,{error:'GUEST_CSRF_REJECTED'});return true;
    }
    const result=await upstream('logout',{},token);
    if(result.status===401||(result.status===200&&result.body.ok===true)){cookie(res,'');reply(res,200,{ok:true});}
    else failed(res,result);
    return true;
   }
   // Never silently replace another account. Expired sessions are cleared by GET session.
   if(token){reply(res,409,{error:'GUEST_SIGN_OUT_FIRST'});return true;}
   const result=await upstream(route,body);
   if(result.status!==200){failed(res,result);return true;}
   if(route==='exchange'){
    if(!TOKEN.test(result.body.token)||result.body.role!=='guest'||!UUID.test(result.body.userId))throw Error('INVALID_RESPONSE');
    cookie(res,result.body.token);reply(res,200,{ok:true});return true;
   }
   const b=result.body;
   if(!UUID.test(b.challengeId)||b.status!=='provider_accepted'||b.expiresInSeconds!==900||b.resendAfterSeconds!==60)throw Error('INVALID_RESPONSE');
   reply(res,200,{challengeId:b.challengeId,status:b.status,expiresInSeconds:900,resendAfterSeconds:60});
  }catch{reply(res,502,{error:'GUEST_CORE_UNAVAILABLE'});}
  finally{inFlight--;}
  return true;
 };
};
