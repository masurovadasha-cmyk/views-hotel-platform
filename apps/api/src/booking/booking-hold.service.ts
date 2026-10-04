import {createHash,randomBytes,randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";
import {BookingConflictError,HoldExpiredError,IdempotencyConflictError} from "./booking.errors";
import type {CreateHoldInput,HoldResult} from "./booking.types";
import {validateHoldInput} from "./booking.validation";

function stable(value:unknown):string{
  if(typeof value==="bigint")return JSON.stringify(value.toString());
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
  return "{"+Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+":"+stable(v)).join(",")+"}";
}
function requestHash(input:CreateHoldInput){
  return createHash("sha256").update(stable({
    propertyId:input.propertyId,unitId:input.unitId,ratePlanId:input.ratePlanId,
    checkInAt:input.checkInAt,checkOutAt:input.checkOutAt,currency:input.currency,
    priceLines:input.priceLines
  })).digest("hex");
}
function confirmationCode(){return "VW-"+randomBytes(6).toString("hex").toUpperCase()}

@Injectable()
export class BookingHoldService{
  constructor(private readonly db:DatabaseService){}

  async createHold(input:CreateHoldInput):Promise<HoldResult>{
    const validated=validateHoldInput(input);
    const hash=requestHash(input);

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
          return this.replayExisting(client,input.actor.organizationId,input.idempotencyKey,hash,input.currency);
        }

        const access=await client.query<{allowed:boolean}>(
          "SELECT app.can_access_property($1::uuid) AS allowed",[input.propertyId]
        );
        if(!access.rows[0]?.allowed)throw new Error("PROPERTY_FORBIDDEN");

        const inventory=await client.query<{currency:string}>(
          `SELECT rp.currency
             FROM units u
             JOIN rate_plans rp ON rp.id=$3
              AND rp.property_id=u.property_id
              AND rp.unit_type_id=u.unit_type_id
              AND rp.active=true
            WHERE u.id=$1 AND u.property_id=$2 AND u.status='active'`,
          [input.unitId,input.propertyId,input.ratePlanId]
        );
        if(!inventory.rows[0])throw new Error("UNIT_OR_RATE_NOT_FOUND");
        if(inventory.rows[0].currency!==input.currency)throw new Error("RATE_CURRENCY_MISMATCH");

        const reservationId=randomUuid();
        const code=confirmationCode();
        const snapshot={
          checkInAt:input.checkInAt,checkOutAt:input.checkOutAt,currency:input.currency,
          totalMinor:validated.totalMinor.toString(),
          lines:input.priceLines.map(x=>({...x,amountMinor:x.amountMinor.toString()}))
        };

        const reservation=await client.query<{hold_expires_at:Date}>(
          `INSERT INTO reservations(
             id,organization_id,property_id,unit_id,rate_plan_id,confirmation_code,status,
             check_in_at,check_out_at,currency,accommodation_minor,total_minor,
             cancellation_policy_snapshot,hold_expires_at,idempotency_key,quote_snapshot
           )
           SELECT $1,$2,$3,$4,$5,$6,'hold',$7,$8,$9,
                  COALESCE((SELECT SUM(amount::bigint) FROM jsonb_to_recordset($10::jsonb) AS x(type text,amount text) WHERE type='stay'),0),
                  $11,'{}'::jsonb,now()+make_interval(secs=>$12),$13,$14::jsonb
           RETURNING hold_expires_at`,
          [
            reservationId,input.actor.organizationId,input.propertyId,input.unitId,input.ratePlanId,code,
            input.checkInAt,input.checkOutAt,input.currency,
            JSON.stringify(input.priceLines.map(x=>({type:x.type,amount:x.amountMinor.toString()}))),
            validated.totalMinor.toString(),validated.ttl,input.idempotencyKey,JSON.stringify(snapshot)
          ]
        );
        const expires=reservation.rows[0].hold_expires_at;

