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
 it('requests the selected ID in its own direction and stay, independent of pagination',()=>{
  const route='services/details/laundry/'+id+'?reservationId='+reservation;
  for(const bookmark of [cursor,null,'invalid',id,'ffffffff-ffff-4fff-8fff-ffffffffffff'])
   expect(orderTargetRoute(reservation,{...target,cursor:bookmark})).toBe(route);
 });
 it('accepts only the exact single order, ignoring its old source cursor',()=>{
  const raw={items:[row],nextCursor:null};
  expect(selectOrder(raw,{...target,cursor:'stale'}).raw).toBe(row);
  expect(selectOrder(raw,target).summary.id).toBe(id);
 });
 it.each([
  {items:[],nextCursor:null},
  {items:[{...row,intakeId:cursor}],nextCursor:null},
  {items:[{...row,intakeId:cursor},row],nextCursor:null},
  {items:[row],nextCursor:id},
  {items:[row,row],nextCursor:null},
  {items:[{orderId:id,stage:'reserved',totalMinor:'123',currency:'UZS'}],nextCursor:null},
 ])('rejects missing, mismatched, multiple, paginated or wrong-kind detail: %j',raw=>{
  expect(()=>selectOrder(raw,target)).toThrow();
 });
 it.each([{id:'../other'},{kind:'admin'},{id:''}])('rejects an invalid target %j',fields=>{
  expect(()=>orderTargetRoute(reservation,{...target,...fields} as OrderTarget)).toThrow('INVALID_ORDER_TARGET');
 });
 it('rejects unscoped reads',()=>{
  expect(()=>orderTargetRoute('',target)).toThrow('INVALID_ORDER_TARGET');
 });
});
