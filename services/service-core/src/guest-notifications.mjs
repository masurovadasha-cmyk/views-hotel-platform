import {inTenantTransaction} from "./postgres.mjs";
import {publicOrderEvent} from "./guest-order-timeline.mjs";

export const notificationEventTypes=[
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

/** Read-only inbox. Projection runs in the separate worker. */
export async function listGuestNotifications(pool,{organizationId,principalId}){
 if(typeof principalId!=="string"||!principalId)throw Error("Forbidden");
 return inTenantTransaction(pool,organizationId,async db=>{
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
