import {describe,it,expect,vi} from 'vitest';
import {commitDemoMarket,subscribeDemoMarket,readDemoMarket} from './demo-market-store';
import {emptyDemoMarket,reduceDemoMarket as act,parseDemoMarket} from './demo-market';
import {demoMarketAccess} from '../staff/demo-market-policy';
function fixture(){let s=act(emptyDemoMarket(),{type:'quantity',id:'sample-water',quantity:4});s=act(s,{type:'prepare'});return act(s,{type:'confirm',id:s.pending!.id});}
describe('shared same-tab demo market',()=>{
 it('notifies mounted consumers only after successful persisted writes; unsubscribes',()=>{
  let raw=JSON.stringify(fixture()),fail=true;const spy=vi.fn(()=>expect(parseDemoMarket(raw).orders[0].status).toBe('completed'));
  const storage={getItem:()=>raw,setItem:(_key:string,value:string)=>{if(fail)throw Error('quota');raw=value;}};
  const unsubscribe=subscribeDemoMarket(spy);
  try{expect(()=>commitDemoMarket(storage,{type:'staff-confirm',id:'DEMO-1',action:'complete'})).toThrow('quota');expect(spy).not.toHaveBeenCalled();expect(parseDemoMarket(raw).orders[0].status).toBe('reserved');
   fail=false;commitDemoMarket(storage,{type:'staff-confirm',id:'DEMO-1',action:'complete'});expect(spy).toHaveBeenCalledOnce();unsubscribe();commitDemoMarket(storage,{type:'staff-confirm',id:'DEMO-1',action:'complete'});expect(spy).toHaveBeenCalledOnce();
  }finally{unsubscribe();}
 });
 it('revalidates fresh storage for stale opposing action and preserves new guest basket',()=>{
  let s=act(fixture(),{type:'staff-confirm',id:'DEMO-1',action:'cancel'});s=act(s,{type:'quantity',id:'sample-tea',quantity:2});let raw=JSON.stringify(s);const before=raw;
  const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{raw=v;}};
  expect(()=>commitDemoMarket(storage,{type:'staff-confirm',id:'DEMO-1',action:'complete'})).toThrow('stale');expect(raw).toBe(before);
  expect(commitDemoMarket(storage,{type:'staff-confirm',id:'DEMO-1',action:'cancel'})).toEqual(s);
 });
 it('does not bypass guest pending confirmation or replacement draft locks',()=>{
  const old=fixture(),editing=act(old,{type:'edit',id:'DEMO-1'});
  for(const state of [editing,act(editing,{type:'prepare'}),act(act(old,{type:'quantity',id:'sample-tea',quantity:1}),{type:'prepare'})]){
   for(const action of ['complete','cancel'] as const)expect(()=>act(state,{type:'staff-confirm',id:'DEMO-1',action})).toThrow('pending');
  }
 });
 it('uses one accounting state, preserves cart and replacement links across staff actions',()=>{
  let state=act(fixture(),{type:'edit',id:'DEMO-1'});state=act(state,{type:'prepare'});state=act(state,{type:'confirm',id:state.pending!.id});state=act(state,{type:'quantity',id:'sample-tea',quantity:2});
  const done=act(state,{type:'staff-confirm',id:'DEMO-2',action:'complete'});expect(done.cart).toEqual(state.cart);expect(done.orders[0]).toMatchObject({status:'completed',replacesOrderId:'DEMO-1'});expect(done.orders[1].replacedByOrderId).toBe('DEMO-2');expect(parseDemoMarket(JSON.stringify(done))).toEqual(done);
 });
 it('malformed or inaccessible storage fails closed',()=>{expect(readDemoMarket({getItem:()=>'{invalid',setItem:()=>{}}).blocked).toBe(true);expect(readDemoMarket({getItem:()=>{throw Error('security');},setItem:()=>{}}).blocked).toBe(true);});
 it('keeps display-role policy narrow and never labels it authentication',()=>{
  for(const role of ['general_manager','super_admin','front_desk','concierge'] as const)expect(demoMarketAccess(role)).toBe('operate');
  expect(demoMarketAccess('owner_readonly')).toBe('read');for(const role of ['cleaner','technician','accountant','reservation_manager','maintenance_manager','housekeeping_supervisor'] as const)expect(demoMarketAccess(role)).toBe('none');
 });
});
