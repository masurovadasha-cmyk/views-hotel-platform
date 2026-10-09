import {randomUUID} from "node:crypto";
import {inTenantTransaction} from "./postgres.mjs";
import {validatePaymentAmount} from "./payment-domain.mjs";
/**
 * Creates an internal payment intent only. No payment provider request, card
 * charge, or provider status mutation occurs in this module.
 * Caller MUST be an authorized server-side actor for this order.
 */
export async function createPaymentIntent(pool,{organizationId,orderId,merchantReference,provider="sandbox"}){
 if(!["sandbox","payme","click","uzum"].includes(provider))throw Error("Invalid provider");
 if(typeof merchantReference!=="string"||merchantReference.length<8||merchantReference.length>128)throw Error("Invalid payment reference");
 return inTenantTransaction(pool,organizationId,async db=>{
  const found=await db.query("SELECT id,total_uzs,payment_status FROM service_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE",[organizationId,orderId]);
  if(!found.rowCount)throw Error("Not found");
  const order=found.rows[0];
  const amount=validatePaymentAmount(Number(order.total_uzs));
  if(order.payment_status==="paid"||order.payment_status==="refunded")throw Error("Already settled");
  const previous=await db.query("SELECT id,order_id,provider,amount_uzs,status FROM service_payment_attempts WHERE organization_id=$1 AND merchant_reference=$2",[organizationId,merchantReference]);
  if(previous.rowCount){
   const p=previous.rows[0];
   if(p.order_id!==orderId||p.provider!==provider||Number(p.amount_uzs)!==amount)throw Error("Payment reference conflict");
   return {id:p.id,amountUzs:amount,status:p.status,replayed:true};
  }
  const pending=await db.query("SELECT id FROM service_payment_attempts WHERE organization_id=$1 AND order_id=$2 AND status IN ('created','pending') LIMIT 1",[organizationId,orderId]);
  if(pending.rowCount)throw Error("Payment already pending");
  const id=randomUUID();
  await db.query("INSERT INTO service_payment_attempts(id,organization_id,order_id,provider,merchant_reference,amount_uzs) VALUES($1,$2,$3,$4,$5,$6)",[id,organizationId,orderId,provider,merchantReference,amount]);
  await db.query("INSERT INTO service_outbox(organization_id,aggregate_id,event_type,payload) VALUES($1,$2,'payment.intent.created',$3::jsonb)",[organizationId,orderId,JSON.stringify({paymentAttemptId:id,orderId,provider,amountUzs:amount})]);
  return {id,amountUzs:amount,status:"created",replayed:false};
 });
}
