import {createHash,randomUUID} from "node:crypto";
import type {PoolClient} from "pg";
import {reserveMarketStock} from "../inventory/market-stock-transaction";

type MarketCheckoutLine={sku:string;quantity:number};
export type MarketCheckoutInput={
 organizationId:string;propertyId:string;unitId:string|null;actorUserId:string;
 idempotencyKey:string;deliverySlot:string;comment:string;lines:MarketCheckoutLine[];
};
export async function createMarketOrderInTransaction(client:Pick<PoolClient,"query">,input:MarketCheckoutInput){
 if(!input.idempotencyKey||input.idempotencyKey.length>160||!input.deliverySlot.trim()||input.deliverySlot.length>160||input.comment.length>1000)throw Error("INVALID_MARKET_CHECKOUT");
 if(!input.lines.length||input.lines.length>100)throw Error("INVALID_MARKET_LINES");
 const lines=[...input.lines].sort((a,b)=>a.sku.localeCompare(b.sku,"en"));
 if(new Set(lines.map(x=>x.sku)).size!==lines.length)throw Error("DUPLICATE_SKU");
 for(const line of lines)if(!line.sku||line.sku.length>80||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>10000)throw Error("INVALID_MARKET_QUANTITY");
 const hash=createHash("sha256").update(JSON.stringify({propertyId:input.propertyId,unitId:input.unitId,deliverySlot:input.deliverySlot,comment:input.comment,lines})).digest("hex");
 // Serialize identical keys, including when the order has not been inserted yet.
 await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[input.organizationId+":"+input.idempotencyKey]);
 const existing=await client.query<{id:string;request_hash:string;status:string}>(
  "SELECT id,request_hash,status FROM market_service_orders WHERE organization_id=$1 AND idempotency_key=$2",
  [input.organizationId,input.idempotencyKey]
 );
 if(existing.rows[0]){
  if(existing.rows[0].request_hash!==hash)throw Error("MARKET_IDEMPOTENCY_CONFLICT");
  return {orderId:existing.rows[0].id,status:existing.rows[0].status,idempotentReplay:true};
 }
 const scoped=await client.query<{allowed:boolean}>(
  "SELECT app.can_access_property($1::uuid) AS allowed",[input.propertyId]
 );
 if(!scoped.rows[0]?.allowed)throw Error("MARKET_PROPERTY_FORBIDDEN");
 // This is an internal staff checkout primitive only. Guest identity and payment
 // authorization require a separate reviewed endpoint.
 const id=randomUUID();
 const products=[] as {sku:string;quantity:number;name:string;priceMinor:bigint}[];
 let subtotal=0n;
 for(const line of lines){
  const p=await client.query<{sku:string;name:string;price_minor:string}>(
   `SELECT sku,name,price_minor::text FROM market_catalog_prices
     WHERE organization_id=$1 AND property_id=$2 AND sku=$3 AND active=true`,
   [input.organizationId,input.propertyId,line.sku]
  );
  const row=p.rows[0];if(!row)throw Error("MARKET_PRICE_NOT_FOUND");
  const price=BigInt(row.price_minor);
  if(price<0n)throw Error("MARKET_INVALID_PRICE");
  subtotal+=price*BigInt(line.quantity);
  if(subtotal>9223372036854775807n)throw Error("MARKET_TOTAL_OVERFLOW");
  products.push({sku:line.sku,quantity:line.quantity,name:row.name,priceMinor:price});
 }
 await client.query(
  `INSERT INTO market_service_orders(
    id,organization_id,property_id,unit_id,actor_user_id,idempotency_key,request_hash,
    status,payment_status,subtotal_minor,delivery_minor,delivery_slot,guest_comment)
    VALUES($1,$2,$3,$4,$5,$6,$7,'new','unpaid',$8,0,$9,$10)`,
  [id,input.organizationId,input.propertyId,input.unitId,input.actorUserId,input.idempotencyKey,hash,subtotal.toString(),input.deliverySlot,input.comment]
 );
 for(const p of products){
  await client.query(
   `INSERT INTO market_service_order_lines(organization_id,order_id,sku,product_name_snapshot,quantity,unit_price_minor)
     VALUES($1,$2,$3,$4,$5,$6)`,
   [input.organizationId,id,p.sku,p.name,p.quantity,p.priceMinor.toString()]
  );
 }
 await reserveMarketStock(client,{organizationId:input.organizationId,propertyId:input.propertyId,orderId:id,lines});
 await client.query(
  `INSERT INTO market_service_events(organization_id,order_id,action,details)
    VALUES($1,$2,'created',$3::jsonb)`,
  [input.organizationId,id,JSON.stringify({lineCount:products.length})]
 );
 return {orderId:id,status:"new",idempotentReplay:false,totalMinor:subtotal.toString()};
}
