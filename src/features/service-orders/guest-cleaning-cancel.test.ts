import {describe,expect,it} from 'vitest';
import {cleaningCancelAttempt,assertCleaningCancelReceipt} from './guest-cleaning-cancel';
import {retryable} from './model';
const id='00000000-0000-4000-8000-000000000028',key='00000000-0000-4000-8000-000000000029';
const receipt={orderId:id,revision:4,stage:'cancelled',status:'cancelled',idempotentReplay:false};
describe('exact cleaning cancellation contract',()=>{
 it('binds a command to its order, revision and reusable key',()=>{
  expect(cleaningCancelAttempt(id,3,key)).toEqual({route:`services/orders/${id}/actions`,key,body:{action:'cancel',expectedRevision:3}});
 });
 it.each([['invalid',3,key],[id,0,key],[id,-1,key],[id,1.5,key],[id,Infinity,key],[id,Number.MAX_SAFE_INTEGER+1,key],[id,3,'invalid']] as const)('rejects invalid command %j',(order,revision,commandKey)=>expect(()=>cleaningCancelAttempt(order,revision,commandKey)).toThrow());
 it.each([false,true])('accepts verified cancellation including replay %s',idempotentReplay=>{
  expect(()=>assertCleaningCancelReceipt({...receipt,idempotentReplay},cleaningCancelAttempt(id,3,key))).not.toThrow();
 });
 it.each([null,[],{}, {...receipt,orderId:key},{...receipt,stage:'requested'},{...receipt,status:'pending'},{...receipt,revision:3},{...receipt,revision:5},{...receipt,revision:'4'},{...receipt,idempotentReplay:'false'},{...receipt,idempotentReplay:undefined}])('keeps malformed or mismatched receipt uncertain %j',raw=>{
  expect(()=>assertCleaningCancelReceipt(raw,cleaningCancelAttempt(id,3,key))).toThrow('INVALID_RESPONSE');expect(retryable('INVALID_RESPONSE')).toBe(true);
 });
});
