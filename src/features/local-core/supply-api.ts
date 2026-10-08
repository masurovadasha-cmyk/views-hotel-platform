import {request} from './LocalCoreWorkspace';
export type SupplyUnit='piece'|'gram'|'millilitre';
export type SupplyProperty={id:string;name:Record<string,string>;timezone:string};
export type SupplyItem={id:string;sku:string;name:string;unit:SupplyUnit};
export type SupplyLine={itemId:string;sku:string;name:string;unit:SupplyUnit;quantity:string};
export type SupplyOrder={id:string;reference:string;status:'ordered'|'received';createdAt:string;lines:SupplyLine[]};
export type StockItem={itemId:string;sku:string;name:string;unit:SupplyUnit;quantity:string};
export type StockMovement={id:string;itemId:string;sku:string;name:string;unit:SupplyUnit;kind:'receipt'|'issue';quantity:string;reference:string;createdAt:string};
export type SupplyPage<T>={items:T[];nextCursor:string|null};
export type SupplyCommand=
 |{kind:'item';key:string;body:{propertyId:string;sku:string;name:string;unit:SupplyUnit}}
 |{kind:'order';key:string;body:{propertyId:string;reference:string;lines:{itemId:string;quantity:string}[]}}
 |{kind:'receive';key:string;orderId:string;body:Record<string,never>}
 |{kind:'issue';key:string;body:{propertyId:string;itemId:string;quantity:string;reference:string}};
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const timezone=(value:unknown)=>{if(typeof value!=='string'||!value)return false;try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}};
const unit=(value:unknown)=>['piece','gram','millilitre'].includes(String(value));
const quantity=(value:unknown,signed=false)=>typeof value==='string'&&(signed?/^-?\d{1,19}$/:/^\d{1,19}$/).test(value)&&BigInt(value)>=-9223372036854775808n&&BigInt(value)<=9223372036854775807n;
function bad():never{throw Error('SUPPLY_INVALID_RESPONSE');}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return bad();return value as Record<string,unknown>;}
export function supplyQuantity(value:string):string{if(!/^[1-9]\d{0,18}$/.test(value)||BigInt(value)>9223372036854775807n)throw Error('SUPPLY_QUANTITY_INVALID');return value;}
export function supplyPage<T>(raw:unknown,validate:(item:T)=>boolean):SupplyPage<T>{const page=record(raw);if(!Array.isArray(page.items)||page.items.length>50||(page.nextCursor!==null&&(typeof page.nextCursor!=='string'||!/^[A-Za-z0-9_-]{1,700}$/.test(page.nextCursor)))||page.items.some(item=>!item||!validate(item as T)))return bad();return page as unknown as SupplyPage<T>;}
const named=(item:SupplyItem|StockItem|StockMovement|SupplyLine)=>typeof item.sku==='string'&&typeof item.name==='string'&&unit(item.unit);
export function supplyCommandResult(raw:unknown,command:SupplyCommand){
 const result=record(raw);if(typeof result.idempotentReplay!=='boolean')return bad();
 if(command.kind==='item'&&!uuid(result.itemId))return bad();
 if(command.kind==='order'&&(!uuid(result.orderId)||result.status!=='ordered'))return bad();
 if(command.kind==='receive'&&(result.orderId!==command.orderId||!uuid(result.receiptId)||result.status!=='received'))return bad();
 if(command.kind==='issue'&&(result.itemId!==command.body.itemId||result.quantity!==command.body.quantity||!uuid(result.movementId)||!quantity(result.remainingQuantity)))return bad();return result;
}
async function get(route:string,csrf:string,propertyId?:string,cursor?:string){const query=new URLSearchParams({...(propertyId?{propertyId}:{}),...(cursor?{cursor}:{})});return request<unknown>('supply/'+route+(query.size?'?'+query:''),csrf);}
export const supplyApi={
 async properties(csrf:string,cursor?:string){return supplyPage<SupplyProperty>(await get('properties',csrf,undefined,cursor),item=>uuid(item.id)&&!!item.name&&typeof item.name==='object'&&Object.values(item.name).every(v=>typeof v==='string')&&timezone(item.timezone));},
 async items(csrf:string,propertyId:string,cursor?:string){return supplyPage<SupplyItem>(await get('items',csrf,propertyId,cursor),item=>uuid(item.id)&&named(item));},
 async orders(csrf:string,propertyId:string,cursor?:string){return supplyPage<SupplyOrder>(await get('orders',csrf,propertyId,cursor),item=>uuid(item.id)&&typeof item.reference==='string'&&['ordered','received'].includes(item.status)&&Number.isFinite(Date.parse(item.createdAt))&&Array.isArray(item.lines)&&item.lines.length>0&&item.lines.length<=20&&item.lines.every(line=>uuid(line.itemId)&&named(line)&&quantity(line.quantity)&&BigInt(line.quantity)>0n));},
 async stock(csrf:string,propertyId:string,cursor?:string){return supplyPage<StockItem>(await get('stock',csrf,propertyId,cursor),item=>uuid(item.itemId)&&named(item)&&quantity(item.quantity));},
 async movements(csrf:string,propertyId:string,cursor?:string){return supplyPage<StockMovement>(await get('movements',csrf,propertyId,cursor),item=>uuid(item.id)&&uuid(item.itemId)&&named(item)&&['receipt','issue'].includes(item.kind)&&quantity(item.quantity,true)&&BigInt(item.quantity)!==0n&&((item.kind==='receipt')===(BigInt(item.quantity)>0n))&&typeof item.reference==='string'&&Number.isFinite(Date.parse(item.createdAt)));},
 async execute(csrf:string,command:SupplyCommand){const route=command.kind==='item'?'items':command.kind==='order'?'orders':command.kind==='receive'?'orders/'+encodeURIComponent(command.orderId)+'/receive':'stock/issue';return supplyCommandResult(await request('supply/'+route,csrf,command.body,command.key),command);}
};
