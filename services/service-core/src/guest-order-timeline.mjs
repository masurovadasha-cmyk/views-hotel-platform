import {inTenantTransaction} from "./postgres.mjs";

const allowedEvents=new Set([
 "market.order.created",
 "service.order.changed",
 "service.task.assigned",
 "service.task.status_changed",
 "cleaning.task.completed",
 "laundry.bag.changed"
]);

export function publicOrderEvent(row){
 if(!allowedEvents.has(row.event_type))return null;
 const payload=row.payload&&typeof row.payload==="object"?row.payload:{};
 const event={id:row.id,type:row.event_type,at:row.created_at};
 if(row.event_type==="service.order.changed"&&typeof payload.to==="string")event.status=payload.to;
 if(row.event_type==="service.task.assigned"&&["market_pick","market_deliver"].includes(payload.kind))event.taskKind=payload.kind;
 if(row.event_type==="service.task.status_changed"&&typeof payload.to==="string")event.taskStatus=payload.to;
 if(row.event_type==="laundry.bag.changed"&&typeof payload.to==="string")event.laundryStatus=payload.to;
 return event;
}

/**
 * Read-only timeline for an authenticated guest. Never expose raw outbox payload:
 * it may contain employee identifiers and operational metadata.
 */
export async function getGuestOrderTimeline(pool,{organizationId,orderId,principalId}){
 if(typeof principalId!=="string"||!principalId)throw Error("Forbidden");
 return inTenantTransaction(pool,organizationId,async db=>{
  const owned=await db.query(
   "SELECT 1 FROM service_orders WHERE organization_id=$1 AND id=$2 AND created_by=$3",
   [organizationId,orderId,principalId]);
  if(!owned.rowCount)throw Error("Not found");
  const rows=await db.query(
   "SELECT id,event_type,payload,created_at FROM service_outbox WHERE organization_id=$1 AND aggregate_id=$2 AND event_type=ANY($3::text[]) ORDER BY created_at DESC,id DESC LIMIT 100",
   [organizationId,orderId,[...allowedEvents]]);
  return rows.rows.reverse().map(publicOrderEvent).filter(Boolean);
 });
}
