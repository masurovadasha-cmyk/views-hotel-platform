import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import {PaymentWebhookService} from "./payment-webhook.service";
import {loadPaymeSandboxConfig} from "./payme-sandbox.config";

type JsonObject=Record<string,unknown>;
export type PaymeRpcRequest={
  id:number;
  method:string;
  params:JsonObject;
};
export type PaymeRpcResponse=
  |{result:JsonObject;id:number|null}
  |{error:{code:number;message:{ru:string;uz:string;en:string};data?:string};id:number|null};

type PaymentContext={
  id:string;
  organization_id:string;
  reservation_id:string;
  amount_minor:string;
  currency:string;
  status:string;
  reservation_status:string;
  hold_expires_at:Date|null;
};

type PaymeTransaction={
  id:string;
  payment_intent_id:string;
  payme_transaction_id:string;
  payme_time_ms:string;
  amount_minor:string;
  account:JsonObject;
  create_time_ms:string;
  perform_time_ms:string;
  cancel_time_ms:string;
  state:number;
  reason:number|null;
};

const TX_ID=/^[a-f0-9]{24}$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANCEL_REASONS=new Set([1,2,3,4,5,10]);

export class PaymeRpcFault extends Error{
  constructor(
    readonly code:number,
    readonly data?:string
  ){
    super("PAYME_RPC_"+code);
  }
}

@Injectable()
export class PaymeMerchantApiService{
  constructor(
    private readonly db:DatabaseService,
    private readonly webhooks:PaymentWebhookService
  ){}

  async handle(
    request:PaymeRpcRequest,
    rawBody:string
  ):Promise<PaymeRpcResponse>{
    try{
      this.validateEnvelope(request);
      let result:JsonObject;
      switch(request.method){
        case "CheckPerformTransaction":
          result=await this.checkPerform(request.params);
          break;
        case "CreateTransaction":
          result=await this.createTransaction(request.params);
          break;
        case "PerformTransaction":
          result=await this.performTransaction(request.params,rawBody);
          break;
        case "CancelTransaction":
          result=await this.cancelTransaction(request.params,rawBody);
          break;
        case "CheckTransaction":
          result=await this.checkTransaction(request.params);
          break;
        case "GetStatement":
          result=await this.getStatement(request.params);
          break;
        default:
          throw new PaymeRpcFault(-32601);
      }
      return {result,id:request.id};
    }catch(error){
      if(error instanceof PaymeRpcFault){
        return paymeError(request?.id??null,error.code,error.data);
      }
      return paymeError(request?.id??null,-32400);
    }
  }

  private validateEnvelope(request:PaymeRpcRequest){
    if(
      !request||
      !Number.isSafeInteger(request.id)||
      typeof request.method!=="string"||
      !isPlain(request.params)
    ){
      throw new PaymeRpcFault(-32600);
    }
  }

  private async checkPerform(params:JsonObject){
    const {paymentIntentId,amount}=this.accountAndAmount(params);
    await this.requirePayable(paymentIntentId,amount);
    return {allow:true};
  }

