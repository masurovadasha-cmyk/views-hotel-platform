import {randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {PaymentProviderRegistry} from "./payment-provider.registry";
import type {SupportedPaymentProvider} from "./payment-provider.port";
import {publishPaymentProjection} from "./finance-projection-outbox";

export type CreatePaymentIntentInput={
  actor:RequestActorContext;
  reservationId:string;
  quoteId:string;
  provider:SupportedPaymentProvider;
  idempotencyKey:string;
  returnUrl:string;
};

@Injectable()
export class PaymentIntentService{
  constructor(private readonly db:DatabaseService,private readonly providers:PaymentProviderRegistry){}

  async create(input:CreatePaymentIntentInput){
    if(!input.idempotencyKey.trim())throw new Error("INVALID_IDEMPOTENCY_KEY");
    if(!/^https:\/\//i.test(input.returnUrl))throw new Error("INVALID_RETURN_URL");
    // A globally registered sandbox merchant is not a merchant for every tenant.
    // Refuse an unavailable/scoped-out provider BEFORE creating payment records.
    const adapter=this.providers.get(input.provider);
    adapter.assertOrganizationAllowed?.(input.actor.organizationId);

    const prepared=await this.db.withActor(input.actor,async client=>{
      const existing=await client.query<{
        id:string;status:string;provider:string;amount_minor:string;currency:string;checkout_url:string|null;reservation_id:string;quote_id:string;
      }>(
        `SELECT id,status,provider,amount_minor::text,currency,checkout_url,reservation_id,quote_id
         FROM payment_intents WHERE organization_id=$1 AND idempotency_key=$2`,
        [input.actor.organizationId,input.idempotencyKey]
      );
      if(existing.rows[0]){
        const row=existing.rows[0];
        if(row.reservation_id!==input.reservationId||row.quote_id!==input.quoteId||row.provider!==input.provider){
          throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYMENT");
        }
        return {paymentIntentId:row.id,amountMinor:BigInt(row.amount_minor),currency:row.currency,checkoutUrl:row.checkout_url,existing:true};
      }
      const reservation=await client.query<{
        status:string;hold_expires_at:Date|null;property_id:string;quote_snapshot:{quoteId?:string};total_minor:string;currency:string;
      }>(
        `SELECT status,hold_expires_at,property_id,quote_snapshot,total_minor::text,currency
         FROM reservations WHERE id=$1 FOR UPDATE`,[input.reservationId]
      );
      const row=reservation.rows[0];
      if(!row)throw new Error("RESERVATION_NOT_FOUND");
      if(row.status!=="hold")throw new Error("RESERVATION_NOT_ON_HOLD");
      if(!row.hold_expires_at||row.hold_expires_at.getTime()<=Date.now())throw new Error("HOLD_EXPIRED");
      if(row.quote_snapshot?.quoteId!==input.quoteId)throw new Error("QUOTE_RESERVATION_MISMATCH");
      const access=await client.query<{allowed:boolean}>("SELECT app.can_access_property($1::uuid) AS allowed",[row.property_id]);
      if(!access.rows[0]?.allowed)throw new Error("PROPERTY_FORBIDDEN");
      const paymentIntentId=randomUUID();
      await client.query(
        `INSERT INTO payment_intents(id,organization_id,reservation_id,quote_id,provider,status,amount_minor,currency,idempotency_key,expires_at)
         VALUES($1,$2,$3,$4,$5,'requires_payment',$6,$7,$8,$9)`,
        [paymentIntentId,input.actor.organizationId,input.reservationId,input.quoteId,input.provider,row.total_minor,row.currency,input.idempotencyKey,row.hold_expires_at]
      );
      await publishPaymentProjection(client,input.actor.organizationId,paymentIntentId);
      return {paymentIntentId,amountMinor:BigInt(row.total_minor),currency:row.currency,checkoutUrl:null,existing:false};
    });
    if(prepared.existing&&prepared.checkoutUrl)return {...prepared,idempotentReplay:true};
    const attemptId=randomUUID();
    await this.db.withActor(input.actor,async client=>{
      await client.query(
        `INSERT INTO payment_attempts(id,payment_intent_id,provider,status,request_metadata)
         VALUES($1,$2,$3,'created',$4::jsonb)`,[attemptId,prepared.paymentIntentId,input.provider,JSON.stringify({returnUrl:input.returnUrl})]
      );
    });
    try{
      const checkout=await adapter.createHostedCheckout({
        organizationId:input.actor.organizationId,paymentIntentId:prepared.paymentIntentId,amountMinor:prepared.amountMinor,
        currency:prepared.currency,returnUrl:input.returnUrl,metadata:{reservationId:input.reservationId,quoteId:input.quoteId}
      });
      await this.db.withActor(input.actor,async client=>{
        await client.query(
          `UPDATE payment_attempts SET status='redirected',provider_attempt_ref=$1,checkout_url=$2,response_metadata=$3::jsonb,updated_at=now() WHERE id=$4`,
          [checkout.providerAttemptRef,checkout.checkoutUrl,JSON.stringify({expiresAt:checkout.expiresAt}),attemptId]
        );
        await client.query(
          `UPDATE payment_intents SET status='pending_provider',checkout_url=$1,expires_at=COALESCE($2::timestamptz,expires_at),updated_at=now(),version=version+1 WHERE id=$3`,
          [checkout.checkoutUrl,checkout.expiresAt,prepared.paymentIntentId]
        );
        await publishPaymentProjection(client,input.actor.organizationId,prepared.paymentIntentId);
      });
      return {paymentIntentId:prepared.paymentIntentId,amountMinor:prepared.amountMinor,currency:prepared.currency,
        checkoutUrl:checkout.checkoutUrl,provider:input.provider,idempotentReplay:false};
    }catch(error){
      await this.db.withActor(input.actor,async client=>{
        await client.query(
          `UPDATE payment_attempts SET status='failed',response_metadata=$1::jsonb,updated_at=now() WHERE id=$2`,
          [JSON.stringify({error:error instanceof Error?error.message:"provider_error"}),attemptId]
        );
      });
      throw error;
    }
  }
}
