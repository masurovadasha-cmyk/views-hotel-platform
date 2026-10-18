export const orderSources={
 cleaning:{route:'services/orders',title:'Cleaning',stages:['requested','assigned','working','inspection','rework','done','cancelled'],done:'done'},
 laundry:{route:'services/laundry',title:'Laundry',stages:['requested','received','quoted','accepted','washing','ready','delivered','closed','awaiting_return','cancelled'],done:'closed'},
 concierge:{route:'services/concierge',title:'Concierge',stages:['requested','working','answered','closed','cancelled'],done:'closed'},
 market:{route:'services/market',title:'V Market',stages:['reserved','picking','ready','handed_over','completed','cancelled'],done:'completed'},
};
export type OrderKind=keyof typeof orderSources;
export const orderKinds=Object.keys(orderSources) as OrderKind[];
export type OrderGroup='active'|'completed'|'cancelled';
export type OrderSummary={id:string;kind:OrderKind;cursor:string|null;stage:string;group:OrderGroup;name:Record<string,string>|null;category:string|null;money:{minor:string;currency:string;label:string}|null};
export type OrderPage={items:OrderSummary[];nextCursor:string|null};
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function invalid():never{throw Error('INVALID_ORDER_PAGE');}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>;}
export function orderPage(kind:OrderKind,raw:unknown,cursor:string|null=null):OrderPage{
 if(cursor!==null&&!uuid.test(cursor))invalid();
 const b=record(raw),source=orderSources[kind];
 if(!Array.isArray(b.items)||b.items.length>50||b.nextCursor!==null&&(typeof b.nextCursor!=='string'||!uuid.test(b.nextCursor)))invalid();
 const items=b.items.map((value):OrderSummary=>{
  const r=record(value),id=kind==='laundry'?r.intakeId:r.orderId,stage=r.stage;
  if(typeof id!=='string'||!uuid.test(id)||typeof stage!=='string'||!source.stages.includes(stage))invalid();
  let name:Record<string,string>|null=null,category:string|null=null,money:OrderSummary['money']=null;
  if(kind==='cleaning'||kind==='laundry'){
   const n=record(r.name),values=Object.values(n);if(!values.length||!values.every(v=>typeof v==='string')||!values.some(v=>(v as string).trim()))invalid();name=n as Record<string,string>;
  }
  if(kind==='concierge'){if(typeof r.category!=='string'||!['restaurant','documents','help'].includes(r.category))invalid();category=r.category;}
  else{
   const estimate=kind==='laundry'&&r.totalMinor===null,minor=estimate?r.estimateMinor:r.totalMinor;
   if(typeof minor!=='string'||!/^(0|[1-9]\d{0,18})$/.test(minor)||BigInt(minor)>9223372036854775807n||typeof r.currency!=='string'||!['UZS','USD','EUR'].includes(r.currency))invalid();
   money={minor,currency:r.currency,label:kind==='laundry'?(estimate?'Estimate':'Quoted amount'):'Original order amount'};
  }
  return {id,kind,cursor,stage,group:stage==='cancelled'?'cancelled':stage===source.done?'completed':'active',name,category,money};
 });
 if(new Set(items.map(r=>r.id)).size!==items.length||b.nextCursor!==null&&items.at(-1)?.id!==b.nextCursor)invalid();
 return {items,nextCursor:b.nextCursor as string|null};
}
export function mergeOrderPages(previous:OrderPage,next:OrderPage):OrderPage{
 if(next.nextCursor!==null&&previous.nextCursor!==null&&next.nextCursor.toLowerCase()<=previous.nextCursor.toLowerCase())invalid();
 return {items:[...new Map([...previous.items,...next.items].map(r=>[r.kind+':'+r.id,r])).values()],nextCursor:next.nextCursor};
}
