import {describe,it,expect} from 'vitest';
import {definitiveHoldRejection,isActiveRecoveredHold,parseHoldAttempt,parseHoldReceipt,recoveryScopeKey,type RecoveryScope} from './booking-recovery';
const ids=Array.from({length:7},(_,i)=>`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const scope:RecoveryScope={organizationId:ids[0],userId:ids[1],membershipId:ids[2],propertyId:ids[3]};
const attempt={version:1,scope,quoteId:ids[4],key:ids[5]};
const receipt={reservationId:ids[6],confirmationCode:'HOLD-1',status:'hold',holdExpiresAt:'2026-10-23T12:15:00Z',activeHold:true,idempotentReplay:true};
describe('booking hold recovery boundary',()=>{
 it('preserves exactly the immutable quote and key without credentials or quote snapshots',()=>{
  expect(parseHoldAttempt(attempt,scope)).toEqual(attempt);
  for(const extra of [{csrf:'secret'},{quote:{totalMinor:'100'}},{token:'secret'}])expect(()=>parseHoldAttempt({...attempt,...extra},scope)).toThrow('BOOKING_RECOVERY_INVALID');
 });
 it.each(['organizationId','userId','membershipId','propertyId'] as const)('does not recover another %s scope',field=>{
  const other={...scope,[field]:ids[6]};expect(recoveryScopeKey(other)).not.toEqual(recoveryScopeKey(scope));
  expect(()=>parseHoldAttempt(attempt,other)).toThrow('BOOKING_RECOVERY_INVALID');
 });
 it('rejects unsupported versions and corrupt data without treating them as a fresh attempt',()=>{
  for(const value of [null,{},[],{...attempt,version:2},{...attempt,key:'broken'},{...attempt,scope:{...scope,token:'secret'}}])expect(()=>parseHoldAttempt(value,scope)).toThrow();
 });
 it('only releases an unknown attempt for a definitive conflict response, not revoked auth or a failed connection',()=>{
  expect(definitiveHoldRejection({message:'HOLD_NOT_CREATED',httpStatus:409})).toBe(true);
  for(const message of ['QUOTE_EXPIRED','UNIT_NOT_AVAILABLE','BOOKING_CONFLICT','BOOKING_PERIOD_CONFLICT'])expect(definitiveHoldRejection({message,httpStatus:409})).toBe(false);
  for(const e of [new Error('HOLD_NOT_CREATED'),{message:'HOLD_NOT_CREATED',httpStatus:503},{message:'PROPERTY_FORBIDDEN',httpStatus:403},{message:'STAFF_SESSION_REQUIRED',httpStatus:401},{message:'HOLD_RECOVERY_NOT_FOUND',httpStatus:409},{message:'IDEMPOTENCY_CONFLICT',httpStatus:409}])expect(definitiveHoldRejection(e)).toBe(false);
 });
 it('shows current expired or cancelled receipts instead of inventing an active hold',()=>{
  const r=parseHoldReceipt(receipt);expect(isActiveRecoveredHold(r,Date.parse('2026-10-23T12:00:00Z'))).toBe(true);
  expect(isActiveRecoveredHold(r,Date.parse(r.holdExpiresAt!))).toBe(false);
  const cancelled=parseHoldReceipt({...receipt,status:'cancelled',activeHold:false,holdExpiresAt:null});expect(isActiveRecoveredHold(cancelled,0)).toBe(false);
  const confirmed=parseHoldReceipt({...receipt,status:'confirmed',activeHold:false,holdExpiresAt:null});expect(isActiveRecoveredHold(confirmed,0)).toBe(false);
 });
 it('keeps malformed or contradictory responses uncertain',()=>{
  for(const bad of [{...receipt,activeHold:undefined},{...receipt,status:'invented'},{...receipt,holdExpiresAt:'bad'},{...receipt,status:'cancelled'},{...receipt,holdExpiresAt:null},{...receipt,reservationId:'bad'}])expect(()=>parseHoldReceipt(bad)).toThrow();
 });
});
