import {orderPage,orderSources,type OrderKind} from './guest-order-list';
export type OrderTarget={kind:OrderKind;id:string;cursor:string|null};
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
/** Pagination bookmarks are retained for lists only; the detail route rechecks stay ownership. */
export function orderTargetRoute(reservationId:string,target:OrderTarget):string{
 if(!uuid.test(reservationId)||!Object.hasOwn(orderSources,target.kind)||!uuid.test(target.id))throw Error('INVALID_ORDER_TARGET');
 return 'services/details/'+target.kind+'/'+encodeURIComponent(target.id)+'?reservationId='+encodeURIComponent(reservationId);
}
export function selectOrder(raw:unknown,target:OrderTarget){
 const page=orderPage(target.kind,raw);
 if(page.items.length!==1||page.nextCursor!==null||page.items[0].id!==target.id)throw Error('INVALID_ORDER_DETAIL');
 return {summary:page.items[0],raw:(raw as {items:unknown[]}).items[0]};
}
