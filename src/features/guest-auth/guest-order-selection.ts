import {orderPage,orderSources,type OrderKind} from './guest-order-list';
export type OrderTarget={kind:OrderKind;id:string;cursor:string|null};
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
/** A bookmark is not authorization: the existing guest route rechecks stay ownership. */
export function orderTargetRoute(reservationId:string,target:OrderTarget):string{
 if(!uuid.test(reservationId)||!Object.hasOwn(orderSources,target.kind)||!uuid.test(target.id)||
  target.cursor!==null&&(!uuid.test(target.cursor)||target.cursor.toLowerCase()>=target.id.toLowerCase()))throw Error('INVALID_ORDER_TARGET');
 return orderSources[target.kind].route+'?reservationId='+encodeURIComponent(reservationId)+(target.cursor?'&cursor='+encodeURIComponent(target.cursor):'');
}
export function selectOrder(raw:unknown,target:OrderTarget){
 const page=orderPage(target.kind,raw,target.cursor),index=page.items.findIndex(row=>row.id===target.id);
 if(index<0)throw Error('ORDER_NOT_ON_PAGE');
 return {summary:page.items[index],raw:(raw as {items:unknown[]}).items[index]};
}
