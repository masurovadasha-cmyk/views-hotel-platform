import {inTenantTransaction} from "./postgres.mjs";
/**
 * Transition all active reservations for an order atomically.
 * release: reserved decreases; consume: both on_hand and reserved decrease.
 * Caller must authorize the actor and order ownership before invoking.
 */
export async function finalizeMarketReservations(pool,{organizationId,orderId,action}){
 if(!["release","consume"].includes(action))throw Error("Invalid inventory action");
 return inTenantTransaction(pool,organizationId,async client=>{
  const order=await client.query("SELECT id FROM service_orders WHERE id=$1 AND organization_id=$2 FOR UPDATE",[orderId,organizationId]);
  if(order.rowCount!==1)throw Error("Order not found");
  const reservations=await client.query(`SELECT id,lot_id,quantity FROM inventory_reservations
    WHERE organization_id=$1 AND order_id=$2 AND state='active' ORDER BY lot_id FOR UPDATE`,[organizationId,orderId]);
  if(!reservations.rowCount)return {processed:0,alreadyFinalized:true};
  for(const row of reservations.rows){
   const update=action==="release"
    ?"UPDATE inventory_lots SET reserved=reserved-$1 WHERE id=$2 AND organization_id=$3 AND reserved >= $1"
    :"UPDATE inventory_lots SET reserved=reserved-$1,on_hand=on_hand-$1 WHERE id=$2 AND organization_id=$3 AND reserved >= $1 AND on_hand >= $1";
   const result=await client.query(update,[row.quantity,row.lot_id,organizationId]);
   if(result.rowCount!==1)throw Error("Stock integrity violation");
   await client.query("UPDATE inventory_reservations SET state=$1 WHERE id=$2 AND organization_id=$3",[action==="release"?"released":"consumed",row.id,organizationId]);
   await client.query("INSERT INTO stock_movements(organization_id,lot_id,order_id,movement_type,quantity) VALUES ($1,$2,$3,$4,$5)",[organizationId,row.lot_id,orderId,action,row.quantity]);
  }
  await client.query("INSERT INTO service_outbox(organization_id,aggregate_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb)",[organizationId,orderId,"market.stock."+action,JSON.stringify({orderId,action})]);
  return {processed:reservations.rowCount,alreadyFinalized:false};
 });
}
