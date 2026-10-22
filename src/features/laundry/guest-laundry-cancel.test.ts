import {describe,expect,it} from 'vitest';
import {laundryCancelAttempt,assertLaundryCancelReceipt} from './guest-laundry-cancel';
import {retryable} from '../service-orders/model';
const id='00000000-0000-4000-8000-000000000034',key='00000000-0000-4000-8000-000000000035';
const receipt={intakeId:id,revision:4,stage:'cancelled',orderId:null,totalMinor:null,items:null,idempotentReplay:false};
describe('exact laundry cancellation contract',()=>{
 it('binds cancellation to the intake, observed revision and reusable key',()=>{
  expect(laundryCancelAttempt(id,3,key)).toEqual({route:`services/laundry/${id}/actions`,key,body:{action:'cancel',expectedRevision:3}});
 });
 it.each([['invalid',3,key],[id,0,key],[id,-1,key],[id,1.5,key],[id,Infinity,key],[id,NaN,key],[id,Number.MAX_SAFE_INTEGER+1,key],[id,3,'invalid']] as const)('rejects invalid command %j',(intake,revision,commandKey)=>{
  expect(()=>laundryCancelAttempt(intake,revision,commandKey)).toThrow('SERVICE_INPUT_INVALID');
 });
 it.each([false,true])('accepts an exact unquoted cancellation including replay %s',idempotentReplay=>{
  expect(()=>assertLaundryCancelReceipt({...receipt,idempotentReplay},laundryCancelAttempt(id,3,key))).not.toThrow();
 });
 it.each([null,[],{}, {...receipt,intakeId:key},{...receipt,stage:'requested'},{...receipt,revision:3},{...receipt,revision:5},{...receipt,revision:'4'},{...receipt,idempotentReplay:'false'},{...receipt,idempotentReplay:undefined},{...receipt,orderId:key},{...receipt,orderId:undefined},{...receipt,totalMinor:'0'},{...receipt,totalMinor:undefined},{...receipt,items:[]},{...receipt,items:undefined}])('keeps malformed or mismatched cancellation uncertain %j',raw=>{
  expect(()=>assertLaundryCancelReceipt(raw,laundryCancelAttempt(id,3,key))).toThrow('INVALID_RESPONSE');
  expect(retryable('INVALID_RESPONSE')).toBe(true);
 });
});
