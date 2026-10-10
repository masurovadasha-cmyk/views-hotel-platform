import {describe,it,expect,vi,afterEach} from 'vitest';
import {Readable} from 'node:stream';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createGuestEmailGateway}=require('../apps/api/ops/guest-email-gateway.cjs'),project=require('../apps/api/ops/guest-cancellation-projection.cjs');
const id='10000000-0000-4000-8000-000000000001',key='10000000-0000-4000-8000-000000000002',token='vges_'+'a'.repeat(43),secret='b'.repeat(64);
const csrf=createHmac('sha256',Buffer.from(secret,'hex')).update('guest-csrf:v1:'+token).digest('hex');
const preview={reservationId:id,quoteId:key,currency:'UZS',totalMinor:'9007199254740993',netCollectedMinor:'9007199254740993',penaltyMinor:'10',refundMinor:'9007199254740983',refundBps:10000,policyTimezone:'Asia/Tashkent',checkInAt:'2037-01-01T12:00:00Z',expiresAt:'2036-12-31T12:00:00Z',refundStatus:'pending'};
const confirmed={reservationId:id,cancellationId:key,currency:'UZS',penaltyMinor:'10',refundMinor:'9007199254740983',status:'cancelled',refundStatus:'pending',idempotentReplay:false};
async function call({kind='confirm',method='POST',body={quoteId:key},headers={},reply=confirmed,status=200}={}){
 vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_GUEST_EMAIL_PILOT_ENABLED','true');
 const calls=[];vi.stubGlobal('fetch',async(url,init)=>{calls.push({url,init});return Response.json(reply,{status});});
 const handler=createGuestEmailGateway({origin:'http://127.0.0.1:4173',coreOrigin:'http://127.0.0.1:3001',csrfKey:secret});
 const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method=method;req.url='/guest-api/trips/'+id+'/cancellation/'+kind;req.socket={remoteAddress:'127.0.0.1'};
 req.headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173','content-type':'application/json','x-views-guest-pilot':'1','x-views-guest-csrf':csrf,'idempotency-key':key,cookie:'views_guest_email='+token,...headers};
 const result={};await handler(req,{setHeader:(k,v)=>{result[k]=v;},writeHead:s=>{result.status=s;},end:b=>{result.body=JSON.parse(b);}});return {...result,calls};
}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('guest cancellation boundary',()=>{
 it('requires cookie, csrf, exact body and command key before any mutation',async()=>{
  for(const args of [{headers:{cookie:''}},{headers:{'x-views-guest-csrf':'forged'}},{body:{quoteId:key,userId:id}},{headers:{'idempotency-key':'wrong'}},{headers:{'x-user-id':id}},{method:'GET'}]){
   const r=await call(args);expect([400,401,403,404]).toContain(r.status);expect(r.calls).toHaveLength(0);
  }
  const r=await call();expect(r.status).toBe(200);expect(r.body).toEqual(confirmed);expect(r.calls[0].init.headers).toEqual({'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':key});
 });
 it('protects preview with csrf and strips internal financial and identity fields',async()=>{
  expect((await call({kind:'preview',body:{},headers:{'x-views-guest-csrf':''}})).calls).toHaveLength(0);
  const r=await call({kind:'preview',body:{},reply:{...preview,userId:id,captureIds:['private'],policy:{private:true}}});expect(r.body).toEqual(preview);expect(r.calls[0].init.headers['Idempotency-Key']).toBeUndefined();
  expect(()=>project({...preview,refundMinor:9007199254740983},'preview')).toThrow('INVALID_RESPONSE');
 });
 it('preserves safe stale conflicts, hides arbitrary errors and clears invalid sessions',async()=>{
  expect((await call({status:409,reply:{message:'GUEST_CANCELLATION_QUOTE_STALE'}})).body).toEqual({error:'GUEST_CANCELLATION_QUOTE_STALE'});
  expect((await call({status:500,reply:{message:'private-provider-data'}})).body).toEqual({error:'GUEST_CORE_UNAVAILABLE'});
  const r=await call({status:401,reply:{message:'GUEST_EMAIL_SESSION_INVALID'}});expect(r.status).toBe(401);expect(r['Set-Cookie']).toContain('Max-Age=0');
 });
});
