import {inTenantTransaction} from "./postgres.mjs";
import {publicOrderEvent} from "./guest-order-timeline.mjs";

const allowedTypes=[
 "market.order.created","service.order.changed","service.task.assigned",
 "service.task.status_changed","cleaning.task.completed","laundry.bag.changed"
];
const statuses=new Set(["draft","awaiting_payment","confirmed","assigned","in_progress","completed","cancelled"]);
const taskStatuses=new Set(["unassigned","assigned","in_progress","completed","cancelled"]);
const laundryStatuses=new Set(["registered","collected","processing","ready","returned","cancelled"]);

export function notificationMessage(row){
 const event=publicOrderEvent(row);
 if(!event)return null;
 switch(event.type){
  case "market.order.created":return "Заказ минимаркета создан";
  case "service.order.changed":return statuses.has(event.status)?"Статус заказа: "+event.status:null;
  case "service.task.assigned":return event.taskKind==="market_deliver"?"Назначена доставка":event.taskKind==="market_pick"?"Заказ передан на сборку":null;
  case "service.task.status_changed":return taskStatuses.has(event.taskStatus)?"Статус задания: "+event.taskStatus:null;
  case "cleaning.task.completed":return "Уборка завершена";
  case "laundry.bag.changed":return laundryStatuses.has(event.laundryStatus)?"Статус прачечной: "+event.laundryStatus:null;
  default:return null;
 }
}

/**
 * Project eligible outbox events on inbox read. Unique source event ID makes
 * retries safe. This is not a push worker or an external delivery queue.
 */
export async function listGuestNotifications(pool,{organizationId,principalId}){
 if(typeof principalId!=="string"||!principalId)throw Error("Forbidden");
 return inTenantTransaction(pool,organizationId,async db=>{
  const source=await db.query(
   `SELECT e.id,e.aggregate_id,e.event_type,e.payload,e.created_at
      FROM service_outbox e
      JOIN service_orders o ON o.id=e.aggregate_id AND o.organization_id=e.organization_id
      WHERE e.organization_id=$1 AND o.created_by=$2 AND e.event_type=ANY($3::text[])
      ORDER BY e.created_at DESC,e.id DESC LIMIT 200`,
   [organizationId,principalId,allowedTypes]);
  for(const event of source.rows){
   const message=notificationMessage(event);
   if(!message)continue;
   await db.query(
    `INSERT INTO service_guest_notifications
       (organization_id,guest_principal_id,order_id,source_event_id,event_type,message,occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(organization_id,guest_principal_id,source_event_id) DO NOTHING`,
    [organizationId,principalId,event.aggregate_id,event.id,event.event_type,message,event.created_at]);
  }
  const rows=await db.query(
   `SELECT id,order_id,event_type,message,occurred_at,read_at
      FROM service_guest_notifications
      WHERE organization_id=$1 AND guest_principal_id=$2
      ORDER BY occurred_at DESC,id DESC LIMIT 50`,
   [organizationId,principalId]);
  return rows.rows;
 });
}
export async function markGuestNotificationRead(pool,{organizationId,principalId,notificationId}){
 if(typeof principalId!=="string"||!principalId)throw Error("Forbidden");
 return inTenantTransaction(pool,organizationId,async db=>{
  const changed=await db.query(
   `UPDATE service_guest_notifications SET read_at=COALESCE(read_at,now())
      WHERE organization_id=$1 AND guest_principal_id=$2 AND id=$3
      RETURNING id,read_at`,
   [organizationId,principalId,notificationId]);
  if(!changed.rowCount)throw Error("Not found");
  return changed.rows[0];
 });
}
