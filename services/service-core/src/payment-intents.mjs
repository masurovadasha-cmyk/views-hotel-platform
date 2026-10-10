import {inTenantTransaction} from "./postgres.mjs";
const providers=new Set(["payme","click","uzum"]);
export async function createPaymentIntent(pool,{organizationId,orderId,provider,idempotencyKey,actorId}){
 if(!providers.has(provider)||!idempotencyKey||!actorId)throw Error("Invalid payment request");
 return inTenantTransaction(pool,organizationId,async db=>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[organizationId+":"+idempotencyKey]);
  const existing=await db.query("SELECT id,order_id,provider,amount_uzs,status FROM service_payment_intents WHERE organization_id=$1 AND idempotency_key=$2",[organizationId,idempotencyKey]);
  if(existing.rowCount){
   const intent=existing.rows[0];
   if(intent.order_id!==orderId||intent.provider!==provider)throw Error("Idempotency conflict");
   return {...intent,replayed:true};
  }
  const order=await db.query("SELECT id,total_uzs,created_by,payment_status FROM service_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE",[organizationId,orderId]);
  if(!order.rowCount||order.rows[0].created_by!==actorId)throw Error("Forbidden");
  const o=order.rows[0],amount=Number(o.total_uzs);
  if(!Number.isSafeInteger(amount)||amount<=0||o.payment_status!=="unpaid")throw Error("Order not payable");
  const created=await db.query("INSERT INTO service_payment_intents(organization_id,order_id,provider,amount_uzs,idempotency_key) VALUES($1,$2,$3,$4,$5) RETURNING id,order_id,provider,amount_uzs,status",[organizationId,orderId,provider,amount,idempotencyKey]);
  return {...created.rows[0],replayed:false};
 });
}
