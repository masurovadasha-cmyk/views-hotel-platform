import {inTenantTransaction} from "./postgres.mjs";
/**
 * Internal verified-provider event handler.
 * Only invoke AFTER adapter-specific signature validation and reconciliation.
 * This is not a public webhook endpoint.
 */
export async function applyVerifiedPaymentEvent(pool,{organizationId,intentId,providerEventId,eventType}){
 if(!providerEventId||!["succeeded","failed"].includes(eventType))throw Error("Invalid provider event");
 return inTenantTransaction(pool,organizationId,async db=>{
  const result=await db.query("SELECT id,order_id,status FROM service_payment_intents WHERE organization_id=$1 AND id=$2 FOR UPDATE",[organizationId,intentId]);
  if(!result.rowCount)throw Error("Payment intent not found");
  const intent=result.rows[0];
  const inserted=await db.query("INSERT INTO service_payment_events(organization_id,intent_id,provider_event_id,event_type) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",[organizationId,intentId,providerEventId,eventType]);
  if(!inserted.rowCount)return {applied:false,reason:"duplicate"};
  if(intent.status==="succeeded"||intent.status==="refunded")return {applied:false,reason:"terminal"};
  const next=eventType==="succeeded"?"succeeded":"failed";
  await db.query("UPDATE service_payment_intents SET status=$1 WHERE organization_id=$2 AND id=$3",[next,organizationId,intentId]);
  if(next==="succeeded"){
   await db.query("UPDATE service_orders SET payment_status='paid' WHERE organization_id=$1 AND id=$2 AND payment_status='unpaid'",[organizationId,intent.order_id]);
  }
  await db.query("INSERT INTO service_outbox(organization_id,aggregate_id,event_type,payload) VALUES($1,$2,'payment.intent.updated',$3::jsonb)",[organizationId,intent.order_id,JSON.stringify({intentId,status:next})]);
  return {applied:true,status:next};
 });
}
