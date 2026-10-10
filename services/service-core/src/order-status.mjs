import {inTenantTransaction} from "./postgres.mjs";
import {canTransition} from "./domain.mjs";

export async function changeOrderStatus(pool,{organizationId,orderId,actorId,nextStatus}){
 if(typeof actorId!=="string"||!actorId)throw Error("Forbidden");
 return inTenantTransaction(pool,organizationId,async db=>{
  const found=await db.query("SELECT property_id,fulfillment_status FROM service_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE",[organizationId,orderId]);
  if(!found.rowCount)throw Error("Not found");
  const order=found.rows[0];
  const access=await db.query("SELECT 1 FROM service_property_access WHERE organization_id=$1 AND property_id=$2 AND principal_id=$3 AND permission='order:manage'",[organizationId,order.property_id,actorId]);
  if(!access.rowCount)throw Error("Forbidden");
  if(!canTransition(order.fulfillment_status,nextStatus))throw Error("Invalid transition");
  if(nextStatus==="completed"||nextStatus==="cancelled"){
   const reservations=await db.query("SELECT id,lot_id,quantity FROM inventory_reservations WHERE organization_id=$1 AND order_id=$2 AND state='active' ORDER BY lot_id FOR UPDATE",[organizationId,orderId]);
   for(const item of reservations.rows){
    const consume=nextStatus==="completed";
    const sql=consume
     ?"UPDATE inventory_lots SET reserved=reserved-$1,on_hand=on_hand-$1 WHERE organization_id=$2 AND id=$3 AND reserved >= $1 AND on_hand >= $1"
     :"UPDATE inventory_lots SET reserved=reserved-$1 WHERE organization_id=$2 AND id=$3 AND reserved >= $1";
    const updated=await db.query(sql,[item.quantity,organizationId,item.lot_id]);
    if(updated.rowCount!==1)throw Error("Inventory consistency error");
    await db.query("UPDATE inventory_reservations SET state=$1 WHERE organization_id=$2 AND id=$3",[consume?"consumed":"released",organizationId,item.id]);
    await db.query("INSERT INTO stock_movements(organization_id,lot_id,order_id,movement_type,quantity) VALUES($1,$2,$3,$4,$5)",[organizationId,item.lot_id,orderId,consume?"consume":"release",item.quantity]);
   }
  }
  if(nextStatus==="cancelled"){
   await db.query("UPDATE service_dispatch_tasks SET status='cancelled',updated_at=now() WHERE organization_id=$1 AND order_id=$2 AND status IN ('unassigned','assigned','in_progress')",[organizationId,orderId]);
  }
  await db.query("UPDATE service_orders SET fulfillment_status=$1 WHERE organization_id=$2 AND id=$3",[nextStatus,organizationId,orderId]);
  await db.query("INSERT INTO service_order_audit(organization_id,order_id,actor_id,previous_status,next_status) VALUES($1,$2,$3,$4,$5)",[organizationId,orderId,actorId,order.fulfillment_status,nextStatus]);
  await db.query("INSERT INTO service_outbox(organization_id,aggregate_id,event_type,payload) VALUES($1,$2,'service.order.changed',$3::jsonb)",[organizationId,orderId,JSON.stringify({orderId,from:order.fulfillment_status,to:nextStatus})]);
  return {id:orderId,fulfillmentStatus:nextStatus};
 });
}
