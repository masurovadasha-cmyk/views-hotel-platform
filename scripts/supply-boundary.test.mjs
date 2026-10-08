import {describe,it,expect,vi,afterEach} from 'vitest';
import {Readable} from 'node:stream';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createLocalGateway}=require('../apps/api/ops/local-core-gateway.cjs');
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',id='10000000-0000-4000-8000-000000000003',key='10000000-0000-4000-8000-000000000004';
const token='a'.repeat(64),secret='b'.repeat(64),csrf=createHmac('sha256',secret).update('staff-csrf:'+token).digest('hex');
async function call({route='/supply/orders',method='POST',body={propertyId:property,reference:'Synthetic purchase',lines:[{itemId:id,quantity:'12'}]},headers={},permissions=['supply.read','purchase.manage']}={}){
 const calls=[],fetchImpl=async(url,init)=>{calls.push({url,init});return Response.json(url.endsWith('/v1/staff-auth/session')?{organizationId:org,userId:org,membershipId:key,permissions,propertyIds:[property]}:{ok:true});};
 const handler=createLocalGateway({configuration:{internalKey:secret,fixture:{organizationId:org,propertyId:id}},fetchImpl});
 const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.url='/local-api'+route;req.method=method;req.socket={remoteAddress:'127.0.0.1'};
 req.headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173','x-views-local-workspace':'1','content-type':'application/json','x-csrf-token':csrf,'idempotency-key':key,cookie:'views_staff_session='+token,...headers};
 const r={};await handler(req,{writeHead:s=>{r.status=s;},end:b=>{r.body=JSON.parse(b);},setHeader:()=>{}});return {...r,calls:calls.filter(c=>!c.url.endsWith('/staff-auth/session'))};
}
afterEach(()=>vi.unstubAllEnvs());
describe('separate purchase and stock gateway permissions',()=>{
 it('permits purchaser order creation but refuses receipts and direct stock movement',async()=>{
  vi.stubEnv('VIEWS_SUPPLY_PILOT_ENABLED','true');const good=await call();expect(good.status).toBe(200);expect(good.calls[0].init.headers['idempotency-key']).toBe(key);
  for(const route of ['/supply/orders/'+id+'/receive','/supply/stock/issue']){const r=await call({route});expect(r.status).toBe(403);expect(r.calls).toHaveLength(0);}
 });
 it('permits exact warehouse receipt, denies purchase creation and actor or csrf spoofing',async()=>{
  vi.stubEnv('VIEWS_SUPPLY_PILOT_ENABLED','true');const permissions=['supply.read','stock.manage'],route='/supply/orders/'+id+'/receive';
  expect((await call({route,permissions,body:{}})).status).toBe(200);
  for(const args of [{permissions},{route,permissions,body:{userId:id}},{headers:{'x-csrf-token':'wrong'}},{headers:{'x-organization-id':org}},{headers:{'idempotency-key':'wrong'}}]){const r=await call(args);expect([400,403]).toContain(r.status);expect(r.calls).toHaveLength(0);}
 });
 it('bounds property and query access, preserves exact quantities, and disables the pilot by default',async()=>{
  vi.stubEnv('VIEWS_SUPPLY_PILOT_ENABLED','true');
  expect((await call({route:'/supply/stock?propertyId='+property,method:'GET'})).status).toBe(200);
  for(const route of ['/supply/stock?propertyId='+id,'/supply/properties?organizationId='+org,'/supply/items?propertyId='+property+'&propertyId='+property]){const r=await call({route,method:'GET'});expect([400,403]).toContain(r.status);expect(r.calls).toHaveLength(0);}
  const r=await call({route:'/supply/stock/issue',permissions:['stock.manage'],body:{propertyId:property,itemId:id,quantity:'9007199254740993',reference:'Synthetic'}});expect(r.status).toBe(200);expect(JSON.parse(r.calls[0].init.body).quantity).toBe('9007199254740993');
  vi.stubEnv('VIEWS_SUPPLY_PILOT_ENABLED','false');expect((await call()).status).toBe(404);
 });
});
