import {describe,expect,it} from 'vitest';
import {createRequire} from 'node:module';
import {laundryReceiptAttempt,assertLaundryReceipt} from './guest-laundry-receipt';
import {retryable,type Attempt} from '../service-orders/model';
const {projection}=createRequire(import.meta.url)('../../../apps/api/ops/guest-service-gateway.cjs');
const id='00000000-0000-4000-8000-000000000038',key='00000000-0000-4000-8000-000000000039',orderId='00000000-0000-4000-8000-000000000040';
const total='9007199254741000',at='2026-10-18T10:15:00.123456+00:00';
const items=[{tag:'001',description:'White shirt',priceMinor:'9007199254740993'},{tag:'002',description:'Trousers',priceMinor:'7'}];
const receipt={intakeId:id,revision:9,stage:'closed',orderId,totalMinor:total,items,idempotentReplay:false,declaredCount:2,preferences:'No perfume',pickupAt:at,returnBy:at,currency:'UZS',claim:null};
const report={action:'report_claim',at,tag:'001',kind:'quality',note:'Please check this item'};
const resolved={status:'resolved',tag:'001',kind:'quality',history:[report,{action:'resolve_claim',at,note:''}]};
const attempt=()=>laundryReceiptAttempt(id,8,total,'UZS',key);
describe('laundry receipt confirmation contract',()=>{
 it('keeps the exact observed price outside the wire body and retains its reusable key',()=>{
  expect(attempt()).toEqual({route:`services/laundry/${id}/actions`,key,body:{action:'confirm_receipt',expectedRevision:8},receiptExpectation:{totalMinor:total,currency:'UZS'}});
  for(const currency of ['UZS','USD','EUR'])expect(laundryReceiptAttempt(id,8,'9223372036854775807',currency,key).receiptExpectation).toEqual({totalMinor:'9223372036854775807',currency});
 });
 it('snapshots observed scalar fields and accepts a cloned pending attempt',()=>{
  const observed={totalMinor:total,currency:'UZS'},pending=laundryReceiptAttempt(id,8,observed.totalMinor,observed.currency,key);
  observed.totalMinor='1';observed.currency='EUR';
  expect(pending.receiptExpectation).toEqual({totalMinor:total,currency:'UZS'});
  expect(()=>assertLaundryReceipt(receipt,structuredClone(pending))).not.toThrow();
 });
 it.each(['0','-1','1.2','01','1e3','9223372036854775808','',null,undefined,100,NaN])('rejects invalid money %j',money=>{
  expect(()=>laundryReceiptAttempt(id,8,money as string,'UZS',key)).toThrow('SERVICE_INPUT_INVALID');
 });
 it.each(['JPY','uzs','',null,undefined,123])('rejects invalid currency %j',currency=>expect(()=>laundryReceiptAttempt(id,8,total,currency as string,key)).toThrow('SERVICE_INPUT_INVALID'));
 it.each([['invalid',8,key],[id,0,key],[id,-1,key],[id,1.5,key],[id,Infinity,key],[id,NaN,key],[id,Number.MAX_SAFE_INTEGER+1,key],[id,'8',key],[id,8,'invalid']] as const)('rejects invalid command %j',(intake,revision,commandKey)=>{
  expect(()=>laundryReceiptAttempt(intake,revision as number,total,'UZS',commandKey)).toThrow('SERVICE_INPUT_INVALID');
 });
 it.each([false,true])('accepts a full closed receipt with absent or resolved claim, replay %s',idempotentReplay=>{
  for(const claim of [null,undefined,resolved])expect(()=>assertLaundryReceipt({...receipt,claim,idempotentReplay},attempt())).not.toThrow();
 });
 it('accepts the real gateway projection without an absent claim',()=>{
  const wire=projection({...receipt,idempotentReplay:true});expect(Object.hasOwn(wire,'claim')).toBe(false);
  expect(()=>assertLaundryReceipt(wire,attempt())).not.toThrow();
 });
 it.each([undefined,null,{}, {totalMinor:total}, {currency:'UZS'}, {totalMinor:total,currency:'EUR'}])('keeps missing or malformed consent expectations uncertain %j',receiptExpectation=>{
  expect(()=>assertLaundryReceipt(receipt,{...attempt(),receiptExpectation} as Attempt)).toThrow('INVALID_RESPONSE');
 });
 it('rejects a receipt for a different pending action',()=>expect(()=>assertLaundryReceipt(receipt,{...attempt(),body:{action:'accept',expectedRevision:8}})).toThrow('INVALID_RESPONSE'));
 it.each([null,[],{},...[
  {intakeId:key},{stage:'delivered'},{revision:8},{revision:10},{revision:'9'},{idempotentReplay:'false'},{idempotentReplay:undefined},
  {orderId:null},{orderId:'invalid'},{orderId:undefined},{totalMinor:Number(total)},{totalMinor:null},{totalMinor:'09007199254741000'},
  {totalMinor:'9007199254741001',items:[items[0],{...items[1],priceMinor:'8'}]},{currency:'EUR'},{currency:'JPY'},
  {totalMinor:'9223372036854775808',items:[{...items[0],priceMinor:'9223372036854775808'}]},
  {returnBy:null},{returnBy:'2026-02-30T10:00:00Z'},{items:null},{items:[]},{items:[items[0],items[0]]},
  {items:[{...items[0],priceMinor:'9007199254740992'},items[1]]},{items:[{...items[0],description:''},items[1]]},
  {declaredCount:0},{pickupAt:'not-a-time'},{claim:{}},{claim:false},{claim:0},{claim:''},
  {claim:{...resolved,status:'open',history:[report]}},{claim:{...resolved,status:'answered',history:[report,{action:'answer_claim',at,note:'Checking the item'}]}},
  {claim:{...resolved,history:[]}},{claim:{...resolved,tag:'OTHER'}},
 ].map(patch=>({...receipt,...patch}))])('keeps invalid or mismatched receipts uncertain %j',raw=>{
  expect(()=>assertLaundryReceipt(raw,attempt())).toThrow('INVALID_RESPONSE');expect(retryable('INVALID_RESPONSE')).toBe(true);
 });
});
