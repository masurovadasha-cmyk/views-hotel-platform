import {createRequire} from 'node:module';
import {afterEach,describe,it,expect,vi} from 'vitest';
const require=createRequire(import.meta.url),guest=require('../apps/api/ops/guest-service-gateway.cjs'),staff=require('../apps/api/ops/service-order-gateway.cjs');
const id='12345678-1234-4123-8123-123456789012';
afterEach(()=>vi.unstubAllEnvs());
describe('concierge cookie boundary',()=>{
 it('requires explicit pilot, session and CSRF before accepting a request',async()=>{
  const calls=[],ctx={route:'services/concierge',req:{method:'POST',headers:{}},res:{},token:'synthetic',csrf:()=> 'csrf',reply:(_r,s)=>calls.push(s),upstream:()=>{throw Error('MUST_NOT_FORWARD');}};
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','false');await guest.handle(ctx);expect(calls.pop()).toBe(404);
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');await guest.handle(ctx);expect(calls.pop()).toBe(403);
  ctx.req.method='GET';ctx.route='services/concierge?reservationId='+id+'&propertyId='+id;await guest.handle(ctx);expect(calls.pop()).toBe(400);
 });
 it('keeps membership and internal identity out of the guest projection',()=>{
  const p=guest.projection({orderId:id,revision:1,idempotentReplay:false,assigned_membership_id:id,messages:[{id,author:'staff',text:'Answer',createdAt:'2026-10-12',actorId:id}]});
  expect(p.assigned_membership_id).toBeUndefined();expect(p.messages[0].actorId).toBeUndefined();
  expect(()=>guest.projection({orderId:id,revision:1,idempotentReplay:false,messages:Array(101).fill({})})).toThrow('INVALID_RESPONSE');
 });
 it('accepts concierge or dispatcher scope, but denies warehouse and caller-selected property',async()=>{
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');
  const ctx={u:new URL('http://local/local-api/service-orders/concierge'),req:{method:'GET',headers:{}},res:{},identity:{permissions:['concierge.work'],propertyIds:[id]},propertyId:id,token:'staff',fail:(_s,c)=>{throw Error(c);},json:vi.fn(),core:vi.fn(async()=>({items:[]}))};
  await staff.handle(ctx);expect(ctx.core.mock.calls[0][0]).toBe('/v1/service-orders/concierge?propertyId='+id);
  ctx.identity.permissions=['stock.manage'];await expect(staff.handle(ctx)).rejects.toThrow('STAFF_PERMISSION_DENIED');
  ctx.identity.permissions=['reservation.manage'];ctx.identity.propertyIds=[];await expect(staff.handle(ctx)).rejects.toThrow('PROPERTY_FORBIDDEN');
  expect(staff.validSearch(new URL('http://local/local-api/service-orders/concierge?propertyId='+id),'GET')).toBe(false);
 });
});
