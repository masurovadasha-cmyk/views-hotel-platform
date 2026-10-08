import {request} from './LocalCoreWorkspace';
export type SupplyUnit='piece'|'gram'|'millilitre';
export type SupplyProperty={id:string;name:Record<string,string>;timezone:string};
export type SupplyItem={id:string;sku:string;name:string;unit:SupplyUnit};
export type SupplyLine={itemId:string;sku:string;name:string;unit:SupplyUnit;quantity:string;receivedQuantity:string;remainingQuantity:string};
export type SupplyOrder={id:string;reference:string;status:'ordered'|'partially_received'|'received';createdAt:string;lines:SupplyLine[]};
export type StockItem={itemId:string;sku:string;name:string;unit:SupplyUnit;quantity:string};
export type StockMovement={id:string;itemId:string;sku:string;name:string;unit:SupplyUnit;kind:'receipt'|'issue'|'adjustment';quantity:string;reference:string;createdAt:string};
export type SupplyPage<T>={items:T[];nextCursor:string|null};
export type StocktakeInput={propertyId:string;itemId:string;countedQuantity:string;reason:string};
export type StocktakePreview=StocktakeInput&{sku:string;name:string;unit:SupplyUnit;expectedQuantity:string;deltaQuantity:string;expectedRevision:string};
export type StocktakeConfirm=StocktakeInput&{expectedQuantity:string;expectedRevision:string};
export type SupplyCommand=
 |{kind:'item';key:string;body:{propertyId:string;sku:string;name:string;unit:SupplyUnit}}
 |{kind:'order';key:string;body:{propertyId:string;reference:string;lines:{itemId:string;quantity:string}[]}}
 |{kind:'receive';key:string;orderId:string;body:Record<string,never>|{lines:{itemId:string;quantity:string}[]}}
 |{kind:'stocktake';key:string;body:StocktakeConfirm}
 |{kind:'issue';key:string;body:{propertyId:string;itemId:string;quantity:string;reference:string}};
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const timezone=(value:unknown)=>{if(typeof value!=='string'||!value)return false;try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}};
const unit=(value:unknown)=>['piece','gram','millilitre'].includes(String(value));
const quantity=(value:unknown,signed=false)=>typeof value==='string'&&(signed?/^-?\d{1,19}$/:/^\d{1,19}$/).test(value)&&BigInt(value)>=-9223372036854775808n&&BigInt(value)<=9223372036854775807n;
function bad():never{throw Error('SUPPLY_INVALID_RESPONSE');}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return bad();return value as Record<string,unknown>;}
export function supplyCount(value:string):string{if(!/^(0|[1-9]\d{0,18})$/.test(value)||BigInt(value)>9223372036854775807n)throw Error('SUPPLY_QUANTITY_INVALID');return value;}
export function supplyQuantity(value:string):string{if(!/^[1-9]\d{0,18}$/.test(value)||BigInt(value)>9223372036854775807n)throw Error('SUPPLY_QUANTITY_INVALID');return value;}
export function supplyPage<T>(raw:unknown,validate:(item:T)=>boolean):SupplyPage<T>{const page=record(raw);if(!Array.isArray(page.items)||page.items.length>50||(page.nextCursor!==null&&(typeof page.nextCursor!=='string'||!/^[A-Za-z0-9_-]{1,700}$/.test(page.nextCursor)))||page.items.some(item=>!item||!validate(item as T)))return bad();return page as unknown as SupplyPage<T>;}
const named=(item:SupplyItem|StockItem|StockMovement|SupplyLine)=>typeof item.sku==='string'&&typeof item.name==='string'&&unit(item.unit);
export function supplyCommandResult(raw:unknown,command:SupplyCommand){
 const result=record(raw);if(typeof result.idempotentReplay!=='boolean')return bad();
 if(command.kind==='item'&&!uuid(result.itemId))return bad();
 if(command.kind==='order'&&(!uuid(result.orderId)||result.status!=='ordered'))return bad();
 if(command.kind==='receive'&&(result.orderId!==command.orderId||!uuid(result.receiptId)||!['partially_received','received'].includes(String(result.status))||(!command.body.lines&&result.status!=='received')))return bad();
 if(command.kind==='stocktake'&&(result.propertyId!==command.body.propertyId||result.itemId!==command.body.itemId||!uuid(result.stocktakeId)||!uuid(result.movementId)||result.quantity!==command.body.countedQuantity||result.remainingQuantity!==command.body.countedQuantity||result.deltaQuantity!==(BigInt(command.body.countedQuantity)-BigInt(command.body.expectedQuantity)).toString()))return bad();
 if(command.kind==='issue'&&(result.itemId!==command.body.itemId||result.quantity!==command.body.quantity||!uuid(result.movementId)||!quantity(result.remainingQuantity)))return bad();return result;
}
export function supplyStocktakePreview(raw:unknown,input:StocktakeInput):StocktakePreview{
 const value=record(raw);if(value.propertyId!==input.propertyId||value.itemId!==input.itemId||value.countedQuantity!==input.countedQuantity||value.reason!==input.reason||typeof value.sku!=='string'||typeof value.name!=='string'||!unit(value.unit)||!quantity(value.expectedQuantity)||!quantity(value.expectedRevision)||value.deltaQuantity!==(BigInt(input.countedQuantity)-BigInt(value.expectedQuantity as string)).toString())return bad();return value as StocktakePreview;
}
function orderValid(item:SupplyOrder){
 if(!uuid(item.id)||typeof item.reference!=='string'||!['ordered','partially_received','received'].includes(item.status)||!Number.isFinite(Date.parse(item.createdAt))||!Array.isArray(item.lines)||!item.lines.length||item.lines.length>20)return false;
 if(!item.lines.every(line=>uuid(line.itemId)&&named(line)&&quantity(line.quantity)&&BigInt(line.quantity)>0n&&quantity(line.receivedQuantity)&&quantity(line.remainingQuantity)&&BigInt(line.receivedQuantity)+BigInt(line.remainingQuantity)===BigInt(line.quantity)))return false;
 const anyReceived=item.lines.some(line=>BigInt(line.receivedQuantity)>0n),allReceived=item.lines.every(line=>line.remainingQuantity==='0');return item.status===(allReceived?'received':anyReceived?'partially_received':'ordered');
}
async function get(route:string,csrf:string,propertyId?:string,cursor?:string){const query=new URLSearchParams({...(propertyId?{propertyId}:{}),...(cursor?{cursor}:{})});return request<unknown>('supply/'+route+(query.size?'?'+query:''),csrf);}
export const supplyApi={
 async properties(csrf:string,cursor?:string){return supplyPage<SupplyProperty>(await get('properties',csrf,undefined,cursor),item=>uuid(item.id)&&!!item.name&&typeof item.name==='object'&&Object.values(item.name).every(v=>typeof v==='string')&&timezone(item.timezone));},
 async items(csrf:string,propertyId:string,cursor?:string){return supplyPage<SupplyItem>(await get('items',csrf,propertyId,cursor),item=>uuid(item.id)&&named(item));},
 async orders(csrf:string,propertyId:string,cursor?:string){return supplyPage<SupplyOrder>(await get('orders',csrf,propertyId,cursor),orderValid);},
 async stock(csrf:string,propertyId:string,cursor?:string){return supplyPage<StockItem>(await get('stock',csrf,propertyId,cursor),item=>uuid(item.itemId)&&named(item)&&quantity(item.quantity));},
 async movements(csrf:string,propertyId:string,cursor?:string){return supplyPage<StockMovement>(await get('movements',csrf,propertyId,cursor),item=>uuid(item.id)&&uuid(item.itemId)&&named(item)&&['receipt','issue','adjustment'].includes(item.kind)&&quantity(item.quantity,true)&&(item.kind==='adjustment'||(item.kind==='receipt'?BigInt(item.quantity)>0n:BigInt(item.quantity)<0n))&&typeof item.reference==='string'&&Number.isFinite(Date.parse(item.createdAt)));},
 async stocktakePreview(csrf:string,input:StocktakeInput){return supplyStocktakePreview(await request('supply/stocktake/preview',csrf,input),input);},
 async execute(csrf:string,command:SupplyCommand){const route=command.kind==='item'?'items':command.kind==='order'?'orders':command.kind==='receive'?'orders/'+encodeURIComponent(command.orderId)+'/receive':command.kind==='stocktake'?'stocktake/confirm':'stock/issue';return supplyCommandResult(await request('supply/'+route,csrf,command.body,command.key),command);}
};
