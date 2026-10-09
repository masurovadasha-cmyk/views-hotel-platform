import {inTenantTransaction} from "./postgres.mjs";
/**
 * Internal refund request only. Provider execution, approval policy and actual
 * settlement are intentionally separate and not implemented here.
 */
export async function requestRefund(pool,{organizationId,intentId,amountUzs,reason}){
 if(!Number.isSafeInteger(amountUzs)||amountUzs<=0||typeof reason!=="string"||reason.trim().length<3)throw Error("Invalid refund request");
 return inTenantTransaction(pool,organizationId,async db=>{
  const intent=await db.query("SELECT id,amount_uzs,status FROM service_payment_intents WHERE organization_id=$1 AND id=$2 FOR UPDATE",[organizationId,intentId]);
  if(!intent.rowCount||intent.rows[0].status!=="succeeded")throw Error("Payment not refundable");
  const captured=Number(intent.rows[0].amount_uzs);
  const existing=await db.query("SELECT COALESCE(SUM(amount_uzs),0)::bigint AS reserved FROM service_refund_requests WHERE organization_id=$1 AND intent_id=$2 AND status IN ('requested','approved','submitted','succeeded')",[organizationId,intentId]);
  if(amountUzs+Number(existing.rows[0].reserved)>captured)throw Error("Refund exceeds payment");
  const created=await db.query("INSERT INTO service_refund_requests(organization_id,intent_id,amount_uzs,reason) VALUES($1,$2,$3,$4) RETURNING id,status,amount_uzs",[organizationId,intentId,amountUzs,reason.trim()]);
  return created.rows[0];
 });
}
