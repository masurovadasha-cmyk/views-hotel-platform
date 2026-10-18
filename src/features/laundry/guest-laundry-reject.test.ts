import {describe,expect,it} from 'vitest';
import {laundryRejectAttempt,assertLaundryRejectReceipt} from './guest-laundry-reject';
import {retryable} from '../service-orders/model';
import {createRequire} from 'node:module';
const {projection}=createRequire(import.meta.url)('../../../apps/api/ops/guest-service-gateway.cjs');
const id='00000000-0000-4000-8000-000000000036',key='00000000-0000-4000-8000-000000000037',at='2026-10-18T10:15:00.123456+00:00';
const items=[{tag:'001',description:'White shirt',priceMinor:'9007199254740993'},{tag:'002',description:'Trousers',priceMinor:'7'}];
const receipt={intakeId:id,revision:4,stage:'awaiting_return',orderId:null,totalMinor:'9007199254741000',items,idempotentReplay:false,declaredCount:2,preferences:'No perfume',pickupAt:at,returnBy:at,currency:'UZS',claim:null};
describe('laundry quote rejection contract',()=>{
 it('binds rejection to the observed intake revision and a reusable key without authorizing a charge',()=>{
  expect(laundryRejectAttempt(id,3,key)).toEqual({route:`services/laundry/${id}/actions`,key,body:{action:'reject',expectedRevision:3}});
 });
 it.each([['invalid',3,key],[id,0,key],[id,-1,key],[id,1.5,key],[id,Infinity,key],[id,NaN,key],[id,Number.MAX_SAFE_INTEGER+1,key],[id,'3',key],[id,3,'invalid']] as const)('rejects invalid command %j',(intake,revision,commandKey)=>{
  expect(()=>laundryRejectAttempt(intake,revision as number,commandKey)).toThrow('SERVICE_INPUT_INVALID');
 });
 it.each([false,true])('accepts the retained inventory and exact bigint total including replay %s',idempotentReplay=>{
  expect(()=>assertLaundryRejectReceipt({...receipt,idempotentReplay},laundryRejectAttempt(id,3,key))).not.toThrow();
 });
 it('accepts the real gateway projection that omits an absent claim',()=>{
  const wire=projection({...receipt,idempotentReplay:true});expect(Object.hasOwn(wire,'claim')).toBe(false);
  expect(()=>assertLaundryRejectReceipt(wire,laundryRejectAttempt(id,3,key))).not.toThrow();
 });
 it.each([null,[],{},...[
  {intakeId:key},{stage:'quoted'},{stage:'cancelled'},{stage:'accepted'},{revision:3},{revision:5},{revision:'4'},
  {idempotentReplay:'false'},{idempotentReplay:undefined},{orderId:key},{orderId:undefined},
  {totalMinor:'9007199254741001'},{totalMinor:9007199254741000},{totalMinor:null},{totalMinor:'09007199254741000'},
  {totalMinor:'9223372036854775808',items:[{...items[0],priceMinor:'9223372036854775808'}]},
  {currency:'JPY'},{returnBy:null},{returnBy:'2026-02-30T10:00:00Z'},{items:null},{items:null,totalMinor:null},{items:[]},
  {items:[items[0],items[0]]},{items:[{...items[0],priceMinor:'9007199254740992'},items[1]]},
  {items:[{...items[0],description:''},items[1]]},{declaredCount:0},{pickupAt:'not-a-time'},{claim:{}},{claim:false},{claim:0},{claim:''},
  {claim:{status:'open',tag:'001',kind:'quality',history:[{action:'report_claim',at,tag:'001',kind:'quality',note:'A valid but impossible claim'}]}},
 ].map(patch=>({...receipt,...patch}))])('keeps incomplete or mismatched receipts uncertain %j',raw=>{
  expect(()=>assertLaundryRejectReceipt(raw,laundryRejectAttempt(id,3,key))).toThrow('INVALID_RESPONSE');
  expect(retryable('INVALID_RESPONSE')).toBe(true);
 });
});
