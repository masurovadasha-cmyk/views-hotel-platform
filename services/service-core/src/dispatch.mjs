import {inTenantTransaction} from "./postgres.mjs";

const marketKinds=new Set(["market_pick","market_deliver"]);
export async function assignMarketTask(pool,{organizationId,orderId,actorId,assigneeId,kind="market_pick",dueAt=null}){
 if(typeof actorId!=="string"||!actorId||typeof assigneeId!=="string"||!assigneeId)throw Error("Forbidden");
 if(!marketKinds.has(kind))throw Error("Unsupported task kind");
 if(dueAt!==null&&(!Number.isFinite(new Date(dueAt).getTime())))throw Error("Invalid due date");
 return inTenantTransaction(pool,organizationId,async db=>{
  const result=await db.query("SELECT id,property_id,service_type,fulfillment_status FROM service_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE",[organizationId,orderId]);
  if(!result.rowCount)throw Error("Not found");
  const order=result.rows[0];
  if(order.service_type!=="market"||["completed","cancelled"].includes(order.fulfillment_status))throw Error("Order not assignable");
  const access=await db.query("SELECT 1 FROM service_property_access WHERE organization_id=$1 AND property_id=$2 AND principal_id=$3 AND permission='order:manage'",[organizationId,order.property_id,actorId]);
  if(!access.rowCount)throw Error("Forbidden");
  const eligible=await db.query("SELECT 1 FROM service_task_assignees WHERE organization_id=$1 AND property_id=$2 AND principal_id=$3 AND active=true",[organizationId,order.property_id,assigneeId]);
  if(!eligible.rowCount)throw Error("Assignee unavailable");
  const existing=await db.query("SELECT id,status,assigned_principal_id FROM service_dispatch_tasks WHERE organization_id=$1 AND order_id=$2 AND task_kind=$3 FOR UPDATE",[organizationId,orderId,kind]);
  let taskId;
  if(existing.rowCount){
   const task=existing.rows[0];
   if(["completed","cancelled"].includes(task.status))throw Error("Task already closed");
   if(task.status==="in_progress")throw Error("Task already in progress");
   const updated=await db.query("UPDATE service_dispatch_tasks SET assigned_principal_id=$1,status='assigned',due_at=$2,updated_at=now() WHERE id=$3 AND organization_id=$4 RETURNING id",[assigneeId,dueAt,task.id,organizationId]);
   taskId=updated.rows[0].id;
  }else{
   const inserted=await db.query("INSERT INTO service_dispatch_tasks(organization_id,order_id,property_id,task_kind,assigned_principal_id,status,due_at) VALUES($1,$2,$3,$4,$5,'assigned',$6) RETURNING id",[organizationId,orderId,order.property_id,kind,assigneeId,dueAt]);
   taskId=inserted.rows[0].id;
  }
  await db.query("INSERT INTO service_outbox(organization_id,aggregate_id,event_type,payload) VALUES($1,$2,'service.task.assigned',$3::jsonb)",[organizationId,orderId,JSON.stringify({taskId,orderId,kind,assigneeId})]);
  return {id:taskId,orderId,kind,assigneeId,status:"assigned"};
 });
}

export async function updateAssignedTask(pool,{organizationId,taskId,actorId,nextStatus}){
 if(typeof actorId!=="string"||!actorId||!["in_progress","completed"].includes(nextStatus))throw Error("Invalid task transition");
 return inTenantTransaction(pool,organizationId,async db=>{
  const found=await db.query("SELECT id,order_id,property_id,assigned_principal_id,status FROM service_dispatch_tasks WHERE organization_id=$1 AND id=$2 FOR UPDATE",[organizationId,taskId]);
  if(!found.rowCount)throw Error("Not found");
  const task=found.rows[0];
  if(task.assigned_principal_id!==actorId)throw Error("Forbidden");
  const active=await db.query("SELECT 1 FROM service_task_assignees WHERE organization_id=$1 AND property_id=$2 AND principal_id=$3 AND active=true",[organizationId,task.property_id,actorId]);
  if(!active.rowCount)throw Error("Forbidden");
  if(!((task.status==="assigned"&&nextStatus==="in_progress")||(task.status==="in_progress"&&nextStatus==="completed")))throw Error("Invalid task transition");
  await db.query("UPDATE service_dispatch_tasks SET status=$1,updated_at=now() WHERE organization_id=$2 AND id=$3",[nextStatus,organizationId,taskId]);
  await db.query("INSERT INTO service_outbox(organization_id,aggregate_id,event_type,payload) VALUES($1,$2,'service.task.status_changed',$3::jsonb)",[organizationId,task.order_id,JSON.stringify({taskId,orderId:task.order_id,from:task.status,to:nextStatus,actorId})]);
  return {id:taskId,status:nextStatus};
 });
}
