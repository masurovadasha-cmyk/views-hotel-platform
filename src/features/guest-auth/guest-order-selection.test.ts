import {describe,it,expect} from 'vitest';
import {orderPage,mergeOrderPages} from './guest-order-list';
import {orderTargetRoute,selectOrder,type OrderTarget} from './guest-order-selection';
const id='00000000-0000-4000-8000-000000000003',cursor='00000000-0000-4000-8000-000000000002';
const reservation='00000000-0000-4000-8000-000000000001';
const row={intakeId:id,name:{en:'Synthetic'},stage:'requested',totalMinor:null,estimateMinor:'123',currency:'UZS'};
const target:OrderTarget={kind:'laundry',id,cursor};
describe('exact guest order selection',()=>{
 it('retains each source page bookmark across independent pagination',()=>{
  const first=orderPage('laundry',{items:[{...row,intakeId:cursor}],nextCursor:cursor});
  const second=orderPage('laundry',{items:[row],nextCursor:null},cursor);
  expect(mergeOrderPages(first,second).items.map(r=>[r.id,r.cursor])).toEqual([[cursor,null],[id,cursor]]);
 });
 it('requests only the selected source, scoped to its stay and source cursor',()=>{
  expect(orderTargetRoute(reservation,target)).toBe('services/laundry?reservationId='+reservation+'&cursor='+cursor);
  expect(orderTargetRoute(reservation,{...target,cursor:null})).toBe('services/laundry?reservationId='+reservation);
 });
 it('selects the exact ID rather than the first item',()=>{
  const raw={items:[{...row,intakeId:cursor},row],nextCursor:null};
  expect(selectOrder(raw,{...target,cursor:null}).raw).toBe(row);
  expect(selectOrder(raw,target).summary.id).toBe(id);
 });
 it('never falls back to another order when the selected one is absent',()=>{
  expect(()=>selectOrder({items:[{...row,intakeId:cursor}],nextCursor:null},target)).toThrow('ORDER_NOT_ON_PAGE');
 });
 it.each([{id:'../other'},{cursor:'invalid'},{cursor:id},{kind:'admin'},{id:cursor}])('rejects an invalid bookmark %j',fields=>{
  expect(()=>orderTargetRoute(reservation,{...target,...fields} as OrderTarget)).toThrow('INVALID_ORDER_TARGET');
 });
 it('rejects unscoped reads and duplicate response IDs',()=>{
  expect(()=>orderTargetRoute('',target)).toThrow();
  expect(()=>selectOrder({items:[row,row],nextCursor:null},target)).toThrow();
 });
});
