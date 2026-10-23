import {describe,it,expect} from 'vitest';
import {decideDemoMarket,type DurableMarket} from './demo-market-store';
import {emptyDemoMarket,reduceDemoMarket as act,parseDemoMarket} from './demo-market';
import {demoMarketAccess} from '../staff/demo-market-policy';
function fixture(){let s=act(emptyDemoMarket(),{type:'quantity',id:'sample-water',quantity:4});s=act(s,{type:'prepare'});return act(s,{type:'confirm',id:s.pending!.id});}
const raw=()=>JSON.stringify(fixture());
const read=(record?:unknown,legacy:string|null=null)=>decideDemoMarket(record,legacy,{kind:'read'});
const commit=(record:DurableMarket,action:Parameters<typeof act>[1],expectedRevision=record.revision)=>decideDemoMarket(record,null,{kind:'action',action,expectedRevision});
describe('durable demo market decisions inside serialized transactions',()=>{
 it('imports old v1 only into an absent ledger and preserves original bytes',()=>{
  const legacy=raw(),result=read(undefined,legacy);expect(result.write).toBe(true);expect(result.record.raw).toBe(legacy);expect(result.record.legacySources).toEqual([legacy]);expect(result.snapshot.state).toEqual(fixture());
  const next=commit(result.record,{type:'staff-confirm',id:'DEMO-1',action:'complete'});expect(read(next.record,legacy).snapshot.conflict).toBe(false);expect(read(next.record,legacy).record.raw).toBe(next.record.raw);expect(result.record.raw).toBe(legacy);
 });
 it('records an equivalent legacy source so later durable edits do not create a false conflict',()=>{
  const initial=read().record,legacy=initial.raw,same=read(initial,legacy);expect(same.write).toBe(true);expect(same.snapshot.conflict).toBe(false);
  const changed=commit(same.record,{type:'quantity',id:'sample-water',quantity:1});expect(read(changed.record,legacy).snapshot.conflict).toBe(false);
 });
 it('initializes a genuinely absent source only and never calls malformed/version data empty',()=>{
  expect(read().snapshot.state).toEqual(emptyDemoMarket());
  for(const legacy of ['broken','null','{}',JSON.stringify({...fixture(),version:2})])expect(()=>read(undefined,legacy)).toThrow();
  const good=read(undefined,raw()).record;
  for(const record of [null,{}, {...good,format:2},{...good,revision:0},{...good,raw:'broken'},{...good,legacySources:['broken']}])expect(()=>read(record)).toThrow();
 });
 it('explicitly resolves different tab history without merging or overwriting either original',()=>{
  const device=read(undefined,raw()).record,legacy=JSON.stringify(act(emptyDemoMarket(),{type:'quantity',id:'sample-tea',quantity:2}));
  const conflict=read(device,legacy);expect(conflict.write).toBe(false);expect(conflict.snapshot.conflict).toBe(true);expect(conflict.snapshot.raw).toBe(device.raw);expect(conflict.snapshot.legacy).toBe(legacy);
  expect(()=>decideDemoMarket(device,legacy,{kind:'action',action:{type:'clear'},expectedRevision:1})).toThrow('conflict');
  const resolved=decideDemoMarket(device,legacy,{kind:'resolve',expectedRevision:1});expect(resolved.record.raw).toBe(device.raw);expect(resolved.record.legacySources).toEqual([raw(),legacy]);expect(read(resolved.record,legacy).snapshot.conflict).toBe(false);expect(device.legacySources).toEqual([raw()]);
 });
 it('does not silently discard differing empty legacy history',()=>{expect(read(read(undefined,raw()).record,JSON.stringify(emptyDemoMarket())).snapshot.conflict).toBe(true);});
 it('rejects stale revision writes instead of losing successful concurrent edits',()=>{
  const initial=read().record,first=commit(initial,{type:'quantity',id:'sample-water',quantity:2});
  expect(()=>commit(first.record,{type:'quantity',id:'sample-tea',quantity:1},initial.revision)).toThrow('changed');
  const refreshed=commit(first.record,{type:'quantity',id:'sample-tea',quantity:1});expect(refreshed.snapshot.state.cart).toEqual({'sample-water':2,'sample-tea':1});
 });
 it('preserves replay idempotence after durable reopen and does not increment revision for no-op',()=>{
  const initial=read(undefined,raw()).record,done=commit(initial,{type:'staff-confirm',id:'DEMO-1',action:'cancel'});
  const replay=commit(read(done.record).record,{type:'staff-confirm',id:'DEMO-1',action:'cancel'});expect(replay.write).toBe(false);expect(replay.record).toEqual(done.record);
  expect(()=>commit(done.record,{type:'staff-confirm',id:'DEMO-1',action:'complete'})).toThrow('stale');
 });
 it('preserves pending token, replacement draft, backlinks and stock through storage decisions',()=>{
  const editing=act(fixture(),{type:'edit',id:'DEMO-1'}),pending=act(editing,{type:'prepare'}),record=read(undefined,JSON.stringify(pending)).record;
  expect(read(record).snapshot.state).toEqual(pending);
  const done=commit(record,{type:'confirm',id:pending.pending!.id});expect(parseDemoMarket(done.record.raw).orders[0].replacesOrderId).toBe('DEMO-1');
  expect(commit(done.record,{type:'confirm',id:pending.pending!.id}).write).toBe(false);
  expect(()=>commit(record,{type:'staff-confirm',id:'DEMO-1',action:'cancel'})).toThrow('pending');
 });
 it('failed validation never mutates the original record or legacy archive',()=>{
  const record=read(undefined,raw()).record,before=JSON.stringify(record);
  expect(()=>commit(record,{type:'quantity',id:'bad-sku',quantity:1})).toThrow();expect(JSON.stringify(record)).toBe(before);
  const full={...record,legacySources:Array(100).fill(raw())},legacy=JSON.stringify(emptyDemoMarket());expect(()=>decideDemoMarket(full,legacy,{kind:'resolve',expectedRevision:1})).toThrow('limit');expect(full.legacySources).toHaveLength(100);
 });
 it('keeps demo role policy separate from backend authentication',()=>{
  for(const role of ['general_manager','super_admin','front_desk','concierge'] as const)expect(demoMarketAccess(role)).toBe('operate');expect(demoMarketAccess('owner_readonly')).toBe('read');for(const role of ['cleaner','technician','accountant'] as const)expect(demoMarketAccess(role)).toBe('none');
 });
});
