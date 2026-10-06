'use strict';
// LOCAL FIXTURE ONLY. No general proxy, login bypass on public routes or DB access.
const {randomBytes,randomUUID,timingSafeEqual}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const COOKIE='views_local_workspace',ORIGINS=new Set(['http://127.0.0.1:4173','http://localhost:4173']);
class GatewayError extends Error{constructor(status,code){super(code);this.status=status;}}
const fail=(status,code)=>{throw new GatewayError(status,code);};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin, Sec-Fetch-Site'});res.end(JSON.stringify(value));}
function loadConfiguration(){
  if(process.platform!=='win32')return null;
  const root=path.join(process.env.LOCALAPPDATA||'','VIEWS-Staging','private');
  const fixtureFile=path.join(root,'workspace.json');if(!fs.existsSync(fixtureFile))return null;
  const fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));
  const secrets=JSON.parse(fs.readFileSync(path.join(root,'runtime.json'),'utf8'));
  if(fixture.scope!=='views-local-core-workspace'||secrets.scope!=='views-windows-local-rehearsal'||
     !['organizationId','userId','membershipId','propertyId'].every(k=>UUID.test(fixture[k]||''))||
     !Array.isArray(fixture.units)||fixture.units.length<1||fixture.units.length>20||
     !fixture.units.every(u=>UUID.test(u.unitId||'')&&UUID.test(u.ratePlanId||'')&&u.maxGuests>=1&&u.maxGuests<=10)||
     typeof secrets.internalSecret!=='string'||secrets.internalSecret.length<32)throw Error('LOCAL_WORKSPACE_CONFIGURATION_INVALID');
  return {fixture,internalKey:secrets.internalSecret};
}
function requireSameOrigin(req,write){
  const expected='http://'+req.headers.host;
  if(!ORIGINS.has(expected)||!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(req.socket.remoteAddress))fail(403,'LOCAL_ONLY');
  if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))fail(403,'CROSS_SITE_DENIED');
  if(req.headers.origin!==undefined&&req.headers.origin!==expected)fail(403,'ORIGIN_DENIED');
  if(write&&req.headers.origin!==expected)fail(403,'ORIGIN_REQUIRED');
  if(req.headers['x-views-local-workspace']!=='1')fail(403,'LOCAL_HEADER_REQUIRED');
  if(Object.keys(req.headers).some(k=>/^(?:x-views-(?:internal|service)|x-(?:organization|user|membership)-id)/.test(k)))fail(403,'ACTOR_OVERRIDE_DENIED');
}
function same(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function exactKeys(value,keys){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k)))fail(400,'INVALID_REQUEST');
}
function date(value){
  if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))fail(400,'INVALID_DATES');
  const v=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(v)||new Date(v).toISOString().slice(0,10)!==value)fail(400,'INVALID_DATES');return v;
}
function validateStay(input,fixture){
  exactKeys(input,['unitId','ratePlanId','checkIn','checkOut','guests']);
  const unit=fixture.units.find(u=>u.unitId===input.unitId&&u.ratePlanId===input.ratePlanId);
  if(!unit)fail(403,'UNIT_OUTSIDE_WORKSPACE');
  const start=date(input.checkIn),end=date(input.checkOut),today=Date.parse(new Date(Date.now()+5*3600000).toISOString().slice(0,10)+'T00:00:00Z');
  if(start<today||start>today+366*86400000||end<=start||end-start>30*86400000)fail(400,'INVALID_DATES');
  if(!Number.isInteger(input.guests)||input.guests<1||input.guests>unit.maxGuests)fail(400,'INVALID_GUEST_COUNT');
  return {propertyId:fixture.propertyId,unitId:unit.unitId,ratePlanId:unit.ratePlanId,
    checkInAt:input.checkIn+'T14:00:00+05:00',checkOutAt:input.checkOut+'T12:00:00+05:00',
    guests:Array.from({length:input.guests},()=>({age:18,residency:'resident'}))};
}
async function readJson(req){
  if(req.headers['content-type']!=='application/json'||req.headers['content-encoding'])fail(415,'JSON_REQUIRED');
  let bytes=0;const parts=[];
  for await(const part of req){bytes+=part.length;if(bytes>4096)fail(413,'BODY_TOO_LARGE');parts.push(part);}
  try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail(400,'INVALID_JSON');}
}
function createLocalGateway({configuration,fetchImpl=globalThis.fetch}={}){
  let config=configuration;
  if(config===undefined)config=loadConfiguration();
  const sessions=new Map();let active=0;
  function session(req){
    const matches=(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(COOKIE+'='));
    if(matches.length!==1)return null;
    const key=matches[0].slice(COOKIE.length+1),value=sessions.get(key);
    return value&&value.expires>Date.now()?value:null;
  }
  async function core(route,method='GET',body,idempotencyKey){
    if(++active>12){active--;fail(429,'WORKSPACE_BUSY');}
    try{
      const headers={'accept':'application/json','content-type':'application/json','x-views-service-id':'local-workspace',
        'x-views-internal-key':config.internalKey,'x-organization-id':config.fixture.organizationId,
        'x-user-id':config.fixture.userId,'x-membership-id':config.fixture.membershipId,'x-request-id':randomUUID()};
      if(idempotencyKey)headers['idempotency-key']=idempotencyKey;
      const response=await fetchImpl('http://127.0.0.1:3001'+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body),
        redirect:'error',signal:AbortSignal.timeout(12000)});
      let bytes=0;const chunks=[];
      for await(const chunk of response.body){bytes+=chunk.length;if(bytes>262144)fail(502,'CORE_RESPONSE_INVALID');chunks.push(chunk);}
      let value;try{value=JSON.parse(Buffer.concat(chunks).toString());}catch{fail(502,'CORE_RESPONSE_INVALID');}
      if(!response.ok){
        const safe=typeof value.message==='string'&&/^[A-Z][A-Z0-9_]{0,95}$/.test(value.message)?value.message:'CORE_REQUEST_DENIED';
        fail(response.status>=500?502:response.status,safe);
      }
      return value;
    }catch(e){if(e instanceof GatewayError)throw e;fail(502,'CORE_UNAVAILABLE');}
    finally{active--;}
  }
  return async function handle(req,res){
    if(!req.url?.startsWith('/local-api'))return false;
    try{
      if(!config)fail(503,'LOCAL_WORKSPACE_NOT_PREPARED');
      requireSameOrigin(req,req.method!=='GET');
      const u=new URL(req.url,'http://127.0.0.1:4173');
      if(u.search||u.hash||u.pathname!==req.url)fail(400,'INVALID_ROUTE');
      if(req.method==='GET'&&u.pathname==='/local-api/session'){
        for(const [id,s] of sessions)if(s.expires<=Date.now())sessions.delete(id);
        let s=session(req);
        if(!s){
          if(sessions.size>=32)fail(429,'SESSION_LIMIT');
          const id=randomBytes(32).toString('hex');s={csrf:randomBytes(32).toString('hex'),expires:Date.now()+1800000,quotes:new Map(),reservations:new Set(),window:Date.now(),requests:0};
          sessions.set(id,s);res.setHeader('Set-Cookie',COOKIE+'='+id+'; HttpOnly; SameSite=Strict; Path=/local-api; Max-Age=1800');
        }
        json(res,200,{mode:'local-core',identity:'synthetic-front-desk',csrf:s.csrf,expiresAt:new Date(s.expires).toISOString(),realPayments:false});return true;
      }
      const s=session(req);if(!s)fail(401,'LOCAL_SESSION_REQUIRED');
      if(!same(req.headers['x-csrf-token'],s.csrf))fail(403,'CSRF_REQUIRED');
      if(Date.now()-s.window>60000){s.window=Date.now();s.requests=0;}
      if(++s.requests>120)fail(429,'RATE_LIMIT');
      if(req.method==='GET'&&u.pathname==='/local-api/workspace'){
        const value=await core('/v1/booking-workspace?propertyId='+config.fixture.propertyId);
        if(value.property?.id!==config.fixture.propertyId||!Array.isArray(value.reservations)||!Array.isArray(value.units))fail(502,'CORE_RESPONSE_INVALID');
        s.reservations=new Set(value.reservations.map(r=>r.reservationId));
        json(res,200,{...value,mode:'local-core',syntheticData:true,realPayments:false});return true;
      }
      if(req.method!=='POST')fail(405,'METHOD_DENIED');
      if(!['/local-api/quotes','/local-api/holds','/local-api/release'].includes(u.pathname))fail(404,'ROUTE_NOT_ALLOWED');
      const body=await readJson(req);
      if(u.pathname==='/local-api/quotes'){
        for(const [id,time] of s.quotes)if(time<=Date.now())s.quotes.delete(id);
        if(s.quotes.size>=64)fail(429,'QUOTE_LIMIT');
        const value=await core('/v1/quotes','POST',validateStay(body,config.fixture));
        if(!UUID.test(value.quoteId||'')||!Number.isFinite(Date.parse(value.expiresAt)))fail(502,'CORE_RESPONSE_INVALID');
        s.quotes.set(value.quoteId,Date.parse(value.expiresAt));json(res,200,value);return true;
      }
      const key=req.headers['idempotency-key'];if(typeof key!=='string'||!UUID.test(key))fail(400,'IDEMPOTENCY_KEY_REQUIRED');
      if(u.pathname==='/local-api/holds'){
        exactKeys(body,['quoteId']);if(typeof body.quoteId!=='string'||!s.quotes.has(body.quoteId))fail(403,'QUOTE_OUTSIDE_SESSION');
        if(s.quotes.get(body.quoteId)<=Date.now())fail(409,'QUOTE_EXPIRED');
        const value=await core('/v1/bookings/holds','POST',{quoteId:body.quoteId,ttlSeconds:900},key);
        if(!UUID.test(value.reservationId||''))fail(502,'CORE_RESPONSE_INVALID');
        s.reservations.add(value.reservationId);json(res,200,value);return true;
      }
      exactKeys(body,['reservationId']);
      if(!UUID.test(body.reservationId||'')||!s.reservations.has(body.reservationId))fail(403,'RESERVATION_OUTSIDE_WORKSPACE');
      json(res,200,await core('/v1/bookings/'+body.reservationId+'/release','POST',{},key));return true;
    }catch(e){
      if(!res.headersSent)json(res,e instanceof GatewayError?e.status:500,{error:e instanceof GatewayError?e.message:'LOCAL_GATEWAY_ERROR'});
      else res.end();return true;
    }
  };
}
module.exports={createLocalGateway,validateStay,requireSameOrigin};