  private async createTransaction(params:JsonObject){
    const id=this.transactionId(params.id);
    const time=this.timestamp(params.time);
    const {paymentIntentId,amount,account}=this.accountAndAmount(params);
    const config=this.config();

    return this.db.withOrganization(config.organizationId,async client=>{
      const existing=(await client.query<PaymeTransaction>(
        `SELECT id,payment_intent_id,payme_transaction_id,payme_time_ms::text,
                amount_minor::text,account,create_time_ms::text,
                perform_time_ms::text,cancel_time_ms::text,state,reason
           FROM payme_merchant_transactions
          WHERE organization_id=$1 AND payme_transaction_id=$2`,
        [config.organizationId,id]
      )).rows[0];

      if(existing){
        if(
          existing.payment_intent_id!==paymentIntentId||
          BigInt(existing.amount_minor)!==BigInt(amount)||
          BigInt(existing.payme_time_ms)!==BigInt(time)||
          JSON.stringify(existing.account)!==JSON.stringify(account)
        ){
          throw new PaymeRpcFault(-31008);
        }
        return createResult(existing);
      }

      const payment=await this.paymentContextWithClient(
        client,config.organizationId,paymentIntentId
      );
      this.assertPayable(payment,amount);

      const active=(await client.query<{id:string}>(
        `SELECT id
           FROM payme_merchant_transactions
          WHERE organization_id=$1
            AND payment_intent_id=$2
            AND state IN (1,2)
          LIMIT 1`,
        [config.organizationId,paymentIntentId]
      )).rows[0];
      if(active)throw new PaymeRpcFault(-31008);

      const createTime=Date.now();
      try{
        const row=(await client.query<PaymeTransaction>(
          `INSERT INTO payme_merchant_transactions(
             organization_id,payment_intent_id,payme_transaction_id,
             payme_time_ms,amount_minor,account,create_time_ms,state
           ) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,1)
           RETURNING id,payment_intent_id,payme_transaction_id,
                     payme_time_ms::text,amount_minor::text,account,
                     create_time_ms::text,perform_time_ms::text,
                     cancel_time_ms::text,state,reason`,
          [
            config.organizationId,paymentIntentId,id,time,amount,
            JSON.stringify(account),createTime
          ]
        )).rows[0];

        await client.query(
          `UPDATE payment_intents
              SET status='pending_provider',updated_at=now(),version=version+1
            WHERE id=$1 AND organization_id=$2
              AND status='requires_payment'`,
          [paymentIntentId,config.organizationId]
        );
        return createResult(row);
      }catch(error){
        const pg=error as {code?:string};
        if(pg.code==="23505")throw new PaymeRpcFault(-31008);
        throw error;
      }
    });
  }

  private async performTransaction(params:JsonObject,rawBody:string){
    const id=this.transactionId(params.id);
    const config=this.config();
    const current=await this.transaction(config.organizationId,id);

    if(current.state===2)return performResult(current);
    if(current.state!==1)throw new PaymeRpcFault(-31008);

    await this.webhooks.processVerified(
      "payme",
      {
        organizationId:config.organizationId,
        externalEventId:"merchant-api:perform:"+id,
        externalTransactionId:id,
        eventType:"captured",
        paymentIntentId:current.payment_intent_id,
        amountMinor:BigInt(current.amount_minor),
        currency:"UZS",
        occurredAt:new Date().toISOString(),
        rawMetadata:{source:"payme_merchant_api"}
      },
      rawBody
    );

    return this.db.withOrganization(config.organizationId,async client=>{
      const now=Date.now();
      const row=(await client.query<PaymeTransaction>(
        `UPDATE payme_merchant_transactions
            SET state=CASE WHEN state=1 THEN 2 ELSE state END,
                perform_time_ms=CASE
                  WHEN state=1 AND perform_time_ms=0 THEN $3
                  ELSE perform_time_ms
                END,
                updated_at=now()
          WHERE organization_id=$1 AND payme_transaction_id=$2
          RETURNING id,payment_intent_id,payme_transaction_id,
                    payme_time_ms::text,amount_minor::text,account,
                    create_time_ms::text,perform_time_ms::text,
                    cancel_time_ms::text,state,reason`,
        [config.organizationId,id,now]
      )).rows[0];
      if(!row)throw new PaymeRpcFault(-31003);
      return performResult(row);
    });
  }

