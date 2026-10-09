// Runs the real TypeScript market model, compiled into a disposable CommonJS folder.
// No browser storage, external API, real payment or persistent database is touched.
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const source=process.env.MARKET_MODEL_SOURCE||path.resolve(__dirname,'../src/domain/marketModel.ts');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'views-market-integrity-'));
let model;
try{
  fs.writeFileSync(path.join(out,'package.json'),'{"type":"commonjs"}');
  const compilation=spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),source,
    '--strict','--skipLibCheck','--target','ES2022','--module','commonjs','--lib','ES2022,DOM','--outDir',out],{encoding:'utf8',timeout:30000});
  if(compilation.error||compilation.status!==0)throw new Error('Market model typecheck failed: '+(compilation.error||compilation.stdout+compilation.stderr));
  model=require(path.join(out,'marketModel.js'));
}catch(error){fs.rmSync(out,{recursive:true,force:true});throw error}
after(()=>fs.rmSync(out,{recursive:true,force:true}));
const {marketSeed,priceWithMarkup,addCartLine,placeDemoOrder,advanceMarketOrder,cancelMarketOrder,receiveMarketStock,adjustMarketStock}=model;
const fresh=()=>({products:structuredClone(marketSeed),orders:[],ledger:[]});
const input=(override={})=>({idempotencyKey:'key-1',apartment:'#235',deliverySlot:'now',comment:'',payment:'demo_card',...override});
const place=(state,override={},cart)=>placeDemoOrder(state,cart||{[state.products[0].id]:2},input(override));
function unchanged(state,action,pattern){const before=structuredClone(state);assert.throws(action,pattern);assert.deepEqual(state,before)}
function delivered(state,id){for(let i=0;i<4;i++)state=advanceMarketOrder(state,id);return state}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}

