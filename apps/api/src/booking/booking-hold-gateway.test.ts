import {describe,it,expect} from 'vitest';
import {createHmac,randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
const {createLocalGateway}=require('../../ops/local-core-gateway.cjs');
const org=randomUUID(),property=randomUUID(),member=randomUUID(),quoteId=randomUUID(),unitId=randomUUID(),ratePlanId=randomUUID();
const token='1'.repeat(64),secret='synthetic-hold-recovery-gateway-test-only';
const csrf=createHmac('sha256',secret).update('staff-csrf:'+token).digest('hex');
function fixture(){
 const calls:Array<{url:string;body:Record<string,unknown>;headers:Record<string,string>}>=[];
 let permissions=['reservation.manage'];
 const identity=()=>({organizationId:org,userId:member,membershipId:member,role:'front_desk',permissions,propertyIds:[property],expiresAt:new Date(Date.now()+3600000).toISOString()});
 const gateway=createLocalGateway({configuration:{fixture:{organizationId:org,propertyId:property,units:[{unitId,ratePlanId,maxGuests:2}]},internalKey:secret},fetchImpl:async(url:string,init:{body?:string;headers:Record<string,string>})=>{
  calls.push({url,body:JSON.parse(init.body||'{}'),headers:init.headers});
  return new Response(JSON.stringify(url.endsWith('/session')?identity():url.endsWith('/quotes')?{quoteId,expiresAt:new Date(Date.now()-1000).toISOString()}:{reservationId:randomUUID(),status:'cancelled',holdExpiresAt:null,activeHold:false,idempotentReplay:true}));
 }});
 async function call(route:string,body:unknown,headers:Record<string,string>={}){
  const req=Readable.from([Buffer.from(JSON.stringify(body))]) as Readable&Record<string,unknown>;req.method='POST';req.url='/local-api/'+route;req.socket={remoteAddress:'127.0.0.1'};req.headers={host:'127.0.0.1:4173','content-type':'application/json',origin:'http://127.0.0.1:4173','x-views-local-workspace':'1','x-csrf-token':csrf,cookie:'views_staff_session='+token,'idempotency-key':randomUUID(),...headers};
  const res={status:0,value:{} as Record<string,unknown>,setHeader(){},writeHead(status:number){this.status=status;},end(value:string){this.value=JSON.parse(value);}};await gateway(req,res);return res;
 }
 return {calls,call,revoke:()=>{permissions=[];}};
}
describe('hold recovery gateway restriction',()=>{
 it('forwards unknown quote only as property-bound recovery with the original key',async()=>{
  const f=fixture(),key=randomUUID(),r=await f.call('holds',{quoteId},{'idempotency-key':key});expect(r.status).toBe(200);expect(r.value).toMatchObject({status:'cancelled',activeHold:false,holdExpiresAt:null});
  expect(f.calls[1].body).toEqual({quoteId,ttlSeconds:900,propertyId:property,recoveryOnly:true});expect(f.calls[1].headers['idempotency-key']).toBe(key);
 });
 it('lets Core recover a known quote even when its calculation has expired',async()=>{
  const f=fixture(),day=(n:number)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
  expect((await f.call('quotes',{unitId,ratePlanId,checkIn:day(2),checkOut:day(3),guests:1})).status).toBe(200);
  expect((await f.call('holds',{quoteId})).status).toBe(200);expect(f.calls.at(-1)?.body).toEqual({quoteId,ttlSeconds:900,propertyId:property});
 });
 it('forces explicit recovery even for a cached quote, preserving the key',async()=>{
  const f=fixture(),day=(n:number)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10),key=randomUUID();
  await f.call('quotes',{unitId,ratePlanId,checkIn:day(2),checkOut:day(3),guests:1});
  expect((await f.call('holds',{quoteId,recoveryOnly:true},{'idempotency-key':key})).status).toBe(200);
  expect(f.calls.at(-1)?.body).toEqual({quoteId,ttlSeconds:900,propertyId:property,recoveryOnly:true});expect(f.calls.at(-1)?.headers['idempotency-key']).toBe(key);
 });
 it('does not let the browser override recovery mode or property, and preserves current auth/CSRF',async()=>{
  for(const body of [{quoteId,recoveryOnly:false},{quoteId,propertyId:randomUUID()},{quoteId:'bad'}]){const f=fixture();expect((await f.call('holds',body)).status).toBe(400);expect(f.calls).toHaveLength(1);}
  const f=fixture();expect((await f.call('holds',{quoteId},{'x-csrf-token':''})).status).toBe(403);expect(f.calls).toHaveLength(1);
  f.revoke();expect((await f.call('holds',{quoteId})).status).toBe(403);expect(f.calls.every(c=>c.url.endsWith('/session'))).toBe(true);
 });
});
