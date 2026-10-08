'use strict';
// Loopback-only BFF. Authentication is owned by Core/PostgreSQL, never a fixture actor.
const {randomUUID,createHash,createHmac,timingSafeEqual}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const TOKEN=/^[a-f0-9]{64}$/;const COOKIE='views_staff_session';
const ORIGINS=new Set(['http://127.0.0.1:4173','http://localhost:4173']);
class GatewayError extends Error{constructor(status,code){super(code);this.status=status;}}
const fail=(status,code)=>{throw new GatewayError(status,code);};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin, Sec-Fetch-Site'});res.end(JSON.stringify(value));}
function loadConfiguration(){
 if(process.platform!=='win32')return null;
 const root=path.join(process.env.LOCALAPPDATA||'','VIEWS-Staging','private'),file=path.join(root,'workspace.json');
 if(!fs.existsSync(file))return null;
 const fixture=JSON.parse(fs.readFileSync(file,'utf8')),secrets=JSON.parse(fs.readFileSync(path.join(root,'runtime.json'),'utf8'));
 if(fixture.scope!=='views-local-core-workspace'||secrets.scope!=='views-windows-local-rehearsal'||
 !UUID.test(fixture.organizationId||'')||!UUID.test(fixture.propertyId||'')||!Array.isArray(fixture.units)||!fixture.units.length||
 !fixture.units.every(u=>UUID.test(u.unitId||'')&&UUID.test(u.ratePlanId||''))||typeof secrets.internalSecret!=='string'||secrets.internalSecret.length<32)
 throw Error('LOCAL_WORKSPACE_CONFIGURATION_INVALID');
 return {fixture,internalKey:secrets.internalSecret};
}
function requireSameOrigin(req,write){
 const expected='http://'+req.headers.host;
 if(!ORIGINS.has(expected)||!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket.remoteAddress))fail(403,'LOCAL_ONLY');
 if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))fail(403,'CROSS_SITE_DENIED');
 if(req.headers.origin!==undefined&&req.headers.origin!==expected)fail(403,'ORIGIN_DENIED');
 if(write&&req.headers.origin!==expected)fail(403,'ORIGIN_REQUIRED');
 if(req.headers['x-views-local-workspace']!=='1')fail(403,'LOCAL_HEADER_REQUIRED');
 if(Object.keys(req.headers).some(k=>/^(?:x-views-(?:internal|service|staff)|x-(?:organization|user|membership)-id)/.test(k)))fail(403,'ACTOR_OVERRIDE_DENIED');
}
function same(a,b){return typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function exactKeys(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k)))fail(400,'INVALID_REQUEST');}
function date(v){if(typeof v!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(v))fail(400,'INVALID_DATES');const n=Date.parse(v+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==v)fail(400,'INVALID_DATES');return n;}
function validateStay(input,fixture){
 exactKeys(input,['unitId','ratePlanId','checkIn','checkOut','guests']);const unit=fixture.units.find(u=>u.unitId===input.unitId&&u.ratePlanId===input.ratePlanId);
 if(!unit)fail(403,'UNIT_OUTSIDE_WORKSPACE');
 const start=date(input.checkIn),end=date(input.checkOut),today=Date.parse(new Date(Date.now()+5*3600000).toISOString().slice(0,10)+'T00:00:00Z');
 if(start<today||start>today+366*86400000||end<=start||end-start>30*86400000)fail(400,'INVALID_DATES');
 if(!Number.isInteger(input.guests)||input.guests<1||input.guests>unit.maxGuests)fail(400,'INVALID_GUEST_COUNT');
 return {propertyId:fixture.propertyId,unitId:unit.unitId,ratePlanId:unit.ratePlanId,checkInAt:input.checkIn+'T14:00:00+05:00',
 checkOutAt:input.checkOut+'T12:00:00+05:00',guests:Array.from({length:input.guests},()=>({age:18,residency:'resident'}))};
}
async function readJson(req,limit=4096){
 if(req.headers['content-type']!=='application/json'||req.headers['content-encoding'])fail(415,'JSON_REQUIRED');
 let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>limit)fail(413,'BODY_TOO_LARGE');parts.push(part);}
 try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail(400,'INVALID_JSON');}
}
function tokenFrom(req){const parts=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
 const token=parts.length===1?parts[0].slice(COOKIE.length+1):'';return TOKEN.test(token)?token:null;}
