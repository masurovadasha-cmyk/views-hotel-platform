import {createHash,randomBytes,randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";
import {BookingConflictError,HoldExpiredError,IdempotencyConflictError} from "./booking.errors";
import type {CreateHoldInput,HoldResult} from "./booking.types";
import {validateHoldInput} from "./booking.validation";

function requestHash(input:CreateHoldInput,ttl:number){
  return createHash("sha256").update(JSON.stringify({quoteId:input.quoteId,ttl})).digest("hex");
}
function confirmationCode(){return "VW-"+randomBytes(6).toString("hex").toUpperCase()}

@Injectable()
export class BookingHoldService{
  constructor(private readonly db:DatabaseService){}

  async createHold(input:CreateHoldInput):Promise<HoldResult>{
    const {ttl}=validateHoldInput(input);
    const hash=requestHash(input,ttl);

    try{
      return await this.db.withActor(input.actor,async client=>{
        const inserted=await client.query<{id:string}>(
          `INSERT INTO booking_commands(id,organization_id,idempotency_key,command_type,request_hash)
           VALUES(gen_random_uuid(),$1,$2,'create_hold',$3)
           ON CONFLICT(organization_id,idempotency_key,command_type) DO NOTHING
           RETURNING id`,
          [input.actor.organizationId,input.idempotencyKey,hash]
        );

        if(!inserted.rowCount){
          return this.replayExisting(client,input.actor.organizationId,input.idempotencyKey,hash);
        }

        const quoteResult=await client.query<{
          id:string;property_id:string;unit_id:string;rate_plan_id:string;check_in_at:Date;check_out_at:Date;
          currency:string;accommodation_minor:string;total_minor:string;cancellation_policy_snapshot:Record<string,unknown>;
          pricing_snapshot:Record<string,unknown>;guest_context:Record<string,unknown>;expires_at:Date;
          booking_channel:string|null;market_segment:string|null;attribution_source:string|null;
        }>(
          `SELECT id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,currency,
                  accommodation_minor::text,total_minor::text,cancellation_policy_snapshot,
                  pricing_snapshot,guest_context,expires_at,
                  booking_channel,market_segment,attribution_source
             FROM booking_quotes
            WHERE id=$1 AND organization_id=$2`,
          [input.quoteId,input.actor.organizationId]
        );
        const quote=quoteResult.rows[0];
        if(!quote)throw new Error("QUOTE_NOT_FOUND");
        if(quote.expires_at.getTime()<=Date.now())throw new Error("QUOTE_EXPIRED");

        const access=await client.query<{allowed:boolean}>(
          "SELECT app.can_access_property($1::uuid) AS allowed",[quote.property_id]
        );
        if(!access.rows[0]?.allowed)throw new Error("PROPERTY_FORBIDDEN");

        const lines=await client.query<{
          line_type:string;code:string;label:Record<string,string>;amount_minor:string;currency:string;
          refundable:boolean;metadata:Record<string,unknown>;sort_order:number;
        }>(
          `SELECT line_type,code,label,amount_minor::text,currency,refundable,metadata,sort_order
             FROM booking_quote_lines WHERE quote_id=$1 ORDER BY sort_order,id`,
          [quote.id]
        );

        const reservationId=randomUUID();
        const code=confirmationCode();
        const reservationSnapshot={
          quoteId:quote.id,
          pricingSnapshot:quote.pricing_snapshot,
          guestContext:quote.guest_context,
          bookingChannel:quote.booking_channel,
          marketSegment:quote.market_segment,
          attributionSource:quote.attribution_source
        };

        const reservation=await client.query<{hold_expires_at:Date}>(
          `INSERT INTO reservations(
             id,organization_id,property_id,unit_id,rate_plan_id,confirmation_code,status,
             check_in_at,check_out_at,currency,accommodation_minor,total_minor,
             cancellation_policy_snapshot,hold_expires_at,idempotency_key,quote_snapshot
           )
           VALUES($1,$2,$3,$4,$5,$6,'hold',$7,$8,$9,$10,$11,$12::jsonb,
                  now()+make_interval(secs=>$13),$14,$15::jsonb)
           RETURNING hold_expires_at`,
          [
            reservationId,input.actor.organizationId,quote.property_id,quote.unit_id,quote.rate_plan_id,code,
            quote.check_in_at,quote.check_out_at,quote.currency,quote.accommodation_minor,quote.total_minor,
            JSON.stringify(quote.cancellation_policy_snapshot),ttl,input.idempotencyKey,JSON.stringify(reservationSnapshot)
          ]
        );
        const expires=reservation.rows[0].hold_expires_at;

        for(const line of lines.rows){
          await client.query(
            `INSERT INTO reservation_price_lines(
               id,reservation_id,line_type,code,label,amount_minor,currency,refundable,metadata,tax_metadata,sort_order
             )
             VALUES(gen_random_uuid(),$1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb,$8::jsonb,$9)`,
            [
              reservationId,line.line_type,line.code,JSON.stringify(line.label),line.amount_minor,
              line.currency,line.refundable,JSON.stringify(line.metadata),line.sort_order
            ]
          );
        }

        await client.query(
          `INSERT INTO inventory_periods(
             id,organization_id,property_id,unit_id,kind,reservation_id,source_ref,stay_period,expires_at
           )
           VALUES(gen_random_uuid(),$1,$2,$3,'payment_hold',$4,$5,
                  tstzrange($6::timestamptz,$7::timestamptz,'[)'),$8)`,
          [
            input.actor.organizationId,quote.property_id,quote.unit_id,reservationId,
            input.idempotencyKey,quote.check_in_at,quote.check_out_at,expires
          ]
        );

        await client.query(
          `INSERT INTO booking_state_events(
             id,organization_id,reservation_id,event_type,to_status,actor_user_id,idempotency_key,payload
           )
           VALUES(gen_random_uuid(),$1,$2,'booking.hold_created','hold',$3,$4,$5::jsonb)`,
          [
            input.actor.organizationId,reservationId,input.actor.userId,input.idempotencyKey,
            JSON.stringify({quoteId:quote.id,holdExpiresAt:expires.toISOString()})
          ]
        );

        await client.query(
          `INSERT INTO outbox_events(
             id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
           )
           VALUES(gen_random_uuid(),$1,'reservation',$2,'booking.hold_created',$3,$4::jsonb)`,
          [
            input.actor.organizationId,reservationId,"outbox:"+input.idempotencyKey,
            JSON.stringify({reservationId,quoteId:quote.id})
          ]
        );

        await client.query(
          `UPDATE booking_commands
              SET reservation_id=$1,result_snapshot=$2::jsonb,completed_at=now()
            WHERE organization_id=$3 AND idempotency_key=$4 AND command_type='create_hold'`,
          [
            reservationId,
            JSON.stringify({reservationId,confirmationCode:code,holdExpiresAt:expires.toISOString(),quoteId:quote.id}),
            input.actor.organizationId,input.idempotencyKey
          ]
        );

        return {
          reservationId,confirmationCode:code,status:"hold",
          holdExpiresAt:expires.toISOString(),totalMinor:BigInt(quote.total_minor),
          currency:quote.currency,idempotentReplay:false
        };
      });
    }catch(error){
      if(isPgCode(error,"23P01"))throw new BookingConflictError();
      throw error;
    }
  }

  private async replayExisting(
    client:PoolClient,organizationId:string,idempotencyKey:string,hash:string
  ):Promise<HoldResult>{
    const command=await client.query<{request_hash:string;reservation_id:string|null}>(
      `SELECT request_hash,reservation_id FROM booking_commands
        WHERE organization_id=$1 AND idempotency_key=$2 AND command_type='create_hold'`,
      [organizationId,idempotencyKey]
    );
    if(!command.rows[0])throw new Error("IDEMPOTENCY_STATE_MISSING");
    if(command.rows[0].request_hash!==hash)throw new IdempotencyConflictError();
    if(!command.rows[0].reservation_id)throw new Error("IDEMPOTENCY_IN_PROGRESS");

    const row=await client.query<{
      id:string;confirmation_code:string;status:string;hold_expires_at:Date;total_minor:string;currency:string;
    }>(
      `SELECT id,confirmation_code,status,hold_expires_at,total_minor::text,currency
         FROM reservations WHERE id=$1`,
      [command.rows[0].reservation_id]
    );
    const reservation=row.rows[0];
    if(!reservation)throw new Error("IDEMPOTENCY_RESERVATION_MISSING");
    if(reservation.status!=="hold")throw new Error("IDEMPOTENCY_RESULT_NOT_HOLD");
    if(reservation.hold_expires_at.getTime()<=Date.now())throw new HoldExpiredError();

    return {
      reservationId:reservation.id,confirmationCode:reservation.confirmation_code,status:"hold",
      holdExpiresAt:reservation.hold_expires_at.toISOString(),totalMinor:BigInt(reservation.total_minor),
      currency:reservation.currency,idempotentReplay:true
    };
  }
}

function isPgCode(error:unknown,code:string){
  return typeof error==="object"&&error!==null&&"code" in error&&(error as {code?:string}).code===code;
}
