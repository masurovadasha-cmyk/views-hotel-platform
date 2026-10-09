import {createHash} from "node:crypto";
/**
 * PostgreSQL transaction adapter. Pass an initialized pg.Pool; no network calls occur on import.
 * Every request's organizationId MUST be derived from authenticated server context.
 */
export async function inTenantTransaction(pool,organizationId,fn){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId))throw Error("Invalid organization");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.organization_id', $1, true)",[organizationId]);
  const result=await fn(client);
  await client.query("COMMIT");
  return result;
 }catch(error){await client.query("ROLLBACK");throw error}
 finally{client.release()}
}
export async function reserveFefo(client,{organizationId,orderId,sku,quantity,asOf}){
 if(!Number.isSafeInteger(quantity)||quantity<1)throw Error("Invalid quantity");
 if(!/^[-\w.]{1,128}$/.test(sku))throw Error("Invalid SKU");
 // Locks eligible rows in deterministic FEFO order. Caller must use a transaction.
 const result=await client.query(`SELECT id,on_hand,reserved FROM inventory_lots
 WHERE organization_id=$1 AND sku=$2 AND blocked=false
 AND (expires_at IS NULL OR expires_at > $3::date)
 AND on_hand>reserved
 ORDER BY expires_at ASC NULLS LAST,id ASC FOR UPDATE`,[organizationId,sku,asOf]);
 let remaining=quantity;const allocations=[];
 for(const lot of result.rows){
  const available=Number(lot.on_hand)-Number(lot.reserved);
  const take=Math.min(remaining,available);
  if(!take)continue;
  await client.query("UPDATE inventory_lots SET reserved=reserved+$1 WHERE id=$2 AND organization_id=$3",[take,lot.id,organizationId]);
  await client.query(`INSERT INTO inventory_reservations(organization_id,order_id,lot_id,quantity)
   VALUES ($1,$2,$3,$4)`,[organizationId,orderId,lot.id,take]);
  await client.query(`INSERT INTO stock_movements(organization_id,lot_id,order_id,movement_type,quantity)
   VALUES ($1,$2,$3,'reserve',$4)`,[organizationId,lot.id,orderId,take]);
  allocations.push({lotId:lot.id,quantity:take});remaining-=take;
  if(remaining===0)break;
 }
 if(remaining)throw Error("Insufficient inventory"); // caller rolls back all allocations
 return allocations;
}
export async function createMarketOrder(pool,{organizationId,propertyId,idempotencyKey,items,asOf,principalId,bookingId=null}){
 if(typeof principalId!=="string"||!principalId||principalId.length>256)throw Error("Forbidden");
 if(!Array.isArray(items)||items.length<1||items.some(x=>!/^[-\w.]{1,128}$/.test(x.sku)||!Number.isSafeInteger(x.quantity)||x.quantity<1))throw Error("Invalid items");
 if(typeof idempotencyKey!=="string"||idempotencyKey.length<8||idempotencyKey.length>128)throw Error("Invalid idempotency key");
 const normalized=[...items].sort((a,b)=>a.sku.localeCompare(b.sku));
 if(new Set(normalized.map(x=>x.sku)).size!==normalized.length)throw Error("Duplicate SKU");
 return inTenantTransaction(pool,organizationId,async client=>{
  let authorizedPropertyId=propertyId;
  if(bookingId!==null){
   const booking=await client.query(`SELECT property_id FROM service_guest_bookings
    WHERE organization_id=$1 AND id=$2 AND guest_principal_id=$3
    AND status='checked_in' AND starts_at<=now() AND ends_at>now() FOR SHARE`,
    [organizationId,bookingId,principalId]);
   if(booking.rowCount!==1)throw Error("Booking access denied");
   authorizedPropertyId=booking.rows[0].property_id;
  }else{
   const permission=await client.query("SELECT 1 FROM service_property_access WHERE organization_id=$1 AND property_id=$2 AND principal_id=$3 AND permission=$4 LIMIT 1",[organizationId,propertyId,principalId,"order:create"]);
   if(!permission.rowCount){
   if(!isGuest)throw Error("Forbidden");
   const stay=await client.query("SELECT 1 FROM service_guest_stays WHERE organization_id=$1 AND property_id=$2 AND principal_id=$3 AND state IN ('confirmed','checked_in') AND starts_at <= now() AND ends_at > now() LIMIT 1",[organizationId,propertyId,principalId]);
   if(!stay.rowCount)throw Error("Forbidden");
  }
  }
  const fingerprint=createHash("sha256").update(JSON.stringify({propertyId:authorizedPropertyId,bookingId,principalId,items:normalized})).digest("hex");
  // Lock per tenant/key so a concurrent retry cannot double reserve.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[organizationId+":"+idempotencyKey]);
  const existing=await client.query("SELECT id,property_id,service_type,request_fingerprint,created_by FROM service_orders WHERE organization_id=$1 AND idempotency_key=$2",[organizationId,idempotencyKey]);
  if(existing.rowCount){
   if(existing.rows[0].property_id!==authorizedPropertyId||existing.rows[0].service_type!=="market"||existing.rows[0].created_by!==principalId||existing.rows[0].request_fingerprint!==fingerprint)throw Error("Idempotency conflict");
   return {id:existing.rows[0].id,replayed:true};
  }
  // Prices are selected from the server-owned catalog and snapshotted in the same transaction.
  const priced=[];
  let subtotal=0;
  for(const item of normalized){
   const lookup=await client.query("SELECT price_uzs FROM market_catalog WHERE organization_id=$1 AND sku=$2 AND active=true",[organizationId,item.sku]);
   if(lookup.rowCount!==1)throw Error("Unavailable SKU");
   const price=Number(lookup.rows[0].price_uzs);
   if(!Number.isSafeInteger(price)||price<0)throw Error("Invalid catalog price");
   const line=price*item.quantity;
   if(!Number.isSafeInteger(line)||!Number.isSafeInteger(subtotal+line))throw Error("Price overflow");
   subtotal+=line;
   priced.push({...item,price});
  }
  const deliveryFee=15000; // Development-only configured fee, not a real commercial tariff.
  const total=subtotal+deliveryFee;
  if(!Number.isSafeInteger(total))throw Error("Price overflow");
  const created=await client.query(`INSERT INTO service_orders(organization_id,property_id,service_type,fulfillment_status,idempotency_key,request_fingerprint,created_by,delivery_fee_uzs,total_uzs,booking_id)
   VALUES ($1,$2,'market','draft',$3,$4,$5,$6,$7,$8) RETURNING id`,[organizationId,authorizedPropertyId,idempotencyKey,fingerprint,principalId,deliveryFee,total,bookingId]);
  const id=created.rows[0].id;
  for(const item of priced){
   await client.query("INSERT INTO service_order_items(organization_id,order_id,sku,quantity,unit_price_uzs) VALUES($1,$2,$3,$4,$5)",[organizationId,id,item.sku,item.quantity,item.price]);
   await reserveFefo(client,{organizationId,orderId:id,sku:item.sku,quantity:item.quantity,asOf});
  }
  await client.query(`INSERT INTO service_outbox(organization_id,aggregate_id,event_type,payload)
   VALUES($1,$2,'market.order.created',$3::jsonb)`,[organizationId,id,JSON.stringify({orderId:id,propertyId:authorizedPropertyId,bookingId})]);
  return {id,replayed:false};
 });
}
