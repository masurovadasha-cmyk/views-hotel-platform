/**
 * VIEWS Staff CRM server-read adapter (opt-in; requires deployed trusted same-origin gateway).
 * NEVER call /v1/internal/market from a browser or put signed service keys in web bundles.
 */
export type StaffOrderHeader={
 id:string;property_id:string;unit_id:string|null;status:string;payment_status:string;
 total_minor:string;subtotal_minor:string;delivery_minor:string;delivery_slot:string;
 guest_comment:string;version:number;created_at:string;updated_at:string;
};
export type StaffOrderDetail={
 order:StaffOrderHeader;
 lines:{sku:string;product_name_snapshot:string;quantity:number;unit_price_minor:string;line_total_minor:string}[];
 assignment:{assignee_membership_id:string;priority:"normal"|"high"|"urgent";due_at:string;assigned_at:string}|null;
 events:{id:string|number;action:string;details:Record<string,unknown>;actor_membership_id:string|null;created_at:string}[];
};
export class StaffGatewayError extends Error{
 constructor(readonly status:number,code:string){super(code);this.name="StaffGatewayError"}
}
const LOCAL_PROPERTY=/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const amount=(value:unknown)=>typeof value==="string"&&/^\d+$/.test(value)&&BigInt(value)<=9223372036854775807n;
function object(x:unknown):x is Record<string,unknown>{return x!==null&&typeof x==="object"&&!Array.isArray(x)}
export function parseStaffOrderDetail(data:unknown):StaffOrderDetail{
 if(!object(data)||!object(data.order)||!Array.isArray(data.lines)||!Array.isArray(data.events))throw new StaffGatewayError(502,"INVALID_STAFF_RESPONSE");
 const o=data.order;
 if(typeof o.id!=="string"||!UUID.test(o.id)||typeof o.property_id!=="string"||!UUID.test(o.property_id)
   ||typeof o.status!=="string"||typeof o.payment_status!=="string"||!amount(o.total_minor)
   ||!amount(o.subtotal_minor)||!amount(o.delivery_minor)||typeof o.delivery_slot!=="string"
   ||typeof o.guest_comment!=="string"||!Number.isSafeInteger(o.version)||Number(o.version)<1
   ||typeof o.created_at!=="string"||typeof o.updated_at!=="string"
   ||!(o.unit_id===null||typeof o.unit_id==="string"&&UUID.test(o.unit_id)))throw new StaffGatewayError(502,"INVALID_STAFF_RESPONSE");
 if(BigInt(o.total_minor as string)!==BigInt(o.subtotal_minor as string)+BigInt(o.delivery_minor as string))throw new StaffGatewayError(502,"INVALID_STAFF_RESPONSE");
 for(const l of data.lines){
   if(!object(l)||typeof l.sku!=="string"||typeof l.product_name_snapshot!=="string"
      ||!Number.isSafeInteger(l.quantity)||Number(l.quantity)<1
      ||!amount(l.unit_price_minor)||!amount(l.line_total_minor)
      ||BigInt(l.line_total_minor as string)!==BigInt(l.unit_price_minor as string)*BigInt(l.quantity as number))
     throw new StaffGatewayError(502,"INVALID_STAFF_RESPONSE");
 }
 if(data.events.length>200||data.events.some(e=>!object(e)||typeof e.action!=="string"||typeof e.created_at!=="string"||!object(e.details)))
   throw new StaffGatewayError(502,"INVALID_STAFF_RESPONSE");
 if(data.assignment!==null&&(!object(data.assignment)||!["normal","high","urgent"].includes(String(data.assignment.priority))
    ||typeof data.assignment.assignee_membership_id!=="string"||typeof data.assignment.due_at!=="string"))
   throw new StaffGatewayError(502,"INVALID_STAFF_RESPONSE");
 return data as unknown as StaffOrderDetail;
}
export async function fetchStaffOrderDetail(
 propertyId:string,orderId:string,
 options:{gatewayEnabled:boolean;fetcher:typeof fetch;signal?:AbortSignal}
):Promise<StaffOrderDetail>{
 if(!options.gatewayEnabled)throw new StaffGatewayError(503,"STAFF_GATEWAY_NOT_CONFIGURED");
 if(!LOCAL_PROPERTY.test(propertyId)||!UUID.test(orderId))throw new StaffGatewayError(400,"INVALID_ORDER_ID");
 // The gateway must authenticate the staff session and sign requests to the
 // internal API server-side. Browser supplies no trusted actor or service headers.
 const path="/api/staff/market/properties/"+encodeURIComponent(propertyId)+"/orders/"+encodeURIComponent(orderId);
 const response=await options.fetcher(path,{method:"GET",credentials:"same-origin",cache:"no-store",signal:options.signal,headers:{"Accept":"application/json"}});
 if(!response.ok)throw new StaffGatewayError(response.status,response.status===403?"STAFF_FORBIDDEN":response.status===404?"ORDER_NOT_FOUND":"STAFF_REQUEST_FAILED");
 return parseStaffOrderDetail(await response.json());
}
