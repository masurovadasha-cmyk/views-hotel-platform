import {describe,expect,it} from 'vitest';
import {allocateCancellation} from './cancellation-allocation';
const capture=(captured:bigint,refunded=0n)=>({id:'capture',paymentIntentId:'intent',capturedMinor:captured,refundedMinor:refunded});
describe('policy cancellation allocation',()=>{
 it('retains penalty before refunding a partial prepayment',()=>{
  expect(allocateCancellation(100n,50n,[capture(30n)]).refundMinor).toBe(0n);
  expect(allocateCancellation(100n,50n,[capture(80n)]).refundMinor).toBe(30n);
 });
 it('caps actual funds after prior refunds and allocates exact bigint across captures',()=>{
  const r=allocateCancellation(100n,80n,[capture(40n,10n),{...capture(60n),id:'second'}]);
  expect(r.netCollectedMinor).toBe(90n);expect(r.refundMinor).toBe(70n);
  expect(r.limits.map(l=>l.refundLimitMinor)).toEqual([40n,40n]);
  expect(allocateCancellation(9007199254740993n,9007199254740992n,[capture(9007199254740993n)]).refundMinor).toBe(9007199254740992n);
 });
 it('refunds nothing when no money was collected',()=>expect(allocateCancellation(100n,100n,[]).refundMinor).toBe(0n));
 it('refuses inconsistent amounts or duplicated captures',()=>{
  expect(()=>allocateCancellation(100n,101n,[])).toThrow('INVALID_CANCELLATION_AMOUNTS');
  expect(()=>allocateCancellation(100n,100n,[capture(101n)])).toThrow('CANCELLATION_RECONCILIATION_REQUIRED');
  expect(()=>allocateCancellation(100n,100n,[capture(10n,11n)])).toThrow('CANCELLATION_RECONCILIATION_REQUIRED');
  expect(()=>allocateCancellation(100n,100n,[capture(10n),capture(10n)])).toThrow('CANCELLATION_RECONCILIATION_REQUIRED');
 });
});