  private async cancelTransaction(params:JsonObject,rawBody:string){
    const id=this.transactionId(params.id);
    const reason=this.cancelReason(params.reason);
    const config=this.config();
    const current=await this.transaction(config.organizationId,id);

    if(current.state===-1||current.state===-2){
      return cancelResult(current);
    }

    if(current.state===1){
      return this.db.withOrganization(config.organizationId,async client=>{
        const now=Date.now();
        const row=(await client.query<PaymeTransaction>(
          `UPDATE payme_merchant_transactions
              SET state=-1,reason=$3,cancel_time_ms=$4,updated_at=now()
            WHERE organization_id=$1
              AND payme_transaction_id=$2
              AND state=1
            RETURNING id,payment_intent_id,payme_transaction_id,
                      payme_time_ms::text,amount_minor::text,account,
                      create_time_ms::text,perform_time_ms::text,
                      cancel_time_ms::text,state,reason`,
          [config.organizationId,id,reason,now]
        )).rows[0];
        if(!row)return cancelResult(
          await this.transactionWithClient(client,config.organizationId,id)
        );
        await client.query(
          `UPDATE payment_intents
              SET status='cancelled',updated_at=now(),version=version+1
            WHERE organization_id=$1 AND id=$2
              AND status IN ('requires_payment','pending_provider')`,
          [config.organizationId,current.payment_intent_id]
        );
        return cancelResult(row);
      });
    }

    const payment=await this.paymentContext(
      config.organizationId,current.payment_intent_id
    );
    if(["checked_in","checked_out"].includes(payment.reservation_status)){
      throw new PaymeRpcFault(-31007);
    }

    await this.webhooks.processVerified(
      "payme",
      {
        organizationId:config.organizationId,
        externalEventId:"merchant-api:cancel:"+id,
        externalTransactionId:id+":cancel:"+reason,
        relatedExternalTransactionId:id,
        eventType:"refunded",
        paymentIntentId:current.payment_intent_id,
        amountMinor:BigInt(current.amount_minor),
        currency:"UZS",
        occurredAt:new Date().toISOString(),
        rawMetadata:{source:"payme_merchant_api",reason}
      },
      rawBody
    );

    return this.db.withOrganization(config.organizationId,async client=>{
      const now=Date.now();
      const before=(await client.query<{status:string}>(
        `SELECT status FROM reservations
          WHERE id=$1 FOR UPDATE`,
        [payment.reservation_id]
      )).rows[0]?.status;

      const row=(await client.query<PaymeTransaction>(
        `UPDATE payme_merchant_transactions
            SET state=-2,reason=$3,
                cancel_time_ms=CASE WHEN cancel_time_ms=0 THEN $4 ELSE cancel_time_ms END,
                updated_at=now()
          WHERE organization_id=$1 AND payme_transaction_id=$2
          RETURNING id,payment_intent_id,payme_transaction_id,
                    payme_time_ms::text,amount_minor::text,account,
                    create_time_ms::text,perform_time_ms::text,
                    cancel_time_ms::text,state,reason`,
        [config.organizationId,id,reason,now]
      )).rows[0];

      if(before&&["hold","pending","confirmed"].includes(before)){
        await client.query(
          `UPDATE reservations
              SET status='cancelled',
                  cancelled_at=COALESCE(cancelled_at,now()),
                  hold_expires_at=NULL,updated_at=now(),version=version+1
            WHERE id=$1 AND status IN ('hold','pending','confirmed')`,
          [payment.reservation_id]
        );
        await client.query(
          `DELETE FROM inventory_periods
            WHERE reservation_id=$1
              AND kind IN ('payment_hold','reservation')`,
          [payment.reservation_id]
        );
        const key="payme-cancel:"+id;
        await client.query(
          `INSERT INTO outbox_events(
             organization_id,aggregate_type,aggregate_id,event_type,
             idempotency_key,payload
           ) VALUES(
             $1,'reservation',$2,'booking.cancelled',$3,$4::jsonb
           )
           ON CONFLICT(idempotency_key) DO NOTHING`,
          [
            config.organizationId,payment.reservation_id,"outbox:"+key,
            JSON.stringify({
              reservationId:payment.reservation_id,
              paymentIntentId:payment.id,
              provider:"payme",
              reason:"provider_transaction_cancelled"
            })
          ]
        );
      }

      return cancelResult(row);
    });
  }

  private async checkTransaction(params:JsonObject){
    const config=this.config();
    return checkResult(
      await this.transaction(
        config.organizationId,
        this.transactionId(params.id)
      )
    );
  }

