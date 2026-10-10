import {describe,it,expect,vi,afterEach} from 'vitest';
import {Readable} from 'node:stream';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createLocalGateway}=require('../apps/api/ops/local-core-gateway.cjs');
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',id='10000000-0000-4000-8000-000000000003',key='10000000-0000-4000-8000-000000000004';
const token='a'.repeat(64),secret='b'.repeat(64),csrf=createHmac('sha256',secret).update('staff-csrf:'+token).digest('hex');
async function call({route='/folios/reservations/'+id+'/charges',method='POST',body={kind:'service',amountMinor:'9007199254740993',label:'Synthetic'},headers={},permissions=['reservation.read','reservation.manage','finance.read','finance.manage'],properties=[property]}={}){
 const calls=[],fetchImpl=async(url,init)=>{calls.push({url,init});return Response.json(url.endsWith('/v1/staff-auth/session')?{organizationId:org,userId:org,membershipId:key,permissions,propertyIds:properties}:{ok:true});};
 const handler=createLocalGateway({configuration:{internalKey:secret,fixture:{organizationId:org,propertyId:id}},fetchImpl});
 const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.url='/local-api'+route;req.method=method;
 req.headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173','x-views-local-workspace':'1','content-type':'application/json','x-csrf-token':csrf,'idempotency-key':key,cookie:'views_staff_session='+token,...headers};req.socket={remoteAddress:'127.0.0.1'};
 const result={};await handler(req,{writeHead:s=>{result.status=s;},end:b=>{result.body=JSON.parse(b);},setHeader:()=>{}});return {...result,calls:calls.filter(c=>!c.url.endsWith('/staff-auth/session'))};
}
afterEach(()=>vi.unstubAllEnvs());
describe('folio cookie gateway',()=>{
 it('requires existing reservation permission, csrf, exact bodies and command key',async()=>{
  vi.stubEnv('VIEWS_FOLIO_PILOT_ENABLED','true');
  for(const args of [{permissions:['reservation.read']},{permissions:['finance.manage']},{headers:{'x-csrf-token':'bad'}},{headers:{'idempotency-key':'bad'}},{body:{kind:'service',amountMinor:'1',label:'Synthetic',organizationId:org}},{headers:{'x-user-id':org}}]){
   const r=await call(args);expect([400,403]).toContain(r.status);expect(r.calls).toHaveLength(0);
  }
  const r=await call();expect(r.status).toBe(200);expect(r.calls[0].init.headers['idempotency-key']).toBe(key);expect(JSON.parse(r.calls[0].init.body).amountMinor).toBe('9007199254740993');
 });
 it('supports scoped property pagination without the old fixture-property restriction',async()=>{
  vi.stubEnv('VIEWS_FOLIO_PILOT_ENABLED','true');
  for(const route of ['/folios/properties?cursor=abc','/folios?propertyId='+property+'&cursor=abc','/folios/reservations/'+id+'?cursor=abc','/night-audit?propertyId='+property+'&businessDate=2026-10-01']){
   const r=await call({route,method:'GET',body:undefined});expect(r.status).toBe(200);expect(r.calls[0].url).toBe('http://127.0.0.1:3001/v1'+route);
  }
  for(const route of ['/folios?propertyId='+id,'/folios?propertyId='+property+'&propertyId='+property,'/folios/properties?organizationId='+org]){const r=await call({route,method:'GET'});expect([400,403]).toContain(r.status);expect(r.calls).toHaveLength(0);}
 });
 it('sends only explicit audit date/property/revision with a stable key and stays off by default',async()=>{
  vi.stubEnv('VIEWS_FOLIO_PILOT_ENABLED','true');
  const body={propertyId:property,businessDate:'2026-10-01',expectedRevision:'c'.repeat(64)};
  const r=await call({route:'/night-audit',body});expect(r.status).toBe(200);expect(JSON.parse(r.calls[0].init.body)).toEqual(body);
  expect((await call({route:'/night-audit',body:{...body,propertyId:id}})).status).toBe(403);
  expect((await call({route:'/night-audit',body:{propertyId:property,businessDate:'2026-10-01'}})).status).toBe(400);
  vi.stubEnv('VIEWS_FOLIO_PILOT_ENABLED','false');const off=await call();expect(off.status).toBe(404);expect(off.calls).toHaveLength(0);
 });
});