function cookie(res,token){res.setHeader('Set-Cookie',COOKIE+'='+(token||'')+'; HttpOnly; SameSite=Strict; Path=/local-api; Max-Age='+(token?'28800':'0'));}
function createLocalGateway({configuration,fetchImpl=globalThis.fetch}={}){
 const config=configuration===undefined?loadConfiguration():configuration;
 const contexts=new Map();let active=0;
 const csrf=token=>createHmac('sha256',config.internalKey).update('staff-csrf:'+token).digest('hex');
 const hash=token=>createHash('sha256').update(token).digest('hex');
 async function core(route,method='GET',body,key,token,identity){
  if(++active>12){active--;fail(429,'WORKSPACE_BUSY');}
  try{
   const headers={'accept':'application/json','content-type':'application/json','x-views-service-id':'local-workspace',
    'x-views-internal-key':config.internalKey,'x-request-id':randomUUID()};
   if(token)headers['x-views-staff-session']=token;
   if(identity){headers['x-organization-id']=identity.organizationId;headers['x-user-id']=identity.userId;headers['x-membership-id']=identity.membershipId;}
   if(key)headers['idempotency-key']=key;
   const response=await fetchImpl('http://127.0.0.1:3001'+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(12000)});
   let bytes=0;const chunks=[];for await(const chunk of response.body){bytes+=chunk.length;if(bytes>262144)fail(502,'CORE_RESPONSE_INVALID');chunks.push(chunk);}
   let value;try{value=JSON.parse(Buffer.concat(chunks).toString());}catch{fail(502,'CORE_RESPONSE_INVALID');}
   if(!response.ok){const safe=typeof value.message==='string'&&/^[A-Z][A-Z0-9_]{0,95}$/.test(value.message)?value.message:'CORE_REQUEST_DENIED';fail(response.status>=500?502:response.status,safe);}
   return value;
  }catch(e){if(e instanceof GatewayError)throw e;fail(502,'CORE_UNAVAILABLE');}finally{active--;}
 }
 async function authenticate(token){
  if(!token)fail(401,'STAFF_SESSION_REQUIRED');
  const identity=await core('/v1/staff-auth/session','GET',undefined,undefined,token);
  if(identity.organizationId!==config.fixture.organizationId||!UUID.test(identity.userId||'')||!UUID.test(identity.membershipId||'')||!Array.isArray(identity.permissions)||!Array.isArray(identity.propertyIds))fail(403,'STAFF_SCOPE_DENIED');
  return identity;
 }
 return async function handle(req,res){
  if(!req.url?.startsWith('/local-api'))return false;
  try{
   if(!config)fail(503,'LOCAL_WORKSPACE_NOT_PREPARED');requireSameOrigin(req,req.method!=='GET');
   const u=new URL(req.url,'http://127.0.0.1:4173');
   const calendarRoute=/^\/local-api\/owner-inventory\/[a-f0-9-]{36}\/calendar$/i.test(u.pathname);
   const ratesRoute=/^\/local-api\/owner-inventory\/[a-f0-9-]{36}\/rates(?:\/[a-f0-9-]{36})?$/i.test(u.pathname);
   const rateDetail=ratesRoute&&!u.pathname.endsWith('/rates');
   const catalogSearch=u.pathname==='/local-api/inventory-search'&&req.method==='GET'&&[...u.searchParams.keys()].every(k=>['from','to','guests','city','cursor'].includes(k)&&u.searchParams.getAll(k).length===1);
   const refundSearch=u.pathname==='/local-api/refund-reconciliation'&&req.method==='GET'&&[...u.searchParams.keys()].every(k=>['status','cursor'].includes(k)&&u.searchParams.getAll(k).length===1);
   const validSearch=refundSearch||catalogSearch||((calendarRoute||rateDetail)?req.method==='GET'&&[...u.searchParams.keys()].every(k=>k==='from'||k==='to')&&u.searchParams.getAll('from').length===1&&u.searchParams.getAll('to').length===1:u.pathname==='/local-api/reception'&&[...u.searchParams.keys()].every(k=>k==='day')&&u.searchParams.getAll('day').length===1);
   if(u.pathname+u.search!==req.url||u.hash||(u.search&&!validSearch))fail(400,'INVALID_ROUTE');
   const route=u.pathname,token=tokenFrom(req);
   if(req.method==='GET'&&route==='/local-api/session'){
    if(!token){json(res,200,{authenticated:false});return true;}
    try{const identity=await authenticate(token);json(res,200,{authenticated:true,identity,csrf:csrf(token),realPayments:false});}
    catch(e){if(e.status!==401)throw e;contexts.delete(hash(token));cookie(res,null);json(res,200,{authenticated:false});}return true;
   }
   if(req.method==='POST'&&['/local-api/login','/local-api/activate','/local-api/reset'].includes(route)){
    const body=await readJson(req),isLogin=route.endsWith('/login');exactKeys(body,isLogin?['email','password']:['token','password']);
    const result=await core('/v1/staff-auth/'+route.split('/').pop(),'POST',body);
    if(isLogin){if(!TOKEN.test(result.token||'')||result.identity?.organizationId!==config.fixture.organizationId)fail(502,'CORE_RESPONSE_INVALID');
      if(token)await core('/v1/staff-auth/logout','POST',{all:false},undefined,token).catch(()=>{});
      cookie(res,result.token);json(res,200,{authenticated:true,identity:result.identity,csrf:csrf(result.token),realPayments:false});
    }else{cookie(res,null);json(res,200,{ok:true,loginRequired:true});}return true;
   }
   const identity=await authenticate(token);
   if(!same(req.headers['x-csrf-token'],csrf(token)))fail(403,'CSRF_REQUIRED');
   if(req.method==='POST'&&['/local-api/passkey/state','/local-api/passkey/options','/local-api/passkey/verify','/local-api/passkey/recovery-codes','/local-api/passkey/replace/options'].includes(route)){
    const body=await readJson(req,16384);
    const result=await core('/v1/staff-auth/'+route.slice('/local-api/'.length),'POST',body,undefined,token);
    if(result.loginRequired===true){contexts.delete(hash(token));cookie(res,null);}
    json(res,200,result);return true;
   }
   if(req.method==='POST'&&['/local-api/logout','/local-api/password'].includes(route)){
    const body=await readJson(req);exactKeys(body,route.endsWith('logout')?['all']:['currentPassword','password']);
    const result=await core('/v1/staff-auth/'+route.split('/').pop(),'POST',body,undefined,token);
    contexts.delete(hash(token));cookie(res,null);json(res,200,result);return true;
   }
   const digest=hash(token);for(const [key,c] of contexts)if(c.expires<=Date.now())contexts.delete(key);
   let s=contexts.get(digest);if(!s){if(contexts.size>=32)fail(429,'SESSION_LIMIT');s={quotes:new Map(),reservations:new Set(),window:Date.now(),requests:0,expires:Date.parse(identity.expiresAt)};contexts.set(digest,s);}
   if(Date.now()-s.window>60000){s.window=Date.now();s.requests=0;}if(++s.requests>120)fail(429,'RATE_LIMIT');
   if(route==='/local-api/owner-inventory'||/^\/local-api\/owner-inventory\/[a-f0-9-]{36}(?:\/(?:calendar|rates(?:\/[a-f0-9-]{36})?))?$/i.test(route)){
    if(process.env[ratesRoute?'VIEWS_OWNER_RATES_ENABLED':calendarRoute?'VIEWS_OWNER_CALENDAR_ENABLED':'VIEWS_OWNER_INVENTORY_DRAFT_ENABLED']!=='true')fail(404,ratesRoute?'OWNER_RATES_DISABLED':calendarRoute?'OWNER_CALENDAR_DISABLED':'OWNER_INVENTORY_DISABLED');
    if(!['owner','manager'].includes(identity.role)||!identity.permissions.includes('property.manage'))fail(403,'OWNER_INVENTORY_FORBIDDEN');
    if(req.method==='GET'){json(res,200,await core(route.replace('/local-api/','/v1/')+u.search,'GET',undefined,undefined,token,identity));return true;}
    if(req.method!=='POST'||(ratesRoute&&!rateDetail))fail(405,'METHOD_DENIED');
    const key=req.headers['idempotency-key'];if(typeof key!=='string'||!UUID.test(key))fail(400,'IDEMPOTENCY_KEY_REQUIRED');
    json(res,200,await core(route.replace('/local-api/','/v1/'),'POST',await readJson(req,32768),key,token,identity));return true;
   }
   if(route==='/local-api/inventory-search'){
    if(req.method!=='GET')fail(405,'METHOD_DENIED');
    if(!identity.permissions.includes('reservation.read'))fail(403,'STAFF_PERMISSION_DENIED');
    json(res,200,await core('/v1/inventory-search'+u.search,'GET',undefined,undefined,token,identity));return true;
   }
   if(!identity.propertyIds.includes(config.fixture.propertyId))fail(403,'PROPERTY_FORBIDDEN');
   if(route==='/local-api/refund-reconciliation'||/^\/local-api\/refund-reconciliation\/[a-f0-9-]{36}(?:\/reviews)?$/i.test(route)){
    const review=route.endsWith('/reviews');
    if(req.method!==(review?'POST':'GET'))fail(405,'METHOD_DENIED');
    if(!identity.permissions.includes(review?'finance.manage':'finance.read'))fail(403,'STAFF_PERMISSION_DENIED');
    let query='';
    if(route==='/local-api/refund-reconciliation'){const params=new URLSearchParams(u.search);params.set('propertyId',config.fixture.propertyId);query='?'+params.toString();}
    if(!review){json(res,200,await core(route.replace('/local-api/','/v1/')+query,'GET',undefined,undefined,token,identity));return true;}
    const key=req.headers['idempotency-key'];if(typeof key!=='string'||!UUID.test(key))fail(400,'IDEMPOTENCY_KEY_REQUIRED');
    const body=await readJson(req);exactKeys(body,['expectedRevision','action','caseReference']);
    json(res,200,await core(route.replace('/local-api/','/v1/'),'POST',body,key,token,identity));return true;
   }
   if(route==='/local-api/housekeeping'){
    if(process.env.VIEWS_HOUSEKEEPING_PILOT_ENABLED!=='true')fail(404,'HOUSEKEEPING_DISABLED');
    if(identity.role!=='housekeeper'||!identity.permissions.includes('housekeeping.work'))fail(403,'HOUSEKEEPING_FORBIDDEN');
    if(req.method==='GET'){json(res,200,await core('/v1/housekeeping?propertyId='+config.fixture.propertyId,'GET',undefined,undefined,token,identity));return true;}
    if(req.method!=='POST')fail(405,'METHOD_DENIED');
    const body=await readJson(req);exactKeys(body,['taskId','action']);
    if(!UUID.test(body.taskId||'')||!['claim','release','complete'].includes(body.action))fail(400,'INVALID_HOUSEKEEPING_REQUEST');
    const key=req.headers['idempotency-key'];if(typeof key!=='string'||!UUID.test(key))fail(400,'IDEMPOTENCY_KEY_REQUIRED');
    json(res,200,await core('/v1/housekeeping','POST',{...body,propertyId:config.fixture.propertyId},key,token,identity));return true;
   }
   if(req.method==='GET'&&route==='/local-api/reception'){
    const day=u.searchParams.get('day')||'today';if(day!=='today'&&!/^\d{4}-\d{2}-\d{2}$/.test(day))fail(400,'INVALID_RECEPTION_DAY');
    const value=await core('/v1/booking-workspace?propertyId='+config.fixture.propertyId+'&day='+encodeURIComponent(day),'GET',undefined,undefined,token,identity);
    if(value.property?.id!==config.fixture.propertyId||!value.arrivals||!value.departures||!value.staying)fail(502,'CORE_RESPONSE_INVALID');
    s.reservations=new Set([...s.reservations,...['arrivals','departures','staying','cleaning'].flatMap(k=>value[k].items.map(r=>r.reservationId))]);
    json(res,200,value);return true;
   }
   if(req.method==='GET'&&route==='/local-api/workspace'){
    const value=await core('/v1/booking-workspace?propertyId='+config.fixture.propertyId,'GET',undefined,undefined,token,identity);
    if(value.property?.id!==config.fixture.propertyId||!Array.isArray(value.reservations)||!Array.isArray(value.units))fail(502,'CORE_RESPONSE_INVALID');
    s.reservations=new Set([...s.reservations,...value.reservations.map(r=>r.reservationId)]);json(res,200,{...value,mode:'local-core',syntheticData:true,realPayments:false});return true;
   }
   if(req.method!=='POST')fail(405,'METHOD_DENIED');
   if(!['/local-api/quotes','/local-api/holds','/local-api/release','/local-api/check-in','/local-api/check-out','/local-api/guest','/local-api/document-view','/local-api/document-review','/local-api/cleaning-complete'].includes(route))fail(404,'ROUTE_NOT_ALLOWED');
   if(!identity.permissions.includes('reservation.manage'))fail(403,'STAFF_PERMISSION_DENIED');
   const body=await readJson(req);
   if(route==='/local-api/quotes'){
    for(const [id,time] of s.quotes)if(time<=Date.now())s.quotes.delete(id);if(s.quotes.size>=64)fail(429,'QUOTE_LIMIT');
    const value=await core('/v1/quotes','POST',validateStay(body,config.fixture),undefined,token,identity);
    if(!UUID.test(value.quoteId||'')||!Number.isFinite(Date.parse(value.expiresAt)))fail(502,'CORE_RESPONSE_INVALID');
    s.quotes.set(value.quoteId,Date.parse(value.expiresAt));json(res,200,value);return true;
   }
   const key=req.headers['idempotency-key'];if(typeof key!=='string'||!UUID.test(key))fail(400,'IDEMPOTENCY_KEY_REQUIRED');
   if(route==='/local-api/holds'){
    exactKeys(body,['quoteId']);if(!s.quotes.has(body.quoteId))fail(403,'QUOTE_OUTSIDE_SESSION');if(s.quotes.get(body.quoteId)<=Date.now())fail(409,'QUOTE_EXPIRED');
    const value=await core('/v1/bookings/holds','POST',{quoteId:body.quoteId,ttlSeconds:900},key,token,identity);
    if(!UUID.test(value.reservationId||''))fail(502,'CORE_RESPONSE_INVALID');s.reservations.add(value.reservationId);json(res,200,value);return true;
   }
   exactKeys(body,route==='/local-api/guest'?['reservationId','guest']:route==='/local-api/document-view'?['reservationId','documentId']:route==='/local-api/document-review'?['reservationId','documentId','decision','reviewToken']:['reservationId']);if(!UUID.test(body.reservationId||'')||!s.reservations.has(body.reservationId))fail(403,'RESERVATION_OUTSIDE_WORKSPACE');
   json(res,200,await core('/v1/bookings/'+body.reservationId+(route==='/local-api/release'?'/release':'/stay/'+route.split('/').pop()),'POST',route==='/local-api/guest'?body.guest:route==='/local-api/document-view'?{documentId:body.documentId}:route==='/local-api/document-review'?{documentId:body.documentId,decision:body.decision,reviewToken:body.reviewToken}:{},key,token,identity));return true;
  }catch(e){if(e.status===401&&e.message!=='STAFF_LOGIN_FAILED')cookie(res,null);if(!res.headersSent)json(res,e instanceof GatewayError?e.status:500,{error:e instanceof GatewayError?e.message:'LOCAL_GATEWAY_ERROR'});else res.end();return true;}
 };
}
module.exports={createLocalGateway,validateStay,requireSameOrigin};
