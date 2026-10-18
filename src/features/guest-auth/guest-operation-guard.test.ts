import {describe,it,expect} from 'vitest';
import {createGuestOperationGuard} from './guest-operation-guard';

describe('guest operation ownership and deferred refresh',()=>{
 it('starts unblocked and never invents a deferred refresh',()=>{
  const guard=createGuestOperationGuard();guard.enter('guest:a');
  expect([guard.blocked(),guard.tripPending(),guard.linkPending(),guard.takeRefresh()]).toEqual([false,false,false,false]);
 });
 it('keeps trip and link pending independently until each source clears',()=>{
  const guard=createGuestOperationGuard();guard.enter('guest:a');
  expect(guard.report('guest:a','trip',true)).toBe(true);
  expect(guard.report('guest:a','link',true)).toBe(true);
  guard.report('guest:a','trip',false);
  expect([guard.blocked(),guard.tripPending(),guard.linkPending()]).toEqual([true,false,true]);
  guard.report('guest:a','link',false);expect(guard.blocked()).toBe(false);
 });
 it('ignores late callbacks from an old owner without unlocking the current command',()=>{
  const guard=createGuestOperationGuard();guard.enter('guest:a');guard.enter('guest:b');
  guard.report('guest:b','trip',true);
  expect(guard.report('guest:a','trip',false)).toBe(false);
  expect(guard.report('guest:a','link',true)).toBe(false);
  expect(guard.requestRefresh('guest:a')).toBe(false);
  expect([guard.blocked(),guard.tripPending(),guard.linkPending(),guard.takeRefresh()]).toEqual([true,true,false,false]);
 });
 it('retains commands and queued refresh when the same owner re-enters',()=>{
  const guard=createGuestOperationGuard();guard.enter('guest:a');
  guard.report('guest:a','trip',true);guard.requestRefresh('guest:a');guard.enter('guest:a');
  expect(guard.blocked()).toBe(true);expect(guard.takeRefresh()).toBe(false);
  guard.report('guest:a','trip',false);expect(guard.takeRefresh()).toBe(true);
 });
 it('coalesces link responses and refreshes only once after both operations settle',()=>{
  const guard=createGuestOperationGuard();guard.enter('guest:a');
  guard.report('guest:a','trip',true);guard.report('guest:a','link',true);
  expect(guard.requestRefresh('guest:a')).toBe(true);expect(guard.requestRefresh('guest:a')).toBe(false);
  expect(guard.takeRefresh()).toBe(false);guard.report('guest:a','link',false);
  expect(guard.takeRefresh()).toBe(false);guard.report('guest:a','trip',false);
  expect(guard.takeRefresh()).toBe(true);expect(guard.takeRefresh()).toBe(false);
 });
 it('clears former pending commands and queued refresh on account change or disconnect',()=>{
  for(const nextOwner of ['guest:b','']){
   const guard=createGuestOperationGuard();guard.enter('guest:a');
   guard.report('guest:a','trip',true);guard.report('guest:a','link',true);guard.requestRefresh('guest:a');
   guard.enter(nextOwner);
   expect([guard.blocked(),guard.tripPending(),guard.linkPending(),guard.takeRefresh()]).toEqual([false,false,false,false]);
   expect(guard.requestRefresh('guest:a')).toBe(false);
  }
 });
 it('reports only real pending-state changes for the current owner',()=>{
  const guard=createGuestOperationGuard();guard.enter('guest:a');
  for(const source of ['trip','link'] as const){
   expect(guard.report('guest:a',source,false)).toBe(false);
   expect(guard.report('guest:a',source,true)).toBe(true);expect(guard.report('guest:a',source,true)).toBe(false);
   expect(guard.report('guest:a',source,false)).toBe(true);expect(guard.report('guest:a',source,false)).toBe(false);
  }
 });
});
