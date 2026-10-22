import {marketProducts,type MarketCart} from './market-catalog';
// Local, synthetic quantity accounting only. Never a Core SKU, payment or real reservation.
export const demoMarketKey='views.demo-market.v1';
export const demoOpeningStock=10;
export type DemoOrder={id:string;lines:MarketCart;status:'reserved'|'completed'|'cancelled'};
export type DemoMarket={version:1;sequence:number;cart:MarketCart;pending:{id:string;lines:MarketCart}|null;orders:DemoOrder[]};
export type DemoAction={type:'quantity';id:string;quantity:number}|{type:'clear'|'prepare'|'discard'}|{type:'complete'|'cancel'|'confirm';id:string};
export const emptyDemoMarket=():DemoMarket=>({version:1,sequence:0,cart:{},pending:null,orders:[]});
function validLines(value:unknown):value is MarketCart{
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([id,q])=>marketProducts.some(p=>p.id===id)&&Number.isInteger(q)&&Number(q)>0&&Number(q)<=20);
}
export function demoBalance(state:DemoMarket,id:string){
 let reserved=0,consumed=0;for(const order of state.orders){const q=order.lines[id]||0;if(order.status==='reserved')reserved+=q;if(order.status==='completed')consumed+=q;}
 return {reserved,consumed,available:demoOpeningStock-reserved-consumed};
}
export function parseDemoMarket(raw:string|null):DemoMarket{
 if(raw===null)return emptyDemoMarket();
 const s=JSON.parse(raw) as DemoMarket;
 if(!s||s.version!==1||!Number.isSafeInteger(s.sequence)||s.sequence<0||!validLines(s.cart)||!Array.isArray(s.orders)||s.orders.length>100)throw Error('storage');
 const ids=new Set<string>();
 const validId=(id:unknown)=>typeof id==='string'&&/^DEMO-[1-9][0-9]*$/.test(id)&&Number(id.slice(5))<=s.sequence;
 for(const o of s.orders){if(!o||!validId(o.id)||ids.has(o.id)||!['reserved','completed','cancelled'].includes(o.status)||!validLines(o.lines)||!Object.keys(o.lines).length)throw Error('storage');ids.add(o.id);}
 if(s.pending!==null&&(!s.pending||!validId(s.pending.id)||ids.has(s.pending.id)||!validLines(s.pending.lines)||!Object.keys(s.pending.lines).length||JSON.stringify(s.pending.lines)!==JSON.stringify(s.cart)))throw Error('storage');
 if(marketProducts.some(p=>demoBalance(s,p.id).available<0))throw Error('storage');
 return s;
}
export function reduceDemoMarket(s:DemoMarket,a:DemoAction):DemoMarket{
 if(a.type==='confirm'){
  if(!s.pending||s.pending.id!==a.id)return s; // A repeat after a committed confirmation cannot create another order.
  if(s.orders.length>=100)throw Error('limit');
  if(Object.entries(s.pending.lines).some(([id,q])=>q>demoBalance(s,id).available))throw Error('stock');
  return {...s,cart:{},pending:null,orders:[{...s.pending,status:'reserved'},...s.orders]};
 }
 if(a.type==='discard')return {...s,pending:null};
 if(a.type==='complete'||a.type==='cancel'){
  if(s.pending)throw Error('pending');
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
 if(Object.entries(s.cart).some(([id,q])=>q>demoBalance(s,id).available))throw Error('stock');
 const sequence=s.sequence+1;return {...s,sequence,pending:{id:'DEMO-'+sequence,lines:{...s.cart}}};
}
export type DemoStorage=Pick<Storage,'getItem'|'setItem'>;
export function loadDemoMarket(storage:DemoStorage){return parseDemoMarket(storage.getItem(demoMarketKey));}
export function transactDemoMarket(storage:DemoStorage,action:DemoAction){
 const next=reduceDemoMarket(loadDemoMarket(storage),action);
 // One atomic per-tab write holds basket, idempotency token and accounting. On failure, no success UI.
 storage.setItem(demoMarketKey,JSON.stringify(next));return next;
}
