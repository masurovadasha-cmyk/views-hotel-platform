import {inTenantTransaction} from "./postgres.mjs";
import {canMoveLaundry,validateChecklist,canCompleteCleaning} from "./service-workflows.mjs";

async function loadTask(db,organizationId,taskId){
 const found=await db.query("SELECT id,order_id,property_id,task_kind,assigned_principal_id,status FROM service_dispatch_tasks WHERE organization_id=$1 AND id=$2 FOR UPDATE",[organizationId,taskId]);
 if(!found.rowCount)throw Error("Not found");
 return found.rows[0];
}
async function canManage(db,organizationId,propertyId,actorId){
 const grant=await db.query("SELECT 1 FROM service_property_access WHERE organization_id=$1 AND property_id=$2 AND principal_id=$3 AND permission='order:manage'",[organizationId,propertyId,actorId]);
 return grant.rowCount>0;
}
export async function initializeCleaningChecklist(pool,{organizationId,taskId,actorId,items}){
 validateChecklist(items);
 return inTenantTransaction(pool,organizationId,async db=>{
  const task=await loadTask(db,organizationId,taskId);
  if(task.task_kind!=="cleaning"||!["unassigned","assigned"].includes(task.status))throw Error("Checklist not editable");
  if(!await canManage(db,organizationId,task.property_id,actorId))throw Error("Forbidden");
  const existing=await db.query("SELECT 1 FROM service_cleaning_checklist_items WHERE organization_id=$1 AND task_id=$2 LIMIT 1",[organizationId,taskId]);
  if(existing.rowCount)throw Error("Checklist already initialized");
  for(const item of items)await db.query("INSERT INTO service_cleaning_checklist_items(organization_id,task_id,item_code,label) VALUES($1,$2,$3,$4)",[organizationId,taskId,item.code,item.label.trim()]);
  return {taskId,itemCount:items.length};
 });
}
export async function completeCleaningItem(pool,{organizationId,taskId,actorId,itemCode}){
 if(typeof itemCode!=="string"||!itemCode)throw Error("Invalid checklist item");
 return inTenantTransaction(pool,organizationId,async db=>{
  const task=await loadTask(db,organizationId,taskId);
  if(task.task_kind!=="cleaning"||task.status!=="in_progress"||task.assigned_principal_id!==actorId)throw Error("Forbidden");
  const changed=await db.query("UPDATE service_cleaning_checklist_items SET completed_at=now(),completed_by=$1 WHERE organization_id=$2 AND task_id=$3 AND item_code=$4 AND completed_at IS NULL RETURNING id",[actorId,organizationId,taskId,itemCode]);
  if(changed.rowCount!==1)throw Error("Checklist item not available");
  await db.query("INSERT INTO service_outbox(organization_id,aggregate_id,event_type,payload) VALUES($1,$2,'cleaning.item.completed',$3::jsonb)",[organizationId,task.order_id,JSON.stringify({taskId,itemCode,actorId})]);
  return {taskId,itemCode,completed:true};
 });
}
export async function finalizeCleaningTask(pool,{organizationId,taskId,actorId}){
 return inTenantTransaction(pool,organizationId,async db=>{
  const task=await loadTask(db,organizationId,taskId);
  if(task.task_kind!=="cleaning"||task.status!=="in_progress"||task.assigned_principal_id!==actorId)throw Error("Forbidden");
  const items=(await db.query("SELECT completed_at AS \"completedAt\",completed_by AS \"completedBy\" FROM service_cleaning_checklist_items WHERE organization_id=$1 AND task_id=$2 FOR UPDATE",[organizationId,taskId])).rows;
  if(!canCompleteCleaning(items))throw Error("Checklist incomplete");
  await db.query("UPDATE service_dispatch_tasks SET status='completed',updated_at=now() WHERE organization_id=$1 AND id=$2",[organizationId,taskId]);
  await db.query("INSERT INTO service_outbox(organization_id,aggregate_id,event_type,payload) VALUES($1,$2,'cleaning.task.completed',$3::jsonb)",[organizationId,task.order_id,JSON.stringify({taskId,actorId})]);
  return {taskId,status:"completed"};
 });
}
export async function registerLaundryBag(pool,{organizationId,orderId,actorId,bagCode,itemCount,conditionNotes=""}){
 if(typeof bagCode!=="string"||!/^[A-Za-z0-9_-]{4,64}$/.test(bagCode)||!Number.isSafeInteger(itemCount)||itemCount<1||itemCount>1000||typeof conditionNotes!=="string"||conditionNotes.length>1000)throw Error("Invalid laundry bag");
 return inTenantTransaction(pool,organizationId,async db=>{
  const found=await db.query("SELECT id,property_id,service_type,fulfillment_status FROM service_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE",[organizationId,orderId]);
  if(!found.rowCount)throw Error("Not found");
  const order=found.rows[0];
  if(order.service_type!=="laundry"||["cancelled","completed"].includes(order.fulfillment_status))throw Error("Order not eligible");
  if(!await canManage(db,organizationId,order.property_id,actorId))throw Error("Forbidden");
  const inserted=await db.query("INSERT INTO service_laundry_bags(organization_id,order_id,bag_code,item_count,condition_notes) VALUES($1,$2,$3,$4,$5) RETURNING id",[organizationId,orderId,bagCode,itemCount,conditionNotes]);
  const bagId=inserted.rows[0].id;
  await db.query("INSERT INTO service_laundry_bag_events(organization_id,bag_id,actor_id,from_status,to_status) VALUES($1,$2,$3,NULL,'registered')",[organizationId,bagId,actorId]);
  return {id:bagId,orderId,status:"registered",itemCount};
 });
}
export async function transitionLaundryBag(pool,{organizationId,bagId,actorId,nextStatus}){
 if(typeof actorId!=="string"||!actorId)throw Error("Forbidden");
 return inTenantTransaction(pool,organizationId,async db=>{
  const found=await db.query("SELECT b.id,b.order_id,b.status,o.property_id FROM service_laundry_bags b JOIN service_orders o ON o.id=b.order_id AND o.organization_id=b.organization_id WHERE b.organization_id=$1 AND b.id=$2 FOR UPDATE OF b",[organizationId,bagId]);
  if(!found.rowCount)throw Error("Not found");
  const bag=found.rows[0];
  const manager=await canManage(db,organizationId,bag.property_id,actorId);
  const assigned=await db.query("SELECT 1 FROM service_dispatch_tasks WHERE organization_id=$1 AND order_id=$2 AND property_id=$3 AND assigned_principal_id=$4 AND task_kind IN ('laundry_pickup','laundry_process','laundry_return') AND status IN ('assigned','in_progress') LIMIT 1",[organizationId,bag.order_id,bag.property_id,actorId]);
  if(!manager&&!assigned.rowCount)throw Error("Forbidden");
  if(!canMoveLaundry(bag.status,nextStatus))throw Error("Invalid laundry transition");
  await db.query("UPDATE service_laundry_bags SET status=$1,received_by=CASE WHEN $1='collected' THEN $2 ELSE received_by END,returned_by=CASE WHEN $1='returned' THEN $2 ELSE returned_by END WHERE organization_id=$3 AND id=$4",[nextStatus,actorId,organizationId,bagId]);
  await db.query("INSERT INTO service_laundry_bag_events(organization_id,bag_id,actor_id,from_status,to_status) VALUES($1,$2,$3,$4,$5)",[organizationId,bagId,actorId,bag.status,nextStatus]);
  await db.query("INSERT INTO service_outbox(organization_id,aggregate_id,event_type,payload) VALUES($1,$2,'laundry.bag.changed',$3::jsonb)",[organizationId,bag.order_id,JSON.stringify({bagId,from:bag.status,to:nextStatus,actorId})]);
  return {id:bagId,status:nextStatus};
 });
}
