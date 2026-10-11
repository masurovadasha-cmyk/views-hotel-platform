import {createRequire} from 'node:module';
import {afterEach,describe,it,expect,vi} from 'vitest';
const require=createRequire(import.meta.url),guest=require('../apps/api/ops/guest-service-gateway.cjs'),staff=require('../apps/api/ops/service-order-gateway.cjs');
const id='12345678-1234-4123-8123-123456789012';
afterEach(()=>vi.unstubAllEnvs());
describe('market cookie boundary',()=>{
 it('is opt-in and demands CSRF on mutations',async()=>{
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');vi.stubEnv('VIEWS_MARKET_PILOT_ENABLED','false');
  const calls=[],ctx={route:'services/market',req:{method:'POST',headers:{}},res:{},token:'synthetic',csrf:()=> 'csrf',reply:(_r,s)=>calls.push(s),upstream:()=>{throw Error('MUST_NOT_FORWARD');}};
  await guest.handle(ctx);expect(calls.pop()).toBe(404);vi.stubEnv('VIEWS_MARKET_PILOT_ENABLED','true');await guest.handle(ctx);expect(calls.pop()).toBe(403);
  ctx.route='services/market?reservationId='+id+'&propertyId='+id;ctx.req.method='GET';await guest.handle(ctx);expect(calls.pop()).toBe(400);
 });
 it('does not expose supply item identifiers and costs to guests',()=>{
  const body={orderId:id,revision:1,idempotentReplay:false,lines:[{serviceId:id,itemId:id,name:{en:'Water'},quantity:2,priceMinor:'1200000',costMinor:'4'}]};
  expect(guest.projection(body).lines).toEqual([{serviceId:id,name:{en:'Water'},quantity:2,priceMinor:'1200000'}]);
 });
 it('projects only guest-safe issue fields',()=>{
  expect(guest.projection({orderId:id,revision:2,idempotentReplay:false,issue:{status:'open',note:'Missing water',internalActorId:id}}).issue).toEqual({status:'open',note:'Missing water',answer:undefined});
 });
 it('strips internal proposal fields and allows only fixed-scope staff catalogues',()=>{
  const proposal={status:'pending',note:'Alternative',totalMinor:'100',expiresAt:'2026-10-11T10:00:00Z',internalActorId:id,lines:[{serviceId:id,itemId:id,name:{en:'Water'},quantity:1,priceMinor:'100',catalogRevision:4}]};
  const projected=guest.projection({orderId:id,revision:2,idempotentReplay:false,proposal}).proposal;
  expect(projected.internalActorId).toBeUndefined();expect(projected.lines[0]).toEqual({serviceId:id,name:{en:'Water'},quantity:1,priceMinor:'100'});
  expect(staff.validSearch(new URL('http://local/local-api/service-orders/market/catalog?cursor='+id),'GET')).toBe(true);
  expect(staff.validSearch(new URL('http://local/local-api/service-orders/market/catalog?propertyId='+id),'GET')).toBe(false);
 });
 it('separates accounting routes from stock permissions',async()=>{
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');vi.stubEnv('VIEWS_MARKET_PILOT_ENABLED','true');
  const ctx={u:new URL('http://local/local-api/service-orders/market/finance'),req:{method:'GET',headers:{}},res:{},identity:{permissions:['stock.manage'],propertyIds:[id]},propertyId:id,token:'staff',fail:(_s,c)=>{throw Error(c);},json:vi.fn(),core:vi.fn(async()=>({items:[]}))};
  await expect(staff.handle(ctx)).rejects.toThrow('STAFF_PERMISSION_DENIED');ctx.identity.permissions=['finance.read'];await staff.handle(ctx);expect(ctx.core.mock.calls[0][0]).toBe('/v1/service-orders/market/finance?propertyId='+id);
  ctx.u=new URL('http://local/local-api/service-orders/market/'+id+'/credits');ctx.req.method='POST';await expect(staff.handle(ctx)).rejects.toThrow('STAFF_PERMISSION_DENIED');
  expect(staff.validSearch(new URL('http://local/local-api/service-orders/market/finance?propertyId='+id),'GET')).toBe(false);
 });
 it('requires stock rights, fixed property scope and exact query parameters',async()=>{
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');vi.stubEnv('VIEWS_MARKET_PILOT_ENABLED','true');
  const ctx={u:new URL('http://local/local-api/service-orders/market'),req:{method:'GET'},res:{},identity:{permissions:['reservation.manage'],propertyIds:[id]},propertyId:id,token:'staff',fail:(_s,c)=>{throw Error(c);},json:vi.fn(),core:vi.fn(async()=>({items:[]}))};
  await expect(staff.handle(ctx)).rejects.toThrow('STAFF_PERMISSION_DENIED');ctx.identity.permissions=['stock.manage'];await staff.handle(ctx);expect(ctx.core.mock.calls[0][0]).toBe('/v1/service-orders/market?propertyId='+id);
  expect(staff.validSearch(new URL('http://local/local-api/service-orders/market?propertyId='+id),'GET')).toBe(false);
 });
});
