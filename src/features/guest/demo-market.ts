import {marketProducts,type MarketCart} from './market-catalog';
// Local, synthetic quantity accounting only. Never a Core SKU, payment or real reservation.
export const demoMarketKey='views.demo-market.v1';
export const demoOpeningStock=10;
export type DemoOrder={id:string;lines:MarketCart;status:'reserved'|'completed'|'cancelled';replacesOrderId?:string;replacedByOrderId?:string};
export type DemoMarket={version:1;sequence:number;cart:MarketCart;pending:{id:string;lines:MarketCart;replacesOrderId?:string}|null;orders:DemoOrder[];editingOrderId?:string};
export type DemoAction={type:'quantity';id:string;quantity:number}|{type:'clear'|'prepare'|'discard'|'stop-edit'}|{type:'edit';id:string}|{type:'complete'|'cancel'|'confirm';id:string};
export const emptyDemoMarket=():DemoMarket=>({version:1,sequence:0,cart:{},pending:null,orders:[]});
function validLines(value:unknown):value is MarketCart{
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([id,q])=>marketProducts.some(p=>p.id===id)&&Number.isInteger(q)&&Number(q)>0&&Number(q)<=20);
}
export function demoBalance(state:DemoMarket,id:string){
 let reserved=0,consumed=0;for(const order of state.orders){const q=order.lines[id]||0;if(order.status==='reserved')reserved+=q;if(order.status==='completed')consumed+=q;}
 return {reserved,consumed,available:demoOpeningStock-reserved-consumed};
}
/** Only the edited order's still-held quantities can fund its replacement. */
export function demoAvailable(state:DemoMarket,id:string){
 const held=state.orders.find(o=>o.id===state.editingOrderId&&o.status==='reserved');
 return demoBalance(state,id).available+(held?.lines[id]||0);
}
export function parseDemoMarket(raw:string|null):DemoMarket{
 if(raw===null)return emptyDemoMarket();
 const s=JSON.parse(raw) as DemoMarket;
 if(!s||s.version!==1||!Number.isSafeInteger(s.sequence)||s.sequence<0||!validLines(s.cart)||!Array.isArray(s.orders)||s.orders.length>100)throw Error('storage');
 const ids=new Set<string>();
 const validId=(id:unknown)=>typeof id==='string'&&/^DEMO-[1-9][0-9]*$/.test(id)&&Number(id.slice(5))<=s.sequence;
 for(const o of s.orders){if(!o||!validId(o.id)||ids.has(o.id)||!['reserved','completed','cancelled'].includes(o.status)||!validLines(o.lines)||!Object.keys(o.lines).length)throw Error('storage');ids.add(o.id);}
 if(s.pending!==null&&(!s.pending||!validId(s.pending.id)||ids.has(s.pending.id)||!validLines(s.pending.lines)||!Object.keys(s.pending.lines).length||JSON.stringify(s.pending.lines)!==JSON.stringify(s.cart)))throw Error('storage');
 for(const o of s.orders){
  if(o.replacesOrderId!==undefined){const old=s.orders.find(v=>v.id===o.replacesOrderId);if(!old||old.id===o.id||old.status!=='cancelled'||old.replacedByOrderId!==o.id||Number(old.id.slice(5))>=Number(o.id.slice(5)))throw Error('storage');}
  if(o.replacedByOrderId!==undefined){const next=s.orders.find(v=>v.id===o.replacedByOrderId);if(o.status!=='cancelled'||!next||next.replacesOrderId!==o.id)throw Error('storage');}
 }
 if(s.editingOrderId!==undefined&&!s.orders.some(o=>o.id===s.editingOrderId&&o.status==='reserved'&&o.replacedByOrderId===undefined))throw Error('storage');
 if(s.pending&&(s.pending.replacesOrderId!==s.editingOrderId||(s.editingOrderId!==undefined&&Number(s.pending.id.slice(5))<=Number(s.editingOrderId.slice(5)))))throw Error('storage');
 if(marketProducts.some(p=>demoBalance(s,p.id).available<0))throw Error('storage');
 return s;
}
export function reduceDemoMarket(s:DemoMarket,a:DemoAction):DemoMarket{
 if(a.type==='confirm'){
  if(!s.pending||s.pending.id!==a.id)return s; // A repeat after a committed confirmation cannot create another order.
  const old=s.editingOrderId?s.orders.find(o=>o.id===s.editingOrderId&&o.status==='reserved'&&!o.replacedByOrderId):undefined;
  if(s.pending.replacesOrderId!==s.editingOrderId||(s.editingOrderId&&!old))throw Error('stale');
  if(s.orders.length>=100)throw Error('limit');
  if(Object.entries(s.pending.lines).some(([id,q])=>q>demoAvailable(s,id)))throw Error('stock');
  const {editingOrderId:_,...rest}=s;
  return {...rest,cart:{},pending:null,orders:[{...s.pending,status:'reserved'},...s.orders.map(o=>o.id===old?.id?{...o,status:'cancelled' as const,replacedByOrderId:s.pending!.id}:o)]};
 }
 if(a.type==='discard')return {...s,pending:null};
 if(a.type==='stop-edit'){
  if(s.pending)throw Error('pending');
  if(!s.editingOrderId)return s;
  const {editingOrderId:_,...rest}=s;return {...rest,cart:{}};
 }
 if(a.type==='edit'){
  if(s.pending||s.editingOrderId||Object.keys(s.cart).length)throw Error('basket');
  const old=s.orders.find(o=>o.id===a.id&&o.status==='reserved'&&!o.replacedByOrderId);
  if(!old)throw Error('stale');
  return {...s,editingOrderId:old.id,cart:{...old.lines}};
 }
 if(a.type==='complete'||a.type==='cancel'){
  if(s.pending||s.editingOrderId)throw Error('pending');
  return {...s,orders:s.orders.map(o=>o.id===a.id&&o.status==='reserved'?{...o,status:a.type==='complete'?'completed':'cancelled'}:o)};
 }
 if(s.pending){if(a.type==='prepare')return s;throw Error('pending');}
 if(a.type==='clear')return {...s,cart:{}};
 if(a.type==='quantity'){
  if(!marketProducts.some(p=>p.id===a.id)||!Number.isInteger(a.quantity)||a.quantity<0||a.quantity>20)throw Error('quantity');
  const cart={...s.cart};if(a.quantity===0)delete cart[a.id];else cart[a.id]=a.quantity;return {...s,cart};
 }
 if(!Object.keys(s.cart).length)throw Error('empty');
 if(s.orders.length>=100||s.sequence>=Number.MAX_SAFE_INTEGER)throw Error('limit');
 if(Object.entries(s.cart).some(([id,q])=>q>demoAvailable(s,id)))throw Error('stock');
 if(s.editingOrderId&&!s.orders.some(o=>o.id===s.editingOrderId&&o.status==='reserved'&&!o.replacedByOrderId))throw Error('stale');
 const sequence=s.sequence+1;return {...s,sequence,pending:{id:'DEMO-'+sequence,lines:{...s.cart},...(s.editingOrderId?{replacesOrderId:s.editingOrderId}:{})}};
}
export type DemoStorage=Pick<Storage,'getItem'|'setItem'>;
export function loadDemoMarket(storage:DemoStorage){return parseDemoMarket(storage.getItem(demoMarketKey));}
export function transactDemoMarket(storage:DemoStorage,action:DemoAction){
 const next=reduceDemoMarket(loadDemoMarket(storage),action);
 // One atomic per-tab write holds basket, idempotency token and accounting. On failure, no success UI.
 storage.setItem(demoMarketKey,JSON.stringify(next));return next;
}