test('retains 120 SKUs and the existing 25-percent rounding rule',()=>{
  assert.equal(marketSeed.length,120);assert.equal(priceWithMarkup(10000,25),12500);
  assert.equal(new Set(marketSeed.map(p=>p.id)).size,120);
});
test('cart controls still cap quantity at available stock',()=>{
  const p={...marketSeed[0],stock:3,reserved:1};assert.equal(addCartLine({},p,99)[p.id],2);
});
for(const [label,value] of [['negative',-1],['fraction',0.5],['NaN',NaN],['infinity',Infinity],['zero',0],['string','2'],['unsafe integer',Number.MAX_SAFE_INTEGER+1]]){
  test('checkout rejects '+label+' quantity without a reservation',()=>{const s=fresh();unchanged(s,()=>place(s,{}, {[s.products[0].id]:value}),/INVALID_QUANTITY/)});
}
for(const [label,value] of [['null',null],['array',[]],['custom prototype',Object.create({ghost:1})]]){
  test('checkout rejects '+label+' cart',()=>{const s=fresh();unchanged(s,()=>placeDemoOrder(s,value,input()),/INVALID_CART/)});
}
test('unknown product cannot be silently dropped from a mixed cart',()=>{
  const s=fresh();unchanged(s,()=>place(s,{}, {[s.products[0].id]:1,ghost:2}),/UNKNOWN_PRODUCT/);
});
test('empty cart and empty idempotency key are refused',()=>{
  const s=fresh();unchanged(s,()=>place(s,{},{}),/EMPTY_CART/);unchanged(s,()=>place(s,{idempotencyKey:'  '}),/INVALID_IDEMPOTENCY_KEY/);
});
test('invalid delivery and payment metadata are refused',()=>{
  for(const options of [{apartment:''},{deliverySlot:''},{comment:42},{payment:'live_card'},{paymentOutcome:'unknown'}]){
    const s=fresh();unchanged(s,()=>place(s,options),/INVALID_/);
  }
});
test('same-key replay preserves exactly one reservation and ledger entry',()=>{
  const first=place(fresh());const second=place(first.state);
  assert.equal(second.duplicate,true);assert.strictEqual(second.state,first.state);assert.strictEqual(second.order,first.order);
  assert.equal(second.state.orders.length,1);assert.equal(second.state.ledger.length,1);assert.equal(second.state.products[0].reserved,2);
});
for(const [label,change] of [['apartment',{apartment:'#250'}],['slot',{deliverySlot:'tomorrow'}],['comment',{comment:'new note'}],['payment',{payment:'room_charge'}],['fee',{deliveryFeeUzs:20000}]]){
  test('same key with changed '+label+' fails without overwriting the order',()=>{
    const first=place(fresh());unchanged(first.state,()=>place(first.state,change),/IDEMPOTENCY_CONFLICT/);
  });
}
test('same key with changed quantity fails',()=>{
  const first=place(fresh());unchanged(first.state,()=>place(first.state,{}, {[first.state.products[0].id]:3}),/IDEMPOTENCY_CONFLICT/);
});
test('cart key ordering does not change request identity',()=>{
  const s=fresh();const [a,b]=s.products;const first=place(s,{}, {[b.id]:1,[a.id]:2});
  assert.equal(place(first.state,{}, {[a.id]:2,[b.id]:1}).duplicate,true);
});
test('replay returns the original total after catalogue repricing',()=>{
  const first=place(fresh());const changed=structuredClone(first.state);changed.products[0].guestPriceUzs+=10000;
  const second=place(changed);assert.equal(second.order.totalUzs,first.order.totalUzs);assert.equal(second.duplicate,true);
});
for(const terminal of ['delivered','cancelled']){
  test('same-key retry after '+terminal+' does not reserve again',()=>{
    const first=place(fresh());const s=terminal==='delivered'?delivered(first.state,first.order.id):cancelMarketOrder(first.state,first.order.id);
    const second=place(s);assert.strictEqual(second.state,s);assert.equal(second.order.status,terminal);assert.equal(s.products[0].reserved,0);
  });
}
test('an insufficient second line cannot partially reserve the first line',()=>{
  const s=fresh();unchanged(s,()=>place(s,{}, {[s.products[0].id]:1,[s.products[1].id]:s.products[1].stock+1}),/OUT_OF_STOCK/);
});
test('two sequential requests cannot both consume the last available units',()=>{
  const s=fresh();const p=s.products[0];const first=place(s,{}, {[p.id]:p.stock});
  unchanged(first.state,()=>place(first.state,{idempotencyKey:'key-2'}, {[p.id]:1}),/OUT_OF_STOCK/);
});
test('failed mock payment never reserves stock or creates an order',()=>{
  const s=fresh();unchanged(s,()=>place(s,{paymentOutcome:'failure'}),/DEMO_PAYMENT_FAILED/);
});
test('orders created in one millisecond have distinct IDs within the same state',()=>{
  const now=Date.now;Date.now=()=>1791540000000;
  try{let s=fresh();for(let i=0;i<5;i++)s=place(s,{idempotencyKey:'same-clock-'+i}).state;
    assert.equal(new Set(s.orders.map(o=>o.id)).size,5);
  }finally{Date.now=now}
});
test('caller-supplied duplicate order ID is rejected',()=>{
  const first=place(fresh(),{orderId:'VM-FIXED'});unchanged(first.state,()=>place(first.state,{idempotencyKey:'key-2',orderId:'VM-FIXED'}),/ORDER_ID_CONFLICT/);
});
test('invalid explicit order ID and timestamp are rejected',()=>{
  const s=fresh();unchanged(s,()=>place(s,{orderId:''}),/INVALID_ORDER_ID/);unchanged(s,()=>place(s,{now:'not-a-date'}),/INVALID_TIMESTAMP/);
});
for(const [label,value] of [['negative',-1],['fraction',0.5],['NaN',NaN],['infinity',Infinity],['string','10000']]){
  test('invalid '+label+' delivery fee is rejected',()=>{const s=fresh();unchanged(s,()=>place(s,{deliveryFeeUzs:value}),/INVALID_MONEY/)});
}
test('invalid price and monetary overflow are rejected before reservation',()=>{
  for(const price of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER]){const s=fresh();s.products[0].guestPriceUzs=price;unchanged(s,()=>place(s),/INVALID_MONEY/)}
});
test('delivery consumes both products exactly once and preserves another order reservation',()=>{
  const s=fresh();const [a,b]=s.products;const first=place(s,{orderId:'VM-A'}, {[a.id]:2,[b.id]:3});
  const second=place(first.state,{idempotencyKey:'key-2',orderId:'VM-B'}, {[a.id]:1});
  const done=delivered(second.state,'VM-A');
  assert.equal(done.products[0].stock,a.stock-2);assert.equal(done.products[0].reserved,1);
  assert.equal(done.products[1].stock,b.stock-3);assert.equal(done.products[1].reserved,0);
  assert.equal(done.ledger.filter(e=>e.type==='SALE').length,2);
  assert.strictEqual(advanceMarketOrder(done,'VM-A'),done);assert.strictEqual(cancelMarketOrder(done,'VM-A'),done);
});
test('cancellation releases once; cancellation is not a financial refund',()=>{
  const first=place(fresh());const cancelled=cancelMarketOrder(first.state,first.order.id);
  assert.equal(cancelled.products[0].reserved,0);assert.equal(cancelled.products[0].stock,first.state.products[0].stock);
  assert.equal(cancelled.orders[0].paymentStatus,'demo_paid');assert.equal(cancelled.ledger.filter(e=>e.type==='RELEASE').length,1);
  assert.strictEqual(cancelMarketOrder(cancelled,first.order.id),cancelled);assert.strictEqual(advanceMarketOrder(cancelled,first.order.id),cancelled);
});
for(const action of ['advance','cancel']){
  test(action+' refuses inconsistent reservation totals rather than clamping',()=>{
    const first=place(fresh());const s=structuredClone(first.state);s.products[0].reserved=0;
    unchanged(s,()=>action==='advance'?advanceMarketOrder(s,first.order.id):cancelMarketOrder(s,first.order.id),/INVENTORY_CONFLICT/);
  });
}
test('ghost reservations, missing active SKUs and duplicate order IDs are rejected',()=>{
  const ghost=fresh();ghost.products[0].reserved=1;unchanged(ghost,()=>place(ghost),/INVENTORY_CONFLICT/);
  const first=place(fresh());const missing=structuredClone(first.state);missing.products.shift();
  unchanged(missing,()=>cancelMarketOrder(missing,first.order.id),/INVENTORY_CONFLICT/);
  const duplicate=structuredClone(first.state);duplicate.orders.push({...duplicate.orders[0],idempotencyKey:'other'});
  unchanged(duplicate,()=>cancelMarketOrder(duplicate,first.order.id),/INVENTORY_CONFLICT/);
});
for(const [label,value] of [['negative',-1],['fraction',0.5],['NaN',NaN],['infinity',Infinity],['string','2']]){
  test('receiving rejects '+label+' quantity',()=>{const s=fresh();unchanged(s,()=>receiveMarketStock(s,s.products[0].id,value),/INVALID_QUANTITY/)});
}
for(const [label,value] of [['fraction',0.5],['NaN',NaN],['infinity',Infinity],['string','2']]){
  test('stock adjustment rejects '+label+' delta',()=>{const s=fresh();unchanged(s,()=>adjustMarketStock(s,s.products[0].id,value,'test'),/INVALID_QUANTITY/)});
}
test('receiving and adjustment reject integer overflow',()=>{
  const s=fresh();s.products[0].stock=Number.MAX_SAFE_INTEGER;
  unchanged(s,()=>receiveMarketStock(s,s.products[0].id,1),/INVALID_QUANTITY/);
  unchanged(s,()=>adjustMarketStock(s,s.products[0].id,1,'test'),/INVALID_QUANTITY/);
});
test('stock adjustment retains its existing floor at reserved quantity',()=>{
  const first=place(fresh());const s=adjustMarketStock(first.state,first.state.products[0].id,-999,'demo stocktake');
  assert.equal(s.products[0].stock,2);assert.equal(s.products[0].reserved,2);
  const received=receiveMarketStock(s,s.products[0].id,10);assert.equal(received.products[0].stock,12);
});
test('successful mutations never mutate frozen input state or cart',()=>{
  const s=freeze(fresh());const cart=freeze({[s.products[0].id]:2});const placed=placeDemoOrder(s,cart,freeze(input()));
  assert.equal(s.products[0].reserved,0);assert.equal(placed.state.products[0].reserved,2);
  freeze(placed.state);const cancelled=cancelMarketOrder(placed.state,placed.order.id);assert.equal(cancelled.products[0].reserved,0);
});
