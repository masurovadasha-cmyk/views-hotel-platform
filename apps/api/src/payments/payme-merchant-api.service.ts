import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";
import {PaymentWebhookService} from "./payment-webhook.service";
import {publishPaymentProjection} from "./finance-projection-outbox";
import {loadPaymeSandboxConfig} from "./payme-sandbox.config";

type JsonObject=Record<string,unknown>;
export type PaymeRpcRequest={id:number;method:string;params:JsonObject};
export type PaymeRpcResponse={result:JsonObject;id:number|null}|{error:{code:number;message:{ru:string;uz:string;en:string};data?:string};id:number|null};
type Payment={id:string;organization_id:string;reservation_id:string;amount_minor:string;currency:string;status:string;
  captured_minor:string;refunded_minor:string;reservation_status:string;hold_expires_at:Date|null};
type Transaction={id:string;payment_intent_id:string;payme_transaction_id:string;payme_time_ms:string;amount_minor:string;
  account:JsonObject;create_time_ms:string;perform_time_ms:string;cancel_time_ms:string;state:number;reason:number|null};
const TX_ID=/^[a-f0-9]{24}$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASONS=new Set([1,2,3,4,5,10]);
export const PAYME_TIMEOUT_MS=43_200_000;
const COLUMNS="id,payment_intent_id,payme_transaction_id,payme_time_ms::text,amount_minor::text,account,create_time_ms::text,perform_time_ms::text,cancel_time_ms::text,state,reason";
export class PaymeRpcFault extends Error{constructor(readonly code:number,readonly data?:string){super("PAYME_RPC_"+code);}}

@Injectable()
export class PaymeMerchantApiService{
  constructor(private readonly db:DatabaseService,private readonly webhooks:PaymentWebhookService){}

  async handle(input:PaymeRpcRequest,_rawBody:string):Promise<PaymeRpcResponse>{
    const id=plain(input)&&Number.isSafeInteger(input.id)?input.id:null;
    try{
      if(!plain(input)||id===null||typeof input.method!=="string"||!plain(input.params))throw new PaymeRpcFault(-32600);
      const config=loadPaymeSandboxConfig();
      if(!config)throw new PaymeRpcFault(-32504);
      // ONE tenant-scoped DB transaction per RPC. An expected timeout returns a
      // fault value after recording cancellation; unexpected exceptions roll back.
      return await this.db.withOrganization(config.organizationId,async client=>{
        await client.query("SET LOCAL lock_timeout='5s'");
        await client.query("SET LOCAL statement_timeout='10s'");
        let result:JsonObject|PaymeRpcFault;
        switch(input.method){
          case "CheckPerformTransaction":result=await this.check(client,config.organizationId,input.params);break;
          case "CreateTransaction":result=await this.create(client,config.organizationId,input.params);break;
          case "PerformTransaction":result=await this.perform(client,config.organizationId,input.params);break;
          case "CancelTransaction":result=await this.cancel(client,config.organizationId,input.params);break;
          case "CheckTransaction":result=await this.status(client,config.organizationId,input.params);break;
          case "GetStatement":result=await this.statement(client,config.organizationId,input.params);break;
          default:throw new PaymeRpcFault(-32601);
        }
        return result instanceof PaymeRpcFault?paymeError(id,result.code,result.data):{id,result};
      });
    }catch(error){return error instanceof PaymeRpcFault?paymeError(id,error.code,error.data):paymeError(id,-32400);}
  }

  private async check(client:PoolClient,org:string,params:JsonObject){
    const {paymentId,amount}=accountAmount(params);
    const payment=await this.payment(client,org,paymentId);
    this.payable(payment,amount);
    const active=await client.query("SELECT 1 FROM payme_merchant_transactions WHERE organization_id=$1 AND payment_intent_id=$2 AND state IN (1,2)",[org,paymentId]);
    if(active.rowCount)throw new PaymeRpcFault(-31008);
    return {allow:true};
  }

