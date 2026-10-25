import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
const gateway=createRequire(import.meta.url)('../apps/api/ops/service-order-gateway.cjs');
const property='10000000-0000-4000-8000-000000000002',cursor='10000000-0000-4000-8000-000000000003';
const url=query=>new URL('http://127.0.0.1/local-api/service-orders/queue'+query);
async function request(query='',overrides={}){
 const prior=process.env.VIEWS_SERVICE_ORDER_PILOT_ENABLED;process.env.VIEWS_SERVICE_ORDER_PILOT_ENABLED='true';
 const calls=[];let result;
 try{await gateway.handle({u:url(query),req:{method:'GET'},res:{},identity:{permissions:['stock.manage'],propertyIds:[property]},token:'synthetic-token',propertyId:property,
  core:async(...args)=>{calls.push(args);return {sections:[]};},json:(_r,status,body)=>{result={status,body};},fail:(status,code)=>{throw Error(status+':'+code);},readJson:()=>{throw Error('NO_BODY_ALLOWED');},...overrides});return {calls,result};}
 finally{if(prior===undefined)delete process.env.VIEWS_SERVICE_ORDER_PILOT_ENABLED;else process.env.VIEWS_SERVICE_ORDER_PILOT_ENABLED=prior;}
}
describe('read-only operations queue gateway',()=>{
 it('forwards the authenticated actor and trusted property, never a client property',async()=>{
  const {calls,result}=await request('?kind=market&cursor='+cursor);expect(result.status).toBe(200);expect(calls).toHaveLength(1);
  const [route,method,body,key,token,identity]=calls[0];const target=new URL(route,'http://core');
  expect(target.pathname).toBe('/v1/service-orders/queue');expect(Object.fromEntries(target.searchParams)).toEqual({kind:'market',cursor,propertyId:property});
  expect([method,body,key,token]).toEqual(['GET',undefined,undefined,'synthetic-token']);expect(identity.permissions).toEqual(['stock.manage']);
 });
 it.each(['?propertyId='+property,'?cursor='+cursor,'?kind=unknown','?kind=market&kind=laundry','?kind=market&cursor=bad','?limit=999'])('rejects untrusted query %s',async query=>{
  expect(gateway.validSearch(url(query),'GET')).toBe(false);await expect(request(query)).rejects.toThrow('400:INVALID_QUERY');
 });
 it('denies writes, unauthorized roles and foreign properties before Core dispatch',async()=>{
  await expect(request('',{req:{method:'POST'}})).rejects.toThrow('405:METHOD_DENIED');
  await expect(request('',{identity:{permissions:['finance.read'],propertyIds:[property]}})).rejects.toThrow('403:STAFF_PERMISSION_DENIED');
  await expect(request('',{identity:{permissions:['stock.manage'],propertyIds:[]}})).rejects.toThrow('403:PROPERTY_FORBIDDEN');
 });
 it('accepts the bounded service kinds and no-query grouped read',()=>{
  expect(gateway.validSearch(url(''),'GET')).toBe(true);
  for(const kind of ['cleaning','laundry','market','concierge'])expect(gateway.validSearch(url('?kind='+kind),'GET')).toBe(true);
  expect(gateway.validSearch(url(''),'POST')).toBe(false);
 });
});
