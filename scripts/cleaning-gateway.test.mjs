import {createRequire} from 'node:module';
import {afterEach,describe,it,expect,vi} from 'vitest';
const require=createRequire(import.meta.url),guest=require('../apps/api/ops/guest-service-gateway.cjs'),staff=require('../apps/api/ops/service-order-gateway.cjs');
const id='12345678-1234-4123-8123-123456789012';
afterEach(()=>vi.unstubAllEnvs());
describe('cleaning browser gateway boundaries',()=>{
 it('keeps the guest route off by default and requires CSRF plus command key for writes',async()=>{
  const calls=[],ctx={route:'services/orders',req:{method:'POST',headers:{}},res:{},token:'synthetic',csrf:()=> 'expected',reply:(_r,status,b)=>calls.push({status,...b}),upstream:()=>{throw Error('MUST_NOT_FORWARD');}};
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','false');await guest.handle(ctx);expect(calls.pop().status).toBe(404);
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');await guest.handle(ctx);expect(calls.pop().status).toBe(403);
  ctx.req.headers['x-views-guest-csrf']='expected';await guest.handle(ctx);expect(calls.pop().status).toBe(400);
  ctx.route='services/orders?reservationId='+id+'&reservationId='+id;ctx.req.method='GET';await guest.handle(ctx);expect(calls.pop().status).toBe(400);
 });
 it('removes staff notes and identifiers from guest projections',()=>{
  const output=guest.projection({items:[{orderId:id,stage:'working',completionNote:'internal',assignedMembershipId:id,totalMinor:'9007199254740993'}],nextCursor:null});
  expect(output).toEqual({items:[{orderId:id,stage:'working',totalMinor:'9007199254740993'}],nextCursor:null});
 });
 it('rejects foreign property scope and unknown search keys before staff forwarding',async()=>{
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');
  expect(staff.validSearch(new URL('http://local/local-api/service-orders?propertyId='+id),'GET')).toBe(false);
  await expect(staff.handle({u:new URL('http://local/local-api/service-orders'),req:{method:'GET'},identity:{permissions:['reservation.manage'],propertyIds:[]},propertyId:id,fail:(_status,code)=>{throw Error(code);},core:()=>{throw Error('MUST_NOT_FORWARD');}})).rejects.toThrow('PROPERTY_FORBIDDEN');
 });
});