  private async getStatement(params:JsonObject){
    const from=this.timestamp(params.from);
    const to=this.timestamp(params.to);
    if(from>to)throw new PaymeRpcFault(-32600);
    const config=this.config();

    return this.db.withOrganization(config.organizationId,async client=>{
      const rows=await client.query<PaymeTransaction>(
        `SELECT id,payment_intent_id,payme_transaction_id,
                payme_time_ms::text,amount_minor::text,account,
                create_time_ms::text,perform_time_ms::text,
                cancel_time_ms::text,state,reason
           FROM payme_merchant_transactions
          WHERE organization_id=$1
            AND payme_time_ms BETWEEN $2 AND $3
          ORDER BY payme_time_ms,id`,
        [config.organizationId,from,to]
      );
      return {
        transactions:rows.rows.map(statementTransaction)
      };
    });
  }

  private accountAndAmount(params:JsonObject){
    const amount=this.amount(params.amount);
    if(!isPlain(params.account)){
      throw new PaymeRpcFault(-32600);
    }
    const keys=Object.keys(params.account);
    const paymentIntentId=params.account.payment_intent_id;
    if(
      keys.length!==1||
      typeof paymentIntentId!=="string"||
      !UUID.test(paymentIntentId)
    ){
      throw new PaymeRpcFault(-31050,"payment_intent_id");
    }
    return {
      amount,
      paymentIntentId,
      account:{payment_intent_id:paymentIntentId}
    };
  }

  private async requirePayable(paymentIntentId:string,amount:number){
    const config=this.config();
    const payment=await this.paymentContext(
      config.organizationId,paymentIntentId
    );
    this.assertPayable(payment,amount);
    return payment;
  }

  private assertPayable(payment:PaymentContext,amount:number){
    if(payment.currency!=="UZS"||BigInt(payment.amount_minor)!==BigInt(amount)){
      throw new PaymeRpcFault(-31001);
    }
    if(!["requires_payment","pending_provider"].includes(payment.status)){
      throw new PaymeRpcFault(-31008);
    }
    if(
      payment.reservation_status!=="hold"||
      !payment.hold_expires_at||
      payment.hold_expires_at.getTime()<=Date.now()
    ){
      throw new PaymeRpcFault(-31008);
    }
  }

  private async paymentContext(
    organizationId:string,
    paymentIntentId:string
  ){
    return this.db.withOrganization(organizationId,client=>
      this.paymentContextWithClient(client,organizationId,paymentIntentId)
    );
  }

  private async paymentContextWithClient(
    client:{query:<T extends Record<string,unknown>>(sql:string,params?:unknown[])=>Promise<{rows:T[]}>},
    organizationId:string,
    paymentIntentId:string
  ):Promise<PaymentContext>{
    const row=(await client.query<PaymentContext>(
      `SELECT pi.id,pi.organization_id,pi.reservation_id,
              pi.amount_minor::text,pi.currency,pi.status,
              r.status AS reservation_status,r.hold_expires_at
         FROM payment_intents pi
         JOIN reservations r ON r.id=pi.reservation_id
        WHERE pi.organization_id=$1
          AND pi.id=$2
          AND pi.provider='payme'`,
      [organizationId,paymentIntentId]
    )).rows[0];
    if(!row)throw new PaymeRpcFault(-31050,"payment_intent_id");
    return row;
  }

  private async transaction(organizationId:string,id:string){
    return this.db.withOrganization(organizationId,client=>
      this.transactionWithClient(client,organizationId,id)
    );
  }

  private async transactionWithClient(
    client:{query:<T extends Record<string,unknown>>(sql:string,params?:unknown[])=>Promise<{rows:T[]}>},
    organizationId:string,
    id:string
  ):Promise<PaymeTransaction>{
    const row=(await client.query<PaymeTransaction>(
      `SELECT id,payment_intent_id,payme_transaction_id,
              payme_time_ms::text,amount_minor::text,account,
              create_time_ms::text,perform_time_ms::text,
              cancel_time_ms::text,state,reason
         FROM payme_merchant_transactions
        WHERE organization_id=$1 AND payme_transaction_id=$2`,
      [organizationId,id]
    )).rows[0];
    if(!row)throw new PaymeRpcFault(-31003);
    return row;
  }

