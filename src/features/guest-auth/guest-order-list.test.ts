import {describe,it,expect} from 'vitest';
import {orderPage,mergeOrderPages,type OrderKind} from './guest-order-list';
const id='00000000-0000-4000-8000-000000000001',next='00000000-0000-4000-8000-000000000002';
const row={orderId:id,intakeId:id,name:{en:'Synthetic order'},category:'help',stage:'requested',totalMinor:'9007199254740993',estimateMinor:'12345',currency:'UZS'};
const project=(kind:OrderKind,fields={})=>orderPage(kind,{items:[{...row,...fields}],nextCursor:null}).items[0];
describe('guest order summary contract',()=>{
 it('preserves exact historical amounts without implying payment or subtracting credits',()=>{
  expect(project('market',{stage:'completed',creditedMinor:'10'}).money).toEqual({minor:row.totalMinor,currency:'UZS',label:'Original order amount'});
  expect(project('cleaning',{stage:'cancelled'}).money?.minor).toBe(row.totalMinor);
 });
 it('distinguishes a laundry estimate from a quote awaiting consent',()=>{
  expect(project('laundry',{totalMinor:null}).money).toEqual({minor:'12345',currency:'UZS',label:'Estimate'});
  expect(project('laundry',{stage:'quoted'}).money?.label).toBe('Quoted amount');
 });
 it('never turns a concierge budget or conversation into a charge or summary',()=>{
  const card=project('concierge',{budgetMinor:'999999',messages:[{text:'Private message'}]});
  expect(card.money).toBeNull();expect(JSON.stringify(card)).not.toMatch(/999999|Private message/);
 });
 it.each([['cleaning','inspection'],['laundry','delivered'],['laundry','awaiting_return'],['market','handed_over'],['concierge','answered']] as const)('keeps %s %s active', (kind,stage)=>expect(project(kind,{stage}).group).toBe('active'));
 it.each([['cleaning','done'],['laundry','closed'],['market','completed'],['concierge','closed']] as const)('closes %s only at %s',(kind,stage)=>{
  expect(project(kind,{stage}).group).toBe('completed');expect(project(kind,{stage:'cancelled'}).group).toBe('cancelled');
 });
 it.each([{stage:'future_state'},{totalMinor:9007199254740992},{totalMinor:'-1'},{totalMinor:'9223372036854775808'},{currency:'JPY'},{name:[]},{orderId:'invalid'}])('rejects malformed summary %j',fields=>expect(()=>project('cleaning',fields)).toThrow());
 it('keeps independent pages, merges overlapping rows, and rejects a stalled cursor',()=>{
  const a=orderPage('cleaning',{items:[row],nextCursor:id});
  const b=orderPage('cleaning',{items:[{...row,stage:'done'},{...row,orderId:next}],nextCursor:null});
  expect(mergeOrderPages(a,b).items.map(v=>[v.id,v.stage])).toEqual([[id,'done'],[next,'requested']]);
  expect(()=>mergeOrderPages(a,a)).toThrow();
  expect(()=>mergeOrderPages({...a,nextCursor:next},a)).toThrow();
  expect(()=>orderPage('cleaning',{items:[],nextCursor:id})).toThrow();
  expect(()=>orderPage('cleaning',{items:[row,row],nextCursor:null})).toThrow();
 });
});
