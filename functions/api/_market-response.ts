/** Fail-closed validation of Core order detail before exposing it to the browser. */
type RecordValue=Record<string,unknown>;
const record=(x:unknown):x is RecordValue=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const integer=(x:unknown,min=0)=>typeof x==="number"&&Number.isSafeInteger(x)&&x>=min;
const money=(x:unknown)=>typeof x==="string"&&/^\d{1,19}$/.test(x)&&BigInt(x)<=9223372036854775807n;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateCoreMarketDetail(payload:unknown,propertyId:string,orderId:string):boolean{
 if(!record(payload)||!record(payload.order)||!Array.isArray(payload.lines)||!Array.isArray(payload.events))return false;
 const o=payload.order;
 if(o.id!==orderId||o.property_id!==propertyId||!uuid.test(String(o.id))||!uuid.test(String(o.property_id)))return false;
 if(!["new","picking","packed","out_for_delivery","delivered","cancelled"].includes(String(o.status)))return false;
 if(!["unpaid","pending","paid","room_charge_pending","failed","refunded"].includes(String(o.payment_status)))return false;
 if(!money(o.total_minor)||!money(o.subtotal_minor)||!money(o.delivery_minor))return false;
 if(BigInt(o.total_minor as string)!==BigInt(o.subtotal_minor as string)+BigInt(o.delivery_minor as string))return false;
 if(!integer(o.version,1)||typeof o.delivery_slot!=="string"||typeof o.guest_comment!=="string")return false;
 if(typeof o.created_at!=="string"||typeof o.updated_at!=="string")return false;
 if(o.unit_id!==null&&!(typeof o.unit_id==="string"&&uuid.test(o.unit_id)))return false;
 if(payload.lines.length>250||payload.events.length>200)return false;
 let subtotal=0n;const skus=new Set<string>();
 for(const line of payload.lines){
  if(!record(line)||typeof line.sku!=="string"||!line.sku||skus.has(line.sku)
    ||typeof line.product_name_snapshot!=="string"||!integer(line.quantity,1)
    ||!money(line.unit_price_minor)||!money(line.line_total_minor))return false;
  skus.add(line.sku);
  const amount=BigInt(line.unit_price_minor as string)*BigInt(line.quantity as number);
  if(amount!==BigInt(line.line_total_minor as string))return false;
  subtotal+=amount;
 }
 if(subtotal!==BigInt(o.subtotal_minor as string))return false;
 if(payload.assignment!==null){
  const a=payload.assignment;
  if(!record(a)||typeof a.assignee_membership_id!=="string"||!uuid.test(a.assignee_membership_id)
   ||!["normal","high","urgent"].includes(String(a.priority))||typeof a.due_at!=="string"
   ||typeof a.assigned_at!=="string")return false;
 }
 for(const e of payload.events){
  if(!record(e)||typeof e.action!=="string"||!record(e.details)||typeof e.created_at!=="string")return false;
 }
 return true;
}
