import {createRequire} from 'node:module';
import {afterEach,describe,it,expect,vi} from 'vitest';
const require=createRequire(import.meta.url),guest=require('../apps/api/ops/guest-service-gateway.cjs'),staff=require('../apps/api/ops/service-order-gateway.cjs');
const id='12345678-1234-4123-8123-123456789012';
afterEach(()=>vi.unstubAllEnvs());
describe('laundry browser boundary',()=>{
 it('forwards only authenticated CSRF-protected laundry mutations',async()=>{
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');
  const calls=[],upstream=vi.fn(async()=>({status:200,body:{intakeId:id,orderId:null,revision:1,idempotentReplay:false,items:null}}));
  const ctx={route:'services/laundry',req:{method:'POST',headers:{}},res:{},token:'synthetic',csrf:()=> 'csrf',reply:(_r,s,b)=>calls.push({s,b}),upstream,jsonBody:async()=>({declaredCount:1})};
  await guest.handle(ctx);expect(calls.pop().s).toBe(403);expect(upstream).not.toHaveBeenCalled();
  ctx.req.headers={'x-views-guest-csrf':'csrf','idempotency-key':id};await guest.handle(ctx);expect(calls.pop().b.intakeId).toBe(id);
  ctx.route=`services/laundry/${id}/actions`;await guest.handle(ctx);expect(upstream).toHaveBeenLastCalledWith(ctx.route,{declaredCount:1},'synthetic',id);
  ctx.token='';await guest.handle(ctx);expect(calls.pop().s).toBe(401);
 });
 it('allows only reservation/cursor reads and strips nested internal fields',async()=>{
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');
  const calls=[],ctx={route:'services/laundry?reservationId='+id+'&propertyId='+id,req:{method:'GET'},res:{},token:'test',reply:(_r,s)=>calls.push(s),upstream:()=>{throw Error('MUST_NOT_FORWARD');}};
  await guest.handle(ctx);expect(calls.pop()).toBe(400);
  const row={intakeId:id,revision:2,idempotentReplay:false,items:[{tag:'001',description:'Shirt',priceMinor:'9007199254740993',internalCost:'hidden'}],organizationId:id,unitCode:'private'};
  expect(guest.projection(row)).toEqual({intakeId:id,revision:2,idempotentReplay:false,items:[{tag:'001',description:'Shirt',priceMinor:'9007199254740993'}]});
  expect(guest.projection({items:[row],nextCursor:null}).items[0].items).toHaveLength(1);
 });
 it('denies housekeeping and injected staff scope; retains fixed property',async()=>{
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');
  const ctx={u:new URL('http://local/local-api/service-orders/laundry'),req:{method:'GET'},res:{},identity:{permissions:['housekeeping.work'],propertyIds:[id]},propertyId:id,token:'staff',fail:(_s,c)=>{throw Error(c);},json:vi.fn(),core:vi.fn(async()=>({items:[]}))};
  await expect(staff.handle(ctx)).rejects.toThrow('STAFF_PERMISSION_DENIED');expect(ctx.core).not.toHaveBeenCalled();
  ctx.identity.permissions=['reservation.manage'];await staff.handle(ctx);expect(ctx.core.mock.calls[0][0]).toBe('/v1/service-orders/laundry?propertyId='+id);
  expect(staff.validSearch(new URL('http://local/local-api/service-orders/laundry?cursor='+id),'GET')).toBe(true);
  expect(staff.validSearch(new URL('http://local/local-api/service-orders/laundry?propertyId='+id),'GET')).toBe(false);
 });
});

it('bounds claim history and excludes internal evidence and actor identities',()=>{
 const history=[{action:'report_claim',at:'2026-10-12T00:00:00Z',note:'Missing item',tag:'001',kind:'missing',actorUserId:id}],claim={status:'open',tag:'001',kind:'missing',history,internalNote:'private'};
 const result=guest.projection({intakeId:id,revision:2,idempotentReplay:false,claim});
 expect(result.claim.internalNote).toBeUndefined();expect(result.claim.history[0].actorUserId).toBeUndefined();
 expect(()=>guest.projection({intakeId:id,revision:2,idempotentReplay:false,claim:{...claim,history:Array(10).fill(history[0])}})).toThrow('INVALID_RESPONSE');
});