  private transactionId(value:unknown){
    if(typeof value!=="string"||!TX_ID.test(value)){
      throw new PaymeRpcFault(-32600);
    }
    return value;
  }

  private timestamp(value:unknown){
    if(
      typeof value!=="number"||
      !Number.isSafeInteger(value)||
      value<1_000_000_000_000||
      value>9_999_999_999_999
    ){
      throw new PaymeRpcFault(-32600);
    }
    return value;
  }

  private amount(value:unknown){
    if(
      typeof value!=="number"||
      !Number.isSafeInteger(value)||
      value<=0
    ){
      throw new PaymeRpcFault(-32600);
    }
    return value;
  }

  private cancelReason(value:unknown){
    if(typeof value!=="number"||!Number.isInteger(value)||!CANCEL_REASONS.has(value)){
      throw new PaymeRpcFault(-32600);
    }
    return value;
  }

  private config(){
    const config=loadPaymeSandboxConfig();
    if(!config)throw new PaymeRpcFault(-32504);
    return config;
  }
}

function createResult(row:PaymeTransaction):JsonObject{
  return {
    create_time:Number(row.create_time_ms),
    transaction:row.id,
    state:row.state
  };
}
function performResult(row:PaymeTransaction):JsonObject{
  return {
    transaction:row.id,
    perform_time:Number(row.perform_time_ms),
    state:row.state
  };
}
function cancelResult(row:PaymeTransaction):JsonObject{
  return {
    transaction:row.id,
    cancel_time:Number(row.cancel_time_ms),
    state:row.state
  };
}
function checkResult(row:PaymeTransaction):JsonObject{
  return {
    create_time:Number(row.create_time_ms),
    perform_time:Number(row.perform_time_ms),
    cancel_time:Number(row.cancel_time_ms),
    transaction:row.id,
    state:row.state,
    reason:row.reason
  };
}
function statementTransaction(row:PaymeTransaction):JsonObject{
  return {
    id:row.payme_transaction_id,
    time:Number(row.payme_time_ms),
    amount:Number(row.amount_minor),
    account:row.account,
    create_time:Number(row.create_time_ms),
    perform_time:Number(row.perform_time_ms),
    cancel_time:Number(row.cancel_time_ms),
    transaction:row.id,
    state:row.state,
    reason:row.reason,
    receivers:null
  };
}
function isPlain(value:unknown):value is JsonObject{
  return !!value&&typeof value==="object"&&!Array.isArray(value);
}

export function paymeError(
  id:number|null,
  code:number,
  data?:string
):PaymeRpcResponse{
  const messages:Record<number,{ru:string;uz:string;en:string}>={
    [-32700]:{ru:"Ошибка разбора JSON",uz:"JSON tahlil xatosi",en:"JSON parse error"},
    [-32600]:{ru:"Некорректный запрос",uz:"Noto'g'ri so'rov",en:"Invalid request"},
    [-32601]:{ru:"Метод не найден",uz:"Metod topilmadi",en:"Method not found"},
    [-32504]:{ru:"Недостаточно привилегий",uz:"Huquqlar yetarli emas",en:"Insufficient privileges"},
    [-32400]:{ru:"Системная ошибка",uz:"Tizim xatosi",en:"System error"},
    [-31001]:{ru:"Неверная сумма",uz:"Noto'g'ri summa",en:"Invalid amount"},
    [-31003]:{ru:"Транзакция не найдена",uz:"Tranzaksiya topilmadi",en:"Transaction not found"},
    [-31007]:{ru:"Невозможно отменить транзакцию",uz:"Tranzaksiyani bekor qilib bo'lmaydi",en:"Transaction cannot be cancelled"},
    [-31008]:{ru:"Невозможно выполнить операцию",uz:"Operatsiyani bajarib bo'lmaydi",en:"Operation cannot be performed"},
    [-31050]:{ru:"Платёжный счёт не найден",uz:"To'lov hisobi topilmadi",en:"Payment account not found"}
  };
  return {
    error:{
      code,
      message:messages[code]??messages[-32400],
      ...(data?{data}:{})
    },
    id
  };
}
