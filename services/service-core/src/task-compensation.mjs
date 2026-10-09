import {inTenantTransaction} from "./postgres.mjs";
export function validateAccrualAmount(amountUzs){
 if(!Number.isSafeInteger(amountUzs)||amountUzs<0||amountUzs>1000000000)throw Error("Invalid accrual amount");
 return amountUzs;
}
export async function accrueTaskCompensation(pool,{organizationId,taskId,actorId,amountUzs}){
 validateAccrualAmount(amountUzs);
 if(typeof actorId!=="string"||!actorId)throw Error("Forbidden");
 return inTenantTransaction(pool,organizationId,async db=>{
  const found=await db.query("SELECT id,property_id,assigned_principal_id,status FROM service_dispatch_tasks WHERE organization_id=$1 AND id=$2 FOR UPDATE",[organizationId,taskId]);
  if(!found.rowCount)throw Error("Not found");
  const task=found.rows[0];
  if(task.status!=="completed"||!task.assigned_principal_id)throw Error("Task not completed");
  const access=await db.query("SELECT 1 FROM service_property_access WHERE organization_id=$1 AND property_id=$2 AND principal_id=$3 AND permission='order:manage'",[organizationId,task.property_id,actorId]);
  if(!access.rowCount||actorId===task.assigned_principal_id)throw Error("Forbidden");
  const existing=await db.query("SELECT id,employee_principal_id,amount_uzs,status FROM service_task_compensation WHERE organization_id=$1 AND task_id=$2",[organizationId,taskId]);
  if(existing.rowCount){
   const row=existing.rows[0];
   if(row.employee_principal_id!==task.assigned_principal_id||Number(row.amount_uzs)!==amountUzs)throw Error("Accrual conflict");
   return {id:row.id,amountUzs,status:row.status,replayed:true};
  }
  const created=await db.query("INSERT INTO service_task_compensation(organization_id,task_id,employee_principal_id,amount_uzs,accrued_by) VALUES($1,$2,$3,$4,$5) RETURNING id",[organizationId,taskId,task.assigned_principal_id,amountUzs,actorId]);
  return {id:created.rows[0].id,amountUzs,status:"accrued",replayed:false};
 });
}
export async function approveTaskCompensation(pool,{organizationId,accrualId,actorId}){
 if(typeof actorId!=="string"||!actorId)throw Error("Forbidden");
 return inTenantTransaction(pool,organizationId,async db=>{
  const found=await db.query("SELECT c.id,c.status,c.employee_principal_id,c.accrued_by,t.property_id FROM service_task_compensation c JOIN service_dispatch_tasks t ON t.id=c.task_id AND t.organization_id=c.organization_id WHERE c.organization_id=$1 AND c.id=$2 FOR UPDATE OF c",[organizationId,accrualId]);
  if(!found.rowCount)throw Error("Not found");
  const row=found.rows[0];
  const access=await db.query("SELECT 1 FROM service_property_access WHERE organization_id=$1 AND property_id=$2 AND principal_id=$3 AND permission='order:manage'",[organizationId,row.property_id,actorId]);
  if(!access.rowCount||actorId===row.employee_principal_id||actorId===row.accrued_by)throw Error("Forbidden");
  if(row.status!=="accrued")throw Error("Accrual already processed");
  await db.query("UPDATE service_task_compensation SET status='approved',approved_by=$1,approved_at=now() WHERE organization_id=$2 AND id=$3",[actorId,organizationId,accrualId]);
  return {id:accrualId,status:"approved"};
 });
}
