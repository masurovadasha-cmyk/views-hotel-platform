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

describe('exact guest service detail boundary',()=>{
 const route=kind=>'services/details/'+kind+'/'+id+'?reservationId='+id;
 function context(path=route('cleaning')){
  vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');vi.stubEnv('VIEWS_MARKET_PILOT_ENABLED','true');
  return {route:path,req:{method:'GET',headers:{}},res:{},token:'synthetic',reply:vi.fn(),failed:vi.fn(),upstream:vi.fn(async()=>({status:200,body:{items:[{orderId:id,stage:'requested',revision:1,totalMinor:'9007199254740993',staffNote:'private',organizationId:id,messages:[{id,author:'staff',text:'Ready',createdAt:'2026-10-18',actorId:id}]}],nextCursor:null}}))};
 }
 it.each(['cleaning','laundry','market','concierge'])('forwards only the selected %s item and strips staff fields',async kind=>{
  const ctx=context(route(kind));await guest.handle(ctx);
  expect(ctx.upstream).toHaveBeenCalledOnce();expect(ctx.upstream).toHaveBeenCalledWith(route(kind),undefined,'synthetic',undefined);
  expect(ctx.reply.mock.calls[0][1]).toBe(200);const page=ctx.reply.mock.calls[0][2];expect(page.nextCursor).toBeNull();expect(page.items).toHaveLength(1);
  expect(page.items[0]).toEqual({orderId:id,stage:'requested',revision:1,totalMinor:'9007199254740993',messages:[{id,author:'staff',text:'Ready',createdAt:'2026-10-18'}]});
 });
 it.each(['','?reservationId=bad','?reservationId='+id+'&reservationId='+id,'?reservationId='+id+'&cursor='+id,'?reservationId='+id+'&propertyId='+id])('rejects invalid or excessive query %s before forwarding',async query=>{
  const ctx=context('services/details/cleaning/'+id+query);await guest.handle(ctx);expect(ctx.reply.mock.calls[0][1]).toBe(400);expect(ctx.upstream).not.toHaveBeenCalled();
 });
 it.each(['unknown/'+id,'cleaning/bad','cleaning/'+id+'/actions','cleaning/'+id+'/'])('rejects unrecognized detail path %s',async path=>{
  const ctx=context('services/details/'+path+'?reservationId='+id);await guest.handle(ctx);expect(ctx.reply.mock.calls[0][1]).toBe(400);expect(ctx.upstream).not.toHaveBeenCalled();
 });
 it('requires a session, GET and both pilot flags without forwarding',async()=>{
  for(const setup of [c=>{c.token=undefined;},c=>{c.req.method='POST';},()=>vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','false'),()=>vi.stubEnv('VIEWS_MARKET_PILOT_ENABLED','false')]){
   const ctx=context(route('market'));setup(ctx);await guest.handle(ctx);expect(ctx.reply.mock.calls[0][1]).toBe(ctx.token===undefined?401:ctx.req.method==='POST'?400:404);expect(ctx.upstream).not.toHaveBeenCalled();
  }
 });
 it('preserves upstream not-found without exposing the private response',async()=>{
  const ctx=context();ctx.upstream.mockResolvedValue({status:404,body:{error:'SERVICE_ORDER_NOT_FOUND',privateNote:'hidden'}});await guest.handle(ctx);expect(ctx.failed).toHaveBeenCalledOnce();expect(ctx.reply).not.toHaveBeenCalled();
 });
 it.each(['services/details/cleaning/../market/'+id,'services/details/cleaning/%2e%2e/market/'+id,'services/laundry/../market'])('keeps market disabled after normalization of %s',async path=>{
  const ctx=context(path+'?reservationId='+id);vi.stubEnv('VIEWS_MARKET_PILOT_ENABLED','false');await guest.handle(ctx);expect(ctx.reply).toHaveBeenCalledWith(ctx.res,404,{error:'SERVICE_MARKET_DISABLED'});expect(ctx.upstream).not.toHaveBeenCalled();
 });
});
