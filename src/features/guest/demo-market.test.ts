import {describe,it,expect} from 'vitest';
import {emptyDemoMarket,reduceDemoMarket as act,demoBalance,parseDemoMarket,transactDemoMarket,demoMarketKey} from './demo-market';
const basket=(quantity=3)=>act(emptyDemoMarket(),{type:'quantity',id:'sample-water',quantity});
const prepare=(s=basket())=>act(s,{type:'prepare'});
const confirm=(s=prepare())=>act(s,{type:'confirm',id:s.pending!.id});
describe('local demo market transaction boundaries',()=>{
 it('keeps the same pending token on a repeated review, including after reload',()=>{const pending=prepare();expect(act(pending,{type:'prepare'})).toEqual(pending);expect(act(parseDemoMarket(JSON.stringify(pending)),{type:'prepare'})).toEqual(pending);});
 it('reserves once, releases once, never charges or consumes on cancel',()=>{const pending=prepare(),s=confirm(pending);expect(demoBalance(s,'sample-water')).toEqual({available:7,reserved:3,consumed:0});expect(act(s,{type:'confirm',id:pending.pending!.id})).toEqual(s);const cancelled=act(s,{type:'cancel',id:s.orders[0].id});expect(demoBalance(cancelled,'sample-water')).toEqual({available:10,reserved:0,consumed:0});expect(act(cancelled,{type:'complete',id:s.orders[0].id})).toEqual(cancelled);expect(act(cancelled,{type:'cancel',id:s.orders[0].id})).toEqual(cancelled);});
 it('fulfilment consumes reserved quantities once, cannot be cancelled afterward',()=>{const s=confirm(),done=act(s,{type:'complete',id:s.orders[0].id});expect(demoBalance(done,'sample-water')).toEqual({available:7,reserved:0,consumed:3});expect(act(done,{type:'complete',id:s.orders[0].id})).toEqual(done);expect(act(done,{type:'cancel',id:s.orders[0].id})).toEqual(done);});
 it('validates the whole basket atomically at review and commit',()=>{expect(()=>prepare(basket(11))).toThrow('stock');const s=prepare();s.orders=[{id:'DEMO-old',lines:{'sample-water':8},status:'reserved'}];expect(()=>confirm(s)).toThrow('stock');expect(s.orders).toHaveLength(1);expect(s.pending).not.toBeNull();});
 it('persists interruption before and after commit and rejects an old confirmation token',()=>{const p=parseDemoMarket(JSON.stringify(prepare())),s=confirm(p);const reloaded=parseDemoMarket(JSON.stringify(s));expect(act(reloaded,{type:'confirm',id:p.pending!.id})).toEqual(reloaded);});
 it('does not confirm a new basket with a stale confirmation token',()=>{const first=confirm();const next=prepare(act(first,{type:'quantity',id:'sample-tea',quantity:1}));expect(act(next,{type:'confirm',id:'DEMO-1'})).toEqual(next);expect(confirm(next).orders).toHaveLength(2);});
 it('discard keeps basket, review locks mutations and can be resumed after reload',()=>{const p=prepare();expect(()=>act(p,{type:'quantity',id:'sample-water',quantity:1})).toThrow('pending');expect(()=>act(p,{type:'clear'})).toThrow('pending');const s=act(p,{type:'discard'});expect(s.cart).toEqual(p.cart);expect(s.orders).toEqual([]);expect(parseDemoMarket(JSON.stringify(p))).toEqual(p);});
 it.each([-1,0.5,21,NaN,Infinity])('rejects invalid quantity %s',q=>{expect(()=>act(emptyDemoMarket(),{type:'quantity',id:'sample-water',quantity:q})).toThrow('quantity');});
 it('rejects unknown products and empty review',()=>{expect(()=>act(emptyDemoMarket(),{type:'quantity',id:'__proto__',quantity:1})).toThrow();expect(()=>prepare(emptyDemoMarket())).toThrow('empty');});
 it('fails closed on malformed persisted state without resetting it',()=>{for(const raw of ['broken','null','{}',JSON.stringify({...basket(),version:2}),JSON.stringify({...basket(),cart:{unknown:1}}),JSON.stringify({...prepare(),sequence:0}),JSON.stringify({...confirm(),orders:[...confirm().orders,...confirm().orders]})])expect(()=>parseDemoMarket(raw)).toThrow();});
 it('storage failure cannot publish a success; retry uses the same pending token',()=>{let raw=JSON.stringify(prepare()),fail=true;const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{if(fail)throw Error('quota');raw=v;}};expect(()=>transactDemoMarket(storage,{type:'confirm',id:'DEMO-1'})).toThrow('quota');expect(parseDemoMarket(raw).orders).toHaveLength(0);fail=false;expect(transactDemoMarket(storage,{type:'confirm',id:'DEMO-1'}).orders).toHaveLength(1);expect(transactDemoMarket(storage,{type:'confirm',id:'DEMO-1'}).orders).toHaveLength(1);expect(demoMarketKey).toContain('demo');});
 it('accounts for mixed baskets without negative stock',()=>{let s=act(basket(10),{type:'quantity',id:'sample-tea',quantity:2});s=confirm(prepare(s));expect(demoBalance(s,'sample-water').available).toBe(0);expect(demoBalance(s,'sample-tea').available).toBe(8);expect(()=>prepare(act(s,{type:'quantity',id:'sample-water',quantity:1}))).toThrow('stock');});
});

