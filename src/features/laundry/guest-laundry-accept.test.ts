import {describe,expect,it} from 'vitest';
import {laundryAcceptAttempt,assertLaundryAcceptReceipt} from './guest-laundry-accept';
import {retryable} from '../service-orders/model';
const id='00000000-0000-4000-8000-000000000034',key='00000000-0000-4000-8000-000000000035',orderId='00000000-0000-4000-8000-000000000036';
const total='9007199254741000',at='2026-10-18T10:15:00.123456+00:00';
const items=[{tag:'001',description:'White shirt',priceMinor:'9007199254740993'},{tag:'002',description:'Trousers',priceMinor:'7'}];
const receipt={intakeId:id,revision:4,stage:'accepted',orderId,totalMinor:total,items,idempotentReplay:false,declaredCount:2,preferences:'No perfume',pickupAt:at,returnBy:at,currency:'UZS',claim:null};
describe('exact laundry quote acceptance contract',()=>{
 it('binds consent to the observed revision and exact bigint total with a reusable key',()=>{
  expect(laundryAcceptAttempt(id,3,total,key)).toEqual({route:`services/laundry/${id}/actions`,key,body:{action:'accept',expectedRevision:3,expectedTotalMinor:total}});
  expect(laundryAcceptAttempt(id,3,'9223372036854775807',key).body.expectedTotalMinor).toBe('9223372036854775807');
 });
 it.each(['0','-1','1.2','01','1e3','9223372036854775808','',null,undefined,100,NaN])('rejects invalid money %j',money=>{
  expect(()=>laundryAcceptAttempt(id,3,money as string,key)).toThrow('SERVICE_INPUT_INVALID');
 });
 it.each([['invalid',3,key],[id,0,key],[id,-1,key],[id,1.5,key],[id,Infinity,key],[id,NaN,key],[id,Number.MAX_SAFE_INTEGER+1,key],[id,'3',key],[id,3,'invalid']] as const)('rejects invalid identity, revision or key %j',(intake,revision,commandKey)=>{
  expect(()=>laundryAcceptAttempt(intake,revision as number,total,commandKey)).toThrow('SERVICE_INPUT_INVALID');
 });
 it.each([false,true])('accepts a validated inventory and exact receipt including replay %s',idempotentReplay=>{
  expect(()=>assertLaundryAcceptReceipt({...receipt,idempotentReplay},laundryAcceptAttempt(id,3,total,key))).not.toThrow();
 });
 it.each([null,[],{},...[
  {intakeId:key},{stage:'quoted'},{revision:3},{revision:5},{revision:'4'},{idempotentReplay:'false'},{idempotentReplay:undefined},
  {orderId:null},{orderId:'invalid'},{orderId:undefined},{totalMinor:'9007199254741001'},{totalMinor:Number(total)},{totalMinor:null},
  {totalMinor:'9007199254741001',items:[items[0],{...items[1],priceMinor:'8'}]},
  {currency:'JPY'},{returnBy:null},{returnBy:'2026-02-30T10:00:00Z'},{items:null},{items:[]},{items:[items[0],items[0]]},
  {items:[{...items[0],priceMinor:'9007199254740992'},items[1]]},{items:[{...items[0],description:''},items[1]]},
 ].map(patch=>({...receipt,...patch}))])('keeps malformed or mismatched receipts uncertain %j',raw=>{
  expect(()=>assertLaundryAcceptReceipt(raw,laundryAcceptAttempt(id,3,total,key))).toThrow('INVALID_RESPONSE');
  expect(retryable('INVALID_RESPONSE')).toBe(true);
 });
});