  private async create(client:PoolClient,org:string,params:JsonObject):Promise<JsonObject|PaymeRpcFault>{
    const txid=transactionId(params.id),time=timestamp(params.time);
    const {paymentId,amount}=accountAmount(params);
    await this.lockTransaction(client,org,txid);
    const existing=await this.find(client,org,txid);
    const payment=await this.payment(client,org,paymentId);
    if(existing){
      if(existing.payment_intent_id!==paymentId||Number(existing.payme_time_ms)!==time)throw new PaymeRpcFault(-31008);
      if(BigInt(existing.amount_minor)!==BigInt(amount))throw new PaymeRpcFault(-31001);
      if(await this.expire(client,org,existing,payment))return new PaymeRpcFault(-31008);
      if(existing.state!==1)throw new PaymeRpcFault(-31008);
      return createResult(existing);
    }
    this.payable(payment,amount);
    const now=Date.now(),expires=time+PAYME_TIMEOUT_MS;
    if(expires<=now||time>now+300_000)throw new PaymeRpcFault(-31008);
    const active=await client.query("SELECT 1 FROM payme_merchant_transactions WHERE organization_id=$1 AND payment_intent_id=$2 AND state IN (1,2)",[org,paymentId]);
    if(active.rowCount)throw new PaymeRpcFault(-31008);
    const row=(await client.query<Transaction>(
      `INSERT INTO payme_merchant_transactions(organization_id,payment_intent_id,payme_transaction_id,payme_time_ms,amount_minor,account,create_time_ms,state)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,1) ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
      [org,paymentId,txid,time,amount,JSON.stringify({payment_intent_id:paymentId}),now])).rows[0];
    if(!row)throw new PaymeRpcFault(-31008);
    // Payme reserves the order until its documented 12-hour transaction timeout.
    await client.query("UPDATE reservations SET hold_expires_at=$2,updated_at=now(),version=version+1 WHERE id=$1",[payment.reservation_id,new Date(expires)]);
    await client.query("UPDATE inventory_periods SET expires_at=$2 WHERE reservation_id=$1 AND kind='payment_hold'",[payment.reservation_id,new Date(expires)]);
    await client.query("UPDATE payment_intents SET status='pending_provider',expires_at=$2,updated_at=now(),version=version+1 WHERE id=$1",[paymentId,new Date(expires)]);
    await publishPaymentProjection(client,org,paymentId);
    return createResult(row);
  }

  private async perform(client:PoolClient,org:string,params:JsonObject):Promise<JsonObject|PaymeRpcFault>{
    const txid=transactionId(params.id);
    const {row,payment}=await this.locked(client,org,txid);
    if(row.state===2)return performResult(row);
    if(row.state!==1)throw new PaymeRpcFault(-31008);
    if(await this.expire(client,org,row,payment))return new PaymeRpcFault(-31008);
    // Refuse before ledger posting when the booking can no longer be honoured.
    this.payable(payment,Number(row.amount_minor));
    const now=Date.now();
    const event={organizationId:org,externalEventId:"merchant-api:perform:"+txid,externalTransactionId:txid,
      eventType:"captured" as const,paymentIntentId:row.payment_intent_id,amountMinor:BigInt(row.amount_minor),currency:"UZS",
      occurredAt:new Date(now).toISOString(),rawMetadata:{source:"payme_merchant_api",mode:"sandbox"}};
    const result=await this.webhooks.processVerifiedInTransaction(client,"payme",event,
      JSON.stringify({method:"PerformTransaction",transaction:txid,amount:row.amount_minor}));
    if(result.status!=="captured")throw new Error("PAYME_CAPTURE_STATE_CONFLICT");
    const changed=(await client.query<Transaction>(`UPDATE payme_merchant_transactions SET state=2,perform_time_ms=$3,updated_at=now()
      WHERE organization_id=$1 AND payme_transaction_id=$2 AND state=1 RETURNING ${COLUMNS}`,[org,txid,now])).rows[0];
    if(!changed)throw new Error("PAYME_TRANSACTION_STATE_CONFLICT");
    return performResult(changed);
  }

  private async cancel(client:PoolClient,org:string,params:JsonObject){
    const txid=transactionId(params.id),reason=cancelReason(params.reason);
    const {row,payment}=await this.locked(client,org,txid);
    if(row.state===-1||row.state===-2)return cancelResult(row);
    if(await this.expire(client,org,row,payment))return cancelResult(row);
    if(row.state===2){
      if(!["confirmed","cancelled","hold","pending"].includes(payment.reservation_status)||
        BigInt(payment.captured_minor)!==BigInt(row.amount_minor)||BigInt(payment.refunded_minor)!==0n)throw new PaymeRpcFault(-31007);
      const event={organizationId:org,externalEventId:"merchant-api:cancel:"+txid,externalTransactionId:txid+":cancel",
        relatedExternalTransactionId:txid,eventType:"refunded" as const,paymentIntentId:row.payment_intent_id,
        amountMinor:BigInt(row.amount_minor),currency:"UZS",occurredAt:new Date().toISOString(),
        rawMetadata:{source:"payme_merchant_api",mode:"sandbox",reason}};
      const result=await this.webhooks.processVerifiedInTransaction(client,"payme",event,
        JSON.stringify({method:"CancelTransaction",transaction:txid,amount:row.amount_minor,reason}));
      if(result.status!=="refunded")throw new Error("PAYME_REFUND_STATE_CONFLICT");
    }else if(row.state!==1){throw new PaymeRpcFault(-31008);}
    else{
      await client.query("UPDATE payment_intents SET status='cancelled',updated_at=now(),version=version+1 WHERE id=$1",[payment.id]);
      await publishPaymentProjection(client,org,payment.id);
    }
    const changed=(await client.query<Transaction>(`UPDATE payme_merchant_transactions SET state=$3,reason=$4,cancel_time_ms=$5,updated_at=now()
      WHERE organization_id=$1 AND payme_transaction_id=$2 RETURNING ${COLUMNS}`,[org,txid,row.state===2?-2:-1,reason,Date.now()])).rows[0];
    await this.releaseBooking(client,org,payment,txid,"provider_transaction_cancelled");
    return cancelResult(changed);
  }

  private async status(client:PoolClient,org:string,params:JsonObject){
    const {row,payment}=await this.locked(client,org,transactionId(params.id));
    await this.expire(client,org,row,payment);
    return checkResult(row);
  }
  private async statement(client:PoolClient,org:string,params:JsonObject){
    const from=timestamp(params.from),to=timestamp(params.to);
    if(from>to)throw new PaymeRpcFault(-32600);
    const rows=await client.query<Transaction>(`SELECT ${COLUMNS} FROM payme_merchant_transactions
      WHERE organization_id=$1 AND payme_time_ms BETWEEN $2 AND $3 ORDER BY payme_time_ms,id`,[org,from,to]);
    return {transactions:rows.rows.map(row=>({id:row.payme_transaction_id,time:Number(row.payme_time_ms),amount:Number(row.amount_minor),
      account:row.account,...checkResult(row),receivers:null}))};
  }
  private async expire(client:PoolClient,org:string,row:Transaction,payment:Payment){
    if(row.state!==1||Date.now()<Number(row.payme_time_ms)+PAYME_TIMEOUT_MS)return false;
    const time=Date.now();
    await client.query("UPDATE payme_merchant_transactions SET state=-1,reason=4,cancel_time_ms=$3,updated_at=now() WHERE organization_id=$1 AND id=$2",[org,row.id,time]);
    await client.query("UPDATE payment_intents SET status='cancelled',updated_at=now(),version=version+1 WHERE id=$1 AND captured_minor=0",[payment.id]);
    await this.releaseBooking(client,org,payment,row.payme_transaction_id,"provider_timeout");
    await publishPaymentProjection(client,org,payment.id);
    row.state=-1;row.reason=4;row.cancel_time_ms=String(time);
    return true;
  }
  private async releaseBooking(client:PoolClient,org:string,payment:Payment,txid:string,reason:string){
    if(!["hold","pending","confirmed"].includes(payment.reservation_status))return;
    await client.query("UPDATE reservations SET status='cancelled',cancelled_at=COALESCE(cancelled_at,now()),hold_expires_at=NULL,updated_at=now(),version=version+1 WHERE id=$1",[payment.reservation_id]);
    await client.query("DELETE FROM inventory_periods WHERE reservation_id=$1 AND kind IN ('payment_hold','reservation')",[payment.reservation_id]);
    const payload=JSON.stringify({reservationId:payment.reservation_id,paymentIntentId:payment.id,provider:"payme",reason});
    await client.query(`INSERT INTO booking_state_events(organization_id,reservation_id,event_type,from_status,to_status,idempotency_key,payload)
      VALUES($1,$2,'booking.cancelled_by_provider',$3,'cancelled',$4,$5::jsonb) ON CONFLICT DO NOTHING`,
      [org,payment.reservation_id,payment.reservation_status,"payme-cancel:"+txid,payload]);
    await client.query(`INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
      VALUES($1,'reservation',$2,'booking.cancelled',$3,$4::jsonb) ON CONFLICT(idempotency_key) DO NOTHING`,
      [org,payment.reservation_id,"outbox:payme-cancel:"+txid,payload]);
  }
  private async locked(client:PoolClient,org:string,id:string){
    await this.lockTransaction(client,org,id);
    const row=await this.find(client,org,id);
    if(!row)throw new PaymeRpcFault(-31003);
    const payment=await this.payment(client,org,row.payment_intent_id);
    return {row,payment};
  }
  private async lockTransaction(client:PoolClient,org:string,id:string){
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["payme:"+org+":"+id]);
  }
  private async find(client:PoolClient,org:string,id:string){
    return (await client.query<Transaction>(`SELECT ${COLUMNS} FROM payme_merchant_transactions WHERE organization_id=$1 AND payme_transaction_id=$2`,[org,id])).rows[0];
  }
  private async payment(client:PoolClient,org:string,id:string):Promise<Payment>{
    // Uniform row lock order for this adapter: intent -> reservation.
    const pi=(await client.query<{id:string;organization_id:string;reservation_id:string;amount_minor:string;currency:string;status:string;captured_minor:string;refunded_minor:string}>(
      `SELECT id,organization_id,reservation_id,amount_minor::text,currency,status,captured_minor::text,refunded_minor::text
       FROM payment_intents WHERE organization_id=$1 AND id=$2 AND provider='payme' FOR UPDATE`,[org,id])).rows[0];
    if(!pi)throw new PaymeRpcFault(-31050,"payment_intent_id");
    const reservation=(await client.query<{reservation_status:string;hold_expires_at:Date|null}>(
      "SELECT status AS reservation_status,hold_expires_at FROM reservations WHERE organization_id=$1 AND id=$2 FOR UPDATE",[org,pi.reservation_id])).rows[0];
    if(!reservation)throw new PaymeRpcFault(-31050,"payment_intent_id");
    return {...pi,...reservation};
  }
  private payable(payment:Payment,amount:number){
    if(payment.currency!=="UZS"||BigInt(payment.amount_minor)!==BigInt(amount))throw new PaymeRpcFault(-31001);
    if(!["requires_payment","pending_provider"].includes(payment.status)||BigInt(payment.captured_minor)!==0n||
      payment.reservation_status!=="hold"||!payment.hold_expires_at||payment.hold_expires_at.getTime()<=Date.now())throw new PaymeRpcFault(-31008);
  }
}
function transactionId(value:unknown){if(typeof value!=="string"||!TX_ID.test(value))throw new PaymeRpcFault(-32600);return value.toLowerCase();}
function timestamp(value:unknown){if(typeof value!=="number"||!Number.isSafeInteger(value)||value<1e12||value>9_999_999_999_999)throw new PaymeRpcFault(-32600);return value;}
function cancelReason(value:unknown){if(typeof value!=="number"||!REASONS.has(value))throw new PaymeRpcFault(-32600);return value;}
function accountAmount(params:JsonObject){
  if(typeof params.amount!=="number"||!Number.isSafeInteger(params.amount)||params.amount<=0)throw new PaymeRpcFault(-32600);
  if(!plain(params.account)||Object.keys(params.account).length!==1||typeof params.account.payment_intent_id!=="string"||!UUID.test(params.account.payment_intent_id))throw new PaymeRpcFault(-31050,"payment_intent_id");
  return {paymentId:params.account.payment_intent_id.toLowerCase(),amount:params.amount};
}
function createResult(row:Transaction):JsonObject{return {create_time:Number(row.create_time_ms),transaction:row.id,state:row.state};}
function performResult(row:Transaction):JsonObject{return {transaction:row.id,perform_time:Number(row.perform_time_ms),state:row.state};}
function cancelResult(row:Transaction):JsonObject{return {transaction:row.id,cancel_time:Number(row.cancel_time_ms),state:row.state};}
function checkResult(row:Transaction):JsonObject{return {create_time:Number(row.create_time_ms),perform_time:Number(row.perform_time_ms),cancel_time:Number(row.cancel_time_ms),transaction:row.id,state:row.state,reason:row.reason};}
function plain(value:unknown):value is JsonObject{return !!value&&typeof value==="object"&&!Array.isArray(value);}
export function paymeError(id:number|null,code:number,data?:string):PaymeRpcResponse{
  const messages:Record<number,[string,string,string]>={
    [-32700]:["Ошибка разбора JSON","JSON tahlil xatosi","JSON parse error"],[-32600]:["Некорректный запрос","Noto'g'ri so'rov","Invalid request"],
    [-32601]:["Метод не найден","Metod topilmadi","Method not found"],[-32504]:["Недостаточно привилегий","Huquqlar yetarli emas","Insufficient privileges"],
    [-32400]:["Системная ошибка","Tizim xatosi","System error"],[-31001]:["Неверная сумма","Noto'g'ri summa","Invalid amount"],
    [-31003]:["Транзакция не найдена","Tranzaksiya topilmadi","Transaction not found"],[-31007]:["Невозможно отменить транзакцию","Tranzaksiyani bekor qilib bo'lmaydi","Transaction cannot be cancelled"],
    [-31008]:["Невозможно выполнить операцию","Operatsiyani bajarib bo'lmaydi","Operation cannot be performed"],[-31050]:["Платёжный счёт не найден","To'lov hisobi topilmadi","Payment account not found"]};
  const [ru,uz,en]=messages[code]??messages[-32400];
  return {id:Number.isSafeInteger(id)?id:null,error:{code,message:{ru,uz,en},...(data?{data}:{})}};
}