describe('atomic demo order replacement',()=>{
 const edit=(s=confirm(prepare(basket(10))))=>act(s,{type:'edit',id:s.orders[0].id});
 it('reads old v1 without losing data, reserves continuously, and credits only own held units',()=>{
  const old=confirm(prepare(basket(10))),legacy=parseDemoMarket(JSON.stringify(old));expect(legacy).toEqual(old);
  let s=edit(legacy);expect(s.orders).toEqual(old.orders);expect(demoBalance(s,'sample-water').available).toBe(0);
  s=prepare(act(s,{type:'quantity',id:'sample-water',quantity:9}));expect(s.pending?.replacesOrderId).toBe('DEMO-1');expect(demoBalance(s,'sample-water').reserved).toBe(10);
  const done=confirm(parseDemoMarket(JSON.stringify(s)));expect(done.orders[0]).toMatchObject({id:'DEMO-2',replacesOrderId:'DEMO-1',status:'reserved'});expect(done.orders[1]).toMatchObject({id:'DEMO-1',replacedByOrderId:'DEMO-2',status:'cancelled'});expect(demoBalance(done,'sample-water')).toEqual({available:1,reserved:9,consumed:0});expect(parseDemoMarket(JSON.stringify(done))).toEqual(done);expect(act(done,{type:'confirm',id:'DEMO-2'})).toEqual(done);
 });
 it('keeps draft and review after reload and repeated review, cancels edit without releasing original',()=>{
  const draft=act(edit(),{type:'quantity',id:'sample-water',quantity:7});expect(parseDemoMarket(JSON.stringify(draft))).toEqual(draft);
  const pending=prepare(draft);expect(prepare(parseDemoMarket(JSON.stringify(pending)))).toEqual(pending);
  const back=act(pending,{type:'discard'});expect(back.editingOrderId).toBe('DEMO-1');expect(back.cart).toEqual(draft.cart);
  const stop=act(back,{type:'stop-edit'});expect(stop.cart).toEqual({});expect(stop.editingOrderId).toBeUndefined();expect(demoBalance(stop,'sample-water').reserved).toBe(10);
 });
 it('rejects unrelated basket, active draft mutations of history, stale targets and overstock',()=>{
  const old=confirm();expect(()=>edit(act(old,{type:'quantity',id:'sample-tea',quantity:1}))).toThrow('basket');
  const editing=edit(old);for(const type of ['complete','cancel'] as const)expect(()=>act(editing,{type,id:'DEMO-1'})).toThrow('pending');
  expect(()=>act(act(old,{type:'cancel',id:'DEMO-1'}),{type:'edit',id:'DEMO-1'})).toThrow('stale');
  const tooMuch=act(editing,{type:'quantity',id:'sample-water',quantity:11});expect(()=>prepare(tooMuch)).toThrow('stock');expect(tooMuch.orders).toEqual(old.orders);
  const pending=prepare(editing);expect(()=>confirm({...pending,orders:pending.orders.map(o=>({...o,status:'cancelled' as const}))})).toThrow('stale');
  expect(act(pending,{type:'confirm',id:'DEMO-1'})).toEqual(pending);
 });
 it('rejects malformed persisted replacement backlinks, cycles and mismatched pending target',()=>{
  const done=confirm(prepare(edit()));
  const variants=[{...done,orders:done.orders.map(o=>({...o,replacedByOrderId:'DEMO-404'}))},{...done,orders:done.orders.map(o=>({...o,replacesOrderId:o.id}))},{...done,editingOrderId:'DEMO-1'},{...prepare(edit()),pending:{...prepare(edit()).pending!,replacesOrderId:'DEMO-404'}}];
  for(const bad of variants)expect(()=>parseDemoMarket(JSON.stringify(bad))).toThrow('storage');
 });
 it('replaces chains and retains accounting after cancellation or fulfilment of successor',()=>{
  const second=confirm(prepare(edit())),third=confirm(prepare(edit(second)));expect(parseDemoMarket(JSON.stringify(third))).toEqual(third);
  expect(demoBalance(act(third,{type:'cancel',id:'DEMO-3'}),'sample-water').available).toBe(10);
  expect(demoBalance(act(third,{type:'complete',id:'DEMO-3'}),'sample-water').consumed).toBe(10);
 });
 it('never credits another order or accepts backward pending replacement IDs',()=>{
  let s=confirm(prepare(basket(4)));s=confirm(prepare(act(s,{type:'quantity',id:'sample-water',quantity:6})));
  const editing=act(s,{type:'edit',id:'DEMO-1'});expect(()=>prepare(act(editing,{type:'quantity',id:'sample-water',quantity:5}))).toThrow('stock');
  const pending=prepare(edit(s));const malformed={...pending,pending:{...pending.pending!,id:'DEMO-1'},orders:pending.orders.filter(o=>o.id!=='DEMO-1')};expect(()=>parseDemoMarket(JSON.stringify(malformed))).toThrow('storage');
 });
 it('failed atomic storage write preserves old reservation and pending token, retries exactly once',()=>{
  let raw=JSON.stringify(prepare(edit())),fail=true;const original=raw;
  const storage={getItem:()=>raw,setItem:(_k:string,v:string)=>{if(fail)throw Error('quota');raw=v;}};
  expect(()=>transactDemoMarket(storage,{type:'confirm',id:'DEMO-2'})).toThrow('quota');expect(raw).toBe(original);expect(parseDemoMarket(raw).orders).toHaveLength(1);
  fail=false;const done=transactDemoMarket(storage,{type:'confirm',id:'DEMO-2'});expect(done.orders).toHaveLength(2);expect(transactDemoMarket(storage,{type:'confirm',id:'DEMO-2'})).toEqual(done);
 });
});