        for(const line of input.priceLines){
          await client.query(
            `INSERT INTO reservation_price_lines(id,reservation_id,line_type,label,amount_minor,currency,tax_metadata,sort_order)
             VALUES(gen_random_uuid(),$1,$2,$3::jsonb,$4,$5,$6::jsonb,$7)`,
            [reservationId,line.type,JSON.stringify(line.label),line.amountMinor.toString(),line.currency,JSON.stringify(line.taxMetadata||{}),line.sortOrder||0]
          );
        }

        await client.query(
          `INSERT INTO inventory_periods(id,organization_id,property_id,unit_id,kind,reservation_id,source_ref,stay_period,expires_at)
           VALUES(gen_random_uuid(),$1,$2,$3,'payment_hold',$4,$5,tstzrange($6::timestamptz,$7::timestamptz,'[)'),$8)`,
          [input.actor.organizationId,input.propertyId,input.unitId,reservationId,input.idempotencyKey,input.checkInAt,input.checkOutAt,expires]
        );

        await client.query(
          `INSERT INTO booking_state_events(id,organization_id,reservation_id,event_type,to_status,actor_user_id,idempotency_key,payload)
           VALUES(gen_random_uuid(),$1,$2,'booking.hold_created','hold',$3,$4,$5::jsonb)`,
          [input.actor.organizationId,reservationId,input.actor.userId,input.idempotencyKey,JSON.stringify({holdExpiresAt:expires.toISOString()})]
        );
        await client.query(
          `INSERT INTO outbox_events(id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
           VALUES(gen_random_uuid(),$1,'reservation',$2,'booking.hold_created',$3,$4::jsonb)`,
          [input.actor.organizationId,reservationId,"outbox:"+input.idempotencyKey,JSON.stringify({reservationId})]
        );
        await client.query(
          `UPDATE booking_commands SET reservation_id=$1,result_snapshot=$2::jsonb,completed_at=now()
           WHERE organization_id=$3 AND idempotency_key=$4 AND command_type='create_hold'`,
          [reservationId,JSON.stringify({reservationId,confirmationCode:code,holdExpiresAt:expires.toISOString()}),input.actor.organizationId,input.idempotencyKey]
        );

        return {
          reservationId,confirmationCode:code,status:"hold",
          holdExpiresAt:expires.toISOString(),totalMinor:validated.totalMinor,
          currency:input.currency,idempotentReplay:false
        };
      });
    }catch(error){
      if(isPgCode(error,"23P01"))throw new BookingConflictError();
      throw error;
    }
  }

  private async replayExisting(client:PoolClient,organizationId:string,idempotencyKey:string,hash:string,currency:string):Promise<HoldResult>{
    const command=await client.query<{request_hash:string;reservation_id:string|null}>(
      `SELECT request_hash,reservation_id FROM booking_commands
       WHERE organization_id=$1 AND idempotency_key=$2 AND command_type='create_hold'`,
      [organizationId,idempotencyKey]
    );
    if(!command.rows[0])throw new Error("IDEMPOTENCY_STATE_MISSING");
    if(command.rows[0].request_hash!==hash)throw new IdempotencyConflictError();
    if(!command.rows[0].reservation_id)throw new Error("IDEMPOTENCY_IN_PROGRESS");

    const row=await client.query<{id:string;confirmation_code:string;status:string;hold_expires_at:Date;total_minor:string}>(
      "SELECT id,confirmation_code,status,hold_expires_at,total_minor FROM reservations WHERE id=$1",
      [command.rows[0].reservation_id]
    );
    const reservation=row.rows[0];
    if(!reservation)throw new Error("IDEMPOTENCY_RESERVATION_MISSING");
    if(reservation.status!=="hold")throw new Error("IDEMPOTENCY_RESULT_NOT_HOLD");
    if(reservation.hold_expires_at.getTime()<=Date.now())throw new HoldExpiredError();
    return {
      reservationId:reservation.id,confirmationCode:reservation.confirmation_code,status:"hold",
      holdExpiresAt:reservation.hold_expires_at.toISOString(),totalMinor:BigInt(reservation.total_minor),
      currency,idempotentReplay:true
    };
  }
}

function randomUuid(){return randomUUID()}
function isPgCode(error:unknown,code:string){return typeof error==="object"&&error!==null&&"code" in error&&(error as {code?:string}).code===code}
